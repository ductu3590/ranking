'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDraw, rollDraw, swapDrawEntries, lockDraw, unlockDraw } from '@/lib/tournamentV2Client';

function nameOf(entrants, entryId) {
    const found = entrants.find((e) => String(e.id) === String(entryId));
    if (!found) return `Đội #${entryId}`;
    return found.name || found.name_snapshot || `Đội #${entryId}`;
}

export default function DrawStep({ stageId, isAdmin, reload }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const [picked, setPicked] = useState([]);

    const load = useCallback(async () => {
        if (!stageId) { setData(null); setLoading(false); return; }
        setLoading(true); setError('');
        try {
            setData(await getDraw(stageId));
        } catch (err) {
            setError(err.message || 'Không tải được bốc thăm.');
        } finally {
            setLoading(false);
        }
    }, [stageId]);

    useEffect(() => { load(); }, [load]);

    const draw = data?.draw || { status: 'none', slots: [] };
    const entrants = data?.entrants || [];
    const locked = draw.status === 'locked';

    // Gom theo bảng để vẽ; knockout không có bảng nên gom thành một cụm.
    const groups = useMemo(() => {
        const map = new Map();
        for (const slot of draw.slots || []) {
            const key = slot.group_label == null ? '' : slot.group_label;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(slot);
        }
        for (const list of map.values()) {
            list.sort((a, b) => (a.seed_in_stage || 0) - (b.seed_in_stage || 0));
        }
        return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }, [draw.slots]);

    async function run(fn, okMessage) {
        setBusy(true); setError(''); setNotice('');
        try {
            await fn();
            setPicked([]);
            await load();
            if (okMessage) setNotice(okMessage);
            if (typeof reload === 'function') reload();
        } catch (err) {
            setError(err.message || 'Không thực hiện được.');
        } finally {
            setBusy(false);
        }
    }

    function toggle(entryId) {
        if (locked || !isAdmin) return;
        setPicked((prev) => {
            if (prev.some((x) => String(x) === String(entryId))) {
                return prev.filter((x) => String(x) !== String(entryId));
            }
            if (prev.length >= 2) return [prev[1], entryId];
            return [...prev, entryId];
        });
    }

    function confirmLock() {
        const warnings = data?.warnings || [];
        const head = 'Chốt bốc thăm sẽ sinh lịch thi đấu. Sau khi chốt phải huỷ chốt mới sửa được.';
        const body = warnings.length
            ? `\n\nCảnh báo:\n- ${warnings.map((w) => w.message).join('\n- ')}\n\nChốt luôn?`
            : '\n\nTiếp tục?';
        // window.confirm là bản tạm; thay bằng modal khi app/styles/primitives.css có sẵn.
        if (!window.confirm(head + body)) return;
        run(() => lockDraw({ stage_id: stageId }), 'Đã chốt bốc thăm và sinh lịch.');
    }

    function confirmUnlock() {
        const reason = window.prompt('Huỷ chốt sẽ xoá toàn bộ lịch đã sinh. Lý do?');
        if (!reason || !reason.trim()) return;
        run(() => unlockDraw({ stage_id: stageId, reason }), 'Đã huỷ chốt, lịch đã xoá.');
    }

    if (loading) return <p className="ops-muted">Đang tải bốc thăm…</p>;
    if (error && !data) {
        return <div className="ops-error"><p>{error}</p><button type="button" className="ops-control-button" onClick={load}>Thử lại</button></div>;
    }
    if (!data) return null;

    return (
        <div className="ops-block-list">
            {error ? <p className="ops-error">{error}</p> : null}
            {notice ? <p className="ops-muted">{notice}</p> : null}

            <section className="ops-block">
                <h3>Bốc thăm &amp; chốt lịch</h3>
                <p className="ops-muted">
                    Bốc thăm chưa tạo trận nào. Sửa tay và bốc lại thoải mái; chỉ khi bấm
                    <b> Chốt &amp; sinh lịch</b> thì lịch thi đấu mới được tạo.
                </p>

                {isAdmin ? (
                    <div className="ops-draw-actions">
                        <button
                            type="button"
                            className="ops-control-button"
                            disabled={busy || locked}
                            onClick={() => run(() => rollDraw({ stage_id: stageId }), 'Đã bốc thăm.')}
                        >
                            {draw.status === 'none' ? 'Bốc thăm' : 'Bốc lại'}
                        </button>
                        <button
                            type="button"
                            className="ops-control-button"
                            disabled={busy || locked || picked.length !== 2}
                            onClick={() => run(
                                () => swapDrawEntries({ stage_id: stageId, entry_a: picked[0], entry_b: picked[1] }),
                                'Đã đổi chỗ hai đội.',
                            )}
                        >
                            Đổi chỗ {picked.length === 2 ? '' : `(chọn 2 đội — đang chọn ${picked.length})`}
                        </button>
                        {locked ? (
                            <button type="button" className="ops-control-button" disabled={busy} onClick={confirmUnlock}>
                                Huỷ chốt
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="ops-control-button is-primary"
                                disabled={busy || draw.status !== 'draft'}
                                onClick={confirmLock}
                            >
                                Chốt &amp; sinh lịch
                            </button>
                        )}
                    </div>
                ) : null}

                {locked ? (
                    <p className="ops-muted">
                        🔒 Đã chốt{draw.locked_at ? ` lúc ${new Date(draw.locked_at).toLocaleString('vi-VN')}` : ''}.
                        {data.played_matches > 0
                            ? ` Giai đoạn đã có ${data.played_matches} trận bắt đầu — không huỷ chốt được nữa.`
                            : ''}
                    </p>
                ) : null}

                {(data.warnings || []).length > 0 ? (
                    <div className="ops-impact">
                        <b>Cảnh báo</b> — không chặn, BTC vẫn chốt được:
                        <ul>{data.warnings.map((w) => <li key={w.code}>{w.message}</li>)}</ul>
                    </div>
                ) : null}
            </section>

            {draw.status === 'none' ? (
                <section className="ops-block">
                    <p className="ops-muted">
                        Chưa bốc thăm. Giai đoạn đang có <b>{entrants.length}</b> đội.
                    </p>
                </section>
            ) : (
                <div className="ops-draw-groups">
                    {groups.map(([label, slots]) => (
                        <section className="ops-block" key={label || 'all'}>
                            <h3>{label ? `Bảng ${label}` : 'Thứ tự nhánh'}</h3>
                            <div className="ops-draw-slots">
                                {slots.map((slot) => {
                                    const isPicked = picked.some((x) => String(x) === String(slot.entry_id));
                                    return (
                                        <button
                                            key={slot.entry_id}
                                            type="button"
                                            className={`ops-draw-slot ${isPicked ? 'is-picked' : ''}`}
                                            aria-pressed={isPicked}
                                            disabled={locked || !isAdmin}
                                            onClick={() => toggle(slot.entry_id)}
                                        >
                                            <span className="ops-draw-seed">{slot.seed_in_stage}</span>
                                            <span>{nameOf(entrants, slot.entry_id)}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
