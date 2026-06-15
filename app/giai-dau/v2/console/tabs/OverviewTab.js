'use client';

import { useState, useEffect, useCallback } from 'react';
import { listEntrants, listMatches, advanceStage } from '@/lib/tournamentV2Client';

const STATUS_LABELS = {
    draft: 'Nháp',
    active: 'Đang diễn ra',
    completed: 'Hoàn thành',
};

const STAGE_STATUS_LABELS = {
    pending: 'Chờ',
    active: 'Đang diễn ra',
    completed: 'Hoàn thành',
};

export default function OverviewTab({ tournamentId, tournament, stage, stageId, stages, isAdmin, reload }) {
    const [entrantCount, setEntrantCount] = useState(null);
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [entrants, matchData] = await Promise.all([
                listEntrants(tournamentId),
                stageId ? listMatches(stageId) : Promise.resolve({ matches: [] }),
            ]);
            setEntrantCount(Array.isArray(entrants) ? entrants.length : 0);
            const matches = matchData.matches || [];
            const done = matches.filter((m) => m.status === 'done').length;
            setProgress({ done, total: matches.length });
        } catch (err) {
            setError(err.message || 'Không tải được tổng quan.');
        } finally {
            setLoading(false);
        }
    }, [tournamentId, stageId]);

    useEffect(() => {
        load();
    }, [load]);

    async function handleAdvance() {
        if (!stageId) return;
        if (!window.confirm('Chuyển sang giai đoạn kế tiếp? Kết quả giai đoạn hiện tại sẽ được dùng để xếp hạt giống.')) {
            return;
        }
        setBusy(true);
        setNotice('');
        try {
            const resp = await advanceStage(stageId);
            if (resp.final) {
                setNotice('Đã hoàn tất giai đoạn cuối. Giải kết thúc.');
            } else {
                setNotice(`Đã chuyển giai đoạn (${resp.advanced} đội đi tiếp).`);
            }
            if (reload) await reload();
            await load();
        } catch (err) {
            setNotice(err.message || 'Không chuyển được giai đoạn.');
        } finally {
            setBusy(false);
        }
    }

    if (loading) {
        return (
            <div className="v2-state v2-loading">
                <span className="v2-spinner" aria-hidden="true" />
                <p>Đang tải tổng quan...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="v2-state v2-error">
                <p>{error}</p>
                <button type="button" className="v2-btn-secondary" onClick={load}>Thử lại</button>
            </div>
        );
    }

    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

    return (
        <div className="v2-overview">
            <div className="v2-stat-grid">
                <div className="v2-stat">
                    <span className="v2-stat-num">{stages.length}</span>
                    <span className="v2-stat-label">Giai đoạn</span>
                </div>
                <div className="v2-stat">
                    <span className="v2-stat-num">{entrantCount ?? '—'}</span>
                    <span className="v2-stat-label">Đội/Cặp</span>
                </div>
                <div className="v2-stat">
                    <span className="v2-stat-num">{progress.done}/{progress.total}</span>
                    <span className="v2-stat-label">Trận xong</span>
                </div>
            </div>

            <div className="v2-overview-row">
                <span className="v2-overview-key">Trạng thái giải</span>
                <span className={`v2-chip v2-chip-${tournament?.status || 'draft'}`}>
                    {STATUS_LABELS[tournament?.status] || 'Nháp'}
                </span>
            </div>
            {tournament?.event_date ? (
                <div className="v2-overview-row">
                    <span className="v2-overview-key">Ngày thi đấu</span>
                    <span>{tournament.event_date}</span>
                </div>
            ) : null}
            {tournament?.location ? (
                <div className="v2-overview-row">
                    <span className="v2-overview-key">Địa điểm</span>
                    <span>{tournament.location}</span>
                </div>
            ) : null}

            {stage ? (
                <div className="v2-overview-stage">
                    <h3>Giai đoạn hiện tại: {stage.name}</h3>
                    <div className="v2-progress">
                        <div className="v2-progress-bar" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="v2-overview-sub">
                        {STAGE_STATUS_LABELS[stage.status] || stage.status} · {progress.done}/{progress.total} trận hoàn thành
                    </p>
                </div>
            ) : (
                <p className="v2-overview-sub">Chưa có giai đoạn nào.</p>
            )}

            {notice ? <p className="v2-notice v2-notice-info">{notice}</p> : null}

            {isAdmin && stage ? (
                <button
                    type="button"
                    className="v2-btn-primary v2-block"
                    onClick={handleAdvance}
                    disabled={busy}
                >
                    {busy ? 'Đang xử lý...' : 'Chuyển giai đoạn kế tiếp'}
                </button>
            ) : null}
        </div>
    );
}
