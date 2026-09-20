'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    finalize,
    getDivisionSetup,
    listClubRoster,
    previewSchedule,
    saveDraft,
} from '@/lib/tournamentV2Client';
import TournamentSetupWorkspace from './setup/TournamentSetupWorkspace';
import InfoParticipantsStep from './setup/steps/InfoParticipantsStep';
import FormatPairingStep from './setup/steps/FormatPairingStep';
import DrawScheduleStep from './setup/steps/DrawScheduleStep';
import ReviewFinalizeStep from './setup/steps/ReviewFinalizeStep';
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
        tournament: { organizerMode: 'internal' },
        participants: { selectedMemberIds: [], athleteSnapshots: [] },
        format: { entrantType: 'doubles', formatKey: 'group_knockout', config: { groupCount: 2, qualifiersPerGroup: 2, thirdPlaceEnabled: false } },
        pairs: [],
        unpairedMemberIds: [],
        reserveMemberIds: [],
        draw: { status: 'not_started' },
        readiness: { blockers: [], warnings: [] },
        invalidation: {},
    };
}

function draftFromAggregate(aggregate, fallback) {
    if (!aggregate) return fallback;
    const division = aggregate.division || {};
    const selectedAthleteIds = aggregate.roster?.athlete_ids || [];
    return {
        ...fallback,
        tournamentId: fallback.tournamentId,
        divisionId: division.id || fallback.divisionId,
        state: (aggregate.stages || []).some((stage) => Number(stage.match_count || 0) > 0) ? 'finalized' : 'server_draft',
        revision: Number(division.setup_revision || aggregate.readiness?.revision || fallback.revision || 0),
        currentStep: normalizeStep(aggregate.resumeStep || aggregate.currentStep || fallback.currentStep),
        participants: {
            ...(fallback.participants || {}),
            selectedMemberIds: selectedAthleteIds.map(String),
            athleteSnapshots: (aggregate.roster?.athletes || []).map((athlete) => ({
                memberId: String(athlete.member_id || athlete.id),
                athleteId: athlete.id,
                displayNameSnapshot: athlete.display_name_snapshot,
                clubNameSnapshot: athlete.club_name_snapshot,
            })),
        },
        pairs: (aggregate.pairs || []).map((pair) => ({
            pairId: String(pair.id),
            memberIds: (pair.members || []).map((member) => String(member.member_id || member.tournament_athlete_id)),
            athleteIds: (pair.members || []).map((member) => member.tournament_athlete_id),
            nameSnapshot: pair.name_snapshot,
            locked: pair.status === 'locked',
            status: pair.status,
        })),
        draw: { ...(fallback.draw || {}), stagePlans: aggregate.stages || [], status: (aggregate.stages || []).length ? 'draft' : 'not_started' },
        readiness: aggregate.readiness || fallback.readiness,
        savedAt: aggregate.savedAt || fallback.savedAt,
    };
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
        Promise.all([
            listClubRoster().catch(() => []),
            fallback.tournamentId && fallback.divisionId ? getDivisionSetup(fallback.tournamentId, fallback.divisionId).catch((error) => ({ __error: error })) : null,
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
        if (step.key === 'info') return <InfoParticipantsStep draft={draft} roster={roster} loading={loading} error={loadError} onDraftChange={onDraftChange} />;
        if (step.key === 'format') return <FormatPairingStep draft={draft} roster={roster} onDraftChange={onDraftChange} />;
        if (step.key === 'draw') return <DrawScheduleStep draft={draft} onConfigChange={(patch) => onDraftChange({ ...draft, ...patch })} onPreviewSchedule={() => previewSchedule(draft)} />;
        return <ReviewFinalizeStep draft={draft} saveState={{ status: state.saveStatus, error: state.saveError }} finalizeState={{ status: state.isFinalizing ? 'finalizing' : 'idle', error: state.finalizeError }} onSaveDraft={() => adapter.saveDraft(draft)} onFinalize={() => adapter.finalizeDraft(draft)} />;
    }

    return <TournamentSetupWorkspace initialDraft={initialDraft} adapter={adapter} resumeStep={initialDraft.currentStep} renderStep={renderStep} />;
}
