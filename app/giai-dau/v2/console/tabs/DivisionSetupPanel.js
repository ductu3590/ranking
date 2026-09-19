'use client';

// Bảng thiết lập nội dung thi đấu trong bảng điều hành giải.
// Nguồn chân lý là GET /api/tournament-v2/setup: danh sách VĐV của giải, roster
// của nội dung, cặp đã chốt, suất thi đấu và readiness. Mọi thao tác ghi đều có
// CAS (expected_setup_revision) + idempotency_key giữ lại để thử lại an toàn.
//
// Hai trạng thái đặc biệt phải phân biệt rõ:
//  1) Nội dung mới, chưa có VĐV  → hướng dẫn thêm VĐV, không phải lỗi.
//  2) Nội dung CŨ: có suất đôi đã duyệt nhưng entry chưa gắn cặp/danh tính
//     (readiness APPROVED_DOUBLES_ENTRY_PAIR_ID_MISSING) → PHẢI chuyển đổi dữ liệu,
//     TUYỆT ĐỐI không chốt ghép cặp ở đây vì chốt cặp sẽ sinh suất MỚI nằm cạnh
//     suất cũ (nhân đôi danh sách thi đấu).

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    confirmDivisionPairing, getDivisionSetup, lockDivisionRoster, previewDivisionPairing,
    repairLegacyDivisionPairs, saveDivisionRoster, unlockDivisionRoster, unseedPlayoff,
} from '@/lib/tournamentV2Client';
import './DivisionSetupPanel.css';

function stableKey(tournamentId, divisionId, action, payload) {
    return `pickhub:division-setup:v1:${tournamentId}:${divisionId}:${action}:${JSON.stringify(payload)}`;
}

function retryKey(tournamentId, divisionId, action, payload) {
    const key = stableKey(tournamentId, divisionId, action, payload);
    const existing = sessionStorage.getItem(key);
    if (existing) return { storageKey: key, idempotencyKey: existing };
    const idempotencyKey = globalThis.crypto?.randomUUID?.() || `setup-${Date.now()}`;
    sessionStorage.setItem(key, idempotencyKey);
    return { storageKey: key, idempotencyKey };
}

