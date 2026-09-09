'use client';

import { useCallback, useEffect, useState } from 'react';
import { getRoundRules, updateRoundRule } from '@/lib/tournamentV2Client';

const BEST_OF_CHOICES = [1, 3, 5]; // Ba chip: BO1, BO3, BO5


function ruleText(scoring) {
    if (!scoring) return '';
    const cap = scoring.cap == null ? 'không cap' : `cap ${scoring.cap}`;
    return `BO${scoring.best_of} · tới ${scoring.points_to} · cách ${scoring.win_by} · ${cap}`;
}

function lockText(round) {
    if (round.lock_reason === 'ROUND_LIVE') return 'Đã khoá vì vòng đang có trận diễn ra.';
    return 'Đã khoá vì vòng đã đấu xong. Muốn sửa kết quả phải qua nhật ký chỉnh sửa.';
}

export default function RoundScoringPanel({ stageId, isAdmin }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busyKey, setBusyKey] = useState('');

    const load = useCallback(async () => {
        if (!stageId) { setData(null); setLoading(false); return; }
        setLoading(true); setError('');
        try {
            setData(await getRoundRules(stageId));
        } catch (err) {
            setError(err.message || 'Không tải được số ván theo vòng.');
        } finally {
            setLoading(false);
        }
    }, [stageId]);

    useEffect(() => { load(); }, [load]);

    async function save(roundKey, scoring) {
        setBusyKey(roundKey); setNotice(''); setError('');
        try {
            await updateRoundRule({ stage_id: stageId, round_key: roundKey, scoring });
            setNotice(scoring === null ? 'Đã trả vòng này về mặc định.' : 'Đã lưu số ván cho vòng này.');
            await load();
        } catch (err) {
            setError(err.message || 'Không lưu được.');
        } finally {
            setBusyKey('');
        }
    }

    if (loading) return <p className="v2-muted">Đang tải số ván theo vòng…</p>;
    if (error && !data) {
        return (
            <div className="v2-state v2-error">
                <p>{error}</p>
                <button type="button" className="v2-btn-secondary" onClick={load}>Thử lại</button>
            </div>
        );
    }
    if (!data) return null;

    if (!data.rounds || data.rounds.length === 0) {
        return (
            <p className="v2-muted">
                Giai đoạn này chưa sinh lịch nên chưa có vòng nào để cấu hình.
                Sinh lịch xong thì các vòng sẽ hiện ở đây.
            </p>
        );
    }

    return (
        <div className="v2-rounds">
            <p className="v2-rounds-inherit">
                Số ván theo vòng: Mặc định của giai đoạn: <b>{ruleText(data.inherited)}</b>. Vòng nào không chỉnh thì theo mức này.
            </p>
            {notice ? <p className="v2-notice">{notice}</p> : null}
            {error ? <p className="v2-notice v2-notice-error">{error}</p> : null}

            {data.rounds.map((round) => (
                <div
                    key={round.round_key}
                    className={`v2-round ${round.locked ? 'is-locked' : ''}`}
                >
                    <div className="v2-round-head">
                        <div>
                            <b>{round.label}</b>
                            <span className="v2-round-meta">
                                {round.match_count} trận
                                {round.counts.finalized > 0 ? ` · ${round.counts.finalized} đã xong` : ''}
                                {round.counts.live > 0 ? ` · ${round.counts.live} đang đấu` : ''}
                            </span>
                        </div>
                        {round.locked || !isAdmin ? (
                            <span className="v2-round-readonly">{ruleText(round.scoring)}</span>
                        ) : (
                            <div className="v2-round-bo" role="group" aria-label={`Số ván ${round.label}`}>
                                {BEST_OF_CHOICES.map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        aria-pressed={round.scoring.best_of === value}
                                        disabled={busyKey === round.round_key}
                                        onClick={() => save(round.round_key, { best_of: value })}
                                    >
                                        BO{value}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {round.locked ? (
                        <p className="v2-round-lock">🔒 {lockText(round)}</p>
                    ) : (
                        <p className="v2-round-rule">
                            {ruleText(round.scoring)}
                            {round.source === 'round' && isAdmin ? (
                                <button
                                    type="button"
                                    className="v2-link-btn"
                                    disabled={busyKey === round.round_key}
                                    onClick={() => save(round.round_key, null)}
                                >
                                    Trả về mặc định
                                </button>
                            ) : (
                                <span className="v2-round-source"> · đang theo mặc định của giai đoạn</span>
                            )}
                        </p>
                    )}
                </div>
            ))}
        </div>
    );
}
