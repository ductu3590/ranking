'use client';

import { useId } from 'react';
import { nextPowerOfTwo } from '@/lib/tournament/seeding';
import { Segmented } from './GroupKnockoutConfig';

function bracketSummary(pairCount) {
  if (pairCount < 4) return 'Cần ít nhất 4 cặp.';
  if (pairCount > 32) return 'Loại kép nhận tối đa 32 cặp.';
  const size = nextPowerOfTwo(pairCount);
  const byes = size - pairCount;
  const byeText = byes ? ` ${byes} cặp được vào thẳng vòng 2 nhánh thắng theo bốc thăm.` : '';
  return `${pairCount} cặp → nhánh ${size} · ${2 * pairCount - 2} trận (nhánh thắng ${pairCount - 1}, nhánh thua ${pairCount - 2}, chung kết tổng 1).${byeText}`;
}

// Cấu hình loại kép (spec Epic 1 D2 §2). BO chỉ chọn cho chung kết tổng; các trận khác BO1 (ADR-007 D14).
export default function DoubleElimConfig({ draft, onChange }) {
  const base = useId();
  const config = draft.format.config || {};
  const finalBestOf = Number(config.finalBestOf ?? 1);
  const set = (patch) => onChange((current) => ({
    ...current,
    format: { ...current.format, config: { ...current.format.config, ...patch } },
  }));

  return (
    <section className="pc-card" aria-labelledby={`${base}-title`} data-testid="double-elim-config">
      <div className="pc-card__head">
        <h3 id={`${base}-title`} className="pc-card__title"><span className="pc-section-key">C</span>Cấu hình nhánh &amp; số ván</h3>
      </div>
      <div className="pc-grid">
        <p className="pc-card__hint" aria-live="polite">{bracketSummary(draft.pairs.length)}</p>
        <div className="pc-bo-table" role="table" aria-label="Số ván mỗi trận">
          {[
            ['Các trận trước chung kết tổng', null],
            ['Chung kết tổng', 'final'],
          ].map(([label, kind]) => (
            <div key={label} className="pc-bo-row" role="row">
              <span role="cell" className="pc-bo-row__label">{label}</span>
              <span role="cell">
                {kind === 'final'
                  ? <Segmented label="Số ván trận chung kết tổng" options={[1, 3, 5]} value={finalBestOf} onChange={(bo) => set({ finalBestOf: bo })} format={(bo) => `BO${bo}`} />
                  : <span className="pc-badge pc-badge--muted">BO1 (cố định)</span>}
              </span>
            </div>
          ))}
        </div>
        <p className="pc-card__hint">Thua hai trận mới bị loại. Không đá lại chung kết tổng: thắng trận này là vô địch, kể cả khi cặp đi lên từ nhánh thua thắng.</p>
        <p className="pc-card__hint">Hạng 3 là cặp thua chung kết nhánh thua; không có trận tranh hạng ba.</p>
      </div>
    </section>
  );
}