export default function DivisionSetupPanel({ tournamentId, divisionId, isAdmin, onChanged }) {
    const [setup, setSetup] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);
    const [preview, setPreview] = useState(null);
    const [pairingMode, setPairingMode] = useState('random_balanced');
    const [unlockReason, setUnlockReason] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [repairPlan, setRepairPlan] = useState(null);
    const [repairReviewed, setRepairReviewed] = useState(false);

    // Không có nội dung thi đấu thì không gọi API — hiện trạng thái rỗng rõ ràng.
    const hasScope = Boolean(tournamentId) && Boolean(divisionId);

    const loadSetup = useCallback(async () => {
        if (!hasScope) { setLoading(false); setSetup(null); return; }
        setLoading(true);
        setError('');
        try {
            const next = await getDivisionSetup(tournamentId, divisionId);
            setSetup(next);
            setSelectedIds((next.roster?.athlete_ids || []).map(Number));
            setPairingMode(next.division?.pairing_mode || 'random_balanced');
        } catch (err) {
            setError(err.message || 'Không tải được thiết lập nội dung.');
        } finally {
            setLoading(false);
        }
    }, [tournamentId, divisionId, hasScope]);

    useEffect(() => { loadSetup(); }, [loadSetup]);

    const locked = setup?.readiness?.roster_lock_status === 'locked';
    const revision = Number(setup?.readiness?.revision || setup?.division?.setup_revision || 0);
    const athletes = useMemo(() => setup?.roster?.athletes || [], [setup]);
    const reasons = useMemo(() => setup?.readiness?.reasons || [], [setup]);
    const nameById = useMemo(
        () => new Map(athletes.map((athlete) => [Number(athlete.id), athlete.display_name_snapshot || `VĐV #${athlete.id}`])),
        [athletes],
    );

    // Suất đôi đã duyệt nhưng chưa có cặp = dữ liệu cũ cần chuyển đổi.
    const legacyEntryIds = useMemo(
        () => reasons.filter((reason) => reason.code === 'APPROVED_DOUBLES_ENTRY_PAIR_ID_MISSING').map((reason) => reason.entity_id),
        [reasons],
    );
    const needsMigration = legacyEntryIds.length > 0;
    const isDoubles = setup?.division?.play_type === 'doubles';
    const hasFixtures = (setup?.stages || []).some((stage) => stage.status && stage.status !== 'pending');

    function toggleAthlete(id) {
        if (locked || busy) return;
        setPreview(null);
        setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
    }

    async function mutate(action, payload, call) {
        const key = retryKey(tournamentId, divisionId, action, payload);
        setBusy(action);
        setError('');
        setNotice('');
        try {
            await call(key.idempotencyKey);
            sessionStorage.removeItem(key.storageKey);
            await loadSetup();
            await onChanged?.();
            setNotice('Đã lưu thiết lập nội dung.');
            return true;
        } catch (err) {
            if (err.status === 409) {
                // Xung đột: tải lại trạng thái thật rồi để người dùng tự xem và quyết định.
                await loadSetup();
                setPreview(null);
                setError('Thiết lập vừa thay đổi ở nơi khác. Dữ liệu mới đã được tải lại; hãy xác nhận thao tác trước khi thử lại.');
            } else {
                setError(err.message || 'Không thể cập nhật thiết lập. Có thể thử lại thao tác này.');
            }
            return false;
        } finally {
            setBusy('');
        }
    }

    function saveRoster() {
        const payload = { athleteIds: selectedIds.slice().sort((a, b) => a - b), revision };
        return mutate('roster', payload, (idempotencyKey) => saveDivisionRoster({
            tournament_id: tournamentId, division_id: divisionId, athlete_ids: selectedIds,
            expected_setup_revision: revision, idempotency_key: idempotencyKey,
        }));
    }

    async function showPreview() {
        setBusy('preview'); setError(''); setNotice('');
        try {
            const result = await previewDivisionPairing({ division_id: divisionId, athlete_ids: selectedIds, pairing_mode: pairingMode, seed: 1 });
            setPreview(result);
        } catch (err) {
            setError(err.message || 'Không thể xem trước ghép cặp.');
        } finally {
            setBusy('');
        }
    }

    function confirmPairs() {
        // Chặn cứng: dữ liệu cũ phải đi đường chuyển đổi, không chốt cặp đè lên.
        if (needsMigration) {
            setError('Nội dung này còn suất thi đấu cũ chưa gắn cặp. Hãy chuyển đổi dữ liệu trước — chốt ghép cặp lúc này sẽ tạo thêm suất mới.');
            return undefined;
        }
        if (!preview?.pairs?.length) return undefined;
        const payload = { pairs: preview.pairs, pairingMode, revision };
        return mutate('pairs', payload, (idempotencyKey) => confirmDivisionPairing({
            division_id: divisionId, mode: 'confirm', pairs: preview.pairs, pairing_mode: pairingMode,
            expected_setup_revision: revision, idempotency_key: idempotencyKey,
        }));
    }

    function setLock(nextLocked) {
        const action = nextLocked ? 'lock' : 'unlock';
        const reason = nextLocked ? '' : unlockReason.trim();
        return mutate(action, { revision, reason }, (idempotencyKey) => (nextLocked ? lockDivisionRoster : unlockDivisionRoster)({
            tournament_id: tournamentId, division_id: divisionId, expected_setup_revision: revision,
            idempotency_key: idempotencyKey, reason,
        }));
    }

    // Gỡ seed play-off — đường phục hồi khi cần sửa lại kết quả vòng bảng đã seed.
    // Máy chủ từ chối nếu bất kỳ trận vòng sau nào đã bắt đầu hoặc đã có tỉ số,
    // nên nút này an toàn kể cả khi bấm nhầm.
    const groupStage = (setup?.stages || []).find((stage) => stage.schedule_format === 'round_robin');
    const hasPlayoffStage = (setup?.stages || []).some((stage) => stage.schedule_format === 'knockout');
    const canUnseed = Boolean(isAdmin && groupStage && hasPlayoffStage);

    function runUnseed() {
        if (!groupStage) return undefined;
        return mutate('unseed', { revision, groupStageId: groupStage.id }, (idempotencyKey) => unseedPlayoff({
            tournament_id: tournamentId, division_id: divisionId,
            group_stage_id: groupStage.id, expected_setup_revision: revision,
            idempotency_key: idempotencyKey,
        }));
    }

    // Chạy thử chuyển đổi: KHÔNG ghi gì, chỉ báo cáo kế hoạch và điểm vướng.
    async function runRepairDryRun() {
        setBusy('repair-dry'); setError(''); setNotice(''); setRepairReviewed(false);
        const key = retryKey(tournamentId, divisionId, 'repair-dry', { revision });
        try {
            const result = await repairLegacyDivisionPairs({
                tournament_id: tournamentId, division_id: divisionId, dry_run: true,
                expected_setup_revision: revision, idempotency_key: key.idempotencyKey,
            });
            setRepairPlan(result);
            setNotice('Đã chạy thử. Xem kế hoạch bên dưới trước khi áp dụng.');
        } catch (err) {
            sessionStorage.removeItem(key.storageKey);
            setError(err.message || 'Không chạy thử được việc chuyển đổi dữ liệu cũ.');
        } finally {
            setBusy('');
        }
    }

    // Áp dụng thật: giữ nguyên suất thi đấu cũ, chỉ bổ sung danh tính + cặp cho chúng.
    async function applyRepair() {
        if (!repairPlan || !repairReviewed) return undefined;
        const ok = await mutate('repair-apply', { revision }, (idempotencyKey) => repairLegacyDivisionPairs({
            tournament_id: tournamentId, division_id: divisionId, dry_run: false, confirm_apply: true,
            expected_setup_revision: revision, idempotency_key: idempotencyKey,
        }));
        if (ok) { setRepairPlan(null); setRepairReviewed(false); }
        return ok;
    }

    /* ==================== Trạng thái tải / lỗi / rỗng ==================== */

    if (!hasScope) {
        return (
            <section className="division-setup-panel v2-settings-block">
                <p className="division-setup-kicker">Thiết lập nội dung</p>
                <p className="division-setup-empty">
                    Giải chưa có nội dung thi đấu nào để thiết lập. Hãy tạo nội dung (và giai đoạn) trong phần cài đặt giải,
                    sau đó quay lại đây để chọn vận động viên và ghép cặp.
                </p>
            </section>
        );
    }

    if (loading) {
        return (
            <section className="division-setup-panel v2-settings-block" aria-busy="true">
                <p className="division-setup-kicker">Thiết lập nội dung</p>
                <p className="division-setup-empty">Đang tải thiết lập nội dung...</p>
            </section>
        );
    }

    if (error && !setup) {
        return (
            <section className="division-setup-panel v2-settings-block v2-error" role="alert">
                <p className="division-setup-error">{error}</p>
                <button type="button" className="v2-btn-secondary" onClick={loadSetup}>Thử lại</button>
            </section>
        );
    }

    const ready = setup?.readiness?.status === 'ready';
    const canPair = isAdmin && isDoubles && !needsMigration;

    return (
        <section className="division-setup-panel v2-settings-block">
            <div className="v2-settings-block-head">
                <div>
                    <p className="division-setup-kicker">Thiết lập nội dung</p>
                    <h3>{setup?.division?.name || 'Nội dung thi đấu'}</h3>
                </div>
                <span className={`division-setup-lock ${locked ? 'locked' : ''}`}>
                    {locked ? 'Đã khóa' : 'Đang mở'} · Rev {revision}
                </span>
            </div>

            {error ? <p className="v2-notice division-setup-error" role="alert">{error}</p> : null}
            {notice ? <p className="v2-notice" role="status">{notice}</p> : null}

            <p className={`division-setup-readiness ${ready ? 'ready' : 'blocked'}`}>
                {ready ? 'Sẵn sàng bốc thăm' : 'Cần hoàn tất các điều kiện bên dưới'}
            </p>
            {reasons.map((reason) => (
                <p className="division-setup-reason" key={`${reason.code}-${reason.entity_id}`}>{reason.message}</p>
            ))}

            {/* --- Dữ liệu cũ: phải chuyển đổi, không được chốt cặp đè lên --- */}
            {needsMigration ? (
                <div className="division-setup-migration" role="region" aria-label="Cần chuyển đổi dữ liệu cũ">
                    <p className="division-setup-migration-title">Cần chuyển đổi dữ liệu cũ</p>
                    <p>
                        Nội dung này có <b>{legacyEntryIds.length}</b> suất đôi đã duyệt nhưng chưa gắn cặp và danh tính vận động viên
                        (dữ liệu tạo bằng luồng cũ). Vì vậy danh sách vận động viên bên dưới có thể trống và không bốc thăm được.
                    </p>
                    <p className="division-setup-migration-warn">
                        Không dùng “Chốt ghép cặp” cho nội dung này: chốt cặp sẽ tạo suất thi đấu MỚI nằm cạnh suất cũ,
                        làm danh sách thi đấu nhân đôi. Cách đúng là chuyển đổi — giữ nguyên suất cũ và bổ sung cặp cho chúng.
                    </p>
                    {hasFixtures ? (
                        <p className="division-setup-migration-warn">
                            Nội dung đã có giai đoạn đang chạy. Nếu đã sinh lịch thi đấu, máy chủ sẽ từ chối chuyển đổi để không
                            đụng vào lịch — hãy báo ban tổ chức/kỹ thuật trước khi xử lý tiếp.
                        </p>
                    ) : null}
                    {isAdmin ? (
                        <div className="division-setup-actions">
                            <button type="button" className="v2-btn-secondary" disabled={!!busy} onClick={runRepairDryRun}>
                                {busy === 'repair-dry' ? 'Đang chạy thử...' : 'Chạy thử chuyển đổi (không ghi dữ liệu)'}
                            </button>
                        </div>
                    ) : (
                        <p>Hãy liên hệ quản trị CLB để chạy chuyển đổi dữ liệu.</p>
                    )}
                    {repairPlan ? (
                        <div className="division-setup-preview">
                            <strong>Kế hoạch chuyển đổi (chạy thử)</strong>
                            <ul>
                                <li>Suất giữ nguyên: {(repairPlan.entries || []).length}</li>
                                <li>Tạo mới: {repairPlan.planned?.athletes ?? 0} danh tính · {repairPlan.planned?.pairs ?? 0} cặp</li>
                                <li>Suất được gắn cặp: {repairPlan.planned?.entries_updated ?? 0}</li>
                            </ul>
                            {(repairPlan.blockers || []).map((blocker, index) => (
                                <p className="division-setup-reason" key={`blocker-${index}`}>Vướng: {blocker.message || blocker.code || String(blocker)}</p>
                            ))}
                            {(repairPlan.ambiguities || []).map((item, index) => (
                                <p className="division-setup-reason" key={`ambi-${index}`}>Chưa rõ: {item.message || item.code || String(item)}</p>
                            ))}
                            {isAdmin ? (
                                <>
                                    <label className="division-setup-confirm">
                                        <input
                                            type="checkbox"
                                            checked={repairReviewed}
                                            onChange={(event) => setRepairReviewed(event.target.checked)}
                                        />
                                        <span>Tôi đã xem kế hoạch trên và đồng ý áp dụng.</span>
                                    </label>
                                    <div className="division-setup-actions">
                                        <button
                                            type="button"
                                            className="v2-btn-primary"
                                            disabled={!repairReviewed || !!busy || (repairPlan.blockers || []).length > 0}
                                            onClick={applyRepair}
                                        >
                                            {busy === 'repair-apply' ? 'Đang chuyển đổi...' : 'Áp dụng chuyển đổi'}
                                        </button>
                                    </div>
                                </>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            ) : null}

            {/* --- Danh sách vận động viên của nội dung --- */}
            <div className="v2-field">
                <label>Danh sách VĐV ({selectedIds.length})</label>
                {athletes.length === 0 ? (
                    <p className="division-setup-empty">
                        Chưa có vận động viên nào trong phạm vi giải này.
                        {needsMigration
                            ? ' Danh tính sẽ xuất hiện sau khi chuyển đổi dữ liệu cũ ở trên.'
                            : ' Hãy thêm vận động viên (từ thành viên CLB hoặc khách) rồi quay lại chọn đội hình.'}
                    </p>
                ) : (
                    <div className="v2-member-checklist division-setup-roster">
                        {athletes.map((athlete) => {
                            const id = Number(athlete.id);
                            const selected = selectedIds.includes(id);
                            return (
                                <label key={id} className={`v2-member-check-item ${selected ? 'selected' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={selected}
                                        disabled={locked || !!busy || !isAdmin}
                                        onChange={() => toggleAthlete(id)}
                                    />
                                    {nameById.get(id)}
                                </label>
                            );
                        })}
                    </div>
                )}
            </div>

            {locked ? (
                <p className="division-setup-empty">Đội hình đang khóa — mở khóa (có lý do) mới sửa được danh sách và cặp.</p>
            ) : null}

            {isAdmin ? (
                <div className="division-setup-actions">
                    <button type="button" className="v2-btn-secondary" disabled={locked || !!busy || athletes.length === 0} onClick={saveRoster}>
                        {busy === 'roster' ? 'Đang lưu...' : 'Lưu đội hình'}
                    </button>
                    {canUnseed ? (
                        <button
                            type="button"
                            className="v2-btn-secondary"
                            disabled={!!busy}
                            title="Xoá suất đã seed ở vòng play-off để sửa lại kết quả vòng bảng. Bị từ chối nếu trận vòng sau đã bắt đầu."
                            onClick={runUnseed}
                        >
                            {busy === 'unseed' ? 'Đang gỡ seed...' : 'Gỡ seed play-off'}
                        </button>
                    ) : null}
                    {canPair ? (
                        <>
                            <select
                                aria-label="Kiểu ghép cặp"
                                value={pairingMode}
                                disabled={locked || !!busy}
                                onChange={(event) => { setPairingMode(event.target.value); setPreview(null); }}
                            >
                                <option value="random_balanced">Ghép cân bằng</option>
                                <option value="manual">Ghép thủ công</option>
                            </select>
                            <button
                                type="button"
                                className="v2-btn-secondary"
                                disabled={locked || !!busy || selectedIds.length < 2}
                                onClick={showPreview}
                            >
                                {busy === 'preview' ? 'Đang ghép...' : 'Xem trước ghép cặp'}
                            </button>
                            {preview ? (
                                <button
                                    type="button"
                                    className="v2-btn-primary"
                                    disabled={locked || !!busy || needsMigration || preview.unpaired?.length > 0}
                                    onClick={confirmPairs}
                                >
                                    {busy === 'pairs' ? 'Đang chốt...' : 'Chốt ghép cặp'}
                                </button>
                            ) : null}
                        </>
                    ) : null}
                    {!locked ? (
                        <button type="button" className="v2-btn-primary" disabled={!!busy} onClick={() => setLock(true)}>
                            {busy === 'lock' ? 'Đang khóa...' : 'Khóa đội hình'}
                        </button>
                    ) : (
                        <>
                            <input
                                aria-label="Lý do mở khóa"
                                value={unlockReason}
                                onChange={(event) => setUnlockReason(event.target.value)}
                                placeholder="Lý do mở khóa"
                            />
                            <button type="button" className="v2-btn-secondary" disabled={!!busy || !unlockReason.trim()} onClick={() => setLock(false)}>
                                {busy === 'unlock' ? 'Đang mở...' : 'Mở khóa'}
                            </button>
                        </>
                    )}
                </div>
            ) : null}

            {preview ? (
                <div className="division-setup-preview">
                    <strong>Ghép cặp dự kiến</strong>
                    <ul>
                        {preview.pairs.map((pair, index) => (
                            <li key={index}>
                                {(pair.member_names || pair.members?.map((member) => nameById.get(Number(member.tournament_athlete_id))) || []).join(' / ')}
                            </li>
                        ))}
                    </ul>
                    {preview.unpaired?.length ? <p>Còn lẻ: {preview.unpaired.map((athlete) => athlete.display_name).join(', ')}</p> : null}
                </div>
            ) : null}

            {setup?.pairs?.length ? (
                <div className="division-setup-preview">
                    <strong>Cặp đã chốt ({setup.pairs.length})</strong>
                    <ul>
                        {setup.pairs.map((pair) => <li key={pair.id}>{pair.name_snapshot} · Suất #{pair.entry_id || '—'}</li>)}
                    </ul>
                </div>
            ) : null}

            {needsMigration && setup?.entries?.length ? (
                <div className="division-setup-preview">
                    <strong>Suất thi đấu hiện có ({setup.entries.length})</strong>
                    <ul>
                        {setup.entries.map((entry) => (
                            <li key={entry.id}>
                                #{entry.id} · {entry.name_snapshot || 'Chưa đặt tên'} · {entry.pair_id ? 'đã có cặp' : 'chưa có cặp'}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </section>
    );
}
