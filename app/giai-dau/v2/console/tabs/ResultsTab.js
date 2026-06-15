'use client';

import { useState, useEffect, useCallback } from 'react';
import { listMatches, listEntrants, saveGames } from '@/lib/tournamentV2Client';

// Các ván con MLP cố định + dreambreaker (ván phụ khi hòa).
const MLP_SUBS = [
    { kind: 'womens', label: 'Đôi nữ' },
    { kind: 'mens', label: 'Đôi nam' },
    { kind: 'mixed1', label: 'Đôi nam nữ 1' },
    { kind: 'mixed2', label: 'Đôi nam nữ 2' },
];

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

// Khởi tạo các ván cho 1 match từ games đã lưu, tùy theo thể thức.
function initGames(match, savedGames, isMlp) {
    if (isMlp) {
        // Mỗi sub là 1 ván cố định; map từ games đã lưu theo kind.
        const byKind = {};
        for (const g of savedGames || []) byKind[g.kind] = g;
        const rows = MLP_SUBS.map((s, i) => {
            const g = byKind[s.kind];
            return {
                kind: s.kind,
                game_no: i + 1,
                score_a: g ? String(g.score_a ?? '') : '',
                score_b: g ? String(g.score_b ?? '') : '',
            };
        });
        const db = byKind.dreambreaker;
        rows.push({
            kind: 'dreambreaker',
            game_no: MLP_SUBS.length + 1,
            score_a: db ? String(db.score_a ?? '') : '',
            score_b: db ? String(db.score_b ?? '') : '',
        });
        return rows;
    }
    // Thể thức thường: 1 hàng/ván, mặc định 1 ván nếu chưa có.
    if (savedGames && savedGames.length) {
        return savedGames.map((g, i) => ({
            kind: 'game',
            game_no: g.game_no ?? i + 1,
            score_a: String(g.score_a ?? ''),
            score_b: String(g.score_b ?? ''),
        }));
    }
    return [{ kind: 'game', game_no: 1, score_a: '', score_b: '' }];
}

