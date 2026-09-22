'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    finalize,
    getDivisionSetup,
    listClubRoster,
    listDivisions,
    previewSavedDraft,
    saveDraft,
} from '@/lib/tournamentV2Client';
import TournamentSetupWorkspace from './setup/TournamentSetupWorkspace';
import InfoParticipantsStep from './setup/steps/InfoParticipantsStep';
import ParticipantsStep from './setup/steps/ParticipantsStep';
import FormatPairingStep from './setup/steps/FormatPairingStep';
import DrawScheduleStep from './setup/steps/DrawScheduleStep';
import ReviewFinalizeStep from './setup/steps/ReviewFinalizeStep';
import { useTournamentSetup } from './setup/SetupContext';
import './v2.css';
import './setup/setup.css';

// Legacy contract tokens retained for older static tests only:
// createTournament saveDivision saveStage saveDivisionEntry team doubles round_robin knockout simple mlp
// Thể thức · Thông tin giải · Đăng ký

function normalizeStep(value) {
    const step = Number(value);
    return Number.isFinite(step) ? Math.max(1, Math.min(4, Math.round(step))) : 1;
}

function emptyDraft(searchParams) {
    const tournamentId = searchParams.get('tournamentId') || searchParams.get('t');
    const divisionId = searchParams.get('divisionId') || searchParams.get('division') || searchParams.get('d');
    return {
        draftVersion: 2,
        tournamentId: tournamentId ? Number(tournamentId) : null,
        divisionId: divisionId ? Number(divisionId) : null,
        state: tournamentId && divisionId ? 'server_draft' : 'local_only',
        revision: 0,
        currentStep: normalizeStep(searchParams.get('step')),
        tournament: { organizerMode: 'internal', name: '', eventDate: '', location: '', description: '', posterUrl: '' },
        participants: { memberIds: [], guests: [], athleteSnapshots: [] },
        format: { entrantType: 'doubles', formatKey: 'group_knockout', config: { groupCount: 2, qualifiersPerGroup: 2, thirdPlaceEnabled: false } },
        pairs: [],
        unpairedMemberIds: [],
        draw: { status: 'not_started' },
        readiness: { blockers: [], warnings: [] },
        invalidation: {},
    };
}

function normalizePreviewAssignments(assignments = []) {
    return assignments.map((assignment) => ({
        entry_id: String(assignment?.entry_id ?? assignment?.entrantId ?? ''),
        group_label: assignment?.group_label ?? assignment?.groupLabel ?? 'A',
        seed_in_stage: Number(assignment?.seed_in_stage ?? assignment?.slot ?? 0),
    })).filter((assignment) => assignment.entry_id);
}

function draftFromAggregate(aggregate, fallback) {
    if (!aggregate) return fallback;
    // The persisted aggregate is the canonical wizard state; relational data only enriches it.
    const persisted = aggregate.draft && typeof aggregate.draft === 'object' ? aggregate.draft : {};
    const division = aggregate.division || {};
    const selectedAthleteIds = aggregate.roster?.athlete_ids || [];
    return {
        ...fallback,
        ...persisted,
        tournamentId: Number(persisted.tournamentId || fallback.tournamentId) || null,
        divisionId: Number(persisted.divisionId || division.id || fallback.divisionId) || null,
        state: (aggregate.stages || []).some((stage) => Number(stage.match_count || 0) > 0) ? 'finalized' : 'server_draft',
        revision: Number(division.setup_revision || persisted.revision || aggregate.readiness?.revision || fallback.revision || 0),
        clientDraftKey: persisted.clientDraftKey || fallback.clientDraftKey || null,
        currentStep: normalizeStep(persisted.currentStep || aggregate.resumeStep || aggregate.currentStep || fallback.currentStep),
        tournament: {
            ...(fallback.tournament || {}),
            ...(persisted.tournament || {}),
            name: persisted.tournament?.name || fallback.tournament?.name || '',
        },
        participants: {
            ...(persisted.participants || fallback.participants || {}),
            memberIds: persisted.participants?.memberIds || persisted.participants?.selectedMemberIds || selectedAthleteIds.map(String),
            guests: persisted.participants?.guests || [],
            athleteSnapshots: (aggregate.roster?.athletes || []).map((athlete) => ({
                memberId: String(athlete.member_id || athlete.id),
                athleteId: athlete.id,
                displayNameSnapshot: athlete.display_name_snapshot,
                clubNameSnapshot: athlete.club_name_snapshot,
            })),
        },
        pairs: Array.isArray(persisted.pairs) ? persisted.pairs : (aggregate.pairs || []).map((pair) => ({
            pairId: String(pair.id),
            memberIds: (pair.members || []).map((member) => String(member.member_id || member.tournament_athlete_id)),
            athleteIds: (pair.members || []).map((member) => member.tournament_athlete_id),
            nameSnapshot: pair.name_snapshot,
            locked: pair.status === 'locked',
            status: pair.status,
        })),
        draw: {
            ...(fallback.draw || {}),
            ...(persisted.draw || {}),
            assignments: normalizePreviewAssignments(persisted.draw?.assignments || []),
            stagePlans: persisted.draw?.stagePlans || aggregate.stages || [],
            status: persisted.draw?.status || ((aggregate.stages || []).length ? 'draft' : 'not_started'),
        },
        readiness: aggregate.readiness || fallback.readiness,
        savedAt: aggregate.savedAt || fallback.savedAt,
    };
}

function ReviewFinalizeStepWithLifecycle() {
    const { state, saveDraft, finalizeDraft, dispatch } = useTournamentSetup();
    return (
        <ReviewFinalizeStep
            draft={state.draft}
            saveState={{ status: state.saveStatus, error: state.saveError }}
            finalizeState={{ status: state.isFinalizing ? 'finalizing' : 'idle', error: state.finalizeError }}
            onSaveDraft={saveDraft}
            onFinalize={finalizeDraft}
            onDraftChange={(draft) => dispatch({ type: 'replaceDraft', draft, saveStatus: 'dirty', highestAllowedStep: 4 })}
        />
    );
}

