'use client';

import '../draw/draw-review.css';
import { useState } from 'react';
import { buildDrawPreviewModel } from '../draw/drawReviewModel';
import { groupAssignments, swapDraw } from '../draw/drawActions';

const GROUP_PAIRING_LABELS = {
  cross_seed: 'Bán kết chéo bảng: Nhất A – Nhì B, Nhất B – Nhì A',
  same_seed: 'Ghép cùng thứ hạng theo cấu hình BTC',
};

export default function DrawScheduleStep({ draft = {}, onConfigChange, onPreviewSchedule, onAutoDraw }) {
  const preview = buildDrawPreviewModel(draft);
  const config = preview.config;
  const drawStatus = draft.draw?.status || 'not_started';
  const needsRedraw = drawStatus === 'stale';

  // Pending/error CỤC BỘ cho từng hành động: bấm nút nào chỉ khoá nút đó và
  // báo lỗi ngay cạnh, không reset trạng thái cả trang (plan §T3.3 LOAD-02).
  const [pendingAction, setPendingAction] = useState('');
  const [actionError, setActionError] = useState('');
  // Đổi chỗ cần chọn HAI suất: bấm suất thứ nhất để đánh dấu, bấm suất thứ hai để đổi.
  // Không dùng kéo-thả vì bước này phải chạy được trên điện thoại.
  const [pickedEntryId, setPickedEntryId] = useState('');

  const drawnGroups = groupAssignments(draft);
  const hasDraw = drawnGroups.length > 0;

  const applyDraw = (nextDraw) => onConfigChange?.({ draw: nextDraw });

  const runLocal = (name, compute) => {
    if (pendingAction) return;
    setActionError('');
    setPendingAction(name);
    try {
      applyDraw(compute());
    } catch (error) {
      setActionError(error?.message || 'Thao tác không thành công.');
    } finally {
      setPendingAction('');
    }
  };

  const handleRoll = () => runAction('roll', onAutoDraw);

  const handleReroll = () => {
    if (hasDraw && !window.confirm('Bốc lại sẽ thay toàn bộ bản bốc thăm hiện tại. Tiếp tục?')) return;
    setPickedEntryId('');
    runAction('reroll', onAutoDraw, { reroll: true });
  };

  const handleSlotClick = (entryId) => {
    if (pendingAction) return;
    setActionError('');
    if (!pickedEntryId) { setPickedEntryId(String(entryId)); return; }
    if (String(pickedEntryId) === String(entryId)) { setPickedEntryId(''); return; }
    const first = pickedEntryId;
    setPickedEntryId('');
    runLocal('swap', () => swapDraw(draft, first, entryId));
  };

  const runAction = async (name, handler, argument) => {
    if (!handler || pendingAction) return;
    setActionError('');
    setPendingAction(name);
    try {
      await handler(argument);
    } catch (error) {
      setActionError(error?.message || 'Thao tác không thành công.');
    } finally {
      setPendingAction('');
    }
  };

  const formatKey = draft.format?.formatKey || 'group_knockout';
  const formatCopy = {
    round_robin: { eyebrow: 'Cấu hình vòng tròn', title: 'Mọi cặp gặp nhau' },
    knockout: { eyebrow: 'Cấu hình loại trực tiếp', title: 'Nhánh loại trực tiếp' },
    group_knockout: { eyebrow: 'Cấu hình vòng bảng và loại trực tiếp', title: 'Vòng bảng → loại trực tiếp' },
  }[formatKey] || { eyebrow: 'Cấu hình thể thức', title: 'Thiết lập lịch đấu' };

  const updateConfig = (patch) => {
    onConfigChange?.({
      format: {
        ...(draft.format || {}),
        formatKey,
        config: { ...((draft.format && draft.format.config) || {}), ...patch },
      },
    });
  };

  return (
    <section className="setup-draw-panel" aria-label="Bước 4: bốc thăm, xem trước lịch và chốt">
      <div className="setup-draw-card">
        <p className="setup-draw-eyebrow">Bước 4 · Hoàn tất thiết lập</p>
        <h3>Bốc thăm & chốt lịch thi đấu</h3>
        <p>Kiểm tra bảng đấu, nhánh đi tiếp và lịch dự kiến trước khi chốt. Xếp sân/giờ không làm đổi kết quả bốc thăm.</p>
        <div className="setup-flow-chain" aria-label="ghép cặp -> bốc thăm -> sinh trận -> xếp sân/giờ">
          <span className="setup-flow-chip">1. Ghép cặp</span>
          <span className="setup-flow-chip">2. Bốc thăm</span>
          <span className="setup-flow-chip">3. Sinh trận</span>
          <span className="setup-flow-chip">4. Xếp sân/giờ</span>
        </div>
      </div>

      <div className="setup-draw-card">
        <p className="setup-draw-eyebrow">{formatCopy.eyebrow}</p>
        <h3>{formatCopy.title}</h3>
        <div className="setup-config-grid">
          {formatKey !== 'knockout' ? (
            <>
              <label className="setup-config-field">
                Số bảng
                <input type="number" min="1" value={config.groupCount} onChange={(event) => updateConfig({ groupCount: Number(event.target.value) })} />
              </label>
              <label className="setup-config-field">
                Số cặp mỗi bảng
                <input value={config.groupSizes.join('/')} onChange={(event) => updateConfig({ groupSizes: event.target.value.split('/').map((item) => Number(item.trim())).filter(Boolean) })} />
              </label>
            </>
          ) : null}
          {formatKey === 'group_knockout' ? (
            <>
              <label className="setup-config-field">
                Suất đi tiếp mỗi bảng
                <input type="number" min="1" value={config.qualifiersPerGroup} onChange={(event) => updateConfig({ qualifiersPerGroup: Number(event.target.value) })} />
              </label>
              <label className="setup-config-field">
                Cách ghép nhánh
                <select value={config.bracketPairing} onChange={(event) => updateConfig({ bracketPairing: event.target.value })}>
                  <option value="cross_seed">Nhất A - Nhì B, Nhất B - Nhì A</option>
                  <option value="same_seed">Theo thứ hạng cùng nhánh</option>
                </select>
              </label>
            </>
          ) : null}
          {formatKey !== 'round_robin' ? (
            <label className="setup-config-field">
              Tranh hạng ba
              <select value={config.thirdPlaceEnabled ? 'yes' : 'no'} onChange={(event) => updateConfig({ thirdPlaceEnabled: event.target.value === 'yes' })}>
                <option value="no">Không</option>
                <option value="yes">Có</option>
              </select>
            </label>
          ) : null}
          <label className="setup-config-field">
            Số sân
            <input type="number" min="1" value={config.courtCount} onChange={(event) => updateConfig({ courtCount: Number(event.target.value) })} />
          </label>
          <label className="setup-config-field">
            Phút mỗi trận
            <input type="number" min="1" value={config.minutesPerMatch} onChange={(event) => updateConfig({ minutesPerMatch: Number(event.target.value) })} />
          </label>
        </div>
        <p>{GROUP_PAIRING_LABELS[config.bracketPairing] || GROUP_PAIRING_LABELS.cross_seed}</p>
        {needsRedraw ? <div className="setup-status-item blocker">Cấu hình hoặc cặp đã đổi: cần bốc lại, không tự sinh lại.</div> : null}
        {actionError ? <div className="setup-status-item blocker" role="alert">{actionError}</div> : null}
        <div className="setup-action-row">
          <button className="setup-primary-action" type="button" disabled={Boolean(pendingAction)} aria-busy={pendingAction === 'roll'} onClick={handleRoll}>{pendingAction === 'roll' ? 'Đang bốc thăm...' : 'Bốc thăm'}</button>
          <button className="setup-secondary-action" type="button" disabled={Boolean(pendingAction) || !hasDraw} aria-busy={pendingAction === 'reroll'} onClick={handleReroll}>{pendingAction === 'reroll' ? 'Đang bốc lại...' : 'Bốc lại'}</button>
          <button className="setup-secondary-action" type="button" disabled={Boolean(pendingAction) || !hasDraw} aria-busy={pendingAction === 'preview'} onClick={() => runAction('preview', onPreviewSchedule, config)}>{pendingAction === 'preview' ? 'Đang sinh trận...' : 'Sinh trận & xếp sân/giờ'}</button>
        </div>
      </div>

      <div className="setup-draw-card">
        <p className="setup-draw-eyebrow">01 · Kết quả bốc thăm</p>
        <h3>Phân bảng và tuyến đi tiếp</h3>
        {hasDraw ? (
          <>
            <p className="setup-draw-hint">
              <strong>Đổi vị trí:</strong>{' '}
              {pickedEntryId
                ? 'đã chọn một suất, bấm suất thứ hai để đổi chỗ, hoặc bấm lại suất đang chọn để bỏ.'
                : 'bấm hai suất để đổi chỗ cho nhau.'}
            </p>
            <div className="setup-drawn-groups">
              {drawnGroups.map((group) => (
                <section className="setup-drawn-group" key={group.label} aria-label={`Bảng ${group.label}`}>
                  <h4>Bảng {group.label} · {group.slots.length} cặp</h4>
                  <ul className="setup-drawn-slots">
                    {group.slots.map((slot) => {
                      const picked = String(pickedEntryId) === String(slot.entryId);
                      return (
                        <li key={slot.entryId}>
                          <button
                            type="button"
                            className={`setup-draw-slot ${picked ? 'is-picked' : ''}`}
                            aria-pressed={picked}
                            disabled={Boolean(pendingAction)}
                            onClick={() => handleSlotClick(slot.entryId)}
                          >
                            <span className="setup-draw-seed">{slot.seedInStage}</span>
                            <span>{slot.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </>
        ) : (
          <p className="setup-draw-hint">Chưa bốc thăm. Bấm &ldquo;Bốc thăm&rdquo; để chia bảng theo cấu hình trên.</p>
        )}
        <ul className="setup-groups-list" aria-label="Số cặp dự kiến mỗi bảng theo cấu hình">
          {preview.groupSizes.map((size, index) => <li key={index}>Bảng {String.fromCharCode(65 + index)}: {size} cặp</li>)}
        </ul>
        <ul className="setup-progression-list" aria-label="Tuyến đi tiếp thật">
          {preview.progressionLines.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </div>

      <div className="setup-draw-card">
        <p className="setup-draw-eyebrow">02 · Nhánh loại trực tiếp</p>
        <h3>Trận chờ suất đi tiếp</h3>
        <div className="setup-bracket-scroll">
          <div className="setup-bracket-lane">
            {preview.bracketSlots.map((slot) => (
              <article className="setup-bracket-match" key={slot.matchKey}>
                <strong>{slot.label}</strong>
                <span className="setup-placeholder-slot">{slot.slotA.label}</span>
                <span className="setup-placeholder-slot">{slot.slotB.label}</span>
              </article>
            ))}
            <article className="setup-bracket-match">
              <strong>Chung kết</strong>
              <span className="setup-placeholder-slot">Thắng bán kết 1</span>
              <span className="setup-placeholder-slot">Thắng bán kết 2</span>
            </article>
            {config.thirdPlaceEnabled ? (
              <article className="setup-bracket-match">
                <strong>Tranh hạng ba</strong>
                <span className="setup-placeholder-slot">Thua bán kết 1</span>
                <span className="setup-placeholder-slot">Thua bán kết 2</span>
              </article>
            ) : null}
          </div>
        </div>
        <p>Các suất đi tiếp sẽ được xác định sau khi xác nhận kết quả vòng bảng.</p>
      </div>

      <div className="setup-draw-card">
        <p className="setup-draw-eyebrow">03 · Sân và thời gian</p>
        <h3>Xem trước lịch thi đấu</h3>
        <div className="setup-metric-grid">
          <div className="setup-metric-tile">Vòng bảng: {preview.metrics.groupMatches} trận</div>
          <div className="setup-metric-tile">Knockout: {preview.metrics.semifinalMatches + preview.metrics.finalMatches + preview.metrics.thirdPlaceMatches} trận</div>
          <div className="setup-metric-tile">Tổng: {preview.metrics.totalMatches} trận</div>
          <div className="setup-metric-tile">Dự kiến: {preview.courtPlan.estimatedRounds} lượt · {preview.courtPlan.estimatedMinutes} phút</div>
        </div>
        {Array.isArray(draft.draw?.schedulePreview) && draft.draw.schedulePreview.length ? (
          <div className="setup-schedule-scroll" tabIndex={0} role="region" aria-label="Lịch sân và giờ dự kiến">
            <table className="setup-schedule-table">
              <caption>Lịch sân và giờ dự kiến · {draft.draw.schedulePreview.length} trận</caption>
              <thead><tr><th scope="col">Mã trận</th><th scope="col">Lượt</th><th scope="col">Sân đấu</th><th scope="col">Giờ dự kiến</th></tr></thead>
              <tbody>{draft.draw.schedulePreview.map((item) => <tr key={item.matchKey}><td><strong>{item.matchKey}</strong></td><td>{item.round}</td><td>Sân {item.court}</td><td>{item.projectedStart ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.projectedStart)) : 'Chưa có giờ bắt đầu'}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <p className="setup-draw-hint">Bốc thăm tự động hoặc xác nhận bốc thủ công để xem sân và giờ dự kiến.</p>}
      </div>

      {(preview.blockers.length || preview.warnings.length) ? (
        <div className="setup-draw-card">
          <p className="setup-draw-eyebrow">Các mục cần kiểm tra</p>
          <div className="setup-status-list">
            {preview.blockers.map((item) => <div className="setup-status-item blocker" key={item.code}>Blocker: {item.message}</div>)}
            {preview.warnings.map((item) => <div className="setup-status-item warning" key={item.code}>Warning: {item.message}</div>)}
          </div>
        </div>
      ) : null}
    </section>
  );
}