function MatchCard({ match, savedGames, isMlp, entrantsById, isAdmin, onSaved }) {
    const [rows, setRows] = useState(() => initGames(match, savedGames, isMlp));
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');

    useEffect(() => {
        setRows(initGames(match, savedGames, isMlp));
    }, [match.id, savedGames, isMlp]);

    const nameA = entrantName(entrantsById, match.entrant_a_id, 'Đội A');
    const nameB = entrantName(entrantsById, match.entrant_b_id, 'Đội B');

    function setScore(i, side, value) {
        if (!isAdmin) return;
        setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, [side]: value } : r)));
    }

    function addGame() {
        setRows((cur) => [
            ...cur,
            { kind: 'game', game_no: cur.length + 1, score_a: '', score_b: '' },
        ]);
    }

    function removeGame(i) {
        setRows((cur) => cur.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, game_no: idx + 1 })));
    }

    async function save() {
        setBusy(true);
        setMsg('');
        try {
            // Bỏ ván chưa nhập điểm (cả 2 trống). Dreambreaker chỉ gửi nếu có điểm.
            const games = rows
                .filter((r) => r.score_a !== '' || r.score_b !== '')
                .map((r) => ({
                    game_no: r.game_no,
                    kind: r.kind,
                    score_a: Number(r.score_a) || 0,
                    score_b: Number(r.score_b) || 0,
                }));
            const resp = await saveGames(match.id, games);
            if (resp.complete) {
                const w = resp.winner_entrant_id;
                setMsg(`Đã lưu. Thắng: ${entrantName(entrantsById, w, '—')}`);
            } else {
                setMsg('Đã lưu (chưa đủ điều kiện kết thúc trận).');
            }
            if (onSaved) onSaved();
        } catch (err) {
            setMsg(err.message || 'Không lưu được tỉ số.');
        } finally {
            setBusy(false);
        }
    }

    const winnerId = match.winner_entrant_id;
    const isMlpDb = isMlp; // dreambreaker là hàng cuối

    return (
        <div className="v2-match-card">
            <div className="v2-match-head">
                <span className="v2-match-vs">
                    <strong className={String(winnerId) === String(match.entrant_a_id) ? 'v2-win' : ''}>{nameA}</strong>
                    <span className="v2-vs">vs</span>
                    <strong className={String(winnerId) === String(match.entrant_b_id) ? 'v2-win' : ''}>{nameB}</strong>
                </span>
                <span className={`v2-match-status v2-status-${match.status}`}>
                    {MATCH_STATUS_LABELS[match.status] || match.status}
                </span>
            </div>

            <div className="v2-game-rows">
                {rows.map((r, i) => {
                    const sub = isMlp ? MLP_SUBS[i] : null;
                    const isDb = r.kind === 'dreambreaker';
                    return (
                        <div key={`${r.kind}-${i}`} className={`v2-game-row ${isDb ? 'v2-game-db' : ''}`}>
                            <span className="v2-game-label">
                                {isMlp ? (sub ? sub.label : 'Dreambreaker') : `Ván ${r.game_no}`}
                            </span>
                            <input
                                type="number"
                                min="0"
                                inputMode="numeric"
                                className="v2-score-input"
                                value={r.score_a}
                                onChange={(e) => setScore(i, 'score_a', e.target.value)}
                                disabled={!isAdmin}
                                aria-label={`Điểm ${nameA}`}
                            />
                            <span className="v2-score-sep">–</span>
                            <input
                                type="number"
                                min="0"
                                inputMode="numeric"
                                className="v2-score-input"
                                value={r.score_b}
                                onChange={(e) => setScore(i, 'score_b', e.target.value)}
                                disabled={!isAdmin}
                                aria-label={`Điểm ${nameB}`}
                            />
                            {!isMlp && isAdmin && rows.length > 1 ? (
                                <button type="button" className="v2-game-del" onClick={() => removeGame(i)} aria-label="Xóa ván">
                                    ×
                                </button>
                            ) : null}
                        </div>
                    );
                })}
            </div>

            {isMlpDb ? (
                <p className="v2-overview-sub v2-mlp-hint">Dreambreaker chỉ nhập khi 4 ván con hòa 2–2.</p>
            ) : null}

            {isAdmin ? (
                <div className="v2-match-actions">
                    {!isMlp ? (
                        <button type="button" className="v2-btn-secondary v2-btn-sm" onClick={addGame}>
                            + Thêm ván
                        </button>
                    ) : null}
                    <button type="button" className="v2-btn-primary v2-btn-sm" onClick={save} disabled={busy}>
                        {busy ? 'Đang lưu...' : 'Lưu tỉ số'}
                    </button>
                </div>
            ) : (
                <p className="v2-overview-sub">Chỉ admin được nhập tỉ số.</p>
            )}

            {msg ? <p className="v2-match-msg">{msg}</p> : null}
        </div>
    );
}

export default function ResultsTab({ tournamentId, stageId, stage, isAdmin }) {
    const [matches, setMatches] = useState([]);
    const [gamesByMatchId, setGamesByMatchId] = useState({});
    const [entrantsById, setEntrantsById] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const isMlp = stage?.match_format === 'mlp';

    const load = useCallback(async () => {
        if (!stageId) {
            setMatches([]);
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
            setError(err.message || 'Không tải được danh sách trận.');
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
                <p>Đang tải trận đấu...</p>
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

    if (!matches.length) {
        return (
            <div className="v2-state v2-empty">
                <p>Chưa có trận nào. Hãy sinh lịch ở tab Cài đặt.</p>
            </div>
        );
    }

    return (
        <div className="v2-results">
            {matches.map((m) => (
                <MatchCard
                    key={m.id}
                    match={m}
                    savedGames={gamesByMatchId[m.id] || []}
                    isMlp={isMlp}
                    entrantsById={entrantsById}
                    isAdmin={isAdmin}
                    onSaved={load}
                />
            ))}
        </div>
    );
}
