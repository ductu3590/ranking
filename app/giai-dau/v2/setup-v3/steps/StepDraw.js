'use client';

import { useId } from 'react';
import { messageFor } from '@/lib/tournament/setupMessages';

// Lát 0: chưa thể thức nào có preview/finalize thật (ADR-005 D5). Lát A thay màn này
// bằng bốc thăm, sơ đồ nhánh và xem trước lịch.
export default function StepDraw({ readiness }) {
  const base = useId();
  const blockers = readiness.byStep[4].blockers;
  return (
    <section className="pc-card pc-card--hero" aria-labelledby={`${base}-title`}>
      <p className="pc-eyebrow">Bước 4</p>
      <h2 id={`${base}-title`} className="pc-hero-title">Bốc thăm, xem trước lịch &amp; chốt</h2>
      <p className="pc-lead">Bốc thăm sẽ mở khi thể thức đã chọn được hỗ trợ đầy đủ.</p>
      {blockers.map((item) => (
        <div key={item.code} className="pc-notice pc-notice--warn" data-code={item.code} style={{ marginTop: '0.75rem' }}>
          <p>{messageFor(item.code, item.params).text}</p>
        </div>
      ))}
    </section>
  );
}
