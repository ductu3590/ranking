'use client';

import { useState, useEffect } from 'react';
import {
    createTournament,
    updateTournament,
    saveStage,
    saveEntrant,
    generateSchedule,
} from '@/lib/tournamentV2Client';
import './v2.css';

const STEPS_REGULAR = [
    { n: 1, label: 'Thông tin' },
    { n: 2, label: 'Giai đoạn' },
    { n: 3, label: 'Đội/Cặp' },
    { n: 4, label: 'Sinh lịch' },
];

const STEPS_MLP = [
    { n: 1, label: 'Thông tin' },
    { n: 2, label: 'Cấu hình MLP' },
    { n: 3, label: 'Quản lý đội' },
    { n: 4, label: 'Sinh lịch' },
];

export default function TournamentWizard({ onDone }) {
    const [step, setStep] = useState(1);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');

    /* ---- Step 1 ---- */
    const [tournamentFormat, setTournamentFormat] = useState('regular'); // 'regular' | 'mlp'
    const [info, setInfo] = useState({ name: '', event_date: '', location: '', entrant_type: 'pair' });
    const [tournamentId, setTournamentId] = useState(null);

    /* ---- Step 2 Regular ---- */
    const [stageType, setStageType] = useState('single'); // 'single' | 'two_stage'
    const [regCfg, setRegCfg] = useState({ scheduleFormat: 'round_robin', groupCount: 2, advancePerGroup: 2 });

    /* ---- Step 2 MLP ---- */
    const [mlpCfg, setMlpCfg] = useState({ gamesPerMatchup: 4, dreamBreaker: true });

    /* ---- Stages (saved to API when moving fwd from step 2) ---- */
    const [stages, setStages] = useState([]);

    /* ---- Step 3 Regular (incremental save) ---- */
    const [entrants, setEntrants] = useState([]);
    const [entrantForm, setEntrantForm] = useState({ name: '', seed: '' });

    /* ---- Step 3 MLP (batch save when moving to step 4) ---- */
    const [mlpTeams, setMlpTeams] = useState([
        { localId: 1, name: 'Đội A', members: [] },
        { localId: 2, name: 'Đội B', members: [] },
    ]);
    const [mlpTeamsSaved, setMlpTeamsSaved] = useState(false);
    const [clubMembers, setClubMembers] = useState([]);
    const [clubLoaded, setClubLoaded] = useState(false);
    const [pickerState, setPickerState] = useState({}); // { [localId]: { clubPick, manualName } }

    /* ---- Step 4 ---- */
    const [matchCount, setMatchCount] = useState(null);

    const STEPS = tournamentFormat === 'mlp' ? STEPS_MLP : STEPS_REGULAR;
    const setInfoField = (k, v) => setInfo(c => ({ ...c, [k]: v }));
    const setRegCfgField = (k, v) => setRegCfg(c => ({ ...c, [k]: v }));
    const setMlpCfgField = (k, v) => setMlpCfg(c => ({ ...c, [k]: v }));

    /* =================== STEP 1 =================== */

    async function submitInfo() {
        setNotice('');
        if (!info.name.trim()) { setNotice('Vui lòng nhập tên giải.'); return; }
        setBusy(true);
        try {
            const body = {
                name: info.name.trim(),
                event_date: info.event_date || undefined,
                location: info.location || undefined,
                entrant_type: tournamentFormat === 'mlp' ? 'team' : info.entrant_type,
            };
            const resp = tournamentId
                ? await updateTournament({ id: tournamentId, ...body })
                : await createTournament(body);
            const t = resp.tournament;
            if (!t?.id) throw new Error('Không nhận được mã giải.');
            setTournamentId(t.id);
            setStep(2);
        } catch (err) {
            setNotice(err.message || 'Không tạo được giải.');
        } finally {
            setBusy(false);
        }
    }

    /* =================== STEP 2 REGULAR =================== */

    async function submitRegularStages() {
        setNotice('');
        if (stages.length > 0) { setStep(3); return; }
        setBusy(true);
        try {
            if (stageType === 'single') {
                const r = await saveStage({
                    tournament_id: tournamentId,
                    name: regCfg.scheduleFormat === 'round_robin' ? 'Vòng tròn' : 'Loại trực tiếp',
                    schedule_format: regCfg.scheduleFormat,
                    match_format: 'simple',
                    config: {},
                });
                setStages([r.stage]);
            } else {
                const r1 = await saveStage({
                    tournament_id: tournamentId,
                    name: 'Vòng bảng',
                    schedule_format: 'round_robin',
                    match_format: 'simple',
                    config: { groupCount: Number(regCfg.groupCount) || 1, advancePerGroup: Number(regCfg.advancePerGroup) || 1 },
                });
                const r2 = await saveStage({
                    tournament_id: tournamentId,
                    name: 'Chung kết',
                    schedule_format: 'knockout',
                    match_format: 'simple',
                    config: {},
                });
                setStages([r1.stage, r2.stage]);
            }
            setStep(3);
        } catch (err) {
            setNotice(err.message || 'Không tạo được giai đoạn.');
        } finally {
            setBusy(false);
        }
    }

    /* =================== STEP 2 MLP =================== */

    async function submitMlpConfig() {
        setNotice('');
        if (stages.length > 0) { setStep(3); return; }
        setBusy(true);
        try {
            const r = await saveStage({
                tournament_id: tournamentId,
                name: 'Vòng đấu MLP',
                schedule_format: 'round_robin',
                match_format: 'mlp',
                config: { gamesPerMatchup: mlpCfg.gamesPerMatchup, dreamBreaker: mlpCfg.dreamBreaker },
            });
            setStages([r.stage]);
            setStep(3);
        } catch (err) {
            setNotice(err.message || 'Không tạo được cấu hình MLP.');
        } finally {
            setBusy(false);
        }
    }

    /* =================== CLUB MEMBERS =================== */

    useEffect(() => {
        if (step === 3 && tournamentFormat === 'mlp' && !clubLoaded) {
            fetch('/api/club/members', { credentials: 'same-origin' })
                .then(r => r.json())
                .then(d => { setClubMembers(d.members || []); setClubLoaded(true); })
                .catch(() => setClubLoaded(true));
        }
    }, [step, tournamentFormat, clubLoaded]);

    /* =================== STEP 3 REGULAR =================== */

    async function addEntrant() {
        setNotice('');
        if (!entrantForm.name.trim()) { setNotice('Vui lòng nhập tên.'); return; }
        setBusy(true);
        try {
            const r = await saveEntrant({
                tournament_id: tournamentId,
                name: entrantForm.name.trim(),
                seed: entrantForm.seed ? Number(entrantForm.seed) : undefined,
            });
            setEntrants(c => [...c, r.entrant]);
            setEntrantForm({ name: '', seed: '' });
        } catch (err) {
            setNotice(err.message || 'Không thêm được.');
        } finally {
            setBusy(false);
        }
    }

    function goToStep4Regular() {
        setNotice('');
        if (entrants.length < 2) { setNotice('Cần ít nhất 2 đội/cặp.'); return; }
        setStep(4);
    }

    /* =================== STEP 3 MLP =================== */

    function addMlpTeam() {
        setMlpTeams(c => [...c, { localId: Date.now(), name: `Đội ${c.length + 1}`, members: [] }]);
    }

    function removeMlpTeam(localId) {
        setMlpTeams(c => c.filter(t => t.localId !== localId));
    }

    function setTeamName(localId, name) {
        setMlpTeams(c => c.map(t => t.localId === localId ? { ...t, name } : t));
    }

    function addTeamMember(localId, member) {
        setMlpTeams(c => c.map(t => {
            if (t.localId !== localId) return t;
            const dup = t.members.some(m =>
                m.display_name === member.display_name && m.member_id === member.member_id
            );
            if (dup) return t;
            return { ...t, members: [...t.members, member] };
        }));
    }

    function removeTeamMember(localId, idx) {
        setMlpTeams(c => c.map(t => t.localId !== localId ? t : {
            ...t, members: t.members.filter((_, i) => i !== idx),
        }));
    }

    function getPS(localId) {
        return pickerState[localId] || { clubPick: '', manualName: '' };
    }

    function setPS(localId, field, val) {
        setPickerState(c => ({ ...c, [localId]: { ...getPS(localId), [field]: val } }));
    }

    function addFromClub(localId) {
        const ps = getPS(localId);
        if (!ps.clubPick) return;
        const cm = clubMembers.find(m => m.id === ps.clubPick);
        if (!cm) return;
        addTeamMember(localId, { display_name: cm.full_name, member_id: cm.id });
        setPS(localId, 'clubPick', '');
    }

    function addManual(localId) {
        const name = getPS(localId).manualName.trim();
        if (!name) return;
        addTeamMember(localId, { display_name: name, member_id: null });
        setPS(localId, 'manualName', '');
    }

    async function submitMlpTeams() {
        setNotice('');
        if (mlpTeamsSaved) { setStep(4); return; }
        if (mlpTeams.length < 2) { setNotice('Cần ít nhất 2 đội.'); return; }
        if (mlpTeams.some(t => !t.name.trim())) { setNotice('Tên đội không được để trống.'); return; }
        setBusy(true);
        try {
            const saved = [];
            for (const team of mlpTeams) {
                const r = await saveEntrant({
                    tournament_id: tournamentId,
                    name: team.name.trim(),
                    members: team.members.map(m => ({
                        display_name: m.display_name,
                        member_id: m.member_id || undefined,
                    })),
                });
                saved.push(r.entrant);
            }
            setEntrants(saved);
            setMlpTeamsSaved(true);
            setStep(4);
        } catch (err) {
            setNotice(err.message || 'Không lưu được đội.');
        } finally {
            setBusy(false);
        }
    }

    /* =================== STEP 4 =================== */

    async function runGenerate() {
        setNotice('');
        if (!stages.length) { setNotice('Chưa có giai đoạn.'); return; }
        setBusy(true);
        try {
            const r = await generateSchedule(stages[0].id);
            setMatchCount(r.matchCount ?? 0);
        } catch (err) {
            setNotice(err.message || 'Không sinh được lịch.');
        } finally {
            setBusy(false);
        }
    }

    function finish() { if (onDone) onDone(tournamentId); }
    function goBack() { setNotice(''); if (step > 1) setStep(step - 1); }

    /* =================== RENDER =================== */

    return (
        <div className="v2-wizard">
            <h2 className="v2-wizard-title">Tạo giải đấu</h2>

            <div className="v2-steps">
                {STEPS.map(s => (
                    <div key={s.n} className={`v2-step-dot ${s.n === step ? 'active' : s.n < step ? 'done' : ''}`}>
                        {s.n}. {s.label}
                    </div>
                ))}
            </div>

            {notice ? <p className="v2-notice">{notice}</p> : null}

            {/* ===== STEP 1: Thông tin + Thể thức ===== */}
            {step === 1 && (
                <div>
                    <div className="v2-field">
                        <label>Tên giải</label>
                        <input
                            value={info.name}
                            onChange={e => setInfoField('name', e.target.value)}
                            placeholder="Giải CLB mùa hè 2026"
                        />
                    </div>
                    <div className="v2-grid-2">
                        <div className="v2-field">
                            <label>Ngày thi đấu</label>
                            <input type="date" value={info.event_date} onChange={e => setInfoField('event_date', e.target.value)} />
                        </div>
                        <div className="v2-field">
                            <label>Địa điểm</label>
                            <input value={info.location} onChange={e => setInfoField('location', e.target.value)} placeholder="Sân 246" />
                        </div>
                    </div>

                    <div className="v2-field">
                        <label>Thể thức thi đấu</label>
                        <div className="v2-format-cards">
                            <button
                                type="button"
                                className={`v2-format-card ${tournamentFormat === 'regular' ? 'active' : ''}`}
                                onClick={() => setTournamentFormat('regular')}
                            >
                                <span className="v2-format-card-title">Giải đấu thông thường</span>
                                <span className="v2-format-card-sub">Đơn hoặc cặp đôi — vòng tròn, loại trực tiếp, hoặc vòng bảng + chung kết.</span>
                            </button>
                            <button
                                type="button"
                                className={`v2-format-card ${tournamentFormat === 'mlp' ? 'active' : ''}`}
                                onClick={() => setTournamentFormat('mlp')}
                            >
                                <span className="v2-format-card-title">🏆 Thể thức MLP</span>
                                <span className="v2-format-card-sub">Đội nhiều VĐV thi đấu theo vòng — có thể thêm DreamBreaker khi hoà.</span>
                            </button>
                        </div>
                    </div>

                    {tournamentFormat === 'regular' && (
                        <div className="v2-field">
                            <label>Hình thức tham gia</label>
                            <div className="v2-radio-row">
                                {[{ value: 'pair', label: 'Cặp đôi' }, { value: 'single', label: 'Đơn' }].map(o => (
                                    <label key={o.value} className={`v2-radio ${info.entrant_type === o.value ? 'active' : ''}`}>
                                        <input type="radio" name="entrant_type" value={o.value}
                                            checked={info.entrant_type === o.value}
                                            onChange={() => setInfoField('entrant_type', o.value)} />
                                        {o.label}
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="v2-wizard-nav">
                        <button type="button" className="v2-btn-primary" onClick={submitInfo} disabled={busy}>
                            {busy ? 'Đang lưu...' : 'Tiếp tục'}
                        </button>
                    </div>
                </div>
            )}

            {/* ===== STEP 2 REGULAR: Giai đoạn (Challonge-style) ===== */}
            {step === 2 && tournamentFormat === 'regular' && (
                <div>
                    {stages.length > 0 ? (
                        <>
                            <ul className="v2-item-list" style={{ marginBottom: 14 }}>
                                {stages.map((s, i) => (
                                    <li key={s.id} className="v2-item">
                                        <span>
                                            {i + 1}. {s.name}
                                            <span className="v2-item-sub" style={{ marginLeft: 8 }}>
                                                {s.schedule_format === 'knockout' ? 'Loại trực tiếp' : 'Vòng tròn'}
                                            </span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            <p className="v2-item-sub" style={{ marginBottom: 14 }}>Giai đoạn đã được tạo. Nhấn Tiếp tục để thêm đội/cặp.</p>
                        </>
                    ) : (
                        <>
                            <div className="v2-field">
                                <label>Loại giải</label>
                                <div className="v2-format-cards">
                                    <button
                                        type="button"
                                        className={`v2-format-card ${stageType === 'single' ? 'active' : ''}`}
                                        onClick={() => setStageType('single')}
                                    >
                                        <span className="v2-format-card-title">Đơn giai đoạn</span>
                                        <span className="v2-format-card-sub">Tất cả thi đấu trong một bảng duy nhất.</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={`v2-format-card ${stageType === 'two_stage' ? 'active' : ''}`}
                                        onClick={() => setStageType('two_stage')}
                                    >
                                        <span className="v2-format-card-title">Vòng bảng → Chung kết</span>
                                        <span className="v2-format-card-sub">Chia bảng vòng tròn tính điểm, các đội đứng đầu vào loại trực tiếp.</span>
                                    </button>
                                </div>
                            </div>

                            {stageType === 'single' && (
                                <div className="v2-field">
                                    <label>Thể thức</label>
                                    <div className="v2-radio-row">
                                        {[
                                            { value: 'round_robin', label: 'Vòng tròn tính điểm' },
                                            { value: 'knockout', label: 'Loại trực tiếp' },
                                        ].map(o => (
                                            <label key={o.value} className={`v2-radio ${regCfg.scheduleFormat === o.value ? 'active' : ''}`}>
                                                <input type="radio" name="sf" value={o.value}
                                                    checked={regCfg.scheduleFormat === o.value}
                                                    onChange={() => setRegCfgField('scheduleFormat', o.value)} />
                                                {o.label}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {stageType === 'two_stage' && (
                                <div className="v2-add-box">
                                    <h3>Cấu hình vòng bảng</h3>
                                    <div className="v2-grid-2">
                                        <div className="v2-field">
                                            <label>Số bảng</label>
                                            <input type="number" min="1" value={regCfg.groupCount}
                                                onChange={e => setRegCfgField('groupCount', e.target.value)} />
                                        </div>
                                        <div className="v2-field">
                                            <label>Đi tiếp mỗi bảng</label>
                                            <input type="number" min="1" value={regCfg.advancePerGroup}
                                                onChange={e => setRegCfgField('advancePerGroup', e.target.value)} />
                                        </div>
                                    </div>
                                    <p className="v2-item-sub" style={{ margin: 0 }}>Vòng cuối: Loại trực tiếp</p>
                                </div>
                            )}
                        </>
                    )}

                    <div className="v2-wizard-nav">
                        <button type="button" className="v2-btn-secondary" onClick={goBack}>Quay lại</button>
                        <button type="button" className="v2-btn-primary" onClick={submitRegularStages} disabled={busy}>
                            {busy ? 'Đang tạo...' : 'Tiếp tục'}
                        </button>
                    </div>
                </div>
            )}

            {/* ===== STEP 2 MLP: Cấu hình ===== */}
            {step === 2 && tournamentFormat === 'mlp' && (
                <div>
                    {stages.length > 0 ? (
                        <p className="v2-item-sub" style={{ marginBottom: 14 }}>
                            Cấu hình MLP đã lưu: {mlpCfg.gamesPerMatchup} ván/lượt đấu
                            {mlpCfg.dreamBreaker ? ', có DreamBreaker' : ''}.
                            Nhấn Tiếp tục để thêm đội.
                        </p>
                    ) : (
                        <>
                            <div className="v2-field">
                                <label>Số ván khi 2 đội gặp nhau</label>
                                <div className="v2-radio-row">
                                    {[
                                        { value: 2, label: '2 ván', hint: 'Đôi nam + Đôi nữ' },
                                        { value: 4, label: '4 ván', hint: 'Men\'s · Women\'s · Mixed 1 · Mixed 2' },
                                    ].map(o => (
                                        <label key={o.value} className={`v2-radio ${mlpCfg.gamesPerMatchup === o.value ? 'active' : ''}`}>
                                            <input type="radio" name="gpm" value={o.value}
                                                checked={mlpCfg.gamesPerMatchup === o.value}
                                                onChange={() => setMlpCfgField('gamesPerMatchup', o.value)} />
                                            <span>
                                                <span style={{ display: 'block', fontWeight: 700 }}>{o.label}</span>
                                                <span style={{ fontSize: '0.75rem', color: '#8b5cf6', fontWeight: 400 }}>{o.hint}</span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="v2-field">
                                <label>DreamBreaker khi hoà</label>
                                <label className="v2-toggle">
                                    <input type="checkbox" checked={mlpCfg.dreamBreaker}
                                        onChange={e => setMlpCfgField('dreamBreaker', e.target.checked)} />
                                    <span className="v2-toggle-track">
                                        <span className="v2-toggle-thumb" />
                                    </span>
                                    <span style={{ fontSize: '0.9rem', color: '#374151' }}>
                                        {mlpCfg.dreamBreaker
                                            ? 'Bật — đơn luân phiên rally scoring đến 21 điểm'
                                            : 'Tắt — ghi nhận hoà'}
                                    </span>
                                </label>
                            </div>
                        </>
                    )}

                    <div className="v2-wizard-nav">
                        <button type="button" className="v2-btn-secondary" onClick={goBack}>Quay lại</button>
                        <button type="button" className="v2-btn-primary" onClick={submitMlpConfig} disabled={busy}>
                            {busy ? 'Đang tạo...' : 'Tiếp tục'}
                        </button>
                    </div>
                </div>
            )}

            {/* ===== STEP 3 REGULAR: Đội/Cặp ===== */}
            {step === 3 && tournamentFormat === 'regular' && (
                <div>
                    {entrants.length > 0 ? (
                        <ul className="v2-item-list">
                            {entrants.map((en, i) => (
                                <li key={en.id} className="v2-item">
                                    <span>{en.name}</span>
                                    <span className="v2-item-sub">#{en.seed ?? i + 1}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="v2-item-sub" style={{ marginBottom: 14 }}>Cần ít nhất 2 đội/cặp.</p>
                    )}

                    <div className="v2-add-box">
                        <h3>Thêm {info.entrant_type === 'pair' ? 'cặp đôi' : 'VĐV'}</h3>
                        <div className="v2-grid-2">
                            <div className="v2-field">
                                <label>Tên</label>
                                <input
                                    value={entrantForm.name}
                                    onChange={e => setEntrantForm(c => ({ ...c, name: e.target.value }))}
                                    placeholder={info.entrant_type === 'pair' ? 'Tuấn / Nam' : 'Nguyễn Tuấn'}
                                    onKeyDown={e => e.key === 'Enter' && addEntrant()}
                                />
                            </div>
                            <div className="v2-field">
                                <label>Hạt giống</label>
                                <input type="number" min="1" value={entrantForm.seed}
                                    onChange={e => setEntrantForm(c => ({ ...c, seed: e.target.value }))}
                                    placeholder="(tùy chọn)" />
                            </div>
                        </div>
                        <button type="button" className="v2-btn-secondary" onClick={addEntrant} disabled={busy}>
                            {busy ? 'Đang thêm...' : '+ Thêm'}
                        </button>
                    </div>

                    <div className="v2-wizard-nav">
                        <button type="button" className="v2-btn-secondary" onClick={goBack}>Quay lại</button>
                        <button type="button" className="v2-btn-primary" onClick={goToStep4Regular} disabled={busy}>
                            Tiếp tục
                        </button>
                    </div>
                </div>
            )}

            {/* ===== STEP 3 MLP: Quản lý đội ===== */}
            {step === 3 && tournamentFormat === 'mlp' && (
                <div>
                    <ul className="v2-item-list" style={{ marginBottom: 12 }}>
                        {mlpTeams.map((team, tIdx) => {
                            const ps = getPS(team.localId);
                            const usedIds = new Set(team.members.map(m => m.member_id).filter(Boolean));
                            const availableClub = clubMembers.filter(m => !usedIds.has(m.id));
                            return (
                                <li key={team.localId} className="v2-team-card">
                                    <div className="v2-team-header">
                                        <input
                                            className="v2-team-name-input"
                                            value={team.name}
                                            onChange={e => setTeamName(team.localId, e.target.value)}
                                            placeholder={`Đội ${tIdx + 1}`}
                                        />
                                        {mlpTeams.length > 2 && (
                                            <button type="button" className="v2-btn-remove"
                                                onClick={() => removeMlpTeam(team.localId)}>✕</button>
                                        )}
                                    </div>

                                    {team.members.length > 0 && (
                                        <div className="v2-member-chips">
                                            {team.members.map((m, mIdx) => (
                                                <span key={mIdx} className="v2-member-chip">
                                                    {m.display_name}
                                                    <button type="button" onClick={() => removeTeamMember(team.localId, mIdx)}>✕</button>
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {availableClub.length > 0 && (
                                        <div className="v2-member-add-row">
                                            <select
                                                className="v2-member-select"
                                                value={ps.clubPick}
                                                onChange={e => setPS(team.localId, 'clubPick', e.target.value)}
                                            >
                                                <option value="">Chọn thành viên CLB...</option>
                                                {availableClub.map(m => (
                                                    <option key={m.id} value={m.id}>{m.full_name}</option>
                                                ))}
                                            </select>
                                            <button type="button" className="v2-btn-secondary v2-btn-sm"
                                                onClick={() => addFromClub(team.localId)} disabled={!ps.clubPick}>
                                                + Thêm
                                            </button>
                                        </div>
                                    )}

                                    <div className="v2-member-add-row">
                                        <input
                                            className="v2-member-manual-input"
                                            value={ps.manualName}
                                            onChange={e => setPS(team.localId, 'manualName', e.target.value)}
                                            placeholder="Hoặc nhập tên thủ công..."
                                            onKeyDown={e => e.key === 'Enter' && addManual(team.localId)}
                                        />
                                        <button type="button" className="v2-btn-secondary v2-btn-sm"
                                            onClick={() => addManual(team.localId)} disabled={!ps.manualName.trim()}>
                                            + Thêm
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>

                    <button type="button" className="v2-btn-secondary" onClick={addMlpTeam}
                        style={{ width: '100%', marginBottom: 14 }}>
                        + Thêm đội
                    </button>

                    <div className="v2-wizard-nav">
                        <button type="button" className="v2-btn-secondary" onClick={goBack}>Quay lại</button>
                        <button type="button" className="v2-btn-primary" onClick={submitMlpTeams} disabled={busy}>
                            {busy ? 'Đang lưu...' : 'Tiếp tục'}
                        </button>
                    </div>
                </div>
            )}

            {/* ===== STEP 4: Sinh lịch ===== */}
            {step === 4 && (
                <div>
                    <p className="v2-item-sub" style={{ marginBottom: 14 }}>
                        Sinh lịch cho <strong>{stages[0]?.name || 'giai đoạn đầu'}</strong>
                        {' — '}{entrants.length} {tournamentFormat === 'mlp' ? 'đội' : 'đội/cặp'}.
                    </p>

                    {matchCount === null ? (
                        <button type="button" className="v2-btn-primary" onClick={runGenerate} disabled={busy}
                            style={{ width: '100%' }}>
                            {busy ? 'Đang sinh lịch...' : 'Sinh lịch thi đấu'}
                        </button>
                    ) : (
                        <>
                            <p className="v2-result">✓ Đã sinh {matchCount} trận đấu.</p>
                            <button type="button" className="v2-btn-primary" onClick={finish} style={{ width: '100%' }}>
                                Mở console giải
                            </button>
                        </>
                    )}

                    <div className="v2-wizard-nav" style={{ marginTop: 12 }}>
                        <button type="button" className="v2-btn-secondary" onClick={goBack} disabled={busy}>
                            Quay lại
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
