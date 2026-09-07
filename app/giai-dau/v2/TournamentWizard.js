'use client';

// Wizard tạo giải — luồng 3 bước (Thể thức · Thông tin giải · Đăng ký).
// Port từ mockup đã được duyệt sang React idiomatic (state + JSX), mobile-first
// ~380px rồi mở rộng lên desktop khung rộng. Chỉ fetch qua tournamentV2Client,
// KHÔNG gọi Supabase trực tiếp. Quyền admin lấy từ /api/groups/session (server),
// KHÔNG tin role trong localStorage.

import { useState, useEffect, useMemo } from 'react';
import {
    createTournament,
    saveDivision,
    saveStage,
    saveDivisionEntry,
    previewSchedule,
    inviteTournamentClub,
    inviteExternalClub,
    updateTournamentClub,
} from '@/lib/tournamentV2Client';
import { resolveCompetition, describeCombo, effectiveScoring, defaultConfigForScope } from '@/lib/tournament/wizardConfig';
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

const SCOPE_OPTIONS = [
    { id: 'internal', label: 'Nội bộ CLB' },
    { id: 'friendly', label: 'Giao hữu (mời CLB)' },
    { id: 'community', label: 'Cộng đồng 🔒', locked: true },
];

const UNIT_OPTIONS = [
    { id: 'don', title: 'Cá nhân', desc: 'Đánh đơn, mỗi người một suất' },
    { id: 'doi', title: 'Cặp đôi', desc: 'Ghép cặp, hai người một suất' },
    { id: 'team', title: 'Đội (MLP)', desc: 'Đội gặp đội, nhiều ván con' },
];

const SCORING_OPTIONS = [
    { id: 'individual', title: 'Cá nhân', desc: 'Xếp hạng từng người/cặp' },
    { id: 'club', title: 'Cộng điểm về CLB', desc: 'Vô địch đồng đội kiểu tổng sắp' },
];

const FORMAT_OPTIONS = [
    { id: 'rr', title: 'Vòng tròn', desc: 'Ai cũng gặp ai, xếp theo tổng thành tích' },
    { id: 'se', title: 'Loại trực tiếp 1 nhánh', desc: 'Thua một trận là loại, nhanh gọn' },
    { id: 'de', title: 'Loại trực tiếp 2 nhánh', desc: 'Thua có nhánh vớt, cạnh tranh hơn', badge: 'engine đang xây' },
    { id: 'mix', title: 'Vòng bảng + CK', desc: 'Đấu bảng rồi chọn đội vào playoff' },
];

const CLUB_STATUS_LABELS = {
    invited: 'Đã mời',
    roster_submitted: 'Đã nộp danh sách',
    approved: 'Đã duyệt',
    pending: 'Chờ duyệt',
};

/* ==================== Tiện ích thuần ==================== */

