'use client';

import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { generateSchedule } from '@/lib/tournamentV2Client';

export default function SettingsTab({ tournament, stage, stageId, stages, isAdmin, reload }) {
    const [qrDataUrl, setQrDataUrl] = useState('');
    const [copied, setCopied] = useState(false);
    const [busyStageId, setBusyStageId] = useState(null);
    const [notice, setNotice] = useState('');

    const slug = tournament?.public_slug || '';
    const publicPath = slug ? `/giai-dau/v2/${slug}` : '';
    const publicUrl =
        typeof window !== 'undefined' && publicPath ? `${window.location.origin}${publicPath}` : publicPath;

    useEffect(() => {
        let active = true;
        if (!publicUrl) {
            setQrDataUrl('');
            return;
        }
        QRCode.toDataURL(publicUrl, { width: 220, margin: 1 })
            .then((url) => {
                if (active) setQrDataUrl(url);
            })
            .catch(() => {
                if (active) setQrDataUrl('');
            });
        return () => {
            active = false;
        };
    }, [publicUrl]);

    async function copyLink() {
        try {
            await navigator.clipboard.writeText(publicUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setCopied(false);
        }
    }

    async function regenerate(sId, sName) {
        if (!window.confirm(`Sinh lại lịch cho giai đoạn "${sName}"? Mọi tỉ số đã nhập của giai đoạn này sẽ bị xóa.`)) {
            return;
        }
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

    return (
        <div className="v2-settings">
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

            {isAdmin ? (
                <section className="v2-settings-block">
                    <h3>Sinh lại lịch thi đấu</h3>
                    {notice ? <p className="v2-notice v2-notice-info">{notice}</p> : null}
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
