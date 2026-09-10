'use client';

// Wizard tạo giải — luồng 3 bước (Thể thức · Thông tin giải · Đăng ký).
// Component này điều phối state + hiệu ứng + tạo giải; phần trình bày từng bước
// nằm ở app/giai-dau/v2/wizard/{StepConfig,StepInfo,StepRegister,LivePreview}.
// Mobile-first ~380px rồi mở rộng lên desktop khung rộng. Chỉ fetch qua
// tournamentV2Client, KHÔNG gọi Supabase trực tiếp. Quyền admin lấy từ
// /api/groups/session (server), KHÔNG tin role trong localStorage.

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
    listClubRoster,
    listAvailableTournamentClubs,
} from '@/lib/tournamentV2Client';
import { resolveCompetition, describeCombo, effectiveScoring, defaultConfigForScope } from '@/lib/tournament/wizardConfig';
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

    // Thêm một thành viên CLB thật (từ roster) vào danh sách chơi.
    function addRosterMember(fullName) {
        if (players.includes(fullName)) return;
        const next = [...players, fullName];
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
                // Số ván mỗi trận là thứ duy nhất bước 1 chốt về luật; không gửi
                // thì luật rơi về mặc định BO3 và trận BO1 không bao giờ kết thúc.
                default_scoring: competition.best_of ? { best_of: Number(competition.best_of) } : undefined,
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

            // 5b. Giao hữu: mời CLB PickHub (club_id) và CLB ngoài hệ thống (theo tên).
            if (scope === 'friendly') {
                for (const club of inviteClubs) {
                    try {
                        if (club.ext) {
                            await inviteExternalClub({ tournament_id: tournamentId, external_club_name: club.name });
                        } else if (club.club_id != null) {
                            await inviteTournamentClub({ tournament_id: tournamentId, club_id: Number(club.club_id) });
                        }
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