// Slug bỏ dấu tiếng Việt, đ→d, ký tự lạ thành '-'.
function slugify(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function chunkPairs(list) {
    const out = [];
    for (let i = 0; i < list.length; i += 2) out.push([list[i], list[i + 1] || null]);
    return out;
}

function splitTeams(list, count) {
    const teams = Array.from({ length: count }, () => []);
    list.forEach((name, index) => { teams[index % count].push(name); });
    return teams;
}

// PHR mẫu để minh họa xem trước (chưa nối hồ sơ thật).
function samplePhr() {
    return (4.4 + Math.random() * 1.4).toFixed(1);
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

    /* --- Thông tin giải (bước 2) --- */
    const [info, setInfo] = useState({ name: 'Giải CLB mùa hè 2026', slug: 'giai-clb-mua-he-2026', description: '' });

    /* --- Đăng ký (bước 3) --- */
    const [players, setPlayers] = useState(['Hoàng Em', 'Trần Bình', 'Lê Chi', 'Nguyễn An', 'Phạm Dũng', 'Vũ Hà']);
    const [pairs, setPairs] = useState(() => chunkPairs(['Hoàng Em', 'Trần Bình', 'Lê Chi', 'Nguyễn An', 'Phạm Dũng', 'Vũ Hà']));
    const [sel, setSel] = useState(null); // {p, k} thành viên đang chọn để đổi chỗ
    const [playerInput, setPlayerInput] = useState('');
    const [inviteClubs, setInviteClubs] = useState([
        { name: 'CLB Yên Bái', status: 'roster_submitted', n: 8, ext: false },
        { name: 'CLB Nghĩa Lộ', status: 'invited', n: 0, ext: true },
    ]);
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

    const isAdmin = group.role === 'admin';

    // clubPool: gợi ý chọn nhanh thành viên CLB (mẫu; phần nối API roster thật ở
    // bước sau của lộ trình).
    const clubPool = useMemo(() => ['Đỗ Minh', 'Bùi Sơn', 'Ngô Lan', 'Đặng Tú'], []);

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

    /* ==================== Cấu hình dẫn xuất ==================== */

    const eff = effectiveScoring({ unit, scope, userScoring });
    const cfg = useMemo(
        () => ({ scope, unit, userScoring, fmt, bestOf, teamSize, subGames, teamCount }),
        [scope, unit, userScoring, fmt, bestOf, teamSize, subGames, teamCount],
    );

    // Danh sách đơn vị vào sân để xem trước (người/cặp/đội/CLB).
    const clubList = scope === 'friendly' ? inviteClubs : regClubs;
    const entrantLabels = useMemo(() => {
        if (unit === 'team') {
            if (scope === 'internal') return splitTeams(players, teamCount).map((_, i) => `Đội ${i + 1}`);
            return clubList.map((c) => c.name);
        }
        if (scope !== 'internal') return clubList.map((c) => c.name);
        if (unit === 'don') return players.slice();
        return pairs.map((pr) => (pr[1] ? `${pr[0]} / ${pr[1]}` : `${pr[0]} (thiếu)`));
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
        let competition;
        try {
            competition = resolveCompetition(cfg);
        } catch (_) {
            setPreview(null);
            return undefined;
        }
        let alive = true;
        setPreviewLoading(true);
        setPreviewError('');
        previewSchedule({ competition, entrant_count: entrantCount, seed: 1 })
            .then((res) => { if (alive) setPreview(res); })
            .catch((err) => { if (alive) { setPreview(null); setPreviewError(err.message || 'Không xem trước được lịch.'); } })
            .finally(() => { if (alive) setPreviewLoading(false); });
        return () => { alive = false; };
    }, [isAdmin, cfg, entrantCount]);

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

    function addPlayers() {
        const parsed = playerInput.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
        if (!parsed.length) return;
        const next = [...players, ...parsed];
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

    function addFromClub() {
        const next = players.slice();
        clubPool.forEach((name) => { if (!next.includes(name)) next.push(name); });
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
        setTeamCount((current) => Math.min(Math.max(2, players.length), Math.max(2, current + delta)));
    }

    function randomTeams() {
        setPlayers((current) => shuffle(current));
    }

    function addInviteClub() {
        setInviteClubs((current) => [
            ...current,
            { name: `CLB mới #${current.length + 1}`, status: 'invited', n: 0, ext: false },
        ]);
    }

    /* ==================== Tạo giải ==================== */

    // Xây suất thi đấu nội bộ để lưu qua saveDivisionEntry.
    function buildInternalEntries() {
        if (unit === 'team') {
            return splitTeams(players, teamCount).map((members, i) => ({
                name: `Đội ${i + 1}`,
                members: members.map((display_name) => ({ display_name })),
            }));
        }
        if (unit === 'don') {
            return players.map((display_name) => ({ name: display_name, members: [{ display_name }] }));
        }
        return pairs
            .filter((pr) => pr[0])
            .map((pr) => ({
                name: pr[1] ? `${pr[0]} / ${pr[1]}` : pr[0],
                members: [pr[0], pr[1]].filter(Boolean).map((display_name) => ({ display_name })),
            }));
    }

    async function createGiai() {
        setNotice('');
        if (!isAdmin) return;
        if (!info.name.trim()) { setNotice('Vui lòng nhập tên giải.'); setStep(2); return; }
        let competition;
        try {
            competition = resolveCompetition(cfg);
        } catch (_) {
            setNotice('Cấu hình thể thức chưa hợp lệ.');
            setStep(1);
            return;
        }
        setBusy(true);
        try {
            // 1. Tạo giải.
            const tRes = await createTournament({
                name: info.name.trim(),
                slug: info.slug || undefined,
                organizer_mode: scope,
                entrant_type: competition.entrant_type,
                description: info.description || undefined,
            });
            const tournamentId = tRes.tournament?.id;
            if (!tournamentId) throw new Error('Không nhận được mã giải.');

            // 2. CLB chủ giải tham gia sẵn để có chỗ gắn suất thi đấu.
            let hostClubId = null;
            if (group.id) {
                try {
                    const cRes = await inviteTournamentClub({ tournament_id: tournamentId, club_id: Number(group.id) });
                    hostClubId = cRes.club?.id ?? null;
                } catch (_) { /* đã tồn tại thì bỏ qua */ }
            }

            // 3. Một nội dung thi đấu theo cấu hình đã resolve.
            let divisionId = null;
            try {
                const dRes = await saveDivision({
                    tournament_id: tournamentId,
                    name: info.name.trim(),
                    play_type: UNIT_TO_PLAY[unit],
                    scoring_scope: competition.scoring_scope,
                    pairing_mode: unit === 'doi' ? 'random_balanced' : 'none',
                });
                divisionId = dRes.division?.id ?? null;
            } catch (_) { /* xây tiếp ở console nếu thất bại */ }

            // 4. Một giai đoạn theo thể thức đã chọn.
            if (divisionId) {
                try {
                    await saveStage({
                        tournament_id: tournamentId,
                        division_id: divisionId,
                        name: SCHEDULE_LABELS[competition.schedule_format] || 'Giai đoạn 1',
                        schedule_format: competition.schedule_format,
                        match_format: unit === 'team' ? 'mlp' : 'simple',
                        config: competition.group_count > 1 ? { groupCount: competition.group_count } : {},
                    });
                } catch (_) { /* dựng giai đoạn lại ở console nếu thất bại */ }
            }

            // 5a. Nội bộ: lưu suất thi đấu từ danh sách người chơi/đội.
            if (divisionId && hostClubId && scope === 'internal') {
                for (const entry of buildInternalEntries()) {
                    try {
                        await saveDivisionEntry({
                            division_id: divisionId,
                            tournament_club_id: hostClubId,
                            name: entry.name,
                            members: entry.members,
                        });
                    } catch (_) { /* bỏ qua suất lỗi, phần còn lại vẫn lưu */ }
                }
            }

            // 5b. Giao hữu: mời các CLB ngoài hệ thống đã liệt kê.
            if (scope === 'friendly') {
                for (const club of inviteClubs) {
                    if (!club.ext) continue; // CLB PickHub cần chọn từ danh sách thật ở console
                    try {
                        await inviteExternalClub({ tournament_id: tournamentId, external_club_name: club.name });
                    } catch (_) { /* bỏ qua lỗi mời lẻ */ }
                }
            }

            setToast('✓ Đã tạo giải');
            if (onDone) onDone(tournamentId);
        } catch (err) {
            setNotice(err.message || 'Không tạo được giải.');
        } finally {
            setBusy(false);
        }
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
        // CLB mẫu chưa có id — chỉ đổi trạng thái hiển thị.
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

            {/* ===================== BƯỚC 1: THỂ THỨC ===================== */}
            {step === 1 && (
                <>
                    <div className="w3-mtabs">
                        <button type="button" aria-pressed={mView === 'setup'} onClick={() => setMView('setup')}>Cấu hình</button>
                        <button type="button" aria-pressed={mView === 'preview'} onClick={() => setMView('preview')}>Xem trước</button>
                    </div>
                    <div className="w3-work" data-view={mView}>
                        <div className="w3-setup">
                            {/* Phạm vi */}
                            <div className="w3-block">
                                <p className="w3-cflbl">Phạm vi</p>
                                <div className="w3-seg">
                                    {SCOPE_OPTIONS.map((option) => (
                                        <button
                                            key={option.id}
                                            type="button"
                                            aria-pressed={scope === option.id}
                                            disabled={option.locked}
                                            title={option.locked ? 'Cần tài khoản quản trị cộng đồng' : undefined}
                                            onClick={() => pickScope(option.id)}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Đơn vị vào sân */}
                            <div className="w3-block">
                                <p className="w3-cflbl">Đơn vị vào sân — ai đấu một trận</p>
                                <div className="w3-selgrid c3">
                                    {UNIT_OPTIONS.map((option) => (
                                        <button key={option.id} type="button" className="w3-selcard" aria-pressed={unit === option.id} onClick={() => pickUnit(option.id)}>
                                            <span className="w3-chk">✓</span>
                                            <span className="w3-st">{option.title}</span>
                                            <span className="w3-sd">{option.desc}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Tính thành tích — chỉ khi không nội bộ và không đội */}
                            {scope !== 'internal' && unit !== 'team' && (
                                <div className="w3-block">
                                    <p className="w3-cflbl">Tính thành tích — ai được xếp hạng</p>
                                    <div className="w3-selgrid c2">
                                        {SCORING_OPTIONS.map((option) => (
                                            <button key={option.id} type="button" className="w3-selcard" aria-pressed={userScoring === option.id} onClick={() => setUserScoring(option.id)}>
                                                <span className="w3-chk">✓</span>
                                                <span className="w3-st">{option.title}</span>
                                                <span className="w3-sd">{option.desc}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Thể thức */}
                            <div className="w3-block">
                                <p className="w3-cflbl">Thể thức</p>
                                <div className="w3-selgrid c2">
                                    {FORMAT_OPTIONS.map((option) => (
                                        <button key={option.id} type="button" className="w3-selcard" aria-pressed={fmt === option.id} onClick={() => setFmt(option.id)}>
                                            <span className="w3-chk">✓</span>
                                            <span className="w3-st">
                                                {option.title}
                                                {option.badge ? <span className="w3-mini-badge">{option.badge}</span> : null}
                                            </span>
                                            <span className="w3-sd">{option.desc}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Số ván mỗi trận (không phải đội) */}
                            {unit !== 'team' && (
                                <div className="w3-block">
                                    <p className="w3-cflbl">Số ván mỗi trận</p>
                                    <div className="w3-seg">
                                        {[1, 3, 5].map((value) => (
                                            <button key={value} type="button" aria-pressed={bestOf === value} onClick={() => setBestOf(value)}>
                                                {value === 1 ? '1 ván' : `${value} ván (BO${value})`}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Cấu hình trận đội (đội/MLP) */}
                            {unit === 'team' && (
                                <div className="w3-block">
                                    <p className="w3-cflbl">Cấu hình trận đội</p>
                                    <div className="w3-teamcfg">
                                        <div className="w3-tc">
                                            <span>Số người mỗi đội</span>
                                            <div className="w3-stepcnt">
                                                <button type="button" onClick={() => setTeamSize((v) => Math.max(1, v - 1))}>−</button>
                                                <span>{teamSize} người</span>
                                                <button type="button" onClick={() => setTeamSize((v) => Math.min(10, v + 1))}>+</button>
                                            </div>
                                        </div>
                                        <div className="w3-tc">
                                            <span>Số ván con mỗi trận đội</span>
                                            <div className="w3-stepcnt">
                                                <button type="button" onClick={() => setSubGames((v) => Math.max(1, v - 1))}>−</button>
                                                <span>{subGames} ván</span>
                                                <button type="button" onClick={() => setSubGames((v) => Math.min(9, v + 1))}>+</button>
                                            </div>
                                        </div>
                                    </div>
                                    <p className="w3-softnote"><span>ⓘ</span> <span>Cần khoảng {teamCount * teamSize} VĐV cho {teamCount} đội. Số ván con theo điều lệ giải.</span></p>
                                </div>
                            )}

                            <div className="w3-cross">{comboText}</div>
                            <p className="w3-softnote"><span>ⓘ</span> <span>Luật điểm và tie-break là điều lệ của giải, đặt theo từng vòng khi bốc thăm. Không cố định ở đây.</span></p>
                        </div>

                        {/* Xem trước sống */}
                        <div className="w3-preview-pane">
                            <p className="w3-ph">Xem trước sống</p>
                            <p className="w3-ph-sub">Cập nhật theo cấu hình bên trái</p>
                            <LivePreview
                                fmt={fmt}
                                unit={unit}
                                scope={scope}
                                eff={eff}
                                bestOf={bestOf}
                                subGames={subGames}
                                labels={previewLabels}
                                preview={preview}
                                loading={previewLoading}
                                error={previewError}
                            />
                        </div>
                    </div>
                </>
            )}

            {/* ===================== BƯỚC 2: THÔNG TIN GIẢI ===================== */}
            {step === 2 && (
                <div className="w3-formwrap">
                    <div className="v2-field">
                        <label htmlFor="w3-tname">Tên giải</label>
                        <input
                            id="w3-tname"
                            value={info.name}
                            onChange={(e) => setInfo((c) => ({ ...c, name: e.target.value, slug: slugify(e.target.value) }))}
                            placeholder="Giải CLB mùa hè 2026"
                        />
                    </div>
                    <div className="w3-block">
                        <p className="v2-field-label" style={{ fontSize: '0.72rem', color: 'var(--w3-muted)', fontWeight: 700, margin: '0 0 6px' }}>Link chia sẻ riêng</p>
                        <div className="w3-urlrow">
                            <span className="w3-pfx">pickhub.vn/giai/</span>
                            <input value={info.slug} onChange={(e) => setInfo((c) => ({ ...c, slug: e.target.value }))} aria-label="Slug link chia sẻ" />
                        </div>
                        <p className="w3-hint" style={{ marginTop: 8 }}>Link gọn để dán vào nhóm Zalo. Đổi được, phải là duy nhất.</p>
                    </div>
                    <div className="w3-block">
                        <div className="v2-field">
                            <label htmlFor="w3-desc">Mô tả</label>
                            <textarea id="w3-desc" value={info.description} onChange={(e) => setInfo((c) => ({ ...c, description: e.target.value }))} placeholder="Thể lệ ngắn, giải thưởng, liên hệ BTC…" rows={3} />
                        </div>
                    </div>
                    <div className="w3-block">
                        <p className="v2-field-label" style={{ fontSize: '0.72rem', color: 'var(--w3-muted)', fontWeight: 700, margin: '0 0 6px' }}>Poster giải</p>
                        <div className="w3-banner">📷 Bấm để tải poster · gợi ý 1200×630 · dùng làm ảnh khi chia sẻ Zalo</div>
                    </div>
                </div>
            )}

            {/* ===================== BƯỚC 3: ĐĂNG KÝ ===================== */}
            {step === 3 && (
                <div className="w3-formwrap">
                    <RegisterStep
                        scope={scope}
                        unit={unit}
                        players={players}
                        pairs={pairs}
                        sel={sel}
                        playerInput={playerInput}
                        setPlayerInput={setPlayerInput}
                        addPlayers={addPlayers}
                        removePlayer={removePlayer}
                        addFromClub={addFromClub}
                        randomPairs={randomPairs}
                        tapMember={tapMember}
                        teamCount={teamCount}
                        changeTeamCount={changeTeamCount}
                        randomTeams={randomTeams}
                        teams={splitTeams(players, teamCount)}
                        inviteClubs={inviteClubs}
                        addInviteClub={addInviteClub}
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
                </div>
            )}

            {/* --- Chân trang điều hướng --- */}
            <div className="w3-foot">
                {step > 1 ? (
                    <button type="button" className="w3-cta is-back" onClick={() => setStep(step - 1)}>Quay lại</button>
                ) : null}
                <div className="w3-mid">Bước {step} / 3</div>
                {step < 3 ? (
                    <button type="button" className="w3-cta" onClick={() => setStep(step + 1)}>Tiếp tục →</button>
                ) : (
                    <button type="button" className="w3-cta" onClick={createGiai} disabled={busy}>{busy ? 'Đang tạo...' : 'Tạo giải'}</button>
                )}
            </div>

            {toast ? <ToastBubble text={toast} onDone={() => setToast('')} /> : null}
        </div>
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

/* ==================== Bước 3: rẽ theo phạm vi ==================== */

function RegisterStep(props) {
    const {
        scope, unit, players, pairs, sel, playerInput, setPlayerInput,
        addPlayers, removePlayer, addFromClub, randomPairs, tapMember,
        teamCount, changeTeamCount, randomTeams, teams,
        inviteClubs, addInviteClub, reviewInviteClub, regClubs,
        friendlyDeadline, setFriendlyDeadline, communityDeadline, setCommunityDeadline,
        communityWho, setCommunityWho, slug, busy, onToast,
    } = props;

    const note = {
        internal: 'Hình thức A · Tự nhập — BTC nắm danh sách, nhập trực tiếp.',
        friendly: 'Hình thức A · Tự nhập — mời đích danh CLB, họ nộp danh sách trước hạn.',
        community: 'Hình thức B · Mở đăng ký — mở link có hạn cho CLB/VĐV tự đăng ký. Đây là thiết lập; mặt công khai thuộc spec khác.',
    }[scope];

    return (
        <>
            <div className="w3-banner-info">{note}</div>

            {/* A. Nội bộ, đơn/đôi */}
            {scope === 'internal' && unit !== 'team' && (
                <div>
                    <p className="w3-cflbl" style={{ textTransform: 'none' }}>Người chơi <span className="w3-count">· {players.length}</span></p>
                    <div className="w3-chips">
                        {players.map((name, index) => (
                            <span key={`${name}-${index}`} className="w3-chip">
                                {name}
                                <button type="button" aria-label={`Bỏ ${name}`} onClick={() => removePlayer(index)}>×</button>
                            </span>
                        ))}
                    </div>
                    <div className="w3-addrow">
                        <input
                            className="v2-input"
                            value={playerInput}
                            onChange={(e) => setPlayerInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPlayers(); } }}
                            placeholder="Nhập tên rồi Enter"
                        />
                        <button type="button" className="w3-btn" onClick={addPlayers}>Thêm</button>
                    </div>
                    <div className="w3-roster">Hoặc <button type="button" onClick={addFromClub}>chọn nhanh từ thành viên CLB</button> · gắn hồ sơ PHR thật</div>

                    {unit === 'doi' && (
                        <div>
                            <div className="w3-subhead">
                                <h3>Ghép cặp</h3>
                                <span className="w3-count" style={{ fontSize: '0.76rem' }}>· {Math.ceil(players.length / 2)} cặp</span>
                                <button type="button" className="w3-pill" onClick={randomPairs}>⚁ Ghép ngẫu nhiên</button>
                            </div>
                            <div className="w3-pairs">
                                {pairs.map((pr, pi) => {
                                    const miss = !pr[1];
                                    return (
                                        <div key={pi} className={`w3-pair ${miss ? 'is-warn' : ''}`}>
                                            <span className="w3-pn">Cặp {pi + 1}</span>
                                            <button type="button" className={`w3-mem ${sel && sel.p === pi && sel.k === 0 ? 'is-sel' : ''}`} onClick={() => tapMember(pi, 0)}>{pr[0]}</button>
                                            <span className="w3-plus">+</span>
                                            {miss ? (
                                                <span className="w3-mem is-empty">chọn người…</span>
                                            ) : (
                                                <button type="button" className={`w3-mem ${sel && sel.p === pi && sel.k === 1 ? 'is-sel' : ''}`} onClick={() => tapMember(pi, 1)}>{pr[1]}</button>
                                            )}
                                            {miss ? <span className="w3-tag w3-tag-warn">thiếu 1</span> : <span className="w3-tag w3-tag-ok">PHR {samplePhr()}</span>}
                                        </div>
                                    );
                                })}
                            </div>
                            <p className="w3-hint" style={{ marginTop: 10 }}>Chạm hai người để đổi chỗ. Ghép ngẫu nhiên bấm lại tùy ý.</p>
                        </div>
                    )}
                </div>
            )}

            {/* A. Nội bộ, đội */}
            {scope === 'internal' && unit === 'team' && (
                <div>
                    <p className="w3-hint" style={{ marginTop: 0 }}>Chia thành viên CLB thành nhiều đội đấu với nhau.</p>
                    <div className="w3-subhead">
                        <h3>Các đội</h3>
                        <div className="w3-stepcnt">
                            <button type="button" onClick={() => changeTeamCount(-1)}>−</button>
                            <span>{teamCount} đội</span>
                            <button type="button" onClick={() => changeTeamCount(1)}>+</button>
                        </div>
                        <button type="button" className="w3-pill" style={{ marginLeft: 8 }} onClick={randomTeams}>⚁ Chia ngẫu nhiên</button>
                    </div>
                    <div className="w3-teams">
                        {teams.map((members, i) => (
                            <div key={i} className="w3-team">
                                <h4>Đội {i + 1} · {members.length}</h4>
                                {members.map((name, j) => <div key={j} className="w3-m">{name}</div>)}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* A. Giao hữu, mời CLB */}
            {scope === 'friendly' && (
                <div>
                    <div className="w3-block" style={{ marginTop: 0 }}>
                        <div className="v2-field">
                            <label htmlFor="w3-friendly-deadline">Hạn nộp danh sách</label>
                            <input id="w3-friendly-deadline" type="date" style={{ maxWidth: 220 }} value={friendlyDeadline} onChange={(e) => setFriendlyDeadline(e.target.value)} />
                        </div>
                    </div>
                    <div className="w3-subhead">
                        <h3>CLB được mời</h3>
                        <button type="button" className="w3-pill" onClick={addInviteClub}>+ Mời CLB</button>
                    </div>
                    <div className="w3-clubs">
                        {inviteClubs.map((club, index) => (
                            <ClubRow key={index} club={club} busy={busy}>
                                {club.status === 'roster_submitted' ? (
                                    <div className="w3-club-act">
                                        <button type="button" className="w3-sbtn">Xem</button>
                                        <button type="button" className="w3-sbtn" onClick={() => reviewInviteClub(club, 'approve', index)} disabled={busy}>Duyệt</button>
                                        <button type="button" className="w3-sbtn" onClick={() => reviewInviteClub(club, 'request_changes', index)} disabled={busy}>Yêu cầu sửa</button>
                                    </div>
                                ) : (
                                    <div className="w3-club-act">
                                        <button type="button" className="w3-sbtn">Nhập hộ</button>
                                        <button type="button" className="w3-sbtn">Huỷ mời</button>
                                    </div>
                                )}
                            </ClubRow>
                        ))}
                    </div>
                    <p className="w3-hint" style={{ marginTop: 10 }}>Mời đích danh. Mỗi CLB tự nộp danh sách trước hạn; BTC duyệt rồi bốc thăm.</p>
                </div>
            )}

            {/* B. Cộng đồng, mở link đăng ký */}
            {scope === 'community' && (
                <div>
                    <div className="w3-reglink">
                        <div className="w3-reglink-title">Link đăng ký mở</div>
                        <div className="w3-reglink-sub">Chia sẻ link này để CLB/VĐV tự đăng ký</div>
                        <div className="w3-reglink-u">
                            <code>pickhub.vn/dk/{slug}</code>
                            <button type="button" className="w3-sbtn" onClick={() => { navigator.clipboard?.writeText(`pickhub.vn/dk/${slug}`); onToast('✓ Đã sao chép link'); }}>Sao chép</button>
                        </div>
                    </div>
                    <div className="w3-two" style={{ marginTop: 14 }}>
                        <div className="v2-field">
                            <label htmlFor="w3-community-deadline">Hạn đăng ký</label>
                            <input id="w3-community-deadline" type="date" value={communityDeadline} onChange={(e) => setCommunityDeadline(e.target.value)} />
                        </div>
                        <div className="v2-field">
                            <label htmlFor="w3-community-who">Ai được đăng ký</label>
                            <select id="w3-community-who" value={communityWho} onChange={(e) => setCommunityWho(e.target.value)}>
                                <option value="club">CLB đăng ký theo đoàn</option>
                                <option value="athlete">VĐV tự do đăng ký</option>
                                <option value="both">Cả hai</option>
                            </select>
                        </div>
                    </div>
                    <div className="w3-subhead">
                        <h3>CLB đã đăng ký</h3>
                        <span className="w3-count" style={{ fontSize: '0.76rem' }}>· chờ duyệt</span>
                    </div>
                    <div className="w3-clubs">
                        {regClubs.map((club, index) => (
                            <ClubRow key={index} club={club} busy={busy}>
                                {club.status === 'pending' ? (
                                    <div className="w3-club-act">
                                        <button type="button" className="w3-sbtn">Duyệt</button>
                                        <button type="button" className="w3-sbtn">Chờ</button>
                                        <button type="button" className="w3-sbtn">Từ chối</button>
                                    </div>
                                ) : null}
                            </ClubRow>
                        ))}
                    </div>
                    <p className="w3-hint" style={{ marginTop: 10 }}>Đăng ký tự do có hạn. BTC duyệt từng CLB/VĐV, có thể giới hạn tổng PHR hoặc để Open.</p>
                </div>
            )}
        </>
    );
}

function ClubRow({ club, children }) {
    const tag = club.status === 'approved' ? 'w3-tag-ok' : '';
    const meta = `${club.ext ? 'CLB ngoài hệ thống' : 'CLB PickHub'} · ${club.n ? `${club.n} VĐV` : 'chưa nộp'}`;
    return (
        <div className="w3-club">
            <div className="w3-club-top">
                <span className="w3-club-name">{club.name}</span>
                <span className={`w3-tag ${tag}`}>{CLUB_STATUS_LABELS[club.status] || club.status}</span>
            </div>
            <p className="w3-club-meta">{meta}</p>
            {children}
        </div>
    );
}

/* ==================== Xem trước sống ==================== */

function LivePreview({ fmt, unit, scope, eff, bestOf, subGames, labels, preview, loading, error }) {
    const uw = unit === 'team' ? 'đội' : scope !== 'internal' ? 'CLB' : unit === 'don' ? 'người' : 'cặp';
    const labelFor = (id) => (id ? (labels[id - 1] || `#${id}`) : '—');
    const scopeNote = eff === 'team' ? '◈ BXH theo đội' : eff === 'club' ? '◈ BXH theo CLB' : '◈ BXH cá nhân';

    if (error) {
        return <div className="w3-state w3-state-error">{error}</div>;
    }
    if (loading && !preview) {
        return <div className="w3-state">Đang dựng xem trước lịch…</div>;
    }
    if (!preview) {
        return <div className="w3-state">Chưa có dữ liệu xem trước.</div>;
    }

    const matches = preview.matches || [];
    const n = labels.length;

    // Ghi chú MLP / cộng điểm CLB.
    const topNote = unit === 'team' ? (
        <div className="w3-mlpnote">Mỗi trận là <b style={{ fontWeight: 600 }}>trận đội {subGames} ván con</b>{subGames === 5 ? ' — MLP: đôi nữ, đôi nam, 2 mix, DreamBreaker.' : '.'}</div>
    ) : eff === 'club' ? (
        <div className="w3-mlpnote">Trận thường ({bestOf === 1 ? '1 ván' : `BO${bestOf}`}); điểm dồn về CLB.</div>
    ) : null;

    let title;
    let body;

    if (fmt === 'rr') {
        title = `Vòng tròn · ${n} ${uw} · ${matches.length} trận`;
        body = (
            <>
                {topNote}
                {matches.slice(0, 6).map((m, i) => (
                    <div key={i} className="w3-match">
                        <span className="w3-r">{i + 1}</span>
                        {labelFor(m.a)} <span className="w3-vs">vs</span> {labelFor(m.b)}
                    </div>
                ))}
                {matches.length > 6 ? <div className="w3-match" style={{ color: 'var(--w3-muted)' }}>+{matches.length - 6} trận…</div> : null}
            </>
        );
    } else if (fmt === 'se' || fmt === 'de') {
        title = `${fmt === 'de' ? 'Loại trực tiếp 2 nhánh' : 'Loại trực tiếp 1 nhánh'} · ${n} ${uw}`;
        const round1 = matches.filter((m) => Number(m.round) === 1);
        const seeds = round1.length ? round1 : chunkPairs(labels.map((_, i) => i + 1)).map(([a, b]) => ({ a, b: b || null }));
        body = (
            <>
                {topNote}
                <div className="w3-bracket">
                    <div className="w3-col">
                        <div className="w3-clbl">Nhánh thắng · V1</div>
                        {seeds.map((m, i) => (
                            <div key={i} className="w3-slot">{labelFor(m.a)}<br />{m.b ? labelFor(m.b) : '(bye)'}</div>
                        ))}
                    </div>
                    <div className="w3-col">
                        <div className="w3-clbl">Bán kết</div>
                        <div className="w3-slot">—</div>
                        {seeds.length > 2 ? <div className="w3-slot">—</div> : null}
                    </div>
                    <div className="w3-col">
                        <div className="w3-clbl">Chung kết</div>
                        <div className="w3-slot">—</div>
                    </div>
                </div>
                {fmt === 'de' ? (
                    <div className="w3-lower">
                        <div className="w3-clbl">Nhánh thua</div>
                        <div className="w3-bracket">
                            <div className="w3-col">
                                <div className="w3-slot">Thua V1</div>
                                <div className="w3-slot">Thua V1</div>
                            </div>
                            <div className="w3-col"><div className="w3-slot">—</div></div>
                        </div>
                    </div>
                ) : null}
            </>
        );
    } else {
        title = `Vòng bảng + CK · ${n} ${uw} · 2 bảng`;
        const groupA = labels.filter((_, i) => i % 2 === 0);
        const groupB = labels.filter((_, i) => i % 2 === 1);
        body = (
            <>
                {topNote}
                <div className="w3-bracket">
                    <div className="w3-col">
                        <div className="w3-clbl">Bảng A</div>
                        {groupA.map((name, i) => <div key={i} className="w3-slot">{name}</div>)}
                    </div>
                    <div className="w3-col">
                        <div className="w3-clbl">Bảng B</div>
                        {groupB.map((name, i) => <div key={i} className="w3-slot">{name}</div>)}
                    </div>
                    <div className="w3-col">
                        <div className="w3-clbl">Playoff</div>
                        <div className="w3-slot">Nhất A vs Nhì B</div>
                        <div className="w3-slot">Nhất B vs Nhì A</div>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <p className="w3-prev-title">{title}</p>
            <div>{body}</div>
            <div className="w3-prules">
                <span>◷ Luật theo điều lệ, đặt từng vòng</span>
                <span>{scopeNote}</span>
            </div>
        </>
    );
}
