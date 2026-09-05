'use client';

import { useState, useEffect, useCallback } from 'react';
import { getPublic } from '@/lib/tournamentV2Client';
import { StandingsView } from '../../../console/standingsRender';
import ShareActions from '../../../ShareActions';
import '../../public.css';
import '../../../share.css';

const MATCH_STATUS_LABELS = {
    pending: 'Chưa đấu',
    assigned: 'Đã xếp sân',
    ready: 'Sẵn sàng',
    live: 'Đang đấu',
    done: 'Đã xong',
    finalized: 'Đã xong',
};

export default function DivisionPublicView({ slug, divisionId }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!slug) {
            setError('Thiếu mã giải đấu.');
            setLoading(false);
            return;
        }
        try {
            setData(await getPublic(slug));
        } catch (err) {
            setError(err.message || 'Không tải được dữ liệu giải đấu.');
        } finally {
            setLoading(false);
        }
    }, [slug]);

    useEffect(() => { load(); }, [load]);

    if (loading) {
        return (
            <div className="v2pub-state v2pub-loading">
                <span className="v2-spinner" aria-hidden="true" />
                <p>Đang tải nội dung thi đấu...</p>
            </div>
        );
    }
    if (error || !data || !data.tournament) {
        return (
            <div className="v2pub-state v2pub-error">
                <p>{error || 'Giải đấu không tồn tại.'}</p>
            </div>
        );
    }

    const division = (data.divisions || []).find((row) => String(row.id) === String(divisionId));
    if (!division) {
        return (
            <div className="v2pub-state v2pub-empty">
                <p>Nội dung thi đấu không tồn tại trong giải này.</p>
            </div>
        );
    }

    const stages = (data.stages || []).filter((stage) => String(stage.division_id) === String(division.id));
    const entrantsById = {};
    for (const entrant of data.entrants || []) entrantsById[String(entrant.id)] = entrant;
    const stageIds = new Set(stages.map((stage) => String(stage.id)));
    const matches = (data.matches || []).filter((match) => stageIds.has(String(match.stage_id)));

    return (
        <div className="v2pub-page">
            <header className="v2pub-head">
                <h1 className="v2pub-name">{data.tournament.name}</h1>
                <div className="v2pub-meta">
                    <span className="v2pub-chip">{division.name}</span>
                    {data.tournament.event_date ? <span className="v2pub-date">{data.tournament.event_date}</span> : null}
                    {data.tournament.location ? <span className="v2pub-loc">{data.tournament.location}</span> : null}
                </div>
            </header>

            <ShareActions snapshot={data} divisionId={division.id} stageId={stages.length ? stages[0].id : null} />

            {stages.length === 0 ? (
                <div className="v2pub-state v2pub-empty">
                    <p>Nội dung này chưa có giai đoạn nào.</p>
                </div>
            ) : stages.map((stage) => {
                const stageMatches = matches.filter((match) => String(match.stage_id) === String(stage.id));
                const standings = (data.standingsByStage || {})[String(stage.id)];
                return (
                    <section className="v2pub-stage" key={stage.id}>
                        <h2 className="v2pub-stage-title">{stage.name}</h2>
                        <div className="v2pub-block">
                            <h3 className="v2pub-block-title">Lịch thi đấu</h3>
                            {stageMatches.length ? (
                                <ul className="v2pub-match-list">
                                    {stageMatches.map((match) => (
                                        <li key={match.id} className="v2pub-match">
                                            <div className="v2pub-match-teams">
                                                <span>{entrantsById[String(match.entrant_a_id)]?.name || 'Đội A'}</span>
                                                <span className="v2pub-vs">vs</span>
                                                <span>{entrantsById[String(match.entrant_b_id)]?.name || 'Đội B'}</span>
                                            </div>
                                            <span className={`v2pub-status v2pub-status-${match.status}`}>
                                                {MATCH_STATUS_LABELS[match.status] || match.status}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : <p className="v2pub-empty">Chưa có trận nào.</p>}
                        </div>
                        <div className="v2pub-block">
                            <h3 className="v2pub-block-title">Bảng xếp hạng</h3>
                            {standings && standings.standings && standings.standings.length ? (
                                <StandingsView
                                    scheduleFormat={standings.schedule_format || stage.schedule_format}
                                    rows={standings.standings}
                                    entrantsById={entrantsById}
                                />
                            ) : <p className="v2pub-empty">Chưa có dữ liệu xếp hạng.</p>}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}
