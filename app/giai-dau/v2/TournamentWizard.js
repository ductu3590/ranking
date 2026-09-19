'use client';

// Wizard tạo giải — luồng 3 bước (Thể thức · Thông tin giải · Đăng ký).
// Component này điều phối state + hiệu ứng + tạo giải; phần trình bày từng bước
// nằm ở app/giai-dau/v2/wizard/{StepConfig,StepInfo,StepRegister,LivePreview}.
// Mobile-first ~380px rồi mở rộng lên desktop khung rộng. Chỉ fetch qua
// tournamentV2Client, KHÔNG gọi Supabase trực tiếp. Quyền admin lấy từ
// /api/groups/session (server), KHÔNG tin role trong localStorage.
//
// TẠO GIẢI LÀ BẢN NHÁP BỀN VỮNG THEO CHECKPOINT, KHÔNG PHẢI GIAO DỊCH NGUYÊN TỬ.
// Mỗi bước ghi dữ liệu là một checkpoint có tên; id máy chủ trả về được lưu vào
// bản nháp (localStorage) nên tải lại trang vẫn đi tiếp đúng chỗ, không tạo trùng.
// Không có checkpoint nào được nuốt lỗi: hỏng bước nào thì dừng ở bước đó, giữ
// nguyên bản nháp + toàn bộ người chơi đã nhập, và hiện nút "Thử lại" cho đúng bước.
// "✓ Đã tạo giải" chỉ hiện sau khi checkpoint cuối (kiểm tra lại readiness) trả về
// trạng thái 'ready'.

import { useState, useEffect, useMemo, useRef } from 'react';
import {
    createTournament,
    saveDivision,
    saveStage,
    saveDivisionEntry,
    previewSchedule,
    inviteTournamentClub,
    inviteExternalClub,
    updateTournamentClub,
    listClubRoster,
    listAvailableTournamentClubs,
    listDivisions,
    listStages,
    listTournamentClubs,
    replaceDivisionParticipants,
    previewDivisionPairing,
    confirmDivisionPairing,
    configureTopTwoPlayoff,
    getDivisionSetup,
} from '@/lib/tournamentV2Client';
import { resolveCompetition, describeCombo, effectiveScoring, defaultConfigForScope } from '@/lib/tournament/wizardConfig';
import {
    CHECKPOINT,
    CHECKPOINT_LABELS,
    UNIFIED_DOUBLES_PLAN,
    createDraft,
    readDraft,
    writeDraft,
    clearDraft,
    nextCheckpoint,
    isComplete,
    completedCheckpoints,
    recordCheckpoint,
    recordPartial,
    partialOf,
    markAttempt,
    attemptCount,
    checkpointIdempotency,
    newClientRef,
    makeParticipant,
    pinRevision,
    releaseRevision,
} from '@/lib/tournament/wizardDraft';
import { runCheckpointSequence, beginMutation } from '@/lib/tournament/wizardRunner';
import { shuffle, chunkPairs, splitTeams } from './wizard/utils';
import StepConfig from './wizard/StepConfig';
import StepInfo from './wizard/StepInfo';
import StepRegister from './wizard/StepRegister';
import './v2.css';
import './wizard.css';

/* ==================== Hằng nhãn ==================== */

const STEPS = [
    { n: 1, label: 'Thể thức' },
    { n: 2, label: 'Thông tin giải' },
    { n: 3, label: 'Đăng ký' },
];

// Ánh xạ đơn vị vào sân → play_type của division (nguồn chân lý ở DB).
const UNIT_TO_PLAY = { don: 'singles', doi: 'doubles', team: 'team' };
// Nhãn hiển thị của schedule_format engine trả về.
const SCHEDULE_LABELS = { round_robin: 'Vòng tròn', knockout: 'Loại trực tiếp' };
const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

// localStorage có thể bị chặn (chế độ riêng tư) — đọc qua hàm này để không vỡ trang.
function browserStorage() {
    try {
        if (typeof window === 'undefined') return null;
        return window.localStorage;
    } catch (storageError) {
        return null;
    }
}

function participantName(participant) {
    return participant && participant.display_name ? participant.display_name : '';
}

// Chuỗi checkpoint theo phạm vi/đơn vị. Luồng nội bộ đánh đôi dùng bộ danh tính
// thống nhất (VĐV → roster nội dung → cặp → entry). Các luồng còn lại giữ nguyên
// hành vi cũ (saveDivisionEntry / mời CLB) nhưng KHÔNG còn nuốt lỗi.
function planForFlow(scope, unit, competition) {
    const base = [CHECKPOINT.TOURNAMENT, CHECKPOINT.HOST_CLUB, CHECKPOINT.DIVISION, CHECKPOINT.GROUP_STAGE];
    if (scope === 'internal' && unit === 'doi') {
        // Dùng đúng danh sách checkpoint đã đóng băng để wizard không trôi khỏi hợp đồng.
        // Play-off hai bảng chỉ dựng được khi vòng bảng thật sự có 2 bảng (A/B);
        // một bảng thì bỏ hai checkpoint play-off, phần còn lại giữ nguyên thứ tự.
        const skipPlayoff = !hasTwoGroupPlayoff(competition);
        return UNIFIED_DOUBLES_PLAN.filter((name) => !(skipPlayoff
            && (name === CHECKPOINT.PLAYOFF_STAGE || name === CHECKPOINT.PLAYOFF_PLAN)));
    }
    if (scope === 'internal') return base.concat([CHECKPOINT.LEGACY_ENTRIES]);
    if (scope === 'friendly') return base.concat([CHECKPOINT.CLUB_INVITES]);
    return base;
}

function hasTwoGroupPlayoff(competition) {
    return Boolean(competition)
        && competition.schedule_format === 'round_robin'
        && Number(competition.group_count) === 2;
}

/* ==================== Component ==================== */

