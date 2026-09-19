'use client';

import '../draw/draw-review.css';
import { buildDrawPreviewModel } from '../draw/drawReviewModel';

const GROUP_PAIRING_LABELS = {
  cross_seed: 'Bán kết chéo bảng: Nhất A – Nhì B, Nhất B – Nhì A',
  same_seed: 'Ghép cùng thứ hạng theo cấu hình BTC',
};

export default function DrawScheduleStep({ draft = {}, onConfigChange, onRollDraw, onRerollDraw, onSwapDrawSlot, onPreviewSchedule }) {
  const preview = buildDrawPreviewModel(draft);
  const config = preview.config;
  const drawStatus = draft.draw?.status || 'not_started';
  const needsRedraw = drawStatus === 'stale';

  const updateConfig = (patch) => {
    onConfigChange?.({
      format: {
        ...(draft.format || {}),
        formatKey: 'group_knockout',
        config: { ...((draft.format && draft.format.config) || {}), ...patch },
      },
    });
  };

  return (
    <section className="setup-draw-panel" aria-label="Bước 3: bốc thăm và xem trước lịch">
      <div className="setup-draw-card">
        <p className="setup-draw-eyebrow">Luồng nghiệp vụ</p>
        <h3>{'ghép cặp -> bốc thăm -> sinh trận -> xếp sân/giờ'}</h3>
        <p>Xếp sân/giờ chỉ chạy sau khi đã có fixtures, không làm đổi kết quả bốc thăm.</p>
        <div className="setup-flow-chain" aria-label="Bốn nghiệp vụ tách biệt">
          <span className="setup-flow-chip">1. Ghép cặp</span>
          <span className="setup-flow-chip">2. Bốc thăm</span>
          <span className="setup-flow-chip">3. Sinh trận</span>
          <span className="setup-flow-chip">4. Xếp sân/giờ</span>
        </div>
      </div>

      <div className="setup-draw-card">
        <p className="setup-draw-eyebrow">Cấu hình group_knockout</p>
        <h3>Vòng bảng -&gt; loại trực tiếp</h3>
        <div className="setup-config-grid">
          <label className="setup-config-field">
            Số bảng
            <input type="number" min="1" value={config.groupCount} onChange={(event) => updateConfig({ groupCount: Number(event.target.value) })} />
          </label>
          <label className="setup-config-field">
            Số cặp mỗi bảng
            <input value={config.groupSizes.join('/')} onChange={(event) => updateConfig({ groupSizes: event.target.value.split('/').map((item) => Number(item.trim())).filter(Boolean) })} />
          </label>
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
          <label className="setup-config-field">
            Tranh hạng ba
            <select value={config.thirdPlaceEnabled ? 'yes' : 'no'} onChange={(event) => updateConfig({ thirdPlaceEnabled: event.target.value === 'yes' })}>
              <option value="no">Không</option>
              <option value="yes">Có</option>
            </select>
          </label>
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
        <div className="setup-action-row">
          <button className="setup-primary-action" type="button" onClick={() => onRollDraw?.(config)}>Bốc thăm</button>
          <button className="setup-secondary-action" type="button" onClick={() => onRerollDraw?.(config)}>Bốc lại</button>
          <button className="setup-secondary-action" type="button" onClick={() => onSwapDrawSlot?.()}>Đổi vị trí</button>
          <button className="setup-secondary-action" type="button" onClick={() => onPreviewSchedule?.(config)}>Sinh trận & xếp sân/giờ</button>
        </div>
      </div>

      <div className="setup-draw-card">
        <p className="setup-draw-eyebrow">Bảng đấu thật</p>
        <h3>Phân bảng và tuyến đi tiếp</h3>
        <ul className="setup-groups-list">
          {preview.groupSizes.map((size, index) => <li key={index}>Bảng {String.fromCharCode(65 + index)}: {size} cặp</li>)}
        </ul>
        <ul className="setup-progression-list" aria-label="Tuyến đi tiếp thật">
          {preview.progressionLines.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </div>

      <div className="setup-draw-card">
        <p className="setup-draw-eyebrow">Bracket placeholder</p>
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
        <p>Không tạo VĐV giả; slot knockout là placeholder chờ kết quả vòng bảng.</p>
      </div>

      <div className="setup-draw-card">
        <p className="setup-draw-eyebrow">Sân và thời gian</p>
        <h3>Metrics xếp sân/giờ</h3>
        <div className="setup-metric-grid">
          <div className="setup-metric-tile">Vòng bảng: {preview.metrics.groupMatches} trận</div>
          <div className="setup-metric-tile">Knockout: {preview.metrics.semifinalMatches + preview.metrics.finalMatches + preview.metrics.thirdPlaceMatches} trận</div>
          <div className="setup-metric-tile">Tổng: {preview.metrics.totalMatches} trận</div>
          <div className="setup-metric-tile">Dự kiến: {preview.courtPlan.estimatedRounds} lượt · {preview.courtPlan.estimatedMinutes} phút</div>
        </div>
      </div>

      {(preview.blockers.length || preview.warnings.length) ? (
        <div className="setup-draw-card">
          <p className="setup-draw-eyebrow">Blocker / warning</p>
          <div className="setup-status-list">
            {preview.blockers.map((item) => <div className="setup-status-item blocker" key={item.code}>Blocker: {item.message}</div>)}
            {preview.warnings.map((item) => <div className="setup-status-item warning" key={item.code}>Warning: {item.message}</div>)}
          </div>
        </div>
      ) : null}
    </section>
  );
}
