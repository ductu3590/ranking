'use client';

import { useState, useEffect, useCallback } from 'react';
import { getStandings, listEntrants } from '@/lib/tournamentV2Client';
import { StandingsView } from '../standingsRender';
import '../bracket.css';

// Tab Bảng xếp hạng — nhánh theo schedule_format (round_robin | knockout).
export default function StandingsTab({ tournamentId, stageId, stages }) {
    const [data, setData] = useState(null); // { schedule_format, standings }
    const [entrantsById, setEntrantsById] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const stage = (stages || []).find((s) => String(s.id) === String(stageId)) || null;

    const load = useCallback(async () => {
        if (!stageId) {
            setData(null);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const [standings, entrants] = await Promise.all([
                getStandings(stageId),
                listEntrants(tournamentId),
            ]);
            setData(standings);
            const map = {};
            for (const e of entrants || []) map[String(e.id)] = e;
            setEntrantsById(map);
        } catch (err) {
            setError(err.message || 'Không tải được bảng xếp hạng.');
        } finally {
            setLoading(false);
        }
    }, [stageId, tournamentId]);

    useEffect(() => {
        load();
    }, [load]);

    if (loading) {
        return (
            <div className="v2-state v2-loading">
                <span className="v2-spinner" aria-hidden="true" />
                <p>Đang tính bảng xếp hạng...</p>
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

    if (!data || !data.standings || !data.standings.length) {
        return (
            <div className="v2-state v2-empty">
                <p>Chưa có dữ liệu xếp hạng. Hãy nhập tỉ số ở tab Kết quả.</p>
            </div>
        );
    }

    return (
        <StandingsView
            scheduleFormat={data.schedule_format || stage?.schedule_format}
            rows={data.standings}
            entrantsById={entrantsById}
        />
    );
}