export default function TournamentWizard({ onDone }) {
    const [group, setGroup] = useState({ id: null, name: '', role: 'member' });
    const [step, setStep] = useState(1);
    const [mView, setMView] = useState('setup'); // tab mobile bước 1: setup | preview
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const [toast, setToast] = useState('');

    /* --- Cấu hình thể thức (bước 1) --- */
    const [scope, setScope] = useState('internal');
    const [unit, setUnit] = useState('doi');
    const [userScoring, setUserScoring] = useState('individual');
    const [fmt, setFmt] = useState('rr');
    const [bestOf, setBestOf] = useState(1);
    const [teamSize, setTeamSize] = useState(4);
    const [subGames, setSubGames] = useState(5);
    const [teamCount, setTeamCount] = useState(2);
    // Trận tranh hạng ba — mặc định TẮT, chỉ dùng cho play-off hai bảng.
    const [bronze, setBronze] = useState(false);

    /* --- Thông tin giải (bước 2) --- */
    const [info, setInfo] = useState({ name: 'Giải CLB mùa hè 2026', slug: 'giai-clb-mua-he-2026', description: '' });

    /* --- Đăng ký (bước 3) --- */
    // players/pairs giữ ĐỐI TƯỢNG người chơi { client_ref, display_name, athlete_id, source }.
    // client_ref sinh đúng một lần lúc thêm tên và không bao giờ sinh lại.
    const [players, setPlayers] = useState([]);
    const [pairs, setPairs] = useState([]);
    const [sel, setSel] = useState(null); // {p, k} thành viên đang chọn để đổi chỗ
    const [playerInput, setPlayerInput] = useState('');
    const [roster, setRoster] = useState([]); // roster CLB thật: {member_id, full_name, is_active, athlete_id}
    const [pickhubClubs, setPickhubClubs] = useState([]); // CLB PickHub mời được: {id, name}
    const [inviteClubs, setInviteClubs] = useState([]); // {club_id?, name, status, n, ext}
    // CLB đã đăng ký ở phạm vi cộng đồng — mặt công khai thuộc spec
    // tournament-open-registration; ở đây chỉ minh hoạ thiết lập (community bị khoá).
    const [regClubs] = useState([
        { name: 'CLB Trấn Yên', status: 'approved', n: 6 },
        { name: 'CLB Văn Chấn', status: 'pending', n: 8 },
        { name: 'CLB Lục Yên', status: 'pending', n: 6 },
    ]);
    const [friendlyDeadline, setFriendlyDeadline] = useState('');
    const [communityDeadline, setCommunityDeadline] = useState('');
    const [communityWho, setCommunityWho] = useState('both');

    /* --- Xem trước sống (bước 1) --- */
    const [preview, setPreview] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState('');

    /* --- Bản nháp tạo giải (checkpoint bền vững) --- */
    const [draft, setDraft] = useState(null);
    const [activeCheckpoint, setActiveCheckpoint] = useState('');
    const [failure, setFailure] = useState(null); // {checkpoint,label,message,code,status,kind}
    const [conflict, setConflict] = useState(null); // ảnh chụp thiết lập sau khi 409
    const [resumable, setResumable] = useState(false);
    const draftRef = useRef(null);
    const refSeq = useRef(0);

    const isAdmin = group.role === 'admin';

    /* ==================== Quyền từ session server ==================== */

    useEffect(() => {
        let alive = true;
        fetch('/api/groups/session', { credentials: 'same-origin', cache: 'no-store' })
            .then((response) => response.json())
            .then((view) => {
                const session = view?.session;
                if (!alive || !session) return;
                setGroup({
                    id: session.group_id ?? null,
                    code: session.group_code ?? null,
                    name: session.group_name ?? '',
                    role: session.role || 'member',
                });
            })
            .catch(() => { if (alive) setGroup((current) => ({ ...current, role: 'member' })); });
        return () => { alive = false; };
    }, []);

    /* ==================== Dữ liệu thật: roster CLB + CLB PickHub mời được ==================== */

    useEffect(() => {
        if (!isAdmin) return undefined;
        let alive = true;
        listClubRoster()
            .then((rows) => { if (alive) setRoster(Array.isArray(rows) ? rows : []); })
            .catch(() => { if (alive) setRoster([]); });
        return () => { alive = false; };
    }, [isAdmin]);

    useEffect(() => {
        if (!isAdmin) return undefined;
        let alive = true;
        listAvailableTournamentClubs()
            .then((rows) => { if (alive) setPickhubClubs(Array.isArray(rows) ? rows : []); })
            .catch(() => { if (alive) setPickhubClubs([]); });
        return () => { alive = false; };
    }, [isAdmin]);

    /* ==================== Tiếp tục bản nháp dở sau khi tải lại trang ==================== */

    useEffect(() => {
        if (!isAdmin || group.id == null) return;
        if (draftRef.current) return;
        const stored = readDraft(browserStorage(), group.id);
        if (!stored) return;
        if (isComplete(stored)) { clearDraft(browserStorage(), group.id); return; }
        draftRef.current = stored;
        setDraft(stored);
        restoreFromDraft(stored);
        setResumable(true);
        setStep(3);
    }, [isAdmin, group.id]);

    // Khôi phục đúng cấu hình + đúng người chơi (kèm client_ref cũ) từ bản nháp.
    function restoreFromDraft(stored) {
        const config = stored.config || {};
        if (config.scope) setScope(config.scope);
        if (config.unit) setUnit(config.unit);
        if (config.userScoring) setUserScoring(config.userScoring);
        if (config.fmt) setFmt(config.fmt);
        if (config.bestOf) setBestOf(Number(config.bestOf));
        if (config.teamSize) setTeamSize(Number(config.teamSize));
        if (config.subGames) setSubGames(Number(config.subGames));
        if (config.teamCount) setTeamCount(Number(config.teamCount));
        setBronze(Boolean(config.bronze));
        setInfo({ name: config.name || '', slug: config.slug || '', description: config.description || '' });
        if (Array.isArray(config.invite_clubs)) setInviteClubs(config.invite_clubs);
        const participants = Array.isArray(stored.participants) ? stored.participants : [];
        setPlayers(participants);
        const byRef = new Map(participants.map((item) => [item.client_ref, item]));
        const restoredPairs = (stored.pairs || [])
            .map((pair) => [byRef.get(pair[0]) || null, pair[1] ? byRef.get(pair[1]) || null : null])
            .filter((pair) => pair[0]);
        setPairs(restoredPairs.length ? restoredPairs : chunkPairs(participants));
        refSeq.current = participants.length;
    }

    /* ==================== Cấu hình dẫn xuất ==================== */

    const eff = effectiveScoring({ unit, scope, userScoring });
    const cfg = useMemo(
        () => ({ scope, unit, userScoring, fmt, bestOf, teamSize, subGames, teamCount }),
        [scope, unit, userScoring, fmt, bestOf, teamSize, subGames, teamCount],
    );

    // Cấu hình đã resolve (null khi tổ hợp chưa hợp lệ) — dùng cho cả xem trước lẫn tạo giải.
    const competition = useMemo(() => {
        try {
            return resolveCompetition(cfg);
        } catch (configError) {
            return null;
        }
    }, [cfg]);

    const unifiedDoubles = scope === 'internal' && unit === 'doi';
    const groupCount = Number(competition?.group_count || 1);
    const playoffEnabled = unifiedDoubles && hasTwoGroupPlayoff(competition);

    // Danh sách đơn vị vào sân để xem trước (người/cặp/đội/CLB).
    const clubList = scope === 'friendly' ? inviteClubs : regClubs;
    const entrantLabels = useMemo(() => {
        if (unit === 'team') {
            if (scope === 'internal') return splitTeams(players, teamCount).map((_, i) => `Đội ${i + 1}`);
            return clubList.map((c) => c.name);
        }
        if (scope !== 'internal') return clubList.map((c) => c.name);
        if (unit === 'don') return players.map(participantName);
        return pairs.map((pr) => (pr[1] ? `${participantName(pr[0])} / ${participantName(pr[1])}` : `${participantName(pr[0])} (thiếu)`));
    }, [unit, scope, players, pairs, teamCount, clubList]);

    // entrant_count: số thực đang có, hoặc ước lượng 6 khi chưa nhập đủ.
    const entrantCount = entrantLabels.length >= 2 ? entrantLabels.length : 6;
    const previewLabels = useMemo(() => {
        const labels = entrantLabels.slice();
        while (labels.length < entrantCount) labels.push(`Suất ${labels.length + 1}`);
        return labels;
    }, [entrantLabels, entrantCount]);

    /* ==================== Xem trước sống qua previewSchedule ==================== */

    useEffect(() => {
        if (!isAdmin) return undefined;
        if (!competition) { setPreview(null); return undefined; }
        let alive = true;
        setPreviewLoading(true);
        setPreviewError('');
        previewSchedule({ competition, entrant_count: entrantCount, seed: 1 })
            .then((res) => { if (alive) setPreview(res); })
            .catch((err) => { if (alive) { setPreview(null); setPreviewError(err.message || 'Không xem trước được lịch.'); } })
            .finally(() => { if (alive) setPreviewLoading(false); });
        return () => { alive = false; };
    }, [isAdmin, competition, entrantCount]);

    /* ==================== Thao tác cấu hình ==================== */

    function pickScope(next) {
        if (next === scope) return;
        setScope(next);
        // Áp mặc định hợp lý cho phạm vi (giao hữu/cộng đồng → cộng điểm CLB).
        const preset = defaultConfigForScope(next);
        setUserScoring(preset.userScoring);
    }

    function pickUnit(next) {
        setUnit(next);
        if (next === 'team') setUserScoring('individual');
    }

    /* ==================== Thao tác đăng ký nội bộ ==================== */

    // Sinh client_ref MỘT LẦN cho mỗi dòng tên vừa thêm.
    function buildParticipant(displayName, athleteId, source) {
        refSeq.current += 1;
        return makeParticipant({
            client_ref: newClientRef(refSeq.current),
            display_name: displayName,
            athlete_id: athleteId,
            source,
        });
    }

    function addPlayers() {
        const parsed = playerInput.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
        if (!parsed.length) return;
        // Nhập tay → khách (athlete_id null). Khách là hợp lệ, không bịa danh tính CLB.
        const next = [...players, ...parsed.map((name) => buildParticipant(name, null, 'guest'))];
        setPlayers(next);
        setPairs(chunkPairs(next));
        setPlayerInput('');
    }

    function removePlayer(index) {
        const next = players.filter((_, i) => i !== index);
        setPlayers(next);
        setPairs(chunkPairs(next));
        setSel(null);
    }

    // Thêm một thành viên CLB thật (từ roster). athlete_id có thể null — đó là
    // thành viên chưa có hồ sơ VĐV toàn cục, lưu như khách chứ KHÔNG tạo hồ sơ giả.
    function addRosterMember(member) {
        const fullName = typeof member === 'string' ? member : member?.full_name;
        if (!fullName) return;
        const athleteId = typeof member === 'string' ? null : member?.athlete_id ?? null;
        if (athleteId != null && players.some((item) => item.athlete_id === Number(athleteId))) return;
        if (athleteId == null && players.some((item) => item.display_name === fullName)) return;
        const next = [...players, buildParticipant(fullName, athleteId, athleteId == null ? 'guest' : 'club_member')];
        setPlayers(next);
        setPairs(chunkPairs(next));
    }

    function randomPairs() {
        const shuffled = shuffle(players);
        setPlayers(shuffled);
        setPairs(chunkPairs(shuffled));
        setSel(null);
    }

    // Chạm hai thành viên để đổi chỗ giữa các cặp.
    function tapMember(p, k) {
        if (!sel) { setSel({ p, k }); return; }
        if (sel.p === p && sel.k === k) { setSel(null); return; }
        const nextPairs = pairs.map((pr) => pr.slice());
        const a = nextPairs[sel.p][sel.k];
        const b = nextPairs[p][k];
        nextPairs[sel.p][sel.k] = b;
        nextPairs[p][k] = a;
        const flat = [];
        nextPairs.forEach((pr) => { if (pr[0]) flat.push(pr[0]); if (pr[1]) flat.push(pr[1]); });
        setPairs(nextPairs);
        setPlayers(flat);
        setSel(null);
    }

    function changeTeamCount(delta) {
        setTeamCount((current) => Math.min(Math.max(2, players.length || 2), Math.max(2, current + delta)));
    }

    function randomTeams() {
        setPlayers((current) => shuffle(current));
    }

    /* ==================== Thao tác mời CLB (giao hữu) ==================== */

    function addPickhubClub(club) {
        setInviteClubs((current) => {
            if (current.some((c) => String(c.club_id) === String(club.id))) return current;
            return [...current, { club_id: club.id, name: club.name, status: 'invited', n: 0, ext: false }];
        });
    }

    function addExternalClub(name) {
        const trimmed = String(name || '').trim();
        if (!trimmed) return;
        setInviteClubs((current) => {
            if (current.some((c) => c.ext && c.name.toLowerCase() === trimmed.toLowerCase())) return current;
            return [...current, { name: trimmed, status: 'invited', n: 0, ext: true }];
        });
    }

    /* ==================== Bản nháp + chuỗi checkpoint tạo giải ==================== */

    function persistDraft(next) {
        draftRef.current = next;
        setDraft(next);
        if (next) writeDraft(browserStorage(), next);
    }

    function snapshotPairs() {
        return pairs.map((pr) => [pr[0]?.client_ref || null, pr[1]?.client_ref || null]);
    }

    // Suất thi đấu cho luồng cũ (đơn / đội). Đôi nội bộ đi theo chuỗi danh tính thống nhất.
    function buildInternalEntries(current) {
        const config = current.config || {};
        const participants = current.participants || [];
        if (config.unit === 'team') {
            return splitTeams(participants, Number(config.teamCount) || 2).map((members, i) => ({
                name: `Đội ${i + 1}`,
                members: members.map((item) => ({ display_name: item.display_name, athlete_id: item.athlete_id })),
            }));
        }
        return participants.map((item) => ({
            name: item.display_name,
            members: [{ display_name: item.display_name, athlete_id: item.athlete_id }],
        }));
    }

    // Đọc lại (KHÔNG ghi) để thử lại không tạo bản ghi thứ hai.
    async function findHostClubId(tournamentId, clubId) {
        const clubs = await listTournamentClubs(tournamentId);
        const row = (clubs || []).find((club) => Number(club.club_id) === Number(clubId));
        return row ? Number(row.id) : null;
    }

    async function findDivisionId(tournamentId, name, playType) {
        const rows = await listDivisions(tournamentId);
        const row = (rows || []).find((item) => item.name === name && item.play_type === playType);
        return row ? Number(row.id) : null;
    }

    async function findStageId(tournamentId, divisionId, scheduleFormat) {
        const rows = await listStages(tournamentId);
        const row = (rows || []).find((item) => Number(item.division_id) === Number(divisionId) && item.schedule_format === scheduleFormat);
        return row ? Number(row.id) : null;
    }

    async function readSetupRevision(tournamentId, divisionId) {
        const setup = await getDivisionSetup(tournamentId, divisionId);
        const revision = Number(setup?.readiness?.revision || setup?.division?.setup_revision || 0);
        if (!Number.isSafeInteger(revision) || revision < 1) {
            throw new Error('Không đọc được phiên bản thiết lập (revision) của nội dung thi đấu.');
        }
        return { setup, revision };
    }

    function requireId(value, message) {
        const id = Number(value || 0);
        if (!id) throw new Error(message);
        return id;
    }

    // Một checkpoint = một lần ghi có tên. Trả về { draft, result }; ném lỗi thì
    // chuỗi dừng ngay tại đây, KHÔNG có nhánh nào nuốt lỗi.
    async function runCheckpoint(current, name, commit) {
        const config = current.config || {};
        const results = current.results || {};
        const tournamentId = results.tournament?.tournament_id;
        const divisionId = results.division?.division_id;

        if (name === CHECKPOINT.TOURNAMENT) {
            const res = await createTournament({
                name: config.name,
                slug: config.slug || undefined,
                organizer_mode: config.scope,
                entrant_type: config.entrant_type,
                description: config.description || undefined,
                // Số ván mỗi trận là thứ duy nhất bước 1 chốt về luật; không gửi
                // thì luật rơi về mặc định BO3 và trận BO1 không bao giờ kết thúc.
                default_scoring: config.best_of ? { best_of: Number(config.best_of) } : undefined,
                // Thử lại với cùng mã bản nháp thì máy chủ trả lại đúng giải cũ.
                client_draft_key: current.client_draft_key,
            });
            const id = requireId(res?.tournament?.id, 'Máy chủ không trả về mã giải.');
            return { draft: current, result: { tournament_id: id, reused: Boolean(res?.reused) } };
        }

        if (name === CHECKPOINT.HOST_CLUB) {
            const clubId = requireId(group.id, 'Phiên đăng nhập không có mã CLB chủ giải.');
            if (attemptCount(current, name) > 1) {
                const existing = await findHostClubId(tournamentId, clubId);
                if (existing) return { draft: current, result: { tournament_club_id: existing, reused: true } };
            }
            try {
                const res = await inviteTournamentClub({ tournament_id: tournamentId, club_id: clubId });
                const id = requireId(res?.club?.id, 'Máy chủ không trả về mã CLB chủ giải.');
                return { draft: current, result: { tournament_club_id: id } };
            } catch (inviteError) {
                // 409 ở đây nghĩa là CLB chủ giải đã có sẵn (lần gửi trước đã tới nơi).
                // Đọc lại bản ghi thật thay vì ghi lần hai; không tìm thấy thì báo lỗi.
                if (inviteError?.status !== 409) throw inviteError;
                const existing = await findHostClubId(tournamentId, clubId);
                if (!existing) throw inviteError;
                return { draft: current, result: { tournament_club_id: existing, reused: true } };
            }
        }

        if (name === CHECKPOINT.DIVISION) {
            if (attemptCount(current, name) > 1) {
                const existing = await findDivisionId(tournamentId, config.name, config.play_type);
                if (existing) return { draft: current, result: { division_id: existing, reused: true } };
            }
            const res = await saveDivision({
                tournament_id: tournamentId,
                name: config.name,
                play_type: config.play_type,
                scoring_scope: config.scoring_scope,
                pairing_mode: config.unit === 'doi' ? 'random_balanced' : 'none',
            });
            const id = requireId(res?.division?.id, 'Máy chủ không trả về mã nội dung thi đấu.');
            return { draft: current, result: { division_id: id } };
        }

        if (name === CHECKPOINT.GROUP_STAGE) {
            const scheduleFormat = config.schedule_format;
            if (attemptCount(current, name) > 1) {
                const existing = await findStageId(tournamentId, divisionId, scheduleFormat);
                if (existing) return { draft: current, result: { group_stage_id: existing, reused: true } };
            }
            const res = await saveStage({
                tournament_id: tournamentId,
                division_id: divisionId,
                name: SCHEDULE_LABELS[scheduleFormat] || 'Giai đoạn 1',
                schedule_format: scheduleFormat,
                match_format: config.unit === 'team' ? 'mlp' : 'simple',
                config: scheduleFormat === 'round_robin' ? { groupCount: Number(config.group_count) || 1 } : {},
            });
            const id = requireId(res?.stage?.id, 'Máy chủ không trả về mã giai đoạn.');
            return { draft: current, result: { group_stage_id: id, group_count: Number(config.group_count) || 1 } };
        }

        if (name === CHECKPOINT.PARTICIPANTS) {
            const clubId = requireId(results.host_club?.tournament_club_id, 'Chưa có CLB chủ giải để gắn vận động viên.');
            const participants = (current.participants || []).map((item) => ({
                client_ref: item.client_ref,
                display_name: item.display_name,
                athlete_id: item.athlete_id == null ? null : Number(item.athlete_id),
                source: item.source === 'club_member' && item.athlete_id != null ? 'club_member' : 'guest',
            }));
            if (!participants.length) throw new Error('Danh sách vận động viên đang trống.');
            const attempt = await beginMutation({
                draft: current, name, commit,
                payload: { tournament_id: tournamentId, division_id: divisionId, tournament_club_id: clubId, participants },
                readRevision: async () => (await readSetupRevision(tournamentId, divisionId)).revision,
            });
            const revision = attempt.revision;
            const stamped = { draft: attempt.draft, key: attempt.key };
            const res = await replaceDivisionParticipants(attempt.body);
            const athleteIds = {};
            for (const row of res?.athletes || []) {
                if (row?.client_ref) athleteIds[row.client_ref] = Number(row.tournament_athlete_id);
            }
            const missing = participants.filter((item) => !athleteIds[item.client_ref]);
            if (missing.length) throw new Error(`Máy chủ chưa trả mã vận động viên cho ${missing.length} người trong danh sách.`);
            return {
                draft: stamped.draft,
                result: {
                    athlete_ids: athleteIds,
                    setup_revision: Number(res?.setup_revision || 0) || revision + 1,
                    roster_count: Number(res?.roster_count || participants.length),
                },
            };
        }

        if (name === CHECKPOINT.PAIRS) {
            const athleteIds = results.participants?.athlete_ids || {};
            const pairRows = (current.pairs || []).filter((pair) => pair[0] && pair[1]);
            if (!pairRows.length) throw new Error('Chưa có cặp nào đủ hai người để chốt.');
            const pairsPayload = pairRows.map((pair) => ({
                members: [
                    { tournament_athlete_id: athleteIds[pair[0]], role: 'player' },
                    { tournament_athlete_id: athleteIds[pair[1]], role: 'player' },
                ],
            }));
            if (pairsPayload.some((pair) => pair.members.some((member) => !member.tournament_athlete_id))) {
                throw new Error('Thiếu mã vận động viên cho một số cặp — hãy chạy lại bước lưu danh sách vận động viên.');
            }
            // Xem trước trước khi ghi để lấy cảnh báo (thiếu PHR, lẻ người).
            // Thành phần cặp là do BTC tự xếp ở bước 3, không lấy theo kết quả xem trước.
            const previewResult = await previewDivisionPairing({
                division_id: divisionId,
                athlete_ids: Object.values(athleteIds),
                pairing_mode: 'manual',
                seed: 1,
            });
            if (previewResult?.unpaired?.length) {
                const names = previewResult.unpaired.map((athlete) => athlete.display_name).join(', ');
                throw new Error(`Danh sách đang lẻ người (${names}). Hãy thêm hoặc bớt người cho chẵn rồi thử lại.`);
            }
            const attempt = await beginMutation({
                draft: current, name, commit,
                payload: { division_id: divisionId, pairs: pairsPayload, pairing_mode: 'manual' },
                readRevision: async () => (await readSetupRevision(tournamentId, divisionId)).revision,
            });
            const revision = attempt.revision;
            const stamped = { draft: attempt.draft, key: attempt.key };
            const res = await confirmDivisionPairing(attempt.body);
            const pairIds = (res?.pairIds || []).map(Number);
            const entryIds = (res?.entryIds || []).map(Number);
            if (pairIds.length !== pairsPayload.length) {
                throw new Error(`Máy chủ chốt ${pairIds.length} cặp nhưng đã gửi ${pairsPayload.length} cặp.`);
            }
            return {
                draft: stamped.draft,
                result: {
                    pair_ids: pairIds,
                    entry_ids: entryIds,
                    setup_revision: Number(res?.setup_revision || 0) || revision + 1,
                    warnings: (previewResult?.warnings || []).map((item) => item.message).filter(Boolean),
                },
            };
        }

        if (name === CHECKPOINT.PLAYOFF_STAGE) {
            if (attemptCount(current, name) > 1) {
                const existing = await findStageId(tournamentId, divisionId, 'knockout');
                if (existing) return { draft: current, result: { playoff_stage_id: existing, reused: true } };
            }
            const res = await saveStage({
                tournament_id: tournamentId,
                division_id: divisionId,
                name: 'Play-off',
                schedule_format: 'knockout',
                match_format: 'simple',
                config: {},
            });
            const id = requireId(res?.stage?.id, 'Máy chủ không trả về mã giai đoạn play-off.');
            return { draft: current, result: { playoff_stage_id: id } };
        }

        if (name === CHECKPOINT.PLAYOFF_PLAN) {
            const groupStageId = requireId(results.group_stage?.group_stage_id, 'Chưa có giai đoạn vòng bảng.');
            const playoffStageId = requireId(results.playoff_stage?.playoff_stage_id, 'Chưa có giai đoạn play-off.');
            const attempt = await beginMutation({
                draft: current, name, commit,
                payload: {
                    tournament_id: tournamentId, division_id: divisionId,
                    group_stage_id: groupStageId, playoff_stage_id: playoffStageId,
                    bronze: Boolean(config.bronze),
                },
                readRevision: async () => (await readSetupRevision(tournamentId, divisionId)).revision,
            });
            const revision = attempt.revision;
            const stamped = { draft: attempt.draft, key: attempt.key };
            const res = await configureTopTwoPlayoff(attempt.body);
            return {
                draft: stamped.draft,
                result: { setup_revision: Number(res?.setup_revision || 0) || revision + 1, bronze: Boolean(config.bronze) },
            };
        }

        if (name === CHECKPOINT.VERIFY) {
            // Cổng duy nhất dẫn tới thông báo thành công: đọc lại thiết lập thật.
            const setup = await getDivisionSetup(tournamentId, divisionId);
            const status = setup?.readiness?.status;
            if (status !== 'ready') {
                const reasons = (setup?.readiness?.reasons || []).map((item) => item.message).filter(Boolean);
                throw new Error(`Thiết lập nội dung chưa sẵn sàng. ${reasons.join(' ') || 'Máy chủ chưa nêu lý do cụ thể.'}`);
            }
            return { draft: current, result: { status: 'ready', revision: Number(setup?.readiness?.revision || 0) } };
        }

        if (name === CHECKPOINT.LEGACY_ENTRIES) {
            const clubId = requireId(results.host_club?.tournament_club_id, 'Chưa có CLB chủ giải để gắn suất thi đấu.');
            const entries = buildInternalEntries(current);
            if (!entries.length) throw new Error('Chưa có suất thi đấu nào để lưu.');
            const saved = { ...(partialOf(current, name).saved || {}) };
            let working = current;
            for (let index = 0; index < entries.length; index += 1) {
                if (saved[index]) continue;
                const entry = entries[index];
                const payload = { division_id: divisionId, tournament_club_id: clubId, name: entry.name, members: entry.members, index };
                const stamped = checkpointIdempotency(working, `${name}:${index}`, payload);
                working = stamped.draft;
                const res = await saveDivisionEntry({
                    division_id: divisionId,
                    tournament_club_id: clubId,
                    name: entry.name,
                    members: entry.members,
                    idempotency_key: stamped.key,
                });
                saved[index] = Number(res?.entry_id || res?.entry?.id || 0) || `ok-${index}`;
                // Ghi tiến độ từng suất: hỏng giữa chừng thì lần thử lại không lưu trùng.
                working = recordPartial(working, name, { saved });
                persistDraft(working);
            }
            return { draft: working, result: { entry_count: entries.length, saved } };
        }

        if (name === CHECKPOINT.CLUB_INVITES) {
            const clubs = config.invite_clubs || [];
            if (!clubs.length) return { draft: current, result: { invited: {}, warnings: [] } };
            const invited = { ...(partialOf(current, name).invited || {}) };
            const warnings = [];
            let working = current;
            for (let index = 0; index < clubs.length; index += 1) {
                if (invited[index]) continue;
                const club = clubs[index];
                try {
                    if (club.ext) {
                        await inviteExternalClub({ tournament_id: tournamentId, external_club_name: club.name });
                    } else if (club.club_id != null) {
                        await inviteTournamentClub({ tournament_id: tournamentId, club_id: Number(club.club_id) });
                    } else {
                        throw new Error(`CLB "${club.name}" thiếu thông tin để mời.`);
                    }
                    invited[index] = 'invited';
                } catch (inviteError) {
                    // 409 = CLB đã có trong giải: ghi nhận là đã mời và báo rõ cho BTC.
                    if (inviteError?.status !== 409) throw inviteError;
                    invited[index] = 'existing';
                    warnings.push(`CLB "${club.name}" đã có sẵn trong giải.`);
                }
                working = recordPartial(working, name, { invited });
                persistDraft(working);
            }
            return { draft: working, result: { invited, warnings } };
        }

        throw new Error(`Checkpoint không xác định: ${name}`);
    }

    // Sau 409: tải lại thiết lập thật để BTC nhìn thấy trạng thái mới rồi TỰ quyết định
    // gửi lại. Không bao giờ tự động gửi lại sau xung đột.
    async function loadConflictState(current) {
        const tournamentId = current.results?.tournament?.tournament_id;
        const divisionId = current.results?.division?.division_id;
        if (!tournamentId || !divisionId) { setConflict({ loaded: false, error: '' }); return; }
        try {
            const setup = await getDivisionSetup(tournamentId, divisionId);
            setConflict({
                loaded: true,
                revision: Number(setup?.readiness?.revision || 0),
                status: setup?.readiness?.status || '',
                lock: setup?.readiness?.roster_lock_status || '',
                rosterCount: (setup?.roster?.athlete_ids || []).length,
                pairCount: (setup?.pairs || []).length,
                entryCount: (setup?.entries || []).length,
                reasons: (setup?.readiness?.reasons || []).map((item) => item.message).filter(Boolean),
            });
        } catch (reloadError) {
            setConflict({ loaded: false, error: reloadError?.message || 'Không tải lại được thiết lập nội dung.' });
        }
    }

    // Chạy chuỗi checkpoint từ điểm dở dang. Trả về true khi TẤT CẢ checkpoint xong.
    async function runPersistence(startDraft) {
        let current = startDraft;
        setBusy(true);
        setFailure(null);
        setConflict(null);
        setResumable(false);
        try {
            // Orchestration dùng CHUNG với test tích hợp (lib/tournament/wizardRunner.js):
            // runner tự lưu draft trước mỗi lần gọi mạng và không bao giờ quay về
            // snapshot cũ khi có lỗi.
            const handlers = {};
            for (const checkpointName of current.plan || []) {
                handlers[checkpointName] = ({ draft: d, name, commit }) => runCheckpoint(d, name, commit);
            }
            const outcome = await runCheckpointSequence({
                draft: current,
                handlers,
                persist: persistDraft,
                onStart: (name) => setActiveCheckpoint(name),
                onConflict: (nextDraft) => loadConflictState(nextDraft),
            });
            current = outcome.draft;
            if (!outcome.ok) {
                const checkpointError = outcome.error || {};
                const status = Number(checkpointError.status || 0);
                setFailure({
                    checkpoint: outcome.checkpoint,
                    label: CHECKPOINT_LABELS[outcome.checkpoint] || outcome.checkpoint,
                    message: checkpointError.message || 'Lỗi không xác định từ máy chủ.',
                    code: checkpointError.code || '',
                    status,
                    kind: status === 409 ? 'conflict' : 'error',
                });
                return false;
            }
            // Tới đây nghĩa là mọi checkpoint trong kế hoạch đã xong — với luồng đôi nội bộ
            // thì checkpoint cuối là 'verify' (readiness.status === 'ready').
            const tournamentId = current.results?.tournament?.tournament_id || null;
            const invites = current.results?.club_invites?.warnings || [];
            clearDraft(browserStorage(), current.group_id);
            draftRef.current = null;
            setDraft(null);
            if (invites.length) setNotice(invites.join(' '));
            setToast('✓ Đã tạo giải');
            if (onDone) onDone(tournamentId);
            return true;
        } finally {
            setActiveCheckpoint('');
            setBusy(false);
        }
    }

    function validateBeforeCreate() {
        if (!info.name.trim()) return { message: 'Vui lòng nhập tên giải.', step: 2 };
        if (!competition) return { message: 'Cấu hình thể thức chưa hợp lệ.', step: 1 };
        if (scope === 'internal' && unit === 'doi') {
            if (players.length < 4) return { message: 'Cần ít nhất 4 người (2 cặp) cho nội dung đánh đôi.', step: 3 };
            if (players.length % 2 !== 0) return { message: 'Số người đang lẻ — hãy thêm hoặc bớt một người để ghép đủ cặp.', step: 3 };
            if (pairs.some((pair) => !pair[0] || !pair[1])) return { message: 'Còn cặp chưa đủ hai người.', step: 3 };
        }
        if (scope === 'internal' && unit === 'don' && players.length < 2) {
            return { message: 'Cần ít nhất 2 vận động viên.', step: 3 };
        }
        if (scope === 'internal' && unit === 'team' && players.length < 2) {
            return { message: 'Cần ít nhất 2 thành viên để chia đội.', step: 3 };
        }
        if (scope === 'friendly' && !inviteClubs.length) {
            return { message: 'Hãy mời ít nhất một CLB.', step: 3 };
        }
        return null;
    }

    async function createGiai() {
        setNotice('');
        setFailure(null);
        setConflict(null);
        if (!isAdmin) return;
        const invalid = validateBeforeCreate();
        if (invalid) { setNotice(invalid.message); setStep(invalid.step); return; }
        // Còn bản nháp dở của lần trước thì đi tiếp, tuyệt đối không tạo giải thứ hai.
        if (draftRef.current && !isComplete(draftRef.current)) {
            await runPersistence(draftRef.current);
            return;
        }
        const fresh = createDraft({
            groupId: group.id,
            plan: planForFlow(scope, unit, competition),
            config: {
                scope, unit, userScoring, fmt, bestOf, teamSize, subGames, teamCount,
                bronze: playoffEnabled ? Boolean(bronze) : false,
                name: info.name.trim(),
                slug: info.slug || '',
                description: info.description || '',
                play_type: UNIT_TO_PLAY[unit],
                entrant_type: competition.entrant_type,
                scoring_scope: competition.scoring_scope,
                schedule_format: competition.schedule_format,
                group_count: Number(competition.group_count) || 1,
                best_of: competition.best_of || null,
                invite_clubs: scope === 'friendly' ? inviteClubs : [],
            },
            participants: players,
            pairs: snapshotPairs(),
        });
        persistDraft(fresh);
        await runPersistence(fresh);
    }

    // "Thử lại" chạy lại ĐÚNG checkpoint đang hỏng với cùng khóa idempotency.
    async function retryCheckpoint() {
        const current = draftRef.current;
        if (!current || busy) return;
        await runPersistence(current);
    }

    function discardDraft() {
        clearDraft(browserStorage(), group.id);
        draftRef.current = null;
        setDraft(null);
        setFailure(null);
        setConflict(null);
        setResumable(false);
        setNotice('Đã bỏ bản nháp. Phần đã tạo trên máy chủ vẫn còn — mở bảng điều hành giải để kiểm tra và làm tiếp.');
    }

    // CLB khách (giao hữu): duyệt/yêu cầu sửa — nối updateTournamentClub khi có id thật.
    async function reviewInviteClub(club, action, index) {
        if (club.id) {
            setBusy(true);
            try {
                await updateTournamentClub({ id: club.id, action });
            } catch (err) {
                setNotice(err.message || 'Không cập nhật được trạng thái CLB.');
            } finally { setBusy(false); }
            return;
        }
        // CLB chưa lưu (chưa tạo giải) — chỉ đổi trạng thái hiển thị.
        setInviteClubs((current) => current.map((row, i) => (
            i === index ? { ...row, status: action === 'approve' ? 'approved' : row.status } : row
        )));
    }

    /* ==================== Render: chặn khi không phải admin ==================== */

    if (!isAdmin) {
        return (
            <div className="w3-wrap w3-create">
                <div className="w3-top"><h1>Tạo giải</h1></div>
                <div style={{ padding: 20 }}>
                    <div className="w3-state">Chỉ trưởng nhóm/BTC mới tạo và cấu hình được giải đấu.</div>
                </div>
            </div>
        );
    }

    const comboText = describeCombo({ unit, scope, userScoring, subGames, bestOf });
    const groupNames = GROUP_LETTERS.slice(0, Math.max(1, groupCount)).join(' · ');

    return (
        <div className="w3-wrap w3-create">
            <div className="w3-top">
                <h1>Tạo giải</h1>
                <span className="w3-who">Tư cách: <b>Quản trị CLB</b>{group.name ? ` · ${group.name}` : ''}</span>
            </div>

            {/* --- Stepper 3 bước, bấm nhảy bước --- */}
            <nav className="w3-stepper" aria-label="Các bước tạo giải">
                {STEPS.map((item, index) => (
                    <span key={item.n} style={{ display: 'contents' }}>
                        {index > 0 ? <span className="w3-stepline" /> : null}
                        <button
                            type="button"
                            className={`w3-stepchip ${item.n === step ? 'is-active' : item.n < step ? 'is-done' : ''}`}
                            onClick={() => setStep(item.n)}
                        >
                            <span className="w3-n">{item.n}</span>
                            <span className="w3-t">{item.label}</span>
                        </button>
                    </span>
                ))}
            </nav>

            {notice ? <p className="v2-notice" style={{ margin: '10px 16px 0' }}>{notice}</p> : null}

            {/* --- Bản nháp dở từ lần trước (sau khi tải lại trang) --- */}
            {resumable && draft && !busy ? (
                <div className="w3-resume" role="status">
                    <b>Có bản nháp tạo giải chưa hoàn tất.</b>
                    <p>
                        Đã xong {completedCheckpoints(draft).length}/{draft.plan.length} bước.
                        Bấm “Tiếp tục tạo giải” để đi tiếp từ bước dở — giải, vận động viên và cặp đã tạo sẽ không bị tạo lại.
                    </p>
                    <div className="w3-resume-act">
                        <button type="button" className="w3-btn" onClick={retryCheckpoint}>Tiếp tục tạo giải</button>
                        <button type="button" className="w3-sbtn" onClick={discardDraft}>Bỏ bản nháp</button>
                    </div>
                </div>
            ) : null}

            {/* ===================== BƯỚC 1: THỂ THỨC ===================== */}
            {step === 1 && (
                <StepConfig
                    scope={scope}
                    unit={unit}
                    userScoring={userScoring}
                    fmt={fmt}
                    bestOf={bestOf}
                    teamSize={teamSize}
                    subGames={subGames}
                    teamCount={teamCount}
                    pickScope={pickScope}
                    pickUnit={pickUnit}
                    setUserScoring={setUserScoring}
                    setFmt={setFmt}
                    setBestOf={setBestOf}
                    setTeamSize={setTeamSize}
                    setSubGames={setSubGames}
                    mView={mView}
                    setMView={setMView}
                    comboText={comboText}
                    eff={eff}
                    previewLabels={previewLabels}
                    preview={preview}
                    previewLoading={previewLoading}
                    previewError={previewError}
                />
            )}

            {/* ===================== BƯỚC 2: THÔNG TIN GIẢI ===================== */}
            {step === 2 && <StepInfo info={info} setInfo={setInfo} />}

            {/* ===================== BƯỚC 3: ĐĂNG KÝ ===================== */}
            {step === 3 && (
                <div className="w3-formwrap">
                    <StepRegister
                        scope={scope}
                        unit={unit}
                        players={players}
                        pairs={pairs}
                        sel={sel}
                        playerInput={playerInput}
                        setPlayerInput={setPlayerInput}
                        addPlayers={addPlayers}
                        removePlayer={removePlayer}
                        randomPairs={randomPairs}
                        tapMember={tapMember}
                        roster={roster}
                        addRosterMember={addRosterMember}
                        teamCount={teamCount}
                        changeTeamCount={changeTeamCount}
                        randomTeams={randomTeams}
                        teams={splitTeams(players, teamCount)}
                        inviteClubs={inviteClubs}
                        pickhubClubs={pickhubClubs}
                        addPickhubClub={addPickhubClub}
                        addExternalClub={addExternalClub}
                        reviewInviteClub={reviewInviteClub}
                        regClubs={regClubs}
                        friendlyDeadline={friendlyDeadline}
                        setFriendlyDeadline={setFriendlyDeadline}
                        communityDeadline={communityDeadline}
                        setCommunityDeadline={setCommunityDeadline}
                        communityWho={communityWho}
                        setCommunityWho={setCommunityWho}
                        slug={info.slug}
                        busy={busy}
                        onToast={setToast}
                    />

                    {/* --- Vòng bảng & play-off (nội bộ, đánh đôi) --- */}
                    {unifiedDoubles ? (
                        <div className="w3-block w3-playoff">
                            <div className="w3-subhead"><h3>Vòng bảng &amp; play-off</h3></div>
                            <p className="w3-hint" style={{ marginTop: 0 }}>
                                {groupCount > 1
                                    ? `Chia ${groupCount} bảng (${groupNames}). Hai cặp đứng đầu mỗi bảng vào bán kết chéo: A1–B2 và B1–A2.`
                                    : 'Một bảng vòng tròn, xếp hạng theo thành tích — chưa dựng vòng play-off.'}
                            </p>
                            {playoffEnabled ? (
                                <label className="w3-check">
                                    <input
                                        type="checkbox"
                                        checked={bronze}
                                        onChange={(event) => setBronze(event.target.checked)}
                                    />
                                    <span>Có trận tranh hạng ba (hai đội thua bán kết gặp nhau)</span>
                                </label>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            )}

            {/* --- Tiến trình tạo giải theo checkpoint --- */}
            {draft && (busy || failure) ? (
                <CheckpointPanel
                    draft={draft}
                    activeCheckpoint={activeCheckpoint}
                    failure={failure}
                    conflict={conflict}
                    busy={busy}
                    onRetry={retryCheckpoint}
                    onDiscard={discardDraft}
                />
            ) : null}

            {/* --- Chân trang điều hướng --- */}
            <div className="w3-foot">
                {step > 1 ? (
                    <button type="button" className="w3-cta is-back" onClick={() => setStep(step - 1)}>Quay lại</button>
                ) : null}
                <div className="w3-mid">Bước {step} / 3</div>
                {step < 3 ? (
                    <button type="button" className="w3-cta" onClick={() => setStep(step + 1)}>Tiếp tục →</button>
                ) : (
                    <button type="button" className="w3-cta" onClick={createGiai} disabled={busy}>
                        {busy ? 'Đang tạo...' : draft ? 'Tiếp tục tạo giải' : 'Tạo giải'}
                    </button>
                )}
            </div>

            {toast ? <ToastBubble text={toast} onDone={() => setToast('')} /> : null}
        </div>
    );
}

/* ==================== Bảng tiến trình checkpoint ==================== */

// Hiện đúng bước nào xong / đang chạy / hỏng. Khi hỏng: nêu rõ tên bước, lý do,
// cam kết giữ bản nháp, và cho thử lại đúng bước đó. Khi 409: hiện trạng thái vừa
// tải lại và bắt BTC xác nhận trước khi gửi lại.
function CheckpointPanel({ draft, activeCheckpoint, failure, conflict, busy, onRetry, onDiscard }) {
    const [reviewed, setReviewed] = useState(false);
    const done = completedCheckpoints(draft);
    const doneSet = new Set(done);

    useEffect(() => { setReviewed(false); }, [failure?.checkpoint, conflict?.revision]);

    return (
        <section className="w3-cp" aria-live="polite">
            <div className="w3-cp-head">
                <strong>Tiến trình tạo giải</strong>
                <span className="w3-count">· {done.length}/{draft.plan.length} bước</span>
            </div>
            <ol className="w3-cp-list">
                {draft.plan.map((name) => {
                    const isDone = doneSet.has(name);
                    const isFailed = failure?.checkpoint === name;
                    const isActive = !isDone && !isFailed && activeCheckpoint === name;
                    const state = isDone ? 'Xong' : isFailed ? 'Hỏng' : isActive ? 'Đang chạy...' : 'Chờ';
                    return (
                        <li key={name} className={`w3-cp-item ${isDone ? 'is-done' : ''} ${isFailed ? 'is-failed' : ''} ${isActive ? 'is-active' : ''}`}>
                            <span className="w3-cp-label">{CHECKPOINT_LABELS[name] || name}</span>
                            <span className="w3-cp-state">{state}</span>
                        </li>
                    );
                })}
            </ol>

            {failure ? (
                <div className="w3-cp-fail" role="alert">
                    <p className="w3-cp-failmsg"><b>Bước “{failure.label}” chưa xong.</b> {failure.message}</p>
                    <p className="w3-cp-keep">
                        Bản nháp và toàn bộ người chơi đã nhập vẫn được giữ. Các bước đã xong sẽ không chạy lại.
                    </p>

                    {failure.kind === 'conflict' ? (
                        <div className="w3-cp-conflict">
                            <p className="w3-cp-conflict-title">Thiết lập vừa thay đổi ở nơi khác (409).</p>
                            {conflict?.loaded ? (
                                <ul className="w3-cp-conflict-list">
                                    <li>Phiên bản thiết lập hiện tại: <b>{conflict.revision}</b></li>
                                    <li>Danh sách VĐV của nội dung: <b>{conflict.rosterCount}</b></li>
                                    <li>Cặp đã chốt: <b>{conflict.pairCount}</b> · Suất thi đấu: <b>{conflict.entryCount}</b></li>
                                    <li>Đội hình: <b>{conflict.lock === 'locked' ? 'đã khóa' : 'đang mở'}</b> · Sẵn sàng: <b>{conflict.status === 'ready' ? 'có' : 'chưa'}</b></li>
                                </ul>
                            ) : (
                                <p className="w3-cp-conflict-list">{conflict?.error || 'Chưa tải lại được trạng thái mới.'}</p>
                            )}
                            {(conflict?.reasons || []).map((reason, index) => <p key={index} className="w3-cp-reason">{reason}</p>)}
                            <label className="w3-check">
                                <input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />
                                <span>Tôi đã xem trạng thái mới ở trên và muốn gửi lại bước này.</span>
                            </label>
                            <div className="w3-cp-act">
                                <button type="button" className="w3-btn" disabled={!reviewed || busy} onClick={onRetry}>
                                    Gửi lại bước này
                                </button>
                                <button type="button" className="w3-sbtn" onClick={onDiscard} disabled={busy}>Bỏ bản nháp</button>
                            </div>
                        </div>
                    ) : (
                        <div className="w3-cp-act">
                            <button type="button" className="w3-btn" onClick={onRetry} disabled={busy}>Thử lại</button>
                            <button type="button" className="w3-sbtn" onClick={onDiscard} disabled={busy}>Bỏ bản nháp</button>
                        </div>
                    )}
                </div>
            ) : null}
        </section>
    );
}

/* ==================== Toast tự tắt ==================== */

function ToastBubble({ text, onDone }) {
    useEffect(() => {
        const timer = setTimeout(onDone, 2600);
        return () => clearTimeout(timer);
    }, [onDone]);
    return <div className="w3-toast" role="status">{text}</div>;
}
