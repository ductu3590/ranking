'use client';

import { annotateDoubleElim, doubleElimRoundLabel, BRACKET_TITLES } from '@/lib/tournament/doubleElimKeys';

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
    const columns = roundNums.map((rn) => ({ key: rn, label: roundLabel(rn, maxRound), matches: rounds[rn] }));

    return <BracketColumns columns={columns} gamesByMatchId={gamesByMatchId} entrantsById={entrantsById} />;
}

// Cột theo vòng, trận trong cột sắp theo bracket_slot. Dùng chung cho nhánh đơn và từng nhánh loại kép.
// noByes: loại kép không có trận bye (mọi ô đều có nguồn), ô trống luôn là "chờ".
function BracketColumns({ columns, gamesByMatchId, entrantsById, noByes = false }) {
    return (
        <div className="v2-bracket-scroll">
            <div className="v2-bracket">
                {columns.map((column) => {
                    const col = [...column.matches].sort(
                        (a, b) => (a.bracket_slot ?? 0) - (b.bracket_slot ?? 0),
                    );
                    return (
                        <div key={column.key} className="v2-br-col">
                            <div className="v2-br-col-head">{column.label}</div>
                            {col.map((m) => {
                                const nameA = entrantName(entrantsById, m.entrant_a_id);
                                const nameB = entrantName(entrantsById, m.entrant_b_id);
                                const score = matchScore(gamesByMatchId ? gamesByMatchId[m.id] : null);
                                // BYE: 1 bên có đội, bên kia null và match đã done (qua thẳng).
                                const aBye = !noByes && m.entrant_a_id == null && m.entrant_b_id != null;
                                const bBye = !noByes && m.entrant_b_id == null && m.entrant_a_id != null;
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

// Loại kép (Epic 1 D2 §4): ba khung Nhánh thắng / Nhánh thua / Chung kết tổng. Nhánh và vòng trong
// nhánh suy từ match_key (W1-2, WF, L3-1, LF, GF) — cột round là lượt thi đấu, không phải vòng nhánh.
export function DoubleElimBracketView({ matches, gamesByMatchId, entrantsById }) {
    const list = Array.isArray(matches) ? matches : [];
    if (!list.length) {
        return (
            <div className="v2-state v2-empty">
                <p>Chưa có sơ đồ.</p>
            </div>
        );
    }
    const annotated = annotateDoubleElim(list).filter((item) => item.bracket);
    return (
        <div className="v2-de-bracket">
            {['W', 'L', 'GF'].map((bracket) => {
                const inBracket = annotated.filter((item) => item.bracket === bracket);
                if (!inBracket.length) return null;
                const roundsInBracket = [...new Set(inBracket.map((item) => item.bracketRound))].sort((a, b) => a - b);
                const columns = roundsInBracket.map((round) => ({
                    key: `${bracket}-${round}`,
                    label: doubleElimRoundLabel(bracket, round, inBracket[0].lastRound),
                    matches: inBracket.filter((item) => item.bracketRound === round).map((item) => item.match),
                }));
                return (
                    <section key={bracket} className="v2-de-section" data-bracket={bracket}>
                        <h4 className="v2-de-section-title">{BRACKET_TITLES[bracket]}</h4>
                        <BracketColumns columns={columns} gamesByMatchId={gamesByMatchId} entrantsById={entrantsById} noByes />
                    </section>
                );
            })}
        </div>
    );
}
