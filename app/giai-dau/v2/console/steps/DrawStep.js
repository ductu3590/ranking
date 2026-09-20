'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDraw, getSetupReadiness, rollDraw, swapDrawEntries, lockDraw, unlockDraw } from '@/lib/tournamentV2Client';

function nameOf(entrants, entryId) {
    const found = entrants.find((e) => String(e.id) === String(entryId));
    if (!found) return `Đội #${entryId}`;
    return found.name || found.name_snapshot || `Đội #${entryId}`;
}

export default function DrawStep({ tournamentId, stageId, stage, isAdmin, reload }) {
    const [data, setData] = useState(null);
    const [readiness, setReadiness] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const [picked, setPicked] = useState([]);
    const [dialog, setDialog] = useState(null);
    const [unlockReason, setUnlockReason] = useState('');

    const load = useCallback(async () => {
        if (!stageId) { setData(null); setReadiness(null); setLoading(false); return; }
        setLoading(true); setError('');
        try {
            setData(await getDraw(stageId));
            const divisionId = stage?.division_id;
            if (isAdmin && Number(tournamentId) > 0 && Number(divisionId) > 0) {
                getSetupReadiness(tournamentId, divisionId)
                    .then((result) => setReadiness(result?.readiness || null))
                    .catch(() => setReadiness(null));
            } else {
                setReadiness(null);
            }
        } catch (err) {
            setError(err.message || 'Không tải được bốc thăm.');
        } finally {
            setLoading(false);
        }
    }, [stageId, stage?.division_id, isAdmin, tournamentId]);

    useEffect(() => { load(); }, [load]);

    const draw = data?.draw || { status: 'none', slots: [] };
    const entrants = data?.entrants || [];
    const locked = draw.status === 'locked';
    const readinessReasons = readiness?.reasons || [];
    const setupBlocked = Boolean(stage?.division_id) && readiness?.status !== 'ready';

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

    function closeDialog() { setDialog(null); setUnlockReason(''); }

    if (loading) return <p className="v2-console-muted">Đang tải bốc thăm…</p>;
    if (error && !data) {
        return <div className="v2-console-error"><p>{error}</p><button type="button" className="v2-console-control-button" onClick={load}>Thử lại</button></div>;
    }
    if (!data) return null;

    return (
        <div className="v2-console-block-list">
            {error ? <p className="v2-console-error">{error}</p> : null}
            {notice ? <p className="v2-console-muted">{notice}</p> : null}

            <section className="v2-console-block">
                <h3>Bốc thăm &amp; chốt lịch</h3>
                <p className="v2-console-muted">
                    Bốc thăm chưa tạo trận nào. Sửa tay và bốc lại thoải mái; chỉ khi bấm
                    <b> Chốt &amp; sinh lịch</b> thì lịch thi đấu mới được tạo.
                </p>

                {readiness ? (
                    <div className={`v2-console-readiness ${readiness.status === 'ready' ? 'is-ready' : 'is-blocked'}`}>
                        <div><b>Kiểm tra chuẩn bị từ máy chủ</b><span>Phiên bản thiết lập {readiness.revision}</span></div>
                        {readiness.status === 'ready' ? <p>Đội hình và suất thi đấu đã sẵn sàng.</p> : <><p>Cần xử lý trước khi hoàn tất thiết lập:</p><ul>{readinessReasons.map((reason, index) => <li key={`${reason.code || 'reason'}-${reason.entity_id || index}`}>{reason.message || reason.code || 'Thiết lập chưa hợp lệ.'}</li>)}</ul></>}
                    </div>
                ) : null}

                {isAdmin ? (
                    <div className="v2-console-draw-actions">
                        <button
                            type="button"
                            className="v2-console-control-button"
                            disabled={busy || locked || setupBlocked}
                            onClick={() => run(() => rollDraw({ stage_id: stageId }), 'Đã bốc thăm.')}
                        >
                            {draw.status === 'none' ? 'Bốc thăm' : 'Bốc lại'}
                        </button>
                        <button
                            type="button"
                            className="v2-console-control-button"
                            disabled={busy || locked || setupBlocked || picked.length !== 2}
                            onClick={() => run(
                                () => swapDrawEntries({ stage_id: stageId, entry_a: picked[0], entry_b: picked[1] }),
                                'Đã đổi chỗ hai đội.',
                            )}
                        >
                            Đổi chỗ {picked.length === 2 ? '' : `(chọn 2 đội — đang chọn ${picked.length})`}
                        </button>
                        {locked ? (
                            <button type="button" className="v2-console-control-button" disabled={busy} onClick={() => setDialog('unlock')}>
                                Huỷ chốt
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="v2-console-control-button is-primary"
                                disabled={busy || setupBlocked || draw.status !== 'draft'}
                                onClick={() => setDialog('lock')}
                            >
                                Chốt &amp; sinh lịch
                            </button>
                        )}
                    </div>
                ) : null}

                {locked ? (
                    <p className="v2-console-muted">
                        🔒 Đã chốt{draw.locked_at ? ` lúc ${new Date(draw.locked_at).toLocaleString('vi-VN')}` : ''}.
                        {data.played_matches > 0
                            ? ` Giai đoạn đã có ${data.played_matches} trận bắt đầu — không huỷ chốt được nữa.`
                            : ''}
                    </p>
                ) : null}

                {(data.warnings || []).length > 0 ? (
                    <div className="v2-console-impact">
                        <b>Cảnh báo</b> — không chặn, BTC vẫn chốt được:
                        <ul>{data.warnings.map((w) => <li key={w.code}>{w.message}</li>)}</ul>
                    </div>
                ) : null}
            </section>

            {draw.status === 'none' ? (
                <section className="v2-console-block">
                    <p className="v2-console-muted">
                        Chưa bốc thăm. Giai đoạn đang có <b>{entrants.length}</b> đội.
                    </p>
                </section>
            ) : (
                <div className="v2-console-draw-groups">
                    {groups.map(([label, slots]) => (
                        <section className="v2-console-block" key={label || 'all'}>
                            <h3>{label ? `Bảng ${label}` : 'Thứ tự nhánh'}</h3>
                            <div className="v2-console-draw-slots">
                                {slots.map((slot) => {
                                    const isPicked = picked.some((x) => String(x) === String(slot.entry_id));
                                    return (
                                        <button
                                            key={slot.entry_id}
                                            type="button"
                                            className={`v2-console-draw-slot ${isPicked ? 'is-picked' : ''}`}
                                            aria-pressed={isPicked}
                                            disabled={locked || !isAdmin}
                                            onClick={() => toggle(slot.entry_id)}
                                        >
                                            <span className="v2-console-draw-seed">{slot.seed_in_stage}</span>
                                            <span>{nameOf(entrants, slot.entry_id)}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>
            )}
            {dialog ? <div className="v2-console-dialog-backdrop" role="presentation"><section className="v2-console-dialog" role="dialog" aria-modal="true" aria-labelledby="draw-dialog-title"><h3 id="draw-dialog-title">{dialog === 'lock' ? 'Chốt bốc thăm?' : 'Huỷ chốt lịch?'}</h3>{dialog === 'lock' ? <><p>Chốt bốc thăm sẽ sinh lịch thi đấu. Muốn sửa sau đó cần huỷ chốt.</p>{(data.warnings || []).length ? <ul>{data.warnings.map((warning) => <li key={warning.code}>{warning.message}</li>)}</ul> : null}</> : <><p>Huỷ chốt sẽ xoá toàn bộ lịch đã sinh. Nhập lý do để tiếp tục.</p><input autoFocus value={unlockReason} onChange={(event) => setUnlockReason(event.target.value)} placeholder="Lý do huỷ chốt" /></>}<div className="v2-console-draw-actions"><button type="button" className="v2-console-control-button" onClick={closeDialog}>Quay lại</button><button type="button" className="v2-console-control-button is-primary" disabled={busy || (dialog === 'unlock' && !unlockReason.trim())} onClick={() => { const kind = dialog; const reason = unlockReason.trim(); closeDialog(); run(() => kind === 'lock' ? lockDraw({ stage_id: stageId }) : unlockDraw({ stage_id: stageId, reason }), kind === 'lock' ? 'Đã chốt bốc thăm và sinh lịch.' : 'Đã huỷ chốt, lịch đã xoá.'); }}>{dialog === 'lock' ? 'Chốt lịch' : 'Huỷ chốt'}</button></div></section></div> : null}
        </div>
    );
}
