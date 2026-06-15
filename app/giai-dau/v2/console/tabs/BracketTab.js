'use client';

import { useState, useEffect, useCallback } from 'react';
import { listMatches, listEntrants } from '@/lib/tournamentV2Client';
import { BracketView } from '../bracketRender';
import '../bracket.css';

// Tab Sơ đồ — chỉ áp dụng cho thể thức loại trực tiếp (knockout).
export default function BracketTab({ tournamentId, stageId, stages }) {
    const [matches, setMatches] = useState([]);
    const [gamesByMatchId, setGamesByMatchId] = useState({});
    const [entrantsById, setEntrantsById] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const stage = (stages || []).find((s) => String(s.id) === String(stageId)) || null;
    const isKnockout = stage?.schedule_format === 'knockout';

    const load = useCallback(async () => {
        if (!stageId || !isKnockout) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const [matchData, entrants] = await Promise.all([
                listMatches(stageId),
                listEntrants(tournamentId),
            ]);
            setMatches(matchData.matches || []);
            setGamesByMatchId(matchData.gamesByMatchId || {});
            const map = {};
            for (const e of entrants || []) map[String(e.id)] = e;
            setEntrantsById(map);
        } catch (err) {
            setError(err.message || 'Không tải được sơ đồ thi đấu.');
        } finally {
            setLoading(false);
        }
    }, [stageId, tournamentId, isKnockout]);

    useEffect(() => {
        load();
    }, [load]);

    if (!isKnockout) {
        return (
            <div className="v2-state v2-empty">
                <p>Chỉ áp dụng cho thể thức loại trực tiếp.</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="v2-state v2-loading">
                <span className="v2-spinner" aria-hidden="true" />
                <p>Đang tải sơ đồ...</p>
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

    return (
        <BracketView matches={matches} gamesByMatchId={gamesByMatchId} entrantsById={entrantsById} />
    );
}
