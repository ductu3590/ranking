'use client';

import { messageFor } from '@/lib/tournament/setupMessages';

// Giải cộng đồng (Epic 4 C3, PLA-04): người tham gia là các cặp ĐÃ DUYỆT ở bảng duyệt đăng ký — không chọn thành viên CLB,
// không thêm khách mời, không ghép cặp ở đây. Chỉ đọc; chỉnh sửa (duyệt / ghép hộ / bỏ duyệt) ở bảng duyệt.
// Chỉ hiện tên, PHR tự khai và chip phí. Không số điện thoại, không ngày sinh.

function phrText(members) {
  const values = (members || []).map((member) => member.phr).filter((value) => value != null);
  return values.length ? `PHR ${values.join(' / ')}` : null;
}

export default function CommunityPairsPanel({ community, registrationsHref, blockers = [], warnings = [], onRefresh }) {
  const pairs = community?.approvedPairs || [];
  const counts = community?.counts || {};
  const hasFee = Number(community?.entryFee) > 0;
  const approved = counts.approved ?? pairs.length;
  const capacity = community?.capacity ?? null;
  const summary = `${approved} cặp · ${counts.pending ?? 0} chờ duyệt · ${counts.awaitingPartner ?? 0} đang tìm bạn`;
  const unpaid = hasFee ? pairs.filter((pair) => !pair.feeConfirmed).length : 0;
  return (
    <section className="cm-pairs" aria-labelledby="cm-pairs-title" data-section="community-pairs">
      <div className="cm-stats" role="list">
        <div className="cm-stat" role="listitem">
          <span>Đã duyệt</span>
          <strong>{approved}{capacity != null ? <small>/{capacity}</small> : null} <em>cặp</em></strong>
        </div>
        <div className="cm-stat" role="listitem" data-tone="warn">
          <span>Chờ duyệt</span>
          <strong>{counts.pending ?? 0}</strong>
        </div>
        <div className="cm-stat" role="listitem" data-tone="brand">
          <span>VĐV đơn lẻ</span>
          <strong>{counts.awaitingPartner ?? 0}</strong>
        </div>
        {hasFee ? (
          <div className="cm-stat" role="listitem" data-tone={unpaid > 0 ? 'danger' : 'ok'}>
            <span>Tình trạng lệ phí</span>
            <strong>{unpaid > 0 ? `${unpaid} chưa thu` : 'Đã thu đủ'}</strong>
          </div>
        ) : null}
      </div>

      <div className="cm-info">
        <p>Danh sách lấy từ các đơn đã duyệt. Muốn thêm hoặc bớt cặp, hãy mở bảng duyệt.</p>
        <div className="pc-btn-row">
          {registrationsHref ? <a className="pc-btn pc-btn--sm" href={registrationsHref}>Mở bảng duyệt</a> : null}
          {onRefresh ? <button type="button" className="pc-btn pc-btn--sm" onClick={onRefresh}>Tải lại</button> : null}
        </div>
      </div>

      {blockers.map((item) => (
        <div key={item.code} className="pc-notice pc-notice--error" role="alert" data-code={item.code}><p>{messageFor(item.code, item.params).text}</p></div>
      ))}
      {warnings.map((item) => (
        <div key={item.code} className="pc-notice pc-notice--warn" data-code={item.code}><p>{messageFor(item.code, item.params).text}</p></div>
      ))}
      {unpaid > 0 ? <div className="pc-notice pc-notice--warn" data-code="COMMUNITY_UNPAID"><p>{unpaid} cặp chưa xác nhận thu phí. Bạn vẫn có thể tiếp tục.</p></div> : null}

      <div className="cm-listhead">
        <h3 id="cm-pairs-title">Danh sách cặp ({approved})</h3>
        <span data-testid="community-counter">{summary}</span>
      </div>

      {pairs.length ? (
        <ol className="cm-pair-list">
          {pairs.map((pair, index) => (
            <li key={pair.pairId} className="cm-pair" data-pair-id={pair.pairId}>
              <span className="cm-pair__no" aria-label={`Cặp ${index + 1}`}>{String(index + 1).padStart(2, '0')}</span>
              <span className="cm-pair__names">{(pair.members || []).map((member) => member.name || 'VĐV').join(' & ')}</span>
              {phrText(pair.members) ? <span className="cm-pair__phr">{phrText(pair.members)}</span> : null}
              {hasFee ? <span className="cm-chip" data-tone={pair.feeConfirmed ? 'ok' : 'wait'}>{pair.feeConfirmed ? 'Đã xác nhận thu' : 'Chưa thu'}</span> : null}
            </li>
          ))}
        </ol>
      ) : <p className="pc-empty">Chưa có cặp nào được duyệt. Duyệt đăng ký ở bảng duyệt rồi quay lại đây.</p>}
    </section>
  );
}
