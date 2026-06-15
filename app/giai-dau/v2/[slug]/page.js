'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getPublic, getStandings } from '@/lib/tournamentV2Client';
import { supabase } from '@/lib/supabaseClient';
import { StandingsView } from '../console/standingsRender';
import { BracketView } from '../console/bracketRender';
import '../console/bracket.css';
import './public.css';

const STATUS_LABELS = {
    draft: 'Nháp',
    active: 'Đang diễn ra',
    completed: 'Hoàn thành',
};

const MATCH_STATUS_LABELS = {
    pending: 'Chưa đấu',
    live: 'Đang đấu',
    done: 'Đã xong',
};

function entrantName(entrantsById, id, fallback) {
    if (id == null) return fallback || 'Chưa xác định';
    const e = entrantsById[String(id)];
    return e ? e.name : `#${id}`;
}

// Lịch thi đấu read-only cho 1 stage.
function ScheduleList({ matches, entrantsById }) {
    if (!matches || !matches.length) {
        return <p className="v2pub-empty">Chưa có trận nào.</p>;
    }
    return (
        <ul className="v2pub-match-list">
            {matches.map((m) => {
                const nameA = entrantName(entrantsById, m.entrant_a_id, 'Đội A');
                const nameB = entrantName(entrantsById, m.entrant_b_id, 'Đội B');
                const winA = m.winner_entrant_id != null && String(m.winner_entrant_id) === String(m.entrant_a_id);
                const winB = m.winner_entrant_id != null && String(m.winner_entrant_id) === String(m.entrant_b_id);
                return (
                    <li key={m.id} className="v2pub-match">
                        <div className="v2pub-match-teams">
                            <span className={winA ? 'v2pub-win' : ''}>{nameA}</span>
                            <span className="v2pub-vs">vs</span>
                            <span className={winB ? 'v2pub-win' : ''}>{nameB}</span>
                        </div>
                        <span className={`v2pub-status v2pub-status-${m.status}`}>
                            {MATCH_STATUS_LABELS[m.status] || m.status}
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}

// 1 giai đoạn: lịch + BXH (+ sơ đồ nếu knockout).
function StageSection({ stage, matches, entrantsById, standings }) {
    const isKnockout = stage.schedule_format === 'knockout';
    return (
        <section className="v2pub-stage">
            <h2 className="v2pub-stage-title">{stage.name}</h2>

            {isKnockout ? (
                <div className="v2pub-block">
                    <h3 className="v2pub-block-title">Sơ đồ thi đấu</h3>
                    <BracketView matches={matches} gamesByMatchId={{}} entrantsById={entrantsById} />
                </div>
            ) : null}

            <div className="v2pub-block">
                <h3 className="v2pub-block-title">Lịch thi đấu</h3>
                <ScheduleList matches={matches} entrantsById={entrantsById} />
            </div>

            <div className="v2pub-block">
                <h3 className="v2pub-block-title">Bảng xếp hạng</h3>
                {standings && standings.standings && standings.standings.length ? (
                    <StandingsView
                        scheduleFormat={standings.schedule_format || stage.schedule_format}
                        rows={standings.standings}
                        entrantsById={entrantsById}
                    />
                ) : (
                    <p className="v2pub-empty">Chưa có dữ liệu xếp hạng.</p>
                )}
            </div>
        </section>
    );
}

export default function PublicTournamentPage({ params }) {
    const slug = params?.slug;

    const [data, setData] = useState(null); // { tournament, stages, entrants, matches }
    const [standingsByStage, setStandingsByStage] = useState({});
    const [activeStageId, setActiveStageId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const refetchTimer = useRef(null);

    const load = useCallback(async () => {
        if (!slug) {
            setError('Thiếu mã giải đấu.');
            setLoading(false);
            return;
        }
        setError('');
        try {
            const snapshot = await getPublic(slug);
            setData(snapshot);
            setActiveStageId((prev) => {
                const stages = snapshot.stages || [];
                if (prev && stages.some((s) => String(s.id) === String(prev))) return prev;
                return stages.length ? stages[0].id : null;
            });
            // BXH tính riêng từng stage (on-read).
            const stages = snapshot.stages || [];
            const results = await Promise.all(
                stages.map((s) => getStandings(s.id).catch(() => null)),
            );
            const map = {};
            stages.forEach((s, i) => {
                if (results[i]) map[String(s.id)] = results[i];
            });
            setStandingsByStage(map);
        } catch (err) {
            setError(err.message || 'Không tải được dữ liệu giải đấu.');
        } finally {
            setLoading(false);
        }
    }, [slug]);

    useEffect(() => {
        load();
    }, [load]);

    // Realtime: refetch (debounce) khi matches/games thay đổi.
    const tournamentId = data?.tournament?.id;
    useEffect(() => {
        if (!tournamentId) return undefined;

        function scheduleRefetch() {
            if (refetchTimer.current) clearTimeout(refetchTimer.current);
            refetchTimer.current = setTimeout(() => {
                load();
            }, 600);
        }

        const channel = supabase
            .channel(`tour-public-${tournamentId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_matches' }, scheduleRefetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_games' }, scheduleRefetch)
            .subscribe();

        return () => {
            if (refetchTimer.current) clearTimeout(refetchTimer.current);
            supabase.removeChannel(channel);
        };
    }, [tournamentId, load]);

    if (loading) {
        return (
            <div className="v2pub-state v2pub-loading">
                <span className="v2-spinner" aria-hidden="true" />
                <p>Đang tải giải đấu...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="v2pub-state v2pub-error">
                <p>{error}</p>
                <button type="button" className="v2pub-retry" onClick={load}>Thử lại</button>
            </div>
        );
    }

    if (!data || !data.tournament) {
        return (
            <div className="v2pub-state v2pub-empty">
                <p>Giải đấu không tồn tại.</p>
            </div>
        );
    }

    const { tournament, stages = [], entrants = [], matches = [] } = data;

    const entrantsById = {};
    for (const e of entrants) entrantsById[String(e.id)] = e;

    const activeStage = stages.find((s) => String(s.id) === String(activeStageId)) || null;
    const stageMatches = activeStage
        ? matches.filter((m) => String(m.stage_id) === String(activeStage.id))
        : [];

    return (
        <div className="v2pub-page">
            <header className="v2pub-head">
                <div className="v2pub-live-dot" aria-hidden="true" />
                <h1 className="v2pub-name">{tournament.name}</h1>
                <div className="v2pub-meta">
                    <span className={`v2pub-chip v2pub-chip-${tournament.status || 'draft'}`}>
                        {STATUS_LABELS[tournament.status] || 'Nháp'}
                    </span>
                    {tournament.event_date ? <span className="v2pub-date">{tournament.event_date}</span> : null}
                    {tournament.location ? <span className="v2pub-loc">{tournament.location}</span> : null}
                </div>
            </header>

            {stages.length === 0 ? (
                <div className="v2pub-state v2pub-empty">
                    <p>Giải chưa có giai đoạn nào.</p>
                </div>
            ) : (
                <>
                    {stages.length > 1 ? (
                        <nav className="v2pub-stage-picker" aria-label="Giai đoạn">
                            {stages.map((s) => (
                                <button
                                    key={s.id}
                                    type="button"
                                    className={`v2pub-stage-seg ${String(activeStageId) === String(s.id) ? 'active' : ''}`}
                                    onClick={() => setActiveStageId(s.id)}
                                >
                                    {s.name}
                                </button>
                            ))}
                        </nav>
                    ) : null}

                    {activeStage ? (
                        <StageSection
                            stage={activeStage}
                            matches={stageMatches}
                            entrantsById={entrantsById}
                            standings={standingsByStage[String(activeStage.id)]}
                        />
                    ) : null}
                </>
            )}

            <footer className="v2pub-foot">
                <p>Cập nhật trực tiếp khi có kết quả mới.</p>
            </footer>
        </div>
    );
}
