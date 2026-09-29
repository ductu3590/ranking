'use client';

import { messageFor } from '@/lib/tournament/setupMessages';

// Giải cộng đồng (Epic 4 C3, PLA-04): người tham gia là các cặp ĐÃ DUYỆT ở bảng duyệt đăng ký — không chọn thành viên CLB,
// không thêm khách mời, không ghép cặp ở đây. Chỉ đọc; chỉnh sửa (duyệt / ghép hộ / bỏ duyệt) ở bảng duyệt.
// Chỉ hiện tên, PHR tự khai và chip phí. Không số điện thoại, không ngày sinh.

function phrText(members) {
  const values = (members || []).map((member) => member.phr).filter((value) => value != null);
  return values.length ? `PHR ${values.join(' · ')}` : null;
}

export default function CommunityPairsPanel({ community, registrationsHref, blockers = [], warnings = [], compact = false, onRefresh }) {
  const pairs = community?.approvedPairs || [];
  const counts = community?.counts || {};
  const hasFee = Number(community?.entryFee) > 0;
  const summary = `${counts.approved ?? pairs.length} cặp · ${counts.pending ?? 0} chờ duyệt · ${counts.awaitingPartner ?? 0} đang tìm bạn`;
  return (
    <section className="pc-card cm-pairs" aria-labelledby="cm-pairs-title" data-section="community-pairs">
      <div className="pc-card__head">
        <div>
          <h3 id="cm-pairs-title" className="pc-card__title">{compact ? 'Cặp đã duyệt' : 'Các cặp đã duyệt'}</h3>
          <p className="pc-card__hint" data-testid="community-counter">{summary}</p>
        </div>
        <div className="pc-btn-row">
          {onRefresh ? <button type="button" className="pc-btn pc-btn--sm" onClick={onRefresh}>Tải lại</button> : null}
          {registrationsHref ? <a className="pc-btn pc-btn--sm pc-btn--soft" href={registrationsHref}>Mở bảng duyệt</a> : null}
        </div>
      </div>

      {blockers.map((item) => (
        <div key={item.code} className="pc-notice pc-notice--error" role="alert" data-code={item.code}><p>{messageFor(item.code, item.params).text}</p></div>
      ))}
      {warnings.map((item) => (
        <div key={item.code} className="pc-notice pc-notice--warn" data-code={item.code}><p>{messageFor(item.code, item.params).text}</p></div>
      ))}

      {pairs.length ? (
        <ol className="cm-pair-list">
          {pairs.map((pair, index) => (
            <li key={pair.pairId} className="cm-pair" data-pair-id={pair.pairId}>
              <span className="cm-pair__no">Cặp {index + 1}</span>
              <span className="cm-pair__names">{(pair.members || []).map((member) => member.name || 'VĐV').join(' + ')}</span>
              {phrText(pair.members) ? <span className="cm-pair__phr">{phrText(pair.members)}</span> : null}
              {hasFee ? <span className="cm-chip" data-tone={pair.feeConfirmed ? 'ok' : 'wait'}>{pair.feeConfirmed ? 'Đã xác nhận thu' : 'Chưa thu'}</span> : null}
            </li>
          ))}
        </ol>
      ) : <p className="pc-empty">Chưa có cặp nào được duyệt. Duyệt đăng ký ở bảng duyệt rồi quay lại đây.</p>}
    </section>
  );
}
