'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    listMatches,
    listEntrants,
    saveGames,
    getPairs,
    generatePairs,
    patchPairs,
} from '@/lib/tournamentV2Client';

// --- SubKind helpers (hỗ trợ cả format mới round_X_pair_Y lẫn legacy womens/mens/...) ---

const LEGACY_LABELS = {
    womens: 'Đôi nữ',
    mens: 'Đôi nam',
    mixed1: 'Đôi nam nữ 1',
    mixed2: 'Đôi nam nữ 2',
};

function parseSubKind(kind) {
    if (!kind) return null;
    const pairMatch = kind.match(/^round_(\d+)_pair_(\d+)$/);
    if (pairMatch) return { round: Number(pairMatch[1]) - 1, pairIndex: Number(pairMatch[2]) - 1 };
    const roundMatch = kind.match(/^round_(\d+)$/);
    if (roundMatch) return { round: Number(roundMatch[1]) - 1, pairIndex: 0 };
    return null;
}

function subKindDisplayLabel(kind) {
    if (!kind) return '';
    const pairMatch = kind.match(/^round_(\d+)_pair_(\d+)$/);
    if (pairMatch) return `Vòng ${pairMatch[1]} · Đôi ${pairMatch[2]}`;
    const roundMatch = kind.match(/^round_(\d+)$/);
    if (roundMatch) return `Vòng ${roundMatch[1]}`;
    return LEGACY_LABELS[kind] || kind;
}

// subKinds authoritative = pairSchedule.subKinds; fallback derive từ gamesPerMatchup.
function getSubKinds(pairSchedule, gamesPerMatchup) {
    if (pairSchedule?.subKinds?.length) return pairSchedule.subKinds;
    const n = Number(gamesPerMatchup) || 4;
    return Array.from({ length: n }, (_, i) => `round_${i + 1}`);
}

// ---

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

// Tên rút gọn: lấy từ cuối cùng trong họ tên (tên riêng tiếng Việt)
function shortName(fullName) {
    if (!fullName) return '?';
    const parts = fullName.trim().split(/\s+/);
    return parts[parts.length - 1];
}

function pairLabel(pair) {
    if (!Array.isArray(pair) || !pair.length) return null;
    return pair.map((p) => shortName(p?.name)).join(' + ');
}

function proposedPair(pairSchedule, entrantId, round, pairIndex = 0) {
    if (!pairSchedule || !pairSchedule.teams || entrantId == null) return null;
    const team = pairSchedule.teams[String(entrantId)];
    if (!team || !Array.isArray(team.rounds)) return null;
    const roundPairs = team.rounds[round];
    if (!Array.isArray(roundPairs)) return null;
    return roundPairs[pairIndex] || null;
}

