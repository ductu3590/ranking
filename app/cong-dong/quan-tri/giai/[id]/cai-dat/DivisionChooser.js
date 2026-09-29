'use client';

import Link from 'next/link';

import AdminShell from '../../../AdminShell';

// Giải nhiều nội dung: chọn nội dung cần dựng (mỗi nội dung có bản nháp, bốc thăm và chốt riêng).
export default function DivisionChooser({ role, tournament, divisions }) {
  return (
    <AdminShell
      role={role}
      active="settings"
      tournamentId={tournament.id}
      title="Chọn nội dung để dựng"
      breadcrumb={`Giải cộng đồng / ${tournament.name} / Dựng giải`}
    >
      <p className="cd-muted">Mỗi nội dung được dựng, bốc thăm và chốt riêng.</p>
      <div className="cd-pairs" style={{ marginTop: '1rem' }}>
        {divisions.map((division) => (
          <article key={division.id} className="cd-card cd-card--flat cd-row">
            <strong>{division.name}</strong>
            {division.roster_lock_status === 'locked'
              ? <span className="cd-chip">Đã chốt</span>
              : <Link className="cd-btn cd-btn--primary cd-btn--sm" href={`/cong-dong/quan-tri/giai/${tournament.id}/cai-dat?divisionId=${division.id}`}>Dựng nội dung này</Link>}
          </article>
        ))}
      </div>
    </AdminShell>
  );
}