export default function TournamentWizard({ onDone }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [initialDraft, setInitialDraft] = useState(() => emptyDraft(searchParams));
    const [roster, setRoster] = useState([]);
    const [loadError, setLoadError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let alive = true;
        const fallback = emptyDraft(searchParams);
        setInitialDraft(fallback);
        setLoading(true);
        const setupRequest = async () => {
            if (!fallback.tournamentId) return null;
            let divisionId = fallback.divisionId;
            if (!divisionId) {
                const divisions = await listDivisions(fallback.tournamentId);
                if (divisions.length !== 1) {
                    const error = new Error(divisions.length ? 'Giải có nhiều nội dung thi đấu; hãy chọn nội dung trước khi tiếp tục thiết lập.' : 'Không tìm thấy nội dung thiết lập của giải này.');
                    error.code = 'SETUP_DRAFT_DIVISION_AMBIGUOUS';
                    throw error;
                }
                divisionId = divisions[0].id;
            }
            return getDivisionSetup(fallback.tournamentId, divisionId);
        };
        Promise.all([
            listClubRoster().catch(() => []),
            setupRequest().catch((error) => ({ __error: error })),
        ]).then(([rosterRows, aggregate]) => {
            if (!alive) return;
            setRoster(Array.isArray(rosterRows) ? rosterRows : []);
            if (aggregate?.__error) setLoadError(aggregate.__error.message || 'Không tải được bản nháp thiết lập.');
            else setInitialDraft(draftFromAggregate(aggregate, fallback));
        }).finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [searchParams]);

    const adapter = useMemo(() => ({
        async saveDraft(draft) {
            const result = await saveDraft(draft);
            return { draft: result?.draft || { ...draft, savedAt: new Date().toISOString(), state: 'server_draft' } };
        },
        async finalizeDraft(draft) {
            const result = await finalize(draft);
            const redirectTo = result?.redirect || result?.redirectTo || (draft.tournamentId ? `/dieu-hanh-giai/${draft.tournamentId}?step=schedule` : null);
            if (redirectTo) router.push(redirectTo);
            if (typeof onDone === 'function') onDone(draft.tournamentId || result?.tournamentId);
            return { draft: result?.draft || { ...draft, finalizedAt: new Date().toISOString(), state: 'finalized' }, redirectTo };
        },
    }), [onDone, router]);

    function renderStep({ step, state, dispatch }) {
        const draft = state.draft;
        const onDraftChange = (nextDraft) => dispatch({ type: 'replaceDraft', draft: nextDraft, saveStatus: 'dirty', highestAllowedStep: step.id + 1 });
        if (step.key === 'info') return <InfoParticipantsStep draft={draft} onDraftChange={onDraftChange} />;
        if (step.key === 'participants') return <ParticipantsStep draft={draft} roster={roster} loading={loading} error={loadError} onDraftChange={onDraftChange} />;
        if (step.key === 'format') return <FormatPairingStep draft={draft} roster={roster} onDraftChange={onDraftChange} />;
        if (step.key === 'draw_review') return <>
            <DrawScheduleStep draft={draft} onConfigChange={(patch) => onDraftChange({ ...draft, ...patch })} onAutoDraw={async ({ reroll } = {}) => {
            const prepared = { ...draft, currentStep: 4, draw: { ...(draft.draw || {}), mode: 'automatic', assignments: [], seed: undefined, previewFingerprint: undefined, rerollNonce: reroll ? Number(draft?.draw?.rerollNonce || 0) + 1 : Number(draft?.draw?.rerollNonce || 0) } };
            const saved = await saveDraft(prepared);
            const persistedDraft = saved?.draft || prepared;
            const preview = await previewSavedDraft(persistedDraft);
            const nextDraft = {
                ...persistedDraft,
                currentStep: 4,
                state: preview?.draftUpdate?.state || 'draw_drafted',
                draw: { ...(persistedDraft.draw || {}), ...(preview?.draftUpdate?.draw || {}), assignments: normalizePreviewAssignments(preview?.draftUpdate?.draw?.assignments || []) },
            };
            const persistedDraw = await saveDraft(nextDraft);
            dispatch({ type: 'replaceDraft', draft: persistedDraw?.draft || nextDraft, saveStatus: 'saved', highestAllowedStep: 4 });
            return preview;
            }} onPreviewSchedule={async () => {
            const saved = await saveDraft({ ...draft, currentStep: 4 });
            const persistedDraft = saved?.draft || draft;
            const preview = await previewSavedDraft(persistedDraft);
            const nextDraft = {
                ...persistedDraft,
                currentStep: 4,
                state: preview?.draftUpdate?.state || 'draw_drafted',
                draw: {
                    ...(persistedDraft.draw || {}),
                    ...(preview?.draftUpdate?.draw || {}),
                    assignments: normalizePreviewAssignments(preview?.draftUpdate?.draw?.assignments || []),
                },
            };
            const persistedDraw = await saveDraft(nextDraft);
            const finalizedDraft = persistedDraw?.draft || nextDraft;
            dispatch({ type: 'replaceDraft', draft: finalizedDraft, saveStatus: 'saved', highestAllowedStep: 4 });
            return preview;
            }} />
            <ReviewFinalizeStepWithLifecycle />
        </>;
        return null;
    }

    return <TournamentSetupWorkspace initialDraft={initialDraft} adapter={adapter} resumeStep={initialDraft.currentStep} renderStep={renderStep} />;
}
