'use client';

import { useId } from 'react';
import { nextPowerOfTwo } from '@/lib/tournament/seeding';
import { Segmented } from './GroupKnockoutConfig';

const ROUND_NAMES = ['Chung kết', 'Bán kết', 'Tứ kết'];

function bracketSummary(pairCount) {
  if (pairCount < 4) return 'Cần ít nhất 4 cặp.';
  const size = nextPowerOfTwo(pairCount);
  const rounds = Math.log2(size);
  const byes = size - pairCount;
  const first = ROUND_NAMES[rounds - 1] || `Vòng 1/${size / 2}`;
  const byeText = byes ? ` ${byes} cặp được vào thẳng vòng 2 theo bốc thăm.` : '';
  return `${pairCount} cặp → nhánh ${size}, ${rounds} vòng, bắt đầu từ ${first.toLowerCase()}.${byeText}`;
}

// Cấu hình loại trực tiếp (spec Lát C §2). BO chỉ chọn cho chung kết; các trận khác BO1.
export default function KnockoutConfig({ draft, onChange }) {
  const base = useId();
  const config = draft.format.config || {};
  const finalBestOf = Number(config.finalBestOf ?? 1);
  const thirdPlace = config.thirdPlaceEnabled === true;
  const set = (patch) => onChange((current) => ({
    ...current,
    format: { ...current.format, config: { ...current.format.config, ...patch } },
  }));

  return (
    <section className="pc-card" aria-labelledby={`${base}-title`}>
      <div className="pc-card__head">
        <h3 id={`${base}-title`} className="pc-card__title"><span className="pc-section-key">C</span>Cấu hình nhánh &amp; số ván</h3>
      </div>
      <div className="pc-grid">
        <p className="pc-card__hint" aria-live="polite">{bracketSummary(draft.pairs.length)}</p>
        <label className="pc-btn pc-btn--soft" style={{ justifyContent: 'flex-start' }}>
          <input type="checkbox" checked={thirdPlace} onChange={(event) => set({ thirdPlaceEnabled: event.target.checked })} />
          Có trận tranh hạng ba (hai cặp thua bán kết)
        </label>
        <div className="pc-bo-table" role="table" aria-label="Số ván mỗi trận">
          {[
            ['Các vòng trước chung kết', null],
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
        <p className="pc-card__hint">Thua một trận là dừng. Cặp vào thẳng vòng 2 (khi số cặp chưa tròn 4, 8, 16, 32) do bốc thăm quyết định, không theo điểm.</p>
      </div>
    </section>
  );
}
