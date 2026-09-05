'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    createTournament,
    updateTournament,
    listDivisions,
    saveDivision,
    deleteDivision,
    listStages,
    saveStage,
    listTournamentClubs,
    listAvailableTournamentClubs,
    inviteTournamentClub,
    inviteExternalClub,
    updateTournamentClub,
    listTournamentAthletes,
    listClubRoster,
    saveTournamentAthlete,
    previewDivisionPairing,
    confirmDivisionPairing,
    listDivisionEntries,
    saveDivisionEntry,
    listRegistrations,
    saveRegistration,
    reviewRegistration,
    getTournamentRules,
    updateTournamentRules,
    generateSchedule,
} from '@/lib/tournamentV2Client';
import { getCurrentGroupClient } from '@/lib/groupClient';
import wizardModel from '@/lib/tournament/wizardModel';
import './v2.css';
import './wizard.css';

// Lưu ý tương thích: hàm client `saveEntrant` — ghi vào bảng entrant cấp giải
// của v2 cũ — KHÔNG còn được Wizard sử dụng. Đơn vị xếp lịch của Phase 3 là
// entry theo nội dung thi đấu: saveDivisionEntry và confirmDivisionPairing.
// Adapter cũ chỉ còn để đọc dữ liệu giải tạo trước khi mô hình hội tụ.

const {
    ORGANIZER_MODES,
    PLAY_TYPE_OPTIONS,
    SCORING_SCOPE_OPTIONS,
    RATING_POLICY_OPTIONS,
    PAIRING_MODE_OPTIONS,
    STAGE_PLAN_OPTIONS,
    SCORING_PRESET_OPTIONS,
    TIEBREAK_PRESET_OPTIONS,
    buildDivisionPayload,
    buildDivisionStagePayloads,
    buildRulesPreview,
    summarizeRosterWarnings,
    canSubmitRoster,
    buildGuestAthletePayload,
    buildClubMemberAthletePayload,
    validateManualPairs,
} = wizardModel;

const STEPS = [
    { n: 1, label: 'Thông tin' },
    { n: 2, label: 'Nội dung thi đấu' },
    { n: 3, label: 'CLB tham gia' },
    { n: 4, label: 'Đội hình & Ghép cặp' },
    { n: 5, label: 'Giai đoạn' },
    { n: 6, label: 'Luật điểm & Tie-break' },
    { n: 7, label: 'Sinh lịch' },
];

// Trợ giúp ngữ cảnh cho từng chế độ tổ chức.
const MODE_HELP = {
    internal: 'Nội bộ CLB: chỉ VĐV trong CLB của bạn, có thể thêm VĐV khách nếu điều lệ cho phép.',
    friendly: 'Giao hữu liên CLB: Giải liên CLB — mời CLB trong PickHub hoặc CLB ngoài hệ thống, mỗi CLB tự nộp đội hình.',
    community: 'Cộng đồng: mọi CLB trên PickHub gửi đăng ký. Cần tài khoản quản trị cộng đồng (platform_session) mới tạo được.',
};

// play_type là nguồn chân lý; entrant_type legacy được suy ra tương ứng.
const ENTRANT_TYPE_BY_PLAY_TYPE = { singles: 'individual', doubles: 'pair', team: 'team' };

const SCHEDULE_FORMAT_LABELS = { round_robin: 'Vòng tròn tính điểm', knockout: 'Loại trực tiếp' };
const MATCH_FORMAT_LABELS = { simple: 'Trận thường', mlp: 'MLP nhiều ván' };

const RULE_SOURCE_LABELS = {
    stage: 'Đã chốt ở giai đoạn',
    division: 'Nội dung ghi đè',
    tournament: 'Mặc định của giải',
    mac_dinh: 'Mặc định hệ thống',
};

// Template luật của nội dung thi đấu; pilot Phase 3 dùng bộ luật liên CLB
// interclub_friendly_team_v1.
const DEFAULT_COMPETITION_TEMPLATE = 'interclub_friendly_team_v1';

const EMPTY_DIVISION_FORM = {
    competition_template: DEFAULT_COMPETITION_TEMPLATE,
    name: '',
    play_type: 'doubles',
    scoring_scope: 'athlete',
    rating_policy: 'open',
    rating_cap: '',
    pairing_mode: 'random_balanced',
};

function playTypeLabel(playType) {
    return (PLAY_TYPE_OPTIONS.find((option) => option.id === playType) || {}).label || playType;
}

