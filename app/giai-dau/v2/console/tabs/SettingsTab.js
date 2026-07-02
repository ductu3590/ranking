'use client';

import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { generateSchedule, saveStage, updateTournament } from '@/lib/tournamentV2Client';

export default function SettingsTab({ tournament, stage, stageId, stages, isAdmin, reload }) {
    const [qrDataUrl, setQrDataUrl] = useState('');
    const [copied, setCopied] = useState(false);
    const [busyStageId, setBusyStageId] = useState(null);
    const [notice, setNotice] = useState('');

    // Chỉnh sửa thông tin giải
    const [editInfo, setEditInfo] = useState(false);
    const [infoForm, setInfoForm] = useState({ name: '', event_date: '', location: '' });
    const [infoBusy, setInfoBusy] = useState(false);

    // Chỉnh sửa cài đặt stage hiện tại
    const [editConfig, setEditConfig] = useState(false);
    const [configForm, setConfigForm] = useState({ gamesPerMatchup: 4, dreamBreaker: true });
    const [configBusy, setConfigBusy] = useState(false);

    const slug = tournament?.public_slug || '';
    const publicPath = slug ? `/giai-dau/v2/${slug}` : '';
    const publicUrl =
        typeof window !== 'undefined' && publicPath ? `${window.location.origin}${publicPath}` : publicPath;

    useEffect(() => {
        let active = true;
        if (!publicUrl) { setQrDataUrl(''); return; }
        QRCode.toDataURL(publicUrl, { width: 220, margin: 1 })
            .then((url) => { if (active) setQrDataUrl(url); })
            .catch(() => { if (active) setQrDataUrl(''); });
        return () => { active = false; };
    }, [publicUrl]);

    // Sync form khi tournament/stage thay đổi
    useEffect(() => {
        if (tournament) {
            setInfoForm({
                name: tournament.name || '',
                event_date: tournament.event_date ? tournament.event_date.slice(0, 10) : '',
                location: tournament.location || '',
            });
        }
    }, [tournament]);

    useEffect(() => {
        if (stage?.config) {
            setConfigForm({
                gamesPerMatchup: Number(stage.config.gamesPerMatchup) || 4,
                dreamBreaker: stage.config.dreamBreaker !== false,
            });
        }
    }, [stage]);

    async function copyLink() {
        try {
            await navigator.clipboard.writeText(publicUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { setCopied(false); }
    }

    async function regenerate(sId, sName) {
        if (!window.confirm(`Sinh lại lịch cho giai đoạn "${sName}"? Mọi tỉ số đã nhập của giai đoạn này sẽ bị xóa.`)) return;
        setBusyStageId(sId);
        setNotice('');
        try {
            const resp = await generateSchedule(sId);
            setNotice(`Đã sinh ${resp.matchCount ?? 0} trận cho "${sName}".`);
            if (reload) await reload();
        } catch (err) {
            setNotice(err.message || 'Không sinh được lịch.');
        } finally {
            setBusyStageId(null);
        }
    }

    async function saveInfo() {
        setInfoBusy(true);
        setNotice('');
        try {
            if (!infoForm.name.trim()) throw new Error('Tên giải không được để trống.');
            await updateTournament({
                id: tournament.id,
                name: infoForm.name.trim(),
                event_date: infoForm.event_date || null,
                location: infoForm.location || null,
            });
            setNotice('Đã cập nhật thông tin giải.');
            setEditInfo(false);
            if (reload) await reload();
        } catch (err) {
            setNotice(err.message || 'Không lưu được.');
        } finally {
            setInfoBusy(false);
        }
    }

    async function saveConfig() {
        if (!stage) return;
        setConfigBusy(true);
        setNotice('');
        try {
            const rounds = Number(configForm.gamesPerMatchup);
            if (!rounds || rounds < 1) throw new Error('Số vòng đấu phải ≥ 1.');
            const newConfig = {
                ...(stage.config || {}),
                gamesPerMatchup: rounds,
                dreamBreaker: configForm.dreamBreaker,
            };
            await saveStage({ id: stage.id, config: newConfig });
            setNotice('Đã cập nhật điều lệ. Cần sinh lại lịch để áp dụng thay đổi số vòng.');
            setEditConfig(false);
            if (reload) await reload();
        } catch (err) {
            setNotice(err.message || 'Không lưu được.');
        } finally {
            setConfigBusy(false);
        }
    }

    const isMlpStage = stage?.match_format === 'mlp';

    return (
        <div className="v2-settings">
            {notice ? <p className="v2-notice v2-notice-info">{notice}</p> : null}

            {/* Link công khai */}
            <section className="v2-settings-block">
                <h3>Link công khai</h3>
                {publicPath ? (
                    <>
                        <p className="v2-public-link">{publicUrl}</p>
                        <div className="v2-settings-actions">
                            <button type="button" className="v2-btn-secondary v2-btn-sm" onClick={copyLink}>
                                {copied ? 'Đã sao chép' : 'Sao chép link'}
                            </button>
                            <a className="v2-btn-secondary v2-btn-sm" href={publicPath} target="_blank" rel="noreferrer">
                                Mở trang xem
                            </a>
                        </div>
                        {qrDataUrl ? (
                            <div className="v2-qr-wrap">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={qrDataUrl} alt="Mã QR trang công khai" className="v2-qr" />
                                <p className="v2-overview-sub">Quét QR để xem trực tiếp tại sân.</p>
                            </div>
                        ) : null}
                    </>
                ) : (
                    <p className="v2-overview-sub">Giải chưa có slug công khai.</p>
                )}
            </section>

            {/* Thông tin giải */}
            {isAdmin && tournament ? (
                <section className="v2-settings-block">
                    <div className="v2-settings-block-head">
                        <h3>Thông tin giải</h3>
                        {!editInfo ? (
                            <button type="button" className="v2-link-btn" onClick={() => setEditInfo(true)}>Sửa</button>
                        ) : null}
                    </div>
                    {editInfo ? (
                        <div className="v2-add-box">
                            <div className="v2-field">
                                <label>Tên giải</label>
                                <input
                                    value={infoForm.name}
                                    onChange={(e) => setInfoForm((c) => ({ ...c, name: e.target.value }))}
                                    placeholder="VD: Giải MLP Phong Trào Hè 2026"
                                />
                            </div>
                            <div className="v2-grid-2">
                                <div className="v2-field">
                                    <label>Ngày thi đấu</label>
                                    <input
                                        type="date"
                                        value={infoForm.event_date}
                                        onChange={(e) => setInfoForm((c) => ({ ...c, event_date: e.target.value }))}
                                    />
                                </div>
                                <div className="v2-field">
                                    <label>Địa điểm</label>
                                    <input
                                        value={infoForm.location}
                                        onChange={(e) => setInfoForm((c) => ({ ...c, location: e.target.value }))}
                                        placeholder="VD: Sân Quận 7"
                                    />
                                </div>
                            </div>
                            <div className="v2-wizard-nav">
                                <button type="button" className="v2-btn-secondary" onClick={() => setEditInfo(false)}>Hủy</button>
                                <button type="button" className="v2-btn-primary" onClick={saveInfo} disabled={infoBusy}>
                                    {infoBusy ? 'Đang lưu...' : 'Lưu'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <ul className="v2-info-list">
                            <li><span>Tên:</span> {tournament.name}</li>
                            {tournament.event_date ? <li><span>Ngày:</span> {tournament.event_date.slice(0, 10)}</li> : null}
                            {tournament.location ? <li><span>Địa điểm:</span> {tournament.location}</li> : null}
                        </ul>
                    )}
                </section>
            ) : null}

            {/* Điều lệ MLP */}
            {isAdmin && isMlpStage && stage ? (
                <section className="v2-settings-block">
                    <div className="v2-settings-block-head">
                        <h3>Điều lệ vòng đấu MLP</h3>
                        {!editConfig ? (
                            <button type="button" className="v2-link-btn" onClick={() => setEditConfig(true)}>Sửa</button>
                        ) : null}
                    </div>
                    {editConfig ? (
                        <div className="v2-add-box">
                            <div className="v2-grid-2">
                                <div className="v2-field">
                                    <label>Số vòng đấu mỗi trận</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="10"
                                        value={configForm.gamesPerMatchup}
                                        onChange={(e) => setConfigForm((c) => ({ ...c, gamesPerMatchup: e.target.value }))}
                                    />
                                    <p className="v2-field-hint">Mỗi vòng tất cả VĐV ghép đôi ra sân, thắng +1 điểm.</p>
                                </div>
                                <div className="v2-field">
                                    <label>DreamBreaker khi hòa</label>
                                    <label className="v2-checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={configForm.dreamBreaker}
                                            onChange={(e) => setConfigForm((c) => ({ ...c, dreamBreaker: e.target.checked }))}
                                            style={{ accentColor: '#8b5cf6', width: 16, height: 16 }}
                                        />
                                        <span>{configForm.dreamBreaker ? 'Bật' : 'Tắt'}</span>
                                    </label>
                                    <p className="v2-field-hint">Đơn luân phiên đến 21 khi hòa sau đủ vòng.</p>
                                </div>
                            </div>
                            <div className="v2-wizard-nav">
                                <button type="button" className="v2-btn-secondary" onClick={() => setEditConfig(false)}>Hủy</button>
                                <button type="button" className="v2-btn-primary" onClick={saveConfig} disabled={configBusy}>
                                    {configBusy ? 'Đang lưu...' : 'Lưu điều lệ'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <ul className="v2-info-list">
                            <li><span>Số vòng đấu:</span> {stage.config?.gamesPerMatchup ?? 4}</li>
                            <li><span>DreamBreaker:</span> {stage.config?.dreamBreaker !== false ? 'Bật' : 'Tắt'}</li>
                        </ul>
                    )}
                </section>
            ) : null}

            {/* Sinh lại lịch */}
            {isAdmin ? (
                <section className="v2-settings-block">
                    <h3>Sinh lại lịch thi đấu</h3>
                    <p className="v2-overview-sub">Lưu ý: sinh lại sẽ xóa toàn bộ tỉ số đã nhập của giai đoạn đó.</p>
                    {stages && stages.length ? (
                        <ul className="v2-item-list">
                            {stages.map((s) => (
                                <li key={s.id} className="v2-item v2-team-item">
                                    <div className="v2-team-info">
                                        <span className="v2-team-name">{s.name}</span>
                                        <span className="v2-item-sub">
                                            {s.schedule_format === 'knockout' ? 'Loại trực tiếp' : 'Vòng tròn'}
                                            {' · '}
                                            {s.match_format === 'mlp' ? 'MLP' : 'Thường'}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        className="v2-link-btn"
                                        onClick={() => regenerate(s.id, s.name)}
                                        disabled={busyStageId === s.id}
                                    >
                                        {busyStageId === s.id ? 'Đang sinh...' : 'Sinh lại'}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="v2-overview-sub">Chưa có giai đoạn nào.</p>
                    )}
                </section>
            ) : null}
        </div>
    );
}
