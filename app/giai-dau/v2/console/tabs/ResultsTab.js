'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    listMatches,
    listEntrants,
    saveGames,
    getPairs,
    generatePairs,
} from '@/lib/tournamentV2Client';

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

// Tên các VĐV trong 1 đôi: [{mi,name}, {mi,name}] -> "Lan + Mai".
function pairLabel(pair) {
    if (!Array.isArray(pair) || !pair.length) return null;
    return pair.map((p) => p?.name || '?').join(' + ');
}

// Suy ra đôi đề xuất của 1 đội ở vòng r (mặc định pairIndex 0 — mỗi ván con dùng đôi đầu).
function proposedPair(pairSchedule, entrantId, round, pairIndex = 0) {
    if (!pairSchedule || !pairSchedule.teams || entrantId == null) return null;
    const team = pairSchedule.teams[String(entrantId)];
    if (!team || !Array.isArray(team.rounds)) return null;
    const roundPairs = team.rounds[round];
    if (!Array.isArray(roundPairs)) return null;
    return roundPairs[pairIndex] || null;
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
                lineup: g?.lineup || null, // snapshot đôi thực đã đá (nếu có)
            };
        });
        const db = byKind.dreambreaker;
        rows.push({
            kind: 'dreambreaker',
            game_no: MLP_SUBS.length + 1,
            score_a: db ? String(db.score_a ?? '') : '',
            score_b: db ? String(db.score_b ?? '') : '',
            lineup: db?.lineup || null,
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

function MatchCard({ match, savedGames, isMlp, entrantsById, isAdmin, onSaved, pairSchedule }) {
    const [rows, setRows] = useState(() => initGames(match, savedGames, isMlp));
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');

    useEffect(() => {
        setRows(initGames(match, savedGames, isMlp));
    }, [match.id, savedGames, isMlp]);

    // VĐV được chọn cho DreamBreaker (mảng {mi,name}) mỗi đội.
    const [dbPickA, setDbPickA] = useState([]);
    const [dbPickB, setDbPickB] = useState([]);

    const nameA = entrantName(entrantsById, match.entrant_a_id, 'Đội A');
    const nameB = entrantName(entrantsById, match.entrant_b_id, 'Đội B');

    const entrantA = entrantsById[String(match.entrant_a_id)];
    const entrantB = entrantsById[String(match.entrant_b_id)];

    // Khôi phục lựa chọn DreamBreaker từ snapshot đã lưu (nếu có).
    useEffect(() => {
        const dbRow = rows.find((r) => r.kind === 'dreambreaker');
        if (dbRow?.lineup) {
            if (Array.isArray(dbRow.lineup.a)) setDbPickA(dbRow.lineup.a);
            if (Array.isArray(dbRow.lineup.b)) setDbPickB(dbRow.lineup.b);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [match.id]);

    function setScore(i, side, value) {
        if (!isAdmin) return;
        setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, [side]: value } : r)));
    }

    function setDbScore(side, value) {
        if (!isAdmin) return;
        setRows((cur) => cur.map((r) => (r.kind === 'dreambreaker' ? { ...r, [side]: value } : r)));
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
                .map((r) => {
                    const game = {
                        game_no: r.game_no,
                        kind: r.kind,
                        score_a: Number(r.score_a) || 0,
                        score_b: Number(r.score_b) || 0,
                    };
                    if (isMlp) {
                        if (r.kind === 'dreambreaker') {
                            // Snapshot VĐV được chọn luân phiên.
                            if (dbPickA.length || dbPickB.length) {
                                game.lineup = { dreamBreaker: true, a: dbPickA, b: dbPickB };
                            } else if (r.lineup) {
                                game.lineup = r.lineup;
                            }
                        } else {
                            const round = r.game_no - 1;
                            // Ưu tiên snapshot đã lưu; nếu chưa có thì lấy từ đề xuất pairSchedule.
                            const a = r.lineup?.a || proposedPair(pairSchedule, match.entrant_a_id, round, 0);
                            const b = r.lineup?.b || proposedPair(pairSchedule, match.entrant_b_id, round, 0);
                            if (a || b) {
                                game.lineup = { round, pairIndex: 0, a: a || null, b: b || null };
                            }
                        }
                    }
                    return game;
                });
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

    // Đếm số ván con đã thắng mỗi đội (bỏ dreambreaker) — để biết có hòa cần DreamBreaker.
    let subWinsA = 0;
    let subWinsB = 0;
    let subsScored = 0;
    for (const r of rows) {
        if (r.kind === 'dreambreaker') continue;
        if (r.score_a === '' && r.score_b === '') continue;
        subsScored += 1;
        const a = Number(r.score_a) || 0;
        const b = Number(r.score_b) || 0;
        if (a > b) subWinsA += 1;
        else if (b > a) subWinsB += 1;
    }
    const dbRow = rows.find((r) => r.kind === 'dreambreaker');
    const dbHasScore = dbRow && (dbRow.score_a !== '' || dbRow.score_b !== '');
    // Hiện khối DreamBreaker khi đã chấm đủ ván con mà hòa, hoặc đã có điểm DreamBreaker.
    const showDreamBreaker =
        isMlp &&
        ((subsScored >= MLP_SUBS.length && subWinsA === subWinsB) || dbHasScore);

    function toggleDbPick(side, member) {
        const cur = side === 'a' ? dbPickA : dbPickB;
        const setter = side === 'a' ? setDbPickA : setDbPickB;
        const exists = cur.some((p) => p.mi === member.mi);
        setter(exists ? cur.filter((p) => p.mi !== member.mi) : [...cur, member]);
    }

    // Danh sách VĐV của 1 đội (từ entrant.members) -> [{mi,name}].
    function teamMembers(entrant) {
        if (!entrant || !Array.isArray(entrant.members)) return [];
        return entrant.members.map((m, idx) => ({ mi: idx, name: m.display_name || `VĐV ${idx + 1}` }));
    }

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
                    // MLP: dreambreaker được nhập ở khối riêng bên dưới, bỏ khỏi danh sách ván con.
                    if (isMlp && isDb) return null;
                    // Đôi đề xuất/đã chốt cho ván con MLP.
                    let lineA = null;
                    let lineB = null;
                    if (isMlp) {
                        const round = r.game_no - 1;
                        lineA = pairLabel(r.lineup?.a) || pairLabel(proposedPair(pairSchedule, match.entrant_a_id, round, 0));
                        lineB = pairLabel(r.lineup?.b) || pairLabel(proposedPair(pairSchedule, match.entrant_b_id, round, 0));
                    }
                    return (
                        <div key={`${r.kind}-${i}`} className="v2-game-row-wrap">
                        {isMlp && (lineA || lineB) ? (
                            <p className="v2-lineup-display">
                                <strong>{lineA || '?'}</strong>
                                <span className="v2-pair-vs"> vs </span>
                                <strong>{lineB || '?'}</strong>
                            </p>
                        ) : null}
                        <div className={`v2-game-row ${isDb ? 'v2-game-db' : ''}`}>
                            <span className="v2-game-label">
                                {isMlp ? (sub ? sub.label : 'DreamBreaker') : `Ván ${r.game_no}`}
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
                        </div>
                    );
                })}
            </div>

            {isMlp && !showDreamBreaker ? (
                <p className="v2-overview-sub v2-mlp-hint">DreamBreaker chỉ nhập khi các ván con hòa.</p>
            ) : null}

            {showDreamBreaker ? (
                <div className="v2-dreambreaker-section">
                    <p className="v2-dreambreaker-title">DreamBreaker (đơn luân phiên đến 21)</p>
                    {isAdmin ? (
                        <>
                            <p className="v2-overview-sub" style={{ marginTop: 0 }}>Chọn VĐV luân phiên mỗi đội:</p>
                            <div className="v2-db-picker">
                                <div className="v2-db-team">
                                    <p className="v2-db-team-name">{nameA}</p>
                                    <div className="v2-member-checklist">
                                        {teamMembers(entrantA).map((m) => (
                                            <label key={m.mi} className={`v2-member-check-item ${dbPickA.some((p) => p.mi === m.mi) ? 'selected' : ''}`}>
                                                <input type="checkbox" checked={dbPickA.some((p) => p.mi === m.mi)} onChange={() => toggleDbPick('a', m)} />
                                                {m.name}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div className="v2-db-team">
                                    <p className="v2-db-team-name">{nameB}</p>
                                    <div className="v2-member-checklist">
                                        {teamMembers(entrantB).map((m) => (
                                            <label key={m.mi} className={`v2-member-check-item ${dbPickB.some((p) => p.mi === m.mi) ? 'selected' : ''}`}>
                                                <input type="checkbox" checked={dbPickB.some((p) => p.mi === m.mi)} onChange={() => toggleDbPick('b', m)} />
                                                {m.name}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <p className="v2-lineup-display">
                            <strong>{pairLabel(dbPickA) || '—'}</strong>
                            <span className="v2-pair-vs"> vs </span>
                            <strong>{pairLabel(dbPickB) || '—'}</strong>
                        </p>
                    )}
                    <div className="v2-game-row v2-game-db">
                        <span className="v2-game-label">Điểm</span>
                        <input
                            type="number" min="0" inputMode="numeric" className="v2-score-input"
                            value={dbRow ? dbRow.score_a : ''}
                            onChange={(e) => setDbScore('score_a', e.target.value)}
                            disabled={!isAdmin} aria-label={`Điểm DreamBreaker ${nameA}`}
                        />
                        <span className="v2-score-sep">–</span>
                        <input
                            type="number" min="0" inputMode="numeric" className="v2-score-input"
                            value={dbRow ? dbRow.score_b : ''}
                            onChange={(e) => setDbScore('score_b', e.target.value)}
                            disabled={!isAdmin} aria-label={`Điểm DreamBreaker ${nameB}`}
                        />
                    </div>
                </div>
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
    const [pairSchedule, setPairSchedule] = useState(null);
    const [pairBusy, setPairBusy] = useState(false);
    const [pairMsg, setPairMsg] = useState('');
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
            const tasks = [listMatches(stageId), listEntrants(tournamentId)];
            // Với MLP: tải thêm lịch ghép đôi để hiển thị đôi mỗi ván con.
            if (isMlp) tasks.push(getPairs(stageId).catch(() => ({ pairSchedule: null })));
            const [matchData, entrants, pairsData] = await Promise.all(tasks);
            setMatches(matchData.matches || []);
            setGamesByMatchId(matchData.gamesByMatchId || {});
            const map = {};
            for (const e of entrants || []) map[String(e.id)] = e;
            setEntrantsById(map);
            setPairSchedule(isMlp ? (pairsData?.pairSchedule || null) : null);
        } catch (err) {
            setError(err.message || 'Không tải được danh sách trận.');
        } finally {
            setLoading(false);
        }
    }, [stageId, tournamentId, isMlp]);

    async function regeneratePairs() {
        setPairMsg('');
        setPairBusy(true);
        try {
            const r = await generatePairs(stageId, Math.floor(Math.random() * 100000) + 1);
            setPairSchedule(r.pairSchedule || null);
            setPairMsg('Đã sinh lại cặp đôi. Các game đã lưu giữ nguyên đôi gốc.');
        } catch (err) {
            setPairMsg(err.message || 'Không sinh lại được cặp đôi.');
        } finally {
            setPairBusy(false);
        }
    }

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
            {isMlp && isAdmin ? (
                <div className="v2-pairs-bar">
                    <button
                        type="button"
                        className="v2-btn-secondary v2-btn-sm"
                        onClick={regeneratePairs}
                        disabled={pairBusy}
                    >
                        {pairBusy ? 'Đang sinh lại...' : '🔀 Sinh lại cặp đôi'}
                    </button>
                    <span className="v2-pairs-bar-hint">
                        Chỉ đổi ĐỀ XUẤT — các game đã lưu giữ nguyên đôi gốc.
                    </span>
                </div>
            ) : null}
            {pairMsg ? <p className="v2-match-msg">{pairMsg}</p> : null}

            {matches.map((m) => (
                <MatchCard
                    key={m.id}
                    match={m}
                    savedGames={gamesByMatchId[m.id] || []}
                    isMlp={isMlp}
                    entrantsById={entrantsById}
                    isAdmin={isAdmin}
                    onSaved={load}
                    pairSchedule={pairSchedule}
                />
            ))}
        </div>
    );
}
