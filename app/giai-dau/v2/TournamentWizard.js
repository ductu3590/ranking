'use client';

import { useState } from 'react';
import {
    createTournament,
    updateTournament,
    saveStage,
    saveEntrant,
    generateSchedule,
} from '@/lib/tournamentV2Client';
import './v2.css';

const STEPS = [
    { n: 1, label: 'Thông tin' },
    { n: 2, label: 'Giai đoạn' },
    { n: 3, label: 'Đội/Cặp' },
    { n: 4, label: 'Sinh lịch' },
];

const SCHEDULE_FORMATS = [
    { value: 'round_robin', label: 'Vòng tròn' },
    { value: 'knockout', label: 'Loại trực tiếp' },
];

const MATCH_FORMATS = [
    { value: 'simple', label: 'Thường' },
    { value: 'mlp', label: 'MLP' },
];

export default function TournamentWizard({ onDone }) {
    const [step, setStep] = useState(1);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');

    // Bước 1 — thông tin giải
    const [info, setInfo] = useState({
        name: '',
        event_date: '',
        location: '',
        entrant_type: 'pair',
    });
    const [tournamentId, setTournamentId] = useState(null);

    // Bước 2 — giai đoạn
    const [stages, setStages] = useState([]);
    const [stageForm, setStageForm] = useState({
        name: '',
        schedule_format: 'round_robin',
        match_format: 'simple',
        groupCount: 1,
        advancePerGroup: 2,
        bestOf: 1,
    });

    // Bước 3 — đội/cặp
    const [entrants, setEntrants] = useState([]);
    const [entrantForm, setEntrantForm] = useState({ name: '', seed: '' });

    // Bước 4 — kết quả sinh lịch
    const [matchCount, setMatchCount] = useState(null);

    const setInfoField = (k, v) => setInfo((c) => ({ ...c, [k]: v }));
    const setStageField = (k, v) => setStageForm((c) => ({ ...c, [k]: v }));
    const setEntrantField = (k, v) => setEntrantForm((c) => ({ ...c, [k]: v }));

    const isTeamLike = info.entrant_type === 'team' || stageForm.match_format === 'mlp';

    // ---- Bước 1: tạo/cập nhật giải, sang bước 2 ----
    async function submitInfo() {
        setNotice('');
        if (!info.name.trim()) {
            setNotice('Vui lòng nhập tên giải.');
            return;
        }
        setBusy(true);
        try {
            const body = {
                name: info.name.trim(),
                event_date: info.event_date || undefined,
                location: info.location || undefined,
                entrant_type: info.entrant_type,
            };
            let resp;
            if (tournamentId) {
                resp = await updateTournament({ id: tournamentId, ...body });
            } else {
                resp = await createTournament(body);
            }
            const t = resp.tournament;
            if (!t || !t.id) throw new Error('Không nhận được mã giải.');
            setTournamentId(t.id);
            setStep(2);
        } catch (err) {
            setNotice(err.message || 'Không tạo được giải.');
        } finally {
            setBusy(false);
        }
    }

    // ---- Bước 2: thêm 1 stage ----
    async function addStage() {
        setNotice('');
        if (!stageForm.name.trim()) {
            setNotice('Vui lòng nhập tên giai đoạn.');
            return;
        }
        setBusy(true);
        try {
            const config = {
                groupCount: Number(stageForm.groupCount) || 1,
                advancePerGroup: Number(stageForm.advancePerGroup) || 1,
                bestOf: Number(stageForm.bestOf) || 1,
            };
            const resp = await saveStage({
                tournament_id: tournamentId,
                name: stageForm.name.trim(),
                schedule_format: stageForm.schedule_format,
                match_format: stageForm.match_format,
                config,
            });
            setStages((c) => [...c, resp.stage]);
            setStageForm((c) => ({ ...c, name: '' }));
        } catch (err) {
            setNotice(err.message || 'Không thêm được giai đoạn.');
        } finally {
            setBusy(false);
        }
    }

    // ---- Bước 3: thêm 1 entrant ----
    async function addEntrant() {
        setNotice('');
        if (!entrantForm.name.trim()) {
            setNotice('Vui lòng nhập tên đội/cặp.');
            return;
        }
        setBusy(true);
        try {
            const body = {
                tournament_id: tournamentId,
                name: entrantForm.name.trim(),
                seed: entrantForm.seed ? Number(entrantForm.seed) : undefined,
            };
            const resp = await saveEntrant(body);
            setEntrants((c) => [...c, resp.entrant]);
            setEntrantForm({ name: '', seed: '' });
        } catch (err) {
            setNotice(err.message || 'Không thêm được đội/cặp.');
        } finally {
            setBusy(false);
        }
    }

    // ---- Bước 4: sinh lịch cho stage đầu ----
    async function runGenerate() {
        setNotice('');
        if (stages.length === 0) {
            setNotice('Chưa có giai đoạn nào để sinh lịch.');
            return;
        }
        setBusy(true);
        try {
            const firstStage = stages[0];
            const resp = await generateSchedule(firstStage.id);
            setMatchCount(resp.matchCount ?? 0);
        } catch (err) {
            setNotice(err.message || 'Không sinh được lịch.');
        } finally {
            setBusy(false);
        }
    }

    function finish() {
        if (onDone) onDone(tournamentId);
    }

    // ---- Điều hướng ----
    function goNext() {
        setNotice('');
        if (step === 2) {
            if (stages.length < 1) {
                setNotice('Cần ít nhất 1 giai đoạn.');
                return;
            }
            setStep(3);
        } else if (step === 3) {
            if (entrants.length < 2) {
                setNotice('Cần ít nhất 2 đội/cặp.');
                return;
            }
            setStep(4);
        }
    }

    function goBack() {
        setNotice('');
        if (step > 1) setStep(step - 1);
    }

    return (
        <div className="v2-wizard">
            <h2 className="v2-wizard-title">Tạo giải đấu</h2>

            <div className="v2-steps">
                {STEPS.map((s) => (
                    <div
                        key={s.n}
                        className={`v2-step-dot ${s.n === step ? 'active' : s.n < step ? 'done' : ''}`}
                    >
                        {s.n}. {s.label}
                    </div>
                ))}
            </div>

            {notice ? <p className="v2-notice">{notice}</p> : null}

            {/* ---------- Bước 1: Thông tin ---------- */}
            {step === 1 ? (
                <div>
                    <div className="v2-field">
                        <label>Tên giải</label>
                        <input
                            value={info.name}
                            onChange={(e) => setInfoField('name', e.target.value)}
                            placeholder="Giải CLB mùa hè 2026"
                        />
                    </div>
                    <div className="v2-grid-2">
                        <div className="v2-field">
                            <label>Ngày thi đấu</label>
                            <input
                                type="date"
                                value={info.event_date}
                                onChange={(e) => setInfoField('event_date', e.target.value)}
                            />
                        </div>
                        <div className="v2-field">
                            <label>Địa điểm</label>
                            <input
                                value={info.location}
                                onChange={(e) => setInfoField('location', e.target.value)}
                                placeholder="Sân 246"
                            />
                        </div>
                    </div>
                    <div className="v2-field">
                        <label>Hình thức tham gia</label>
                        <div className="v2-radio-row">
                            <label className={`v2-radio ${info.entrant_type === 'pair' ? 'active' : ''}`}>
                                <input
                                    type="radio"
                                    name="entrant_type"
                                    value="pair"
                                    checked={info.entrant_type === 'pair'}
                                    onChange={() => setInfoField('entrant_type', 'pair')}
                                />
                                Cặp đôi
                            </label>
                            <label className={`v2-radio ${info.entrant_type === 'team' ? 'active' : ''}`}>
                                <input
                                    type="radio"
                                    name="entrant_type"
                                    value="team"
                                    checked={info.entrant_type === 'team'}
                                    onChange={() => setInfoField('entrant_type', 'team')}
                                />
                                Đội
                            </label>
                        </div>
                    </div>
                    <div className="v2-wizard-nav">
                        <button type="button" className="v2-btn-primary" onClick={submitInfo} disabled={busy}>
                            {busy ? 'Đang lưu...' : 'Tiếp tục'}
                        </button>
                    </div>
                </div>
            ) : null}

            {/* ---------- Bước 2: Giai đoạn ---------- */}
            {step === 2 ? (
                <div>
                    {stages.length > 0 ? (
                        <ul className="v2-item-list">
                            {stages.map((s, i) => (
                                <li key={s.id} className="v2-item">
                                    <span>
                                        {i + 1}. {s.name}
                                        <br />
                                        <span className="v2-item-sub">
                                            {s.schedule_format === 'knockout' ? 'Loại trực tiếp' : 'Vòng tròn'}
                                            {' · '}
                                            {s.match_format === 'mlp' ? 'MLP' : 'Thường'}
                                        </span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="v2-item-sub">Chưa có giai đoạn. Thêm ≥2 để tạo giải mix nhiều giai đoạn.</p>
                    )}

                    <div className="v2-add-box">
                        <h3>Thêm giai đoạn</h3>
                        <div className="v2-field">
                            <label>Tên giai đoạn</label>
                            <input
                                value={stageForm.name}
                                onChange={(e) => setStageField('name', e.target.value)}
                                placeholder="Vòng bảng"
                            />
                        </div>
                        <div className="v2-grid-2">
                            <div className="v2-field">
                                <label>Thể thức lịch</label>
                                <select
                                    value={stageForm.schedule_format}
                                    onChange={(e) => setStageField('schedule_format', e.target.value)}
                                >
                                    {SCHEDULE_FORMATS.map((o) => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="v2-field">
                                <label>Thể thức trận</label>
                                <select
                                    value={stageForm.match_format}
                                    onChange={(e) => setStageField('match_format', e.target.value)}
                                >
                                    {MATCH_FORMATS.map((o) => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="v2-grid-2">
                            {stageForm.schedule_format === 'round_robin' ? (
                                <>
                                    <div className="v2-field">
                                        <label>Số bảng</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={stageForm.groupCount}
                                            onChange={(e) => setStageField('groupCount', e.target.value)}
                                        />
                                    </div>
                                    <div className="v2-field">
                                        <label>Đi tiếp mỗi bảng</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={stageForm.advancePerGroup}
                                            onChange={(e) => setStageField('advancePerGroup', e.target.value)}
                                        />
                                    </div>
                                </>
                            ) : (
                                <div className="v2-field">
                                    <label>Best of (số ván)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={stageForm.bestOf}
                                        onChange={(e) => setStageField('bestOf', e.target.value)}
                                    />
                                </div>
                            )}
                        </div>
                        <button type="button" className="v2-btn-secondary" onClick={addStage} disabled={busy}>
                            {busy ? 'Đang thêm...' : '+ Thêm giai đoạn'}
                        </button>
                    </div>

                    <div className="v2-wizard-nav">
                        <button type="button" className="v2-btn-secondary" onClick={goBack}>Quay lại</button>
                        <button type="button" className="v2-btn-primary" onClick={goNext}>Tiếp tục</button>
                    </div>
                </div>
            ) : null}

            {/* ---------- Bước 3: Đội/Cặp ---------- */}
            {step === 3 ? (
                <div>
                    {entrants.length > 0 ? (
                        <ul className="v2-item-list">
                            {entrants.map((en, i) => (
                                <li key={en.id} className="v2-item">
                                    <span>{en.name}</span>
                                    <span className="v2-item-sub">Hạt giống {en.seed ?? i + 1}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="v2-item-sub">Cần ít nhất 2 đội/cặp.</p>
                    )}

                    <div className="v2-add-box">
                        <h3>Thêm {isTeamLike ? 'đội' : 'cặp'}</h3>
                        <div className="v2-grid-2">
                            <div className="v2-field">
                                <label>Tên</label>
                                <input
                                    value={entrantForm.name}
                                    onChange={(e) => setEntrantField('name', e.target.value)}
                                    placeholder={isTeamLike ? 'Đội A' : 'Tuấn / Nam'}
                                />
                            </div>
                            <div className="v2-field">
                                <label>Hạt giống</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={entrantForm.seed}
                                    onChange={(e) => setEntrantField('seed', e.target.value)}
                                    placeholder="(tùy chọn)"
                                />
                            </div>
                        </div>
                        <button type="button" className="v2-btn-secondary" onClick={addEntrant} disabled={busy}>
                            {busy ? 'Đang thêm...' : '+ Thêm'}
                        </button>
                    </div>

                    <div className="v2-wizard-nav">
                        <button type="button" className="v2-btn-secondary" onClick={goBack}>Quay lại</button>
                        <button type="button" className="v2-btn-primary" onClick={goNext}>Tiếp tục</button>
                    </div>
                </div>
            ) : null}

            {/* ---------- Bước 4: Sinh lịch ---------- */}
            {step === 4 ? (
                <div>
                    <p className="v2-item-sub">
                        Sinh lịch cho giai đoạn đầu tiên
                        {stages[0] ? `: ${stages[0].name}` : ''}.
                    </p>

                    {matchCount === null ? (
                        <button type="button" className="v2-btn-primary" onClick={runGenerate} disabled={busy}>
                            {busy ? 'Đang sinh lịch...' : 'Sinh lịch thi đấu'}
                        </button>
                    ) : (
                        <>
                            <p className="v2-result">Đã sinh {matchCount} trận đấu.</p>
                            <button type="button" className="v2-btn-primary" onClick={finish}>
                                Mở console giải
                            </button>
                        </>
                    )}

                    <div className="v2-wizard-nav">
                        <button type="button" className="v2-btn-secondary" onClick={goBack} disabled={busy}>
                            Quay lại
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