function initGames(match, savedGames, isMlp, subKinds) {
    if (isMlp) {
        const byKind = {};
        for (const g of savedGames || []) byKind[g.kind] = g;
        const rows = subKinds.map((kind, i) => {
            const g = byKind[kind];
            return {
                kind,
                game_no: i + 1,
                score_a: g ? String(g.score_a ?? '') : '',
                score_b: g ? String(g.score_b ?? '') : '',
                lineup: g?.lineup || null,
            };
        });
        const db = byKind.dreambreaker;
        rows.push({
            kind: 'dreambreaker',
            game_no: subKinds.length + 1,
            score_a: db ? String(db.score_a ?? '') : '',
            score_b: db ? String(db.score_b ?? '') : '',
            lineup: db?.lineup || null,
        });
        return rows;
    }
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

function MatchCard({ match, savedGames, isMlp, entrantsById, isAdmin, onSaved, pairSchedule, gamesPerMatchup }) {
    const subKinds = isMlp ? getSubKinds(pairSchedule, gamesPerMatchup) : [];
    const [rows, setRows] = useState(() => initGames(match, savedGames, isMlp, subKinds));
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');

    useEffect(() => {
        setRows(initGames(match, savedGames, isMlp, subKinds));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [match.id, savedGames, isMlp, pairSchedule, gamesPerMatchup]);

    const [dbPickA, setDbPickA] = useState([]);
    const [dbPickB, setDbPickB] = useState([]);

    const nameA = entrantName(entrantsById, match.entrant_a_id, 'Đội A');
    const nameB = entrantName(entrantsById, match.entrant_b_id, 'Đội B');

    const entrantA = entrantsById[String(match.entrant_a_id)];
    const entrantB = entrantsById[String(match.entrant_b_id)];

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
                            if (dbPickA.length || dbPickB.length) {
                                game.lineup = { dreamBreaker: true, a: dbPickA, b: dbPickB };
                            } else if (r.lineup) {
                                game.lineup = r.lineup;
                            }
                        } else {
                            const parsed = parseSubKind(r.kind);
                            const round = parsed?.round ?? (r.game_no - 1);
                            const pairIndex = parsed?.pairIndex ?? 0;
                            const a = r.lineup?.a || proposedPair(pairSchedule, match.entrant_a_id, round, pairIndex);
                            const b = r.lineup?.b || proposedPair(pairSchedule, match.entrant_b_id, round, pairIndex);
                            if (a || b) {
                                game.lineup = { round, pairIndex, a: a || null, b: b || null };
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
    const showDreamBreaker =
        isMlp &&
        ((subsScored >= subKinds.length && subWinsA === subWinsB) || dbHasScore);

    function toggleDbPick(side, member) {
        const cur = side === 'a' ? dbPickA : dbPickB;
        const setter = side === 'a' ? setDbPickA : setDbPickB;
        const exists = cur.some((p) => p.mi === member.mi);
        setter(exists ? cur.filter((p) => p.mi !== member.mi) : [...cur, member]);
    }

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
                    const subKind = isMlp ? subKinds[i] : null;
                    const isDb = r.kind === 'dreambreaker';
                    if (isMlp && isDb) return null;
                    let lineA = null;
                    let lineB = null;
                    if (isMlp && subKind) {
                        const parsed = parseSubKind(subKind);
                        const round = parsed?.round ?? (r.game_no - 1);
                        const pairIndex = parsed?.pairIndex ?? 0;
                        lineA = pairLabel(r.lineup?.a) || pairLabel(proposedPair(pairSchedule, match.entrant_a_id, round, pairIndex));
                        lineB = pairLabel(r.lineup?.b) || pairLabel(proposedPair(pairSchedule, match.entrant_b_id, round, pairIndex));
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
                                    {isMlp
                                        ? (subKind ? subKindDisplayLabel(subKind) : 'DreamBreaker')
                                        : `Ván ${r.game_no}`}
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

// --- PairScheduleEditor: cho admin chỉnh sửa thủ công lịch ghép đôi ---

function PairScheduleEditor({ pairSchedule, entrantsById, stageId, onSaved }) {
    const [local, setLocal] = useState(() => JSON.parse(JSON.stringify(pairSchedule)));
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');

    useEffect(() => {
        setLocal(JSON.parse(JSON.stringify(pairSchedule)));
    }, [pairSchedule]);

    function allMembers(teamId) {
        const e = entrantsById[String(teamId)];
        return (e?.members || []).map((m, idx) => ({ mi: idx, name: m.display_name || `VĐV ${idx + 1}` }));
    }

    function setMemberInPair(teamId, roundIdx, pairIdx, slotIdx, newMi) {
        setLocal((prev) => {
            const next = JSON.parse(JSON.stringify(prev));
            const members = allMembers(teamId);
            const member = members.find((m) => m.mi === Number(newMi));
            if (!member) return prev;
            next.teams[teamId].rounds[roundIdx][pairIdx][slotIdx] = member;
            return next;
        });
    }

    function validate() {
        for (const [teamId, team] of Object.entries(local.teams || {})) {
            for (let r = 0; r < (team.rounds || []).length; r++) {
                const usedMis = new Set();
                for (const pair of team.rounds[r]) {
                    for (const ref of pair) {
                        if (usedMis.has(ref.mi)) {
                            const teamName = entrantsById[teamId]?.name || `Đội #${teamId}`;
                            return `${teamName} — Vòng ${r + 1}: VĐV "${ref.name}" xuất hiện 2 lần trong cùng vòng.`;
                        }
                        usedMis.add(ref.mi);
                    }
                }
            }
        }
        return null;
    }

    async function save() {
        const err = validate();
        if (err) { setMsg(err); return; }
        setBusy(true);
        setMsg('');
        try {
            const r = await patchPairs(stageId, local);
            setMsg('Đã lưu lịch ghép đôi.');
            if (onSaved) onSaved(r.pairSchedule);
        } catch (e) {
            setMsg(e.message || 'Không lưu được.');
        } finally {
            setBusy(false);
        }
    }

    const rounds = local.rounds || 0;
    const teamIds = Object.keys(local.teams || {});

    return (
        <div className="v2-pair-editor">
            <div className="v2-pair-editor-head">
                <span className="v2-section-label">Sửa thủ công lịch ghép đôi</span>
                <button type="button" className="v2-btn-primary v2-btn-sm" onClick={save} disabled={busy}>
                    {busy ? 'Đang lưu...' : 'Lưu lịch'}
                </button>
            </div>
            {msg ? <p className="v2-match-msg" style={{ marginTop: 8 }}>{msg}</p> : null}
            {Array.from({ length: rounds }).map((_, r) => (
                <div key={r} className="v2-pairs-round">
                    <div className="v2-pairs-round-label">Vòng {r + 1}</div>
                    {teamIds.map((teamId) => {
                        const team = local.teams[teamId];
                        const teamName = entrantsById[teamId]?.name || `Đội #${teamId}`;
                        const pairs = (team?.rounds || [])[r] || [];
                        const members = allMembers(teamId);
                        return (
                            <div key={teamId} className="v2-pair-team-row">
                                <span className="v2-pair-tag">{teamName}</span>
                                <div className="v2-pair-slots">
                                    {pairs.map((pair, pi) => (
                                        <span key={pi} className="v2-pair-slot">
                                            <span className="v2-pair-slot-label">Đôi {pi + 1}:</span>
                                            {pair.map((ref, si) => (
                                                <select
                                                    key={si}
                                                    value={ref.mi}
                                                    onChange={(e) => setMemberInPair(teamId, r, pi, si, e.target.value)}
                                                    className="v2-pair-select"
                                                >
                                                    {members.map((m) => (
                                                        <option key={m.mi} value={m.mi}>{m.name}</option>
                                                    ))}
                                                </select>
                                            ))}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

// --- Main ResultsTab ---

export default function ResultsTab({ tournamentId, stageId, stage, isAdmin }) {
    const [matches, setMatches] = useState([]);
    const [gamesByMatchId, setGamesByMatchId] = useState({});
    const [entrantsById, setEntrantsById] = useState({});
    const [pairSchedule, setPairSchedule] = useState(null);
    const [pairBusy, setPairBusy] = useState(false);
    const [pairMsg, setPairMsg] = useState('');
    const [showPairEditor, setShowPairEditor] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeRound, setActiveRound] = useState(null);

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
            setShowPairEditor(false);
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

    // Reset vòng active khi đổi stage
    useEffect(() => {
        setActiveRound(null);
    }, [stageId]);

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

    // Nhóm trận theo vòng
    const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
    const currentRound = activeRound !== null && rounds.includes(activeRound)
        ? activeRound
        : rounds[0];
    const visibleMatches = matches.filter((m) => m.round === currentRound);

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
                    {pairSchedule ? (
                        <button
                            type="button"
                            className="v2-btn-secondary v2-btn-sm"
                            onClick={() => setShowPairEditor((v) => !v)}
                        >
                            {showPairEditor ? 'Ẩn bảng sửa' : '✏️ Sửa lịch ghép đôi'}
                        </button>
                    ) : null}
                    <span className="v2-pairs-bar-hint">
                        Chỉ đổi ĐỀ XUẤT — các game đã lưu giữ nguyên đôi gốc.
                    </span>
                </div>
            ) : null}
            {pairMsg ? <p className="v2-match-msg">{pairMsg}</p> : null}

            {isMlp && isAdmin && showPairEditor && pairSchedule ? (
                <PairScheduleEditor
                    pairSchedule={pairSchedule}
                    entrantsById={entrantsById}
                    stageId={stageId}
                    onSaved={(updated) => {
                        setPairSchedule(updated);
                        setPairMsg('Đã cập nhật lịch ghép đôi.');
                    }}
                />
            ) : null}

            {/* Tab bar theo vòng */}
            {rounds.length > 1 ? (
                <nav className="v2-round-tabbar" aria-label="Vòng đấu">
                    {rounds.map((r) => {
                        const roundMatches = matches.filter((m) => m.round === r);
                        const doneCount = roundMatches.filter((m) => m.status === 'done').length;
                        const allDone = doneCount === roundMatches.length;
                        const hasLive = roundMatches.some((m) => m.status === 'live');
                        return (
                            <button
                                key={r}
                                type="button"
                                className={`v2-round-tab ${currentRound === r ? 'active' : ''} ${allDone ? 'done' : ''} ${hasLive ? 'live' : ''}`}
                                onClick={() => setActiveRound(r)}
                            >
                                <span className="v2-round-tab-name">Vòng {r}</span>
                                <span className="v2-round-tab-count">{doneCount}/{roundMatches.length}</span>
                            </button>
                        );
                    })}
                </nav>
            ) : null}

            {visibleMatches.map((m) => (
                <MatchCard
                    key={m.id}
                    match={m}
                    savedGames={gamesByMatchId[m.id] || []}
                    isMlp={isMlp}
                    entrantsById={entrantsById}
                    isAdmin={isAdmin}
                    onSaved={load}
                    pairSchedule={pairSchedule}
                    gamesPerMatchup={stage?.config?.gamesPerMatchup}
                />
            ))}
        </div>
    );
}
