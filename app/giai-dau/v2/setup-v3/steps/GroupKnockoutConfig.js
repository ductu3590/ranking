'use client';

import { useId } from 'react';
import { GROUP_KNOCKOUT_COMBOS, groupKnockoutCombo } from '@/lib/tournament/setupFormats';

const RANK_WORD = { 1: 'nhất', 2: 'nhì', 3: 'ba' };

function qualifySummary(combo) {
  if (!combo) return 'Tổ hợp này chưa hợp lệ.';
  const direct = combo.groupCount * combo.qualifiersPerGroup;
  const directText = combo.qualifiersPerGroup === 1 ? `${direct} cặp nhất bảng` : `${direct} cặp nhất/nhì`;
  const poolText = combo.pool ? ` + ${combo.pool} cặp ${RANK_WORD[combo.qualifiersPerGroup + 1]} tốt nhất` : '';
  return `Vào vòng loại: ${directText}${poolText} → ${combo.target === 8 ? 'Tứ kết' : 'Bán kết'}. Cần ít nhất ${combo.minPairs} cặp.`;
}

export function Segmented({ label, options, value, onChange, isDisabled, format }) {
  return (
    <div className="pc-segmented" role="group" aria-label={label}>
      {options.map((option) => {
        const disabled = isDisabled?.(option) || false;
        return (
          <button key={option} type="button" aria-pressed={value === option} disabled={disabled} onClick={() => onChange(option)}
            title={disabled ? 'Tổ hợp này không hợp lệ' : undefined}>
            {format ? format(option) : option}
          </button>
        );
      })}
    </div>
  );
}

// Cấu hình vòng bảng → loại trực tiếp (spec Lát A §2, §7). BO chỉ chọn cho chung kết.
export default function GroupKnockoutConfig({ draft, onChange }) {
  const base = useId();
  const config = draft.format.config || {};
  const groupCount = Number(config.groupCount ?? 2);
  const qualifiers = Number(config.qualifiersPerGroup ?? config.advancePerGroup ?? 2);
  const combo = groupKnockoutCombo({ groupCount, qualifiersPerGroup: qualifiers });
  const finalBestOf = Number(config.finalBestOf ?? 1);
  const thirdPlace = config.thirdPlaceEnabled === true;
  const set = (patch) => onChange((current) => ({
    ...current,
    format: { ...current.format, config: { ...current.format.config, ...patch } },
  }));
  const valid = (g, q) => Boolean(GROUP_KNOCKOUT_COMBOS[`${g}x${q}`]);
  const setGroups = (g) => set({ groupCount: g, qualifiersPerGroup: valid(g, qualifiers) ? qualifiers : 2 });

  return (
    <section className="pc-card" aria-labelledby={`${base}-title`}>
      <div className="pc-card__head">
        <h3 id={`${base}-title`} className="pc-card__title"><span className="pc-section-key">C</span>Cấu hình vòng bảng &amp; số ván</h3>
      </div>
      <div className="pc-grid">
        <div className="pc-btn-row" style={{ alignItems: 'center', gap: '1rem' }}>
          <span className="pc-field__label">Số bảng</span>
          <Segmented label="Số bảng" options={[2, 3, 4]} value={groupCount} onChange={setGroups} />
          <span className="pc-field__label">Lấy mỗi bảng</span>
          <Segmented label="Số cặp đi tiếp mỗi bảng" options={[1, 2]} value={qualifiers} onChange={(q) => set({ qualifiersPerGroup: q })} isDisabled={(q) => !valid(groupCount, q)} />
        </div>
        <p className={combo ? 'pc-card__hint' : 'pc-field__error'} aria-live="polite">{qualifySummary(combo)}</p>
        <label className="pc-btn pc-btn--soft" style={{ justifyContent: 'flex-start' }}>
          <input type="checkbox" checked={thirdPlace} onChange={(event) => set({ thirdPlaceEnabled: event.target.checked })} />
          Có trận tranh hạng ba (hai cặp thua bán kết)
        </label>
        <div className="pc-bo-table" role="table" aria-label="Số ván mỗi trận">
          {[
            ['Vòng bảng', null],
            [combo?.target === 8 ? 'Tứ kết, bán kết' : 'Bán kết', null],
            ...(thirdPlace ? [['Tranh hạng ba', null]] : []),
            ['Chung kết', 'final'],
          ].map(([label, kind]) => (
            <div key={label} className="pc-bo-row" role="row">
              <span role="cell" className="pc-bo-row__label">{label}</span>
              <span role="cell">
                {kind === 'final'
                  ? <Segmented label="Số ván trận chung kết" options={[1, 3, 5]} value={finalBestOf} onChange={(bo) => set({ finalBestOf: bo })} format={(bo) => `BO${bo}`} />
                  : <span className="pc-badge pc-badge--muted">BO1 (cố định)</span>}
              </span>
            </div>
          ))}
        </div>
        <p className="pc-card__hint">BO1 = 1 ván; BO3 = thắng 2 trong 3 ván. Chỉ trận chung kết được chọn số ván.</p>
      </div>
    </section>
  );
}