export default function TournamentWizard({ onDone }) {
    const [group, setGroup] = useState({ id: null, name: '', role: 'member' });
    const [step, setStep] = useState(1);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const [loadError, setLoadError] = useState('');
    const [loading, setLoading] = useState(false);

    /* --- Bước 1 --- */
    const [organizerMode, setOrganizerMode] = useState('internal');
    const [info, setInfo] = useState({ name: '', event_date: '', location: '' });
    const [tournamentId, setTournamentId] = useState(null);

    /* --- Bước 2 --- */
    const [divisions, setDivisions] = useState([]);
    const [divisionForm, setDivisionForm] = useState(EMPTY_DIVISION_FORM);

    /* --- Bước 3 --- */
    const [clubs, setClubs] = useState([]);
    const [availableClubs, setAvailableClubs] = useState([]);
    const [clubForm, setClubForm] = useState({ club_id: '', quota: '4' });
    const [externalForm, setExternalForm] = useState({ name: '', contact_name: '', quota: '4' });

    /* --- Bước 4 --- */
    const [activeDivisionId, setActiveDivisionId] = useState('');
    const [activeClubId, setActiveClubId] = useState('');
    const [roster, setRoster] = useState([]);
    const [athletes, setAthletes] = useState([]);
    const [selectedAthleteIds, setSelectedAthleteIds] = useState([]);
    const [guestForm, setGuestForm] = useState({ display_name: '', phr_rating: '' });
    const [pairingMode, setPairingMode] = useState('random_balanced');
    const [pairingPreview, setPairingPreview] = useState(null);
    const [manualPairs, setManualPairs] = useState([]);
    const [entriesByDivision, setEntriesByDivision] = useState({});
    const [registrations, setRegistrations] = useState([]);
    const [proxyForm, setProxyForm] = useState({ athlete_id: '', reason: '' });

    /* --- Bước 5 --- */
    const [stages, setStages] = useState([]);
    const [stagePlanByDivision, setStagePlanByDivision] = useState({});
    const [stageConfig, setStageConfig] = useState({ groupCount: 2, advancePerGroup: 2, gamesPerMatchup: 4, dreamBreaker: true });

    /* --- Bước 6 --- */
    const [rules, setRules] = useState(null);
    const [rulePicker, setRulePicker] = useState({ scoring_preset: 'phong_trao_11', tiebreak_preset: 'phong_trao_mac_dinh' });

    /* --- Bước 7 --- */
    const [generated, setGenerated] = useState({});

    const isAdmin = group.role === 'admin';
    const activeDivision = divisions.find((division) => String(division.id) === String(activeDivisionId)) || null;

    useEffect(() => {
        // Quyền admin phải lấy từ session server, không tin role trong localStorage
        // (anti-pattern của kiến trúc). localStorage chỉ để hiển thị tạm khi chờ.
        setGroup(getCurrentGroupClient());
        let alive = true;
        fetch('/api/groups/session', { credentials: 'same-origin', cache: 'no-store' })
            .then((response) => response.json())
            .then((view) => {
                const session = view?.session;
                if (!alive || !session) return;
                setGroup((current) => ({
                    id: session.group_id ?? current.id,
                    code: session.group_code ?? current.code,
                    name: session.group_name ?? current.name,
                    role: session.role || 'member',
                }));
            })
            .catch(() => {});
        return () => { alive = false; };
    }, []);

    /* ==================== Nạp dữ liệu ==================== */

    const refreshDivisions = useCallback(async (id) => {
        if (!id) return;
        setLoading(true); setLoadError('');
        try {
            const list = await listDivisions(id);
            setDivisions(list);
            if (list.length && !activeDivisionId) setActiveDivisionId(String(list[0].id));
        } catch (err) {
            setLoadError(err.message || 'Không tải được danh sách nội dung thi đấu.');
        } finally { setLoading(false); }
    }, [activeDivisionId]);

    const refreshClubs = useCallback(async (id) => {
        if (!id) return;
        setLoading(true); setLoadError('');
        try {
            const [joined, available] = await Promise.all([
                listTournamentClubs(id),
                listAvailableTournamentClubs(id).catch(() => []),
            ]);
            setClubs(joined);
            setAvailableClubs(available);
            if (joined.length && !activeClubId) setActiveClubId(String(joined[0].id));
        } catch (err) {
            setLoadError(err.message || 'Không tải được danh sách CLB tham gia.');
        } finally { setLoading(false); }
    }, [activeClubId]);

    const refreshAthletes = useCallback(async (id) => {
        if (!id) return;
        setLoading(true); setLoadError('');
        try {
            // Roster hiển thị lấy từ /api/club/members; danh tính VĐV (athlete_id)
            // lấy kèm để entry không phải nhập lại tên bằng tay.
            const [tournamentAthletes, identityRoster, memberResponse] = await Promise.all([
                listTournamentAthletes(id),
                listClubRoster().catch(() => []),
                fetch('/api/club/members', { credentials: 'same-origin' }).then((response) => response.json()).catch(() => ({ members: [] })),
            ]);
            const athleteIdByMember = new Map(identityRoster.map((row) => [String(row.member_id), row.athlete_id]));
            setAthletes(tournamentAthletes);
            setRoster((memberResponse.members || []).map((member) => ({
                member_id: member.id,
                full_name: member.full_name,
                athlete_id: athleteIdByMember.get(String(member.id)) ?? null,
            })));
        } catch (err) {
            setLoadError(err.message || 'Không tải được danh sách VĐV.');
        } finally { setLoading(false); }
    }, []);

    const refreshRegistrations = useCallback(async (id) => {
        if (!id) return;
        try {
            setRegistrations(await listRegistrations({ tournamentId: id }));
        } catch (err) {
            setLoadError(err.message || 'Không tải được danh sách đăng ký.');
        }
    }, []);

    const refreshStages = useCallback(async (id) => {
        if (!id) return;
        setLoading(true); setLoadError('');
        try {
            setStages(await listStages(id));
        } catch (err) {
            setLoadError(err.message || 'Không tải được danh sách giai đoạn.');
        } finally { setLoading(false); }
    }, []);

    const refreshRules = useCallback(async (id) => {
        if (!id) return;
        setLoading(true); setLoadError('');
        try {
            setRules(await getTournamentRules(id));
        } catch (err) {
            setLoadError(err.message || 'Không tải được cấu hình luật thi đấu.');
        } finally { setLoading(false); }
    }, []);

    useEffect(() => {
        if (!tournamentId) return;
        if (step === 2) refreshDivisions(tournamentId);
        if (step === 3) refreshClubs(tournamentId);
        if (step === 4) { refreshDivisions(tournamentId); refreshClubs(tournamentId); refreshAthletes(tournamentId); refreshRegistrations(tournamentId); }
        if (step === 5) { refreshDivisions(tournamentId); refreshStages(tournamentId); }
        if (step === 6) refreshRules(tournamentId);
        if (step === 7) refreshStages(tournamentId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, tournamentId]);

    /* ==================== Bước 1 ==================== */

    async function submitInfo() {
        setNotice('');
        if (!info.name.trim()) { setNotice('Vui lòng nhập tên giải.'); return; }
        setBusy(true);
        try {
            const body = {
                name: info.name.trim(),
                event_date: info.event_date || undefined,
                location: info.location || undefined,
                entrant_type: 'team',
                organizer_mode: organizerMode,
            };
            const response = tournamentId
                ? await updateTournament({ id: tournamentId, ...body })
                : await createTournament(body);
            const created = response.tournament;
            if (!created?.id) throw new Error('Không nhận được mã giải.');
            setTournamentId(created.id);
            if (!tournamentId && organizerMode !== 'community' && group.id) {
                // CLB chủ giải tham dự sẵn để có chỗ gắn VĐV/entry.
                try {
                    await inviteTournamentClub({ tournament_id: created.id, club_id: Number(group.id) });
                } catch (_) { /* đã tồn tại thì bỏ qua */ }
            }
            setStep(2);
        } catch (err) {
            setNotice(err.message || 'Không tạo được giải.');
        } finally { setBusy(false); }
    }

    /* ==================== Bước 2: nội dung thi đấu ==================== */

    function setDivisionField(field, value) {
        setDivisionForm((current) => {
            const next = { ...current, [field]: value };
            if (field === 'play_type') {
                next.pairing_mode = value === 'doubles' ? 'random_balanced' : 'none';
                next.scoring_scope = value === 'team' ? 'club' : 'athlete';
            }
            if (field === 'rating_policy' && value === 'open') next.rating_cap = '';
            return next;
        });
    }

    async function addDivision() {
        setNotice('');
        let payload;
        try {
            payload = buildDivisionPayload(divisionForm);
        } catch (err) {
            setNotice(err.message || 'Cấu hình nội dung chưa hợp lệ.');
            return;
        }
        setBusy(true);
        try {
            const response = await saveDivision({ tournament_id: tournamentId, ...payload });
            setDivisions((current) => [...current, response.division]);
            if (!activeDivisionId) setActiveDivisionId(String(response.division.id));
            setDivisionForm(EMPTY_DIVISION_FORM);
        } catch (err) {
            setNotice(err.message || 'Không thêm được nội dung thi đấu.');
        } finally { setBusy(false); }
    }

    async function removeDivision(id) {
        setNotice('');
        setBusy(true);
        try {
            await deleteDivision(id);
            setDivisions((current) => current.filter((division) => String(division.id) !== String(id)));
        } catch (err) {
            setNotice(err.message || 'Không xoá được nội dung.');
        } finally { setBusy(false); }
    }

    /* ==================== Bước 3: CLB ==================== */

    async function addPickhubClub() {
        setNotice('');
        if (!clubForm.club_id) { setNotice('Vui lòng chọn CLB cần mời.'); return; }
        setBusy(true);
        try {
            const response = await inviteTournamentClub({
                tournament_id: tournamentId,
                club_id: Number(clubForm.club_id),
                quota: Number(clubForm.quota) || undefined,
            });
            setClubs((current) => [...current, response.club]);
            setAvailableClubs((current) => current.filter((club) => String(club.id) !== String(clubForm.club_id)));
            setClubForm({ club_id: '', quota: '4' });
        } catch (err) {
            setNotice(err.message || 'Không mời được CLB.');
        } finally { setBusy(false); }
    }

    async function addExternalClub() {
        setNotice('');
        if (!externalForm.name.trim()) { setNotice('Vui lòng nhập tên CLB ngoài hệ thống.'); return; }
        setBusy(true);
        try {
            const response = await inviteExternalClub({
                tournament_id: tournamentId,
                external_club_name: externalForm.name.trim(),
                contact_name: externalForm.contact_name || undefined,
                quota: Number(externalForm.quota) || undefined,
            });
            setClubs((current) => [...current, response.club]);
            setExternalForm({ name: '', contact_name: '', quota: '4' });
        } catch (err) {
            setNotice(err.message || 'Không thêm được CLB ngoài hệ thống.');
        } finally { setBusy(false); }
    }

    async function reviewClub(club, action) {
        setNotice('');
        setBusy(true);
        try {
            const response = await updateTournamentClub({ id: club.id, action });
            setClubs((current) => current.map((row) => (String(row.id) === String(club.id) ? response.club : row)));
        } catch (err) {
            setNotice(err.message || 'Không cập nhật được trạng thái CLB.');
        } finally { setBusy(false); }
    }

    /* ==================== Bước 4: VĐV và ghép cặp ==================== */

    async function addRosterAthlete(member) {
        setNotice('');
        if (!activeClubId) { setNotice('Chọn CLB đại diện trước khi thêm VĐV.'); return; }
        setBusy(true);
        try {
            const payload = member.athlete_id
                ? buildClubMemberAthletePayload({
                    tournament_id: tournamentId,
                    tournament_club_id: Number(activeClubId),
                    athlete_id: member.athlete_id,
                })
                : buildGuestAthletePayload({
                    tournament_id: tournamentId,
                    tournament_club_id: Number(activeClubId),
                    display_name: member.full_name,
                });
            const response = await saveTournamentAthlete(payload);
            setAthletes((current) => [...current, response.athlete]);
        } catch (err) {
            setNotice(err.message || 'Không thêm được VĐV vào giải.');
        } finally { setBusy(false); }
    }

    async function addGuestAthlete() {
        setNotice('');
        if (!activeClubId) { setNotice('Chọn CLB đại diện trước khi tạo VĐV khách.'); return; }
        let payload;
        try {
            payload = buildGuestAthletePayload({
                tournament_id: tournamentId,
                tournament_club_id: Number(activeClubId),
                display_name: guestForm.display_name,
                phr_rating: guestForm.phr_rating === '' ? null : Number(guestForm.phr_rating),
            });
        } catch (err) {
            setNotice(err.message || 'Thông tin VĐV khách chưa hợp lệ.');
            return;
        }
        setBusy(true);
        try {
            const response = await saveTournamentAthlete(payload);
            setAthletes((current) => [...current, response.athlete]);
            setGuestForm({ display_name: '', phr_rating: '' });
        } catch (err) {
            setNotice(err.message || 'Không tạo được VĐV khách.');
        } finally { setBusy(false); }
    }

    function toggleAthlete(id) {
        setSelectedAthleteIds((current) => (
            current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
        ));
    }

    async function runPairingPreview() {
        setNotice('');
        if (!activeDivision) { setNotice('Chọn nội dung thi đấu trước.'); return; }
        setBusy(true);
        try {
            const response = await previewDivisionPairing({
                division_id: activeDivision.id,
                pairing_mode: pairingMode,
                athlete_ids: selectedAthleteIds,
                seed: Math.floor(Math.random() * 100000) + 1,
            });
            setPairingPreview(response);
            setManualPairs(response.pairs || []);
        } catch (err) {
            setPairingPreview(null);
            setNotice(err.message || 'Không xem trước được ghép cặp.');
        } finally { setBusy(false); }
    }

    function swapManualMember(pairIndex, memberIndex, athleteId) {
        setManualPairs((current) => current.map((pair, index) => {
            if (index !== pairIndex) return pair;
            const members = pair.members.map((member, position) => (
                position === memberIndex ? { ...member, tournament_athlete_id: Number(athleteId) } : member
            ));
            return { ...pair, members };
        }));
    }

    async function commitPairing() {
        setNotice('');
        if (!activeDivision) return;
        let pairs;
        try {
            pairs = validateManualPairs(manualPairs);
        } catch (err) {
            setNotice(err.message || 'Ghép cặp chưa hợp lệ.');
            return;
        }
        setBusy(true);
        try {
            await confirmDivisionPairing({ division_id: activeDivision.id, pairing_mode: pairingMode, pairs });
            const entries = await listDivisionEntries(activeDivision.id);
            setEntriesByDivision((current) => ({ ...current, [String(activeDivision.id)]: entries }));
            setPairingPreview(null);
            setManualPairs([]);
        } catch (err) {
            setNotice(err.message || 'Không chốt được ghép cặp.');
        } finally { setBusy(false); }
    }

    async function addDirectEntry(athlete) {
        setNotice('');
        if (!activeDivision) { setNotice('Chọn nội dung thi đấu trước.'); return; }
        setBusy(true);
        try {
            await saveDivisionEntry({
                division_id: activeDivision.id,
                tournament_club_id: athlete.tournament_club_id,
                name: athlete.display_name_snapshot || `VĐV #${athlete.athlete_id}`,
                members: [{ athlete_id: athlete.athlete_id, display_name: athlete.display_name_snapshot, phr_rating: athlete.phr_rating }],
            });
            const entries = await listDivisionEntries(activeDivision.id);
            setEntriesByDivision((current) => ({ ...current, [String(activeDivision.id)]: entries }));
        } catch (err) {
            setNotice(err.message || 'Không tạo được suất thi đấu.');
        } finally { setBusy(false); }
    }

    // BTC nhập hộ đội hình cho CLB khách: bắt buộc ghi lý do, bản ghi ở trạng
    // thái chờ CLB xác nhận (mục 14.4 tài liệu kiến trúc).
    async function submitProxyRoster() {
        setNotice('');
        if (!activeDivision) { setNotice('Chọn nội dung thi đấu trước.'); return; }
        if (!activeClubId) { setNotice('Chọn CLB đại diện trước.'); return; }
        if (!proxyForm.reason.trim()) { setNotice('BTC nhập hộ phải ghi lý do.'); return; }
        setBusy(true);
        try {
            const athlete = athletes.find((row) => String(row.id) === String(proxyForm.athlete_id));
            await saveRegistration({
                division_id: activeDivision.id,
                tournament_club_id: Number(activeClubId),
                athlete_id: athlete ? athlete.athlete_id : null,
                status: 'submitted',
                actor: 'organizer',
                reason: proxyForm.reason.trim(),
            });
            setProxyForm({ athlete_id: '', reason: '' });
            await refreshRegistrations(tournamentId);
        } catch (err) {
            setNotice(err.message || 'Không lưu được đăng ký nhập hộ.');
        } finally { setBusy(false); }
    }

    async function reviewRoster(registration, action) {
        setNotice('');
        setBusy(true);
        try {
            await reviewRegistration({ id: registration.id, action, reason: proxyForm.reason || undefined });
            await refreshRegistrations(tournamentId);
        } catch (err) {
            setNotice(err.message || 'Không cập nhật được trạng thái đăng ký.');
        } finally { setBusy(false); }
    }

    /* ==================== Bước 5: giai đoạn ==================== */

    async function createStagesForDivision(division) {
        setNotice('');
        const plan = stagePlanByDivision[String(division.id)] || 'single_round_robin';
        let payloads;
        try {
            payloads = buildDivisionStagePayloads({
                tournament_id: tournamentId,
                division,
                stage_plan: plan,
                config: stageConfig,
            });
        } catch (err) {
            setNotice(err.message || 'Không dựng được giai đoạn.');
            return;
        }
        setBusy(true);
        try {
            const created = [];
            for (const payload of payloads) {
                // Stage bắt buộc có division_id theo mô hình đã hội tụ.
                const response = await saveStage(payload);
                created.push(response.stage);
            }
            setStages((current) => [...current, ...created]);
        } catch (err) {
            setNotice(err.message || 'Không tạo được giai đoạn.');
        } finally { setBusy(false); }
    }

    /* ==================== Bước 6: luật ==================== */

    async function applyRules(scope, divisionId) {
        setNotice('');
        setBusy(true);
        try {
            const response = await updateTournamentRules({
                tournament_id: tournamentId,
                scope,
                division_id: divisionId,
                scoring_preset: rulePicker.scoring_preset,
                tiebreak_preset: rulePicker.tiebreak_preset,
            });
            setRules((current) => ({ ...(current || {}), ...response }));
        } catch (err) {
            setNotice(err.message || 'Không lưu được luật thi đấu.');
        } finally { setBusy(false); }
    }

    /* ==================== Bước 7: sinh lịch ==================== */

    async function runGenerate(stage) {
        setNotice('');
        setBusy(true);
        try {
            const response = await generateSchedule(stage.id);
            setGenerated((current) => ({ ...current, [String(stage.id)]: response.matchCount ?? 0 }));
        } catch (err) {
            setNotice(err.message || 'Không sinh được lịch thi đấu.');
        } finally { setBusy(false); }
    }

    function goBack() { setNotice(''); if (step > 1) setStep(step - 1); }
    function goNext() { setNotice(''); if (step < STEPS.length) setStep(step + 1); }
    function finish() { if (onDone) onDone(tournamentId); }

    /* ==================== Dữ liệu dẫn xuất ==================== */

    const localPreview = rules
        ? buildRulesPreview({ tournament: rules.tournament || {}, divisions: rules.divisions || [], stages: rules.stages || [] })
        : [];
    const effectivePreview = (rules && rules.preview) ? rules.preview : localPreview;

    const ratingSummary = pairingPreview
        ? (pairingPreview.rating_summary || summarizeRosterWarnings(pairingPreview.pairs || [], activeDivision || {}))
        : null;
    const submitState = ratingSummary ? canSubmitRoster(ratingSummary) : { allowed: true };

    const athletesInClub = athletes.filter((athlete) => !activeClubId || String(athlete.tournament_club_id) === String(activeClubId));

    /* ==================== Render ==================== */

    if (!isAdmin) {
        return (
            <div className="v2-wizard w3-wrap">
                <h2 className="v2-wizard-title">Tạo giải đấu</h2>
                <div className="w3-state">Chỉ trưởng nhóm/BTC mới tạo và cấu hình được giải đấu.</div>
            </div>
        );
    }

    return (
        <div className="v2-wizard w3-wrap">
            <h2 className="v2-wizard-title">Tạo giải đấu</h2>

            <nav className="w3-steps" aria-label="Các bước tạo giải">
                {STEPS.map((item) => (
                    <button
                        key={item.n}
                        type="button"
                        className={`w3-step ${item.n === step ? 'is-active' : item.n < step ? 'is-done' : ''}`}
                        onClick={() => tournamentId && setStep(item.n)}
                        disabled={!tournamentId && item.n > 1}
                    >
                        {item.n}. {item.label}
                    </button>
                ))}
            </nav>

            {notice ? <p className="v2-notice">{notice}</p> : null}
            {loadError ? <div className="w3-state w3-state-error">{loadError}</div> : null}
            {loading ? <div className="w3-state">Đang tải dữ liệu...</div> : null}

            {/* ===== Bước 1 ===== */}
            {step === 1 && (
                <div>
                    <div className="w3-section">
                        <h3>Chế độ tổ chức</h3>
                        <div className="w3-option-list">
                            {ORGANIZER_MODES.map((mode) => (
                                <button
                                    key={mode.id}
                                    type="button"
                                    className={`w3-option ${organizerMode === mode.id ? 'is-active' : ''}`}
                                    onClick={() => setOrganizerMode(mode.id)}
                                    disabled={Boolean(tournamentId)}
                                >
                                    <span className="w3-option-title">{mode.label}</span>
                                    <span className="w3-option-sub">{mode.description}</span>
                                </button>
                            ))}
                        </div>
                        <p className="w3-hint">{MODE_HELP[organizerMode]}</p>
                        {tournamentId ? <p className="w3-hint">Giải đã tạo — không đổi được chế độ tổ chức. Tạo giải mới nếu cần đổi.</p> : null}
                    </div>

                    <div className="v2-field">
                        <label htmlFor="w3-name">Tên giải</label>
                        <input id="w3-name" value={info.name} onChange={(e) => setInfo((c) => ({ ...c, name: e.target.value }))} placeholder="Giải CLB mùa hè 2026" />
                    </div>
                    <div className="v2-grid-2">
                        <div className="v2-field">
                            <label htmlFor="w3-date">Ngày thi đấu</label>
                            <input id="w3-date" type="date" value={info.event_date} onChange={(e) => setInfo((c) => ({ ...c, event_date: e.target.value }))} />
                        </div>
                        <div className="v2-field">
                            <label htmlFor="w3-location">Địa điểm</label>
                            <input id="w3-location" value={info.location} onChange={(e) => setInfo((c) => ({ ...c, location: e.target.value }))} placeholder="Sân 246" />
                        </div>
                    </div>

                    <div className="v2-wizard-nav">
                        <button type="button" className="v2-btn-primary" onClick={submitInfo} disabled={busy}>
                            {busy ? 'Đang lưu...' : 'Tiếp tục'}
                        </button>
                    </div>
                </div>
            )}

            {/* ===== Bước 2 ===== */}
            {step === 2 && (
                <div>
                    <p className="w3-hint">Một giải có thể có nhiều Nội dung thi đấu độc lập, mỗi nội dung trao giải riêng.</p>

                    {divisions.length === 0 ? (
                        <div className="w3-state">Chưa có nội dung thi đấu nào.</div>
                    ) : (
                        <ul className="w3-list">
                            {divisions.map((division) => (
                                <li key={division.id} className="w3-row">
                                    <div className="w3-row-top">
                                        <span className="w3-row-name">{division.name}</span>
                                        <span className="w3-tag">{playTypeLabel(division.play_type)}</span>
                                    </div>
                                    <p className="w3-row-meta">
                                        {division.scoring_scope === 'club' ? 'Tính thành tích CLB' : 'Tính thành tích cá nhân'}
                                        {' · '}
                                        {division.rating_policy === 'capped' ? `Giới hạn tổng PHR ${division.rating_cap}` : 'Open (không giới hạn PHR)'}
                                        {' · Ghép cặp: '}
                                        {(PAIRING_MODE_OPTIONS.find((option) => option.id === division.pairing_mode) || {}).label}
                                        {` · entrant_type ${ENTRANT_TYPE_BY_PLAY_TYPE[division.play_type]}`}
                                    </p>
                                    <div className="w3-row-actions">
                                        <button type="button" className="v2-btn-secondary v2-btn-sm" onClick={() => removeDivision(division.id)} disabled={busy}>Xoá</button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="w3-section">
                        <h3>Thêm nội dung thi đấu</h3>
                        <div className="v2-field">
                            <label htmlFor="w3-div-name">Tên nội dung</label>
                            <input id="w3-div-name" value={divisionForm.name} onChange={(e) => setDivisionField('name', e.target.value)} placeholder="Đôi nam 5.2" />
                        </div>
                        <div className="v2-field">
                            <label>Loại thi đấu</label>
                            <div className="w3-option-list">
                                {PLAY_TYPE_OPTIONS.map((option) => (
                                    <button key={option.id} type="button" className={`w3-option ${divisionForm.play_type === option.id ? 'is-active' : ''}`} onClick={() => setDivisionField('play_type', option.id)}>
                                        <span className="w3-option-title">{option.label}</span>
                                        <span className="w3-option-sub">{option.hint}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="v2-grid-2">
                            <div className="v2-field">
                                <label htmlFor="w3-scope">Tính thành tích</label>
                                <select id="w3-scope" value={divisionForm.scoring_scope} onChange={(e) => setDivisionField('scoring_scope', e.target.value)}>
                                    {SCORING_SCOPE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                                </select>
                            </div>
                            <div className="v2-field">
                                <label htmlFor="w3-rating">Trình độ</label>
                                <select id="w3-rating" value={divisionForm.rating_policy} onChange={(e) => setDivisionField('rating_policy', e.target.value)}>
                                    {RATING_POLICY_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                                </select>
                            </div>
                        </div>
                        {divisionForm.rating_policy === 'capped' && (
                            <div className="v2-field">
                                <label htmlFor="w3-cap">Tổng PHR tối đa của cặp</label>
                                <input id="w3-cap" type="number" step="0.1" min="0" value={divisionForm.rating_cap} onChange={(e) => setDivisionField('rating_cap', e.target.value)} placeholder="5.2" />
                            </div>
                        )}
                        <div className="v2-field">
                            <label htmlFor="w3-pairing">Chế độ Ghép cặp</label>
                            <select id="w3-pairing" value={divisionForm.pairing_mode} onChange={(e) => setDivisionField('pairing_mode', e.target.value)} disabled={divisionForm.play_type === 'singles'}>
                                {PAIRING_MODE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                            </select>
                            {divisionForm.play_type === 'singles' && <p className="w3-hint">Đánh đơn không ghép cặp — mỗi VĐV là một suất.</p>}
                        </div>
                        <button type="button" className="v2-btn-secondary" onClick={addDivision} disabled={busy}>+ Thêm nội dung</button>
                    </div>

                    <div className="v2-wizard-nav">
                        <button type="button" className="v2-btn-secondary" onClick={goBack}>Quay lại</button>
                        <button type="button" className="v2-btn-primary" onClick={goNext} disabled={divisions.length === 0}>Tiếp tục</button>
                    </div>
                </div>
            )}

            {/* ===== Bước 3 ===== */}
            {step === 3 && (
                <div>
                    <p className="w3-hint">{MODE_HELP[organizerMode]}</p>

                    {clubs.length === 0 ? (
                        <div className="w3-state">Chưa có CLB nào tham gia.</div>
                    ) : (
                        <ul className="w3-list">
                            {clubs.map((club) => (
                                <li key={club.id} className="w3-row">
                                    <div className="w3-row-top">
                                        <span className="w3-row-name">{club.name}</span>
                                        <span className="w3-tag">{club.invitation_status}</span>
                                    </div>
                                    <p className="w3-row-meta">
                                        {club.is_external ? 'CLB ngoài hệ thống' : 'CLB PickHub'}
                                        {club.quota ? ` · Quota ${club.quota}` : ''}
                                    </p>
                                    <div className="w3-row-actions">
                                        <button type="button" className="v2-btn-secondary v2-btn-sm" onClick={() => reviewClub(club, 'accept')} disabled={busy}>Xác nhận tham gia</button>
                                        <button type="button" className="v2-btn-secondary v2-btn-sm" onClick={() => reviewClub(club, 'approve')} disabled={busy}>BTC duyệt đội hình</button>
                                        <button type="button" className="v2-btn-secondary v2-btn-sm" onClick={() => reviewClub(club, 'request_changes')} disabled={busy}>Yêu cầu sửa</button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}

                    {organizerMode !== 'internal' && (
                        <>
                            <div className="w3-section">
                                <h3>Mời CLB trong PickHub</h3>
                                <div className="w3-inline-form">
                                    <div className="v2-field">
                                        <label htmlFor="w3-club">CLB</label>
                                        <select id="w3-club" value={clubForm.club_id} onChange={(e) => setClubForm((c) => ({ ...c, club_id: e.target.value }))}>
                                            <option value="">Chọn CLB</option>
                                            {availableClubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="v2-field">
                                        <label htmlFor="w3-quota">Quota VĐV</label>
                                        <input id="w3-quota" type="number" min="1" value={clubForm.quota} onChange={(e) => setClubForm((c) => ({ ...c, quota: e.target.value }))} />
                                    </div>
                                </div>
                                <button type="button" className="v2-btn-secondary" onClick={addPickhubClub} disabled={busy}>+ Mời CLB</button>
                            </div>

                            <div className="w3-section">
                                <h3>CLB ngoài hệ thống</h3>
                                <p className="w3-hint">CLB chưa có trên PickHub vẫn tham gia được trong phạm vi giải này.</p>
                                <div className="w3-inline-form">
                                    <div className="v2-field">
                                        <label htmlFor="w3-ext-name">Tên CLB</label>
                                        <input id="w3-ext-name" value={externalForm.name} onChange={(e) => setExternalForm((c) => ({ ...c, name: e.target.value }))} placeholder="CLB Yên Bái" />
                                    </div>
                                    <div className="v2-field">
                                        <label htmlFor="w3-ext-contact">Người liên hệ</label>
                                        <input id="w3-ext-contact" value={externalForm.contact_name} onChange={(e) => setExternalForm((c) => ({ ...c, contact_name: e.target.value }))} placeholder="Anh Tuấn" />
                                    </div>
                                </div>
                                <button type="button" className="v2-btn-secondary" onClick={addExternalClub} disabled={busy}>+ Thêm CLB ngoài</button>
                            </div>
                        </>
                    )}

                    <div className="v2-wizard-nav">
                        <button type="button" className="v2-btn-secondary" onClick={goBack}>Quay lại</button>
                        <button type="button" className="v2-btn-primary" onClick={goNext}>Tiếp tục</button>
                    </div>
                </div>
            )}

            {/* ===== Bước 4 ===== */}
            {step === 4 && (
                <div>
                    <div className="w3-inline-form">
                        <div className="v2-field">
                            <label htmlFor="w3-active-division">Nội dung thi đấu</label>
                            <select id="w3-active-division" value={activeDivisionId} onChange={(e) => { setActiveDivisionId(e.target.value); setPairingPreview(null); }}>
                                <option value="">Chọn nội dung</option>
                                {divisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}
                            </select>
                        </div>
                        <div className="v2-field">
                            <label htmlFor="w3-active-club">CLB đại diện</label>
                            <select id="w3-active-club" value={activeClubId} onChange={(e) => setActiveClubId(e.target.value)}>
                                <option value="">Chọn CLB</option>
                                {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="w3-section">
                        <h3>Chọn thành viên CLB</h3>
                        {roster.length === 0 ? (
                            <div className="w3-state">Chưa tải được roster thành viên.</div>
                        ) : (
                            <div className="w3-check-grid">
                                {roster.map((member) => (
                                    <button key={member.member_id} type="button" className="w3-check" onClick={() => addRosterAthlete(member)} disabled={busy}>
                                        <span>{member.full_name}</span>
                                        <span className="w3-tag">{member.athlete_id ? 'Có hồ sơ' : 'Chỉ tên'}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="w3-section">
                        <h3>Tạo VĐV khách</h3>
                        <p className="w3-hint">VĐV khách chỉ tồn tại trong phạm vi giải này, không tạo thành viên CLB mới.</p>
                        <div className="w3-inline-form">
                            <div className="v2-field">
                                <label htmlFor="w3-guest-name">Tên VĐV khách</label>
                                <input id="w3-guest-name" value={guestForm.display_name} onChange={(e) => setGuestForm((c) => ({ ...c, display_name: e.target.value }))} placeholder="Nguyễn Văn A" />
                            </div>
                            <div className="v2-field">
                                <label htmlFor="w3-guest-phr">PHR (nếu có)</label>
                                <input id="w3-guest-phr" type="number" step="0.1" min="0" value={guestForm.phr_rating} onChange={(e) => setGuestForm((c) => ({ ...c, phr_rating: e.target.value }))} placeholder="2.5" />
                            </div>
                        </div>
                        <button type="button" className="v2-btn-secondary" onClick={addGuestAthlete} disabled={busy}>+ Thêm VĐV khách</button>
                    </div>

                    <div className="w3-section">
                        <h3>VĐV đã đăng ký</h3>
                        {athletesInClub.length === 0 ? (
                            <div className="w3-state">Chưa có VĐV nào trong giải.</div>
                        ) : (
                            <div className="w3-check-grid">
                                {athletesInClub.map((athlete) => (
                                    <label key={athlete.id} className={`w3-check ${selectedAthleteIds.includes(athlete.id) ? 'is-selected' : ''}`}>
                                        <input type="checkbox" checked={selectedAthleteIds.includes(athlete.id)} onChange={() => toggleAthlete(athlete.id)} />
                                        <span>{athlete.display_name_snapshot || `VĐV #${athlete.athlete_id}`}</span>
                                        <span className={`w3-tag ${athlete.source === 'guest' ? 'w3-tag-guest' : 'w3-tag-member'}`}>{athlete.source === 'guest' ? 'Khách' : 'Thành viên CLB'}</span>
                                        <span className="w3-tag">{athlete.phr_rating == null ? 'Chưa có PHR' : `PHR ${athlete.phr_rating}`}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                        {activeDivision && activeDivision.play_type !== 'doubles' && (
                            <div className="w3-row-actions">
                                {athletesInClub.map((athlete) => (
                                    <button key={athlete.id} type="button" className="v2-btn-secondary v2-btn-sm" onClick={() => addDirectEntry(athlete)} disabled={busy}>
                                        + Suất cho {athlete.display_name_snapshot || `#${athlete.athlete_id}`}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {activeDivision && activeDivision.play_type === 'doubles' && (
                        <div className="w3-section">
                            <h3>Ghép cặp</h3>
                            <div className="v2-field">
                                <label htmlFor="w3-pairing-mode">Chế độ</label>
                                <select id="w3-pairing-mode" value={pairingMode} onChange={(e) => setPairingMode(e.target.value)}>
                                    {PAIRING_MODE_OPTIONS.filter((option) => option.id !== 'none').map((option) => (
                                        <option key={option.id} value={option.id}>{option.label}</option>
                                    ))}
                                </select>
                            </div>
                            <button type="button" className="v2-btn-secondary" onClick={runPairingPreview} disabled={busy}>Xem trước ghép cặp</button>

                            {pairingPreview && (
                                <>
                                    {(pairingPreview.warnings || []).map((warning, index) => (
                                        <div key={`w-${index}`} className="w3-warning">
                                            <p>{warning.message}</p>
                                            <p className="w3-warning-note">Chỉ là cảnh báo — vẫn gửi đăng ký được.</p>
                                        </div>
                                    ))}
                                    {ratingSummary && ratingSummary.warnings.map((warning, index) => (
                                        <div key={`r-${index}`} className="w3-warning">
                                            <p><strong>{warning.label}:</strong> {warning.message}</p>
                                            <p className="w3-warning-note">Chỉ là cảnh báo — BTC vẫn duyệt được.</p>
                                        </div>
                                    ))}
                                    <ul className="w3-list">
                                        {manualPairs.map((pair, pairIndex) => (
                                            <li key={pair.id || pairIndex} className="w3-row">
                                                <div className="w3-row-top">
                                                    <span className="w3-row-name">Cặp {pairIndex + 1}</span>
                                                    <span className={`w3-tag ${pair.rating_warning && pair.rating_warning.status !== 'confirmed' ? 'w3-tag-warn' : 'w3-tag-ok'}`}>
                                                        {pair.rating_warning ? pair.rating_warning.status : 'preview'}
                                                    </span>
                                                </div>
                                                <div className="w3-inline-form">
                                                    {pair.members.map((member, memberIndex) => (
                                                        <select
                                                            key={memberIndex}
                                                            value={member.tournament_athlete_id}
                                                            onChange={(e) => swapManualMember(pairIndex, memberIndex, e.target.value)}
                                                        >
                                                            {athletesInClub.map((athlete) => (
                                                                <option key={athlete.id} value={athlete.id}>
                                                                    {athlete.display_name_snapshot || `VĐV #${athlete.athlete_id}`}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    ))}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                    {(pairingPreview.unpaired || []).length > 0 && (
                                        <div className="w3-warning">
                                            <p>Còn VĐV chưa ghép cặp: {pairingPreview.unpaired.map((athlete) => athlete.display_name).join(', ')}</p>
                                            <p className="w3-warning-note">Chỉ là cảnh báo — vẫn tiếp tục được.</p>
                                        </div>
                                    )}
                                    <button type="button" className="v2-btn-primary" onClick={commitPairing} disabled={busy || !submitState.allowed}>
                                        Chốt cặp và tạo suất thi đấu
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    <div className="w3-section">
                        <h3>BTC nhập hộ đội hình</h3>
                        <p className="w3-hint">Bản ghi lưu người thao tác và lý do, ở trạng thái chờ CLB xác nhận. Cảnh báo PHR không chặn gửi hay duyệt.</p>
                        <div className="w3-inline-form">
                            <div className="v2-field">
                                <label htmlFor="w3-proxy-athlete">VĐV</label>
                                <select id="w3-proxy-athlete" value={proxyForm.athlete_id} onChange={(e) => setProxyForm((c) => ({ ...c, athlete_id: e.target.value }))}>
                                    <option value="">Chọn VĐV</option>
                                    {athletesInClub.map((athlete) => (
                                        <option key={athlete.id} value={athlete.id}>
                                            {athlete.display_name_snapshot || `VĐV #${athlete.athlete_id}`}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="v2-field">
                                <label htmlFor="w3-proxy-reason">Lý do nhập hộ</label>
                                <input id="w3-proxy-reason" value={proxyForm.reason} onChange={(e) => setProxyForm((c) => ({ ...c, reason: e.target.value }))} placeholder="CLB khách nhờ BTC nhập hộ" />
                            </div>
                        </div>
                        <button type="button" className="v2-btn-secondary" onClick={submitProxyRoster} disabled={busy}>+ Gửi đăng ký nhập hộ</button>

                        {registrations.length > 0 && (
                            <ul className="w3-list" style={{ marginTop: 12 }}>
                                {registrations.map((registration) => (
                                    <li key={registration.id} className="w3-row">
                                        <div className="w3-row-top">
                                            <span className="w3-row-name">Đăng ký #{registration.id}</span>
                                            <span className="w3-tag">{registration.status}</span>
                                        </div>
                                        <p className="w3-row-meta">
                                            Người nộp: {registration.submitted_by_actor === 'organizer' ? 'BTC nhập hộ' : 'CLB tự nộp'}
                                            {' · CLB xác nhận: '}{registration.club_confirmation_status}
                                            {registration.private_note ? ` · ${registration.private_note}` : ''}
                                        </p>
                                        <div className="w3-row-actions">
                                            <button type="button" className="v2-btn-secondary v2-btn-sm" onClick={() => reviewRoster(registration, 'approve')} disabled={busy}>Duyệt</button>
                                            <button type="button" className="v2-btn-secondary v2-btn-sm" onClick={() => reviewRoster(registration, 'request_changes')} disabled={busy}>Yêu cầu sửa</button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {activeDivision && (entriesByDivision[String(activeDivision.id)] || []).length > 0 && (
                        <div className="w3-section">
                            <h3>Suất thi đấu đã chốt</h3>
                            <ul className="w3-list">
                                {(entriesByDivision[String(activeDivision.id)] || []).map((entry) => (
                                    <li key={entry.id} className="w3-row">
                                        <span className="w3-row-name">{entry.name_snapshot}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="v2-wizard-nav">
                        <button type="button" className="v2-btn-secondary" onClick={goBack}>Quay lại</button>
                        <button type="button" className="v2-btn-primary" onClick={goNext}>Tiếp tục</button>
                    </div>
                </div>
            )}

            {/* ===== Bước 5 ===== */}
            {step === 5 && (
                <div>
                    <p className="w3-hint">Mỗi Giai đoạn thuộc đúng một nội dung thi đấu (division_id) và có lịch riêng.</p>

                    {divisions.map((division) => {
                        const divisionStages = stages.filter((stage) => String(stage.division_id) === String(division.id));
                        return (
                            <div key={division.id} className="w3-section">
                                <h3>{division.name}</h3>
                                {divisionStages.length > 0 ? (
                                    <ul className="w3-list">
                                        {divisionStages.map((stage) => (
                                            <li key={stage.id} className="w3-row">
                                                <div className="w3-row-top">
                                                    <span className="w3-row-name">{stage.name}</span>
                                                    <span className="w3-tag">{SCHEDULE_FORMAT_LABELS[stage.schedule_format] || stage.schedule_format}</span>
                                                </div>
                                                <p className="w3-row-meta">{MATCH_FORMAT_LABELS[stage.match_format] || stage.match_format}</p>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <>
                                        <div className="v2-field">
                                            <label htmlFor={`w3-plan-${division.id}`}>Thể thức</label>
                                            <select
                                                id={`w3-plan-${division.id}`}
                                                value={stagePlanByDivision[String(division.id)] || 'single_round_robin'}
                                                onChange={(e) => setStagePlanByDivision((current) => ({ ...current, [String(division.id)]: e.target.value }))}
                                            >
                                                {STAGE_PLAN_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                                            </select>
                                        </div>
                                        {(stagePlanByDivision[String(division.id)] === 'group_knockout') && (
                                            <div className="w3-inline-form">
                                                <div className="v2-field">
                                                    <label htmlFor={`w3-groups-${division.id}`}>Số bảng</label>
                                                    <input id={`w3-groups-${division.id}`} type="number" min="1" value={stageConfig.groupCount} onChange={(e) => setStageConfig((c) => ({ ...c, groupCount: e.target.value }))} />
                                                </div>
                                                <div className="v2-field">
                                                    <label htmlFor={`w3-advance-${division.id}`}>Đi tiếp mỗi bảng</label>
                                                    <input id={`w3-advance-${division.id}`} type="number" min="1" value={stageConfig.advancePerGroup} onChange={(e) => setStageConfig((c) => ({ ...c, advancePerGroup: e.target.value }))} />
                                                </div>
                                            </div>
                                        )}
                                        <button type="button" className="v2-btn-secondary" onClick={() => createStagesForDivision(division)} disabled={busy}>+ Tạo giai đoạn</button>
                                    </>
                                )}
                            </div>
                        );
                    })}

                    <div className="v2-wizard-nav">
                        <button type="button" className="v2-btn-secondary" onClick={goBack}>Quay lại</button>
                        <button type="button" className="v2-btn-primary" onClick={goNext} disabled={stages.length === 0}>Tiếp tục</button>
                    </div>
                </div>
            )}

            {/* ===== Bước 6 ===== */}
            {step === 6 && (
                <div>
                    <p className="w3-hint">Chọn preset cho cả giải, ghi đè theo từng nội dung nếu cần, rồi xem luật hiệu lực của từng giai đoạn trước khi bốc thăm.</p>

                    <div className="w3-section">
                        <h3>Luật điểm số và tie-break</h3>
                        <div className="w3-inline-form">
                            <div className="v2-field">
                                <label htmlFor="w3-scoring">Luật điểm số</label>
                                <select id="w3-scoring" value={rulePicker.scoring_preset} onChange={(e) => setRulePicker((c) => ({ ...c, scoring_preset: e.target.value }))}>
                                    {SCORING_PRESET_OPTIONS.map((option) => (
                                        <option key={option.id} value={option.id}>{option.label} — {option.summary}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="v2-field">
                                <label htmlFor="w3-tiebreak">Thứ tự tie-break</label>
                                <select id="w3-tiebreak" value={rulePicker.tiebreak_preset} onChange={(e) => setRulePicker((c) => ({ ...c, tiebreak_preset: e.target.value }))}>
                                    {TIEBREAK_PRESET_OPTIONS.map((option) => (
                                        <option key={option.id} value={option.id}>{option.label} — {option.summary}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="w3-row-actions">
                            <button type="button" className="v2-btn-primary" onClick={() => applyRules('tournament')} disabled={busy}>Áp cho cả giải</button>
                            {divisions.map((division) => (
                                <button key={division.id} type="button" className="v2-btn-secondary v2-btn-sm" onClick={() => applyRules('division', division.id)} disabled={busy}>
                                    Ghi đè: {division.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="w3-section">
                        <h3>Luật hiệu lực từng giai đoạn</h3>
                        {effectivePreview.length === 0 ? (
                            <div className="w3-state">Chưa có giai đoạn để xem trước.</div>
                        ) : (
                            <div className="w3-scroll-x">
                                <table className="w3-rules-table">
                                    <thead>
                                        <tr>
                                            <th>Nội dung</th>
                                            <th>Giai đoạn</th>
                                            <th>Điểm số</th>
                                            <th>Tie-break</th>
                                            <th>Nguồn</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {effectivePreview.map((row) => (
                                            <tr key={row.stage_id}>
                                                <td>{row.division_name}</td>
                                                <td>{row.stage_name}</td>
                                                <td>{row.scoring.best_of} ván · tới {row.scoring.points_to} · cách {row.scoring.win_by}{row.scoring.cap ? ` · cap ${row.scoring.cap}` : ''}</td>
                                                <td>{(row.tiebreak.order || []).join(' → ')}</td>
                                                <td>
                                                    {RULE_SOURCE_LABELS[row.scoring_source]}
                                                    {row.locked ? ' · đã khóa' : ''}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <div className="v2-wizard-nav">
                        <button type="button" className="v2-btn-secondary" onClick={goBack}>Quay lại</button>
                        <button type="button" className="v2-btn-primary" onClick={goNext}>Tiếp tục</button>
                    </div>
                </div>
            )}

            {/* ===== Bước 7 ===== */}
            {step === 7 && (
                <div>
                    <p className="w3-hint">Sinh lịch cho từng giai đoạn. Lịch dùng suất thi đấu của nội dung tương ứng.</p>

                    {stages.length === 0 ? (
                        <div className="w3-state">Chưa có giai đoạn nào để sinh lịch.</div>
                    ) : (
                        <ul className="w3-list">
                            {stages.map((stage) => {
                                const division = divisions.find((item) => String(item.id) === String(stage.division_id));
                                return (
                                    <li key={stage.id} className="w3-row">
                                        <div className="w3-row-top">
                                            <span className="w3-row-name">{division ? `${division.name} · ` : ''}{stage.name}</span>
                                            <span className="w3-tag">{SCHEDULE_FORMAT_LABELS[stage.schedule_format] || stage.schedule_format}</span>
                                        </div>
                                        <p className="w3-row-meta">
                                            {generated[String(stage.id)] != null
                                                ? `Đã sinh ${generated[String(stage.id)]} trận đấu.`
                                                : 'Chưa sinh lịch.'}
                                        </p>
                                        <div className="w3-row-actions">
                                            <button type="button" className="v2-btn-secondary v2-btn-sm" onClick={() => runGenerate(stage)} disabled={busy}>
                                                {busy ? 'Đang xử lý...' : 'Sinh lịch'}
                                            </button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    <div className="v2-wizard-nav">
                        <button type="button" className="v2-btn-secondary" onClick={goBack}>Quay lại</button>
                        <button type="button" className="v2-btn-primary" onClick={finish}>Mở console giải</button>
                    </div>
                </div>
            )}
        </div>
    );
}
