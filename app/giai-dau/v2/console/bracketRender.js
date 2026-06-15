'use client';

// Render sơ đồ cây loại trực tiếp dùng chung cho console (BracketTab) và trang công khai.
// Cột theo round, các match sắp theo bracket_slot. Cuộn ngang trên mobile.

function entrantName(entrantsById, id, fallback) {
    if (id == null) return fallback || null;
    const e = entrantsById[String(id)];
    return e ? e.name : `#${id}`;
}

const ROUND_LABELS = {
    final: 'Chung kết',
    semi: 'Bán kết',
    quarter: 'Tứ kết',
};

function roundLabel(round, maxRound) {
    const depth = maxRound - round; // 0 = chung kết
    if (depth === 0) return ROUND_LABELS.final;
    if (depth === 1) return ROUND_LABELS.semi;
    if (depth === 2) return ROUND_LABELS.quarter;
    return `Vòng ${round}`;
}

// Tỉ số tổng (số ván thắng) từ games đã lưu của 1 match.
function matchScore(games) {
    if (!games || !games.length) return null;
    let a = 0;
    let b = 0;
    for (const g of games) {
        if (g.kind === 'dreambreaker') {
            if ((g.score_a ?? 0) > (g.score_b ?? 0)) a += 1;
            else if ((g.score_b ?? 0) > (g.score_a ?? 0)) b += 1;
            continue;
        }
        if ((g.score_a ?? 0) > (g.score_b ?? 0)) a += 1;
        else if ((g.score_b ?? 0) > (g.score_a ?? 0)) b += 1;
    }
    return { a, b };
}

function SideRow({ name, score, isWinner, isBye }) {
    return (
        <div className={`v2-br-side ${isWinner ? 'v2-br-win' : ''} ${isBye ? 'v2-br-bye' : ''}`}>
            <span className="v2-br-name">{name || (isBye ? 'BYE' : 'chờ')}</span>
            {score != null ? <span className="v2-br-score">{score}</span> : null}
        </div>
    );
}

export function BracketView({ matches, gamesByMatchId, entrantsById }) {
    const list = Array.isArray(matches) ? matches : [];
    if (!list.length) {
        return (
            <div className="v2-state v2-empty">
                <p>Chưa có sơ đồ. Hãy sinh lịch ở tab Cài đặt.</p>
            </div>
        );
    }

    const rounds = {};
    for (const m of list) {
        const r = m.round ?? 0;
        if (!rounds[r]) rounds[r] = [];
        rounds[r].push(m);
    }
    const roundNums = Object.keys(rounds).map(Number).sort((a, b) => a - b);
    const maxRound = roundNums.length ? roundNums[roundNums.length - 1] : 0;

    return (
        <div className="v2-bracket-scroll">
            <div className="v2-bracket">
                {roundNums.map((rn) => {
                    const col = [...rounds[rn]].sort(
                        (a, b) => (a.bracket_slot ?? 0) - (b.bracket_slot ?? 0),
                    );
                    return (
                        <div key={rn} className="v2-br-col">
                            <div className="v2-br-col-head">{roundLabel(rn, maxRound)}</div>
                            {col.map((m) => {
                                const nameA = entrantName(entrantsById, m.entrant_a_id);
                                const nameB = entrantName(entrantsById, m.entrant_b_id);
                                const score = matchScore(gamesByMatchId ? gamesByMatchId[m.id] : null);
                                // BYE: 1 bên có đội, bên kia null và match đã done (qua thẳng).
                                const aBye = m.entrant_a_id == null && m.entrant_b_id != null;
                                const bBye = m.entrant_b_id == null && m.entrant_a_id != null;
                                const winA = String(m.winner_entrant_id) === String(m.entrant_a_id);
                                const winB = String(m.winner_entrant_id) === String(m.entrant_b_id);
                                return (
                                    <div key={m.id} className="v2-br-match">
                                        <SideRow
                                            name={nameA}
                                            score={score ? score.a : null}
                                            isWinner={m.winner_entrant_id != null && winA}
                                            isBye={aBye}
                                        />
                                        <SideRow
                                            name={nameB}
                                            score={score ? score.b : null}
                                            isWinner={m.winner_entrant_id != null && winB}
                                            isBye={bBye}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
