'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { resolveInviteLink } from '@/lib/tournamentV2Client';
import { LiPage } from '../../loi-moi/liShared';

// Mở link mời (FRD-05, README §5.3). Server quyết định theo thứ tự: phiên → token → đúng CLB → quản trị → cửa sổ.
// Nhánh sai CLB CHỈ hiện tên CLB của chính phiên (currentClubName) — không có tên giải, không có CLB chủ nhà.
async function logoutThenLogin(path) {
  try {
    await fetch('/api/groups/session', { method: 'DELETE', credentials: 'same-origin' });
  } catch {
    // Vẫn chuyển tới đăng nhập: đăng nhập CLB mới sẽ thay phiên cũ.
  }
  window.location.assign(`/?dang-nhap=clb&next=${encodeURIComponent(path)}`);
}

export default function InviteLinkClient({ token }) {
  const router = useRouter();
  const [state, setState] = useState({ kind: 'loading' });
  const path = `/giai-dau/moi/${token}`;

  const resolve = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const result = await resolveInviteLink(token);
      setState({ kind: 'ok' });
      router.replace(`/giai-dau/loi-moi/${encodeURIComponent(result.invitationId)}`);
    } catch (error) {
      const details = error?.details || {};
      if (error?.code === 'UNAUTHENTICATED') {
        window.location.assign(details.loginUrl || `/?dang-nhap=clb&next=${encodeURIComponent(path)}`);
        return;
      }
      if (error?.code === 'FRIENDLY_INVITE_WRONG_CLUB') setState({ kind: 'wrong-club', currentClubName: details.currentClubName || null });
      else if (error?.code === 'GROUP_ADMIN_REQUIRED') setState({ kind: 'admin-required' });
      else if (error?.code === 'FRIENDLY_INVITE_LINK_EXPIRED') setState({ kind: 'expired', invitationId: details.invitationId });
      else if (error?.code === 'FRIENDLY_INVITE_LINK_INVALID') setState({ kind: 'invalid' });
      else if (error?.code === 'RATE_LIMITED') setState({ kind: 'error', text: 'Thao tác quá nhiều lần, thử lại sau ít phút.' });
      else setState({ kind: 'error', text: 'Không mở được lời mời. Kiểm tra kết nối rồi thử lại.' });
    }
  }, [path, router, token]);

  useEffect(() => { resolve(); }, [resolve]);

  if (state.kind === 'loading' || state.kind === 'ok') {
    return (
      <LiPage label="Đang mở lời mời">
        <section className="li-card" aria-busy="true">
          <div className="li-skeleton" aria-hidden="true"><i /><i /><i /></div>
          <p className="li-muted" role="status">Đang mở lời mời…</p>
        </section>
      </LiPage>
    );
  }

  if (state.kind === 'wrong-club') {
    return (
      <LiPage label="Link mời dành cho CLB khác">
        <section className="li-card li-card--center" data-code="FRIENDLY_INVITE_WRONG_CLUB">
          <span className="li-icon" aria-hidden="true">🔒</span>
          <h2>Link mời này dành cho một CLB khác</h2>
          {state.currentClubName ? <p className="li-muted">Bạn đang đăng nhập: <strong>{state.currentClubName}</strong></p> : null}
          <button type="button" className="li-btn li-btn--primary li-btn--block" onClick={() => logoutThenLogin(path)}>Đăng xuất &amp; đăng nhập CLB khác</button>
          <Link className="li-btn li-btn--block" href="/">Về trang chủ</Link>
        </section>
        <p className="li-muted" style={{ textAlign: 'center' }}>Nhờ chủ nhà gửi lại link nếu bạn quản trị CLB được mời.</p>
      </LiPage>
    );
  }

  if (state.kind === 'admin-required') {
    return (
      <LiPage label="Cần quyền quản trị">
        <section className="li-card li-card--center" data-code="GROUP_ADMIN_REQUIRED">
          <span className="li-icon" data-tone="brand" aria-hidden="true">🛡</span>
          <h2>Cần tài khoản quản trị CLB để trả lời lời mời</h2>
          <p className="li-muted">Bạn đang đăng nhập bằng tài khoản thành viên.</p>
          <button type="button" className="li-btn li-btn--primary li-btn--block" onClick={() => logoutThenLogin(path)}>Đăng nhập bằng quyền quản trị</button>
        </section>
      </LiPage>
    );
  }

  if (state.kind === 'invalid') {
    return (
      <LiPage label="Link mời không hợp lệ">
        <section className="li-card li-card--center" data-code="FRIENDLY_INVITE_LINK_INVALID">
          <span className="li-icon" aria-hidden="true">⛓</span>
          <h2>Link mời không hợp lệ hoặc đã bị thu hồi</h2>
          <p className="li-muted">Chủ nhà có thể đã tạo link mới. Lời mời vẫn có trong hộp lời mời của CLB bạn.</p>
          <Link className="li-btn li-btn--block" href="/giai-dau/loi-moi">Mở hộp lời mời</Link>
        </section>
      </LiPage>
    );
  }

  if (state.kind === 'expired') {
    return (
      <LiPage label="Đăng ký đã đóng">
        <section className="li-card li-card--center" data-code="FRIENDLY_INVITE_LINK_EXPIRED">
          <span className="li-icon" data-tone="warn" aria-hidden="true">🕒</span>
          <h2>Đăng ký của giải này đã đóng</h2>
          <p className="li-muted">Chủ nhà đã khoá đăng ký hoặc đã qua hạn chót.</p>
          {state.invitationId != null
            ? <Link className="li-btn li-btn--block" href={`/giai-dau/loi-moi/${encodeURIComponent(state.invitationId)}`}>Xem lời mời</Link>
            : <Link className="li-btn li-btn--block" href="/giai-dau/loi-moi">Mở hộp lời mời</Link>}
        </section>
      </LiPage>
    );
  }

  return (
    <LiPage label="Không mở được lời mời">
      <section className="li-card li-card--center" role="alert">
        <h2>Không mở được lời mời</h2>
        <p className="li-muted">{state.text}</p>
        <button type="button" className="li-btn li-btn--primary li-btn--block" onClick={resolve}>Thử lại</button>
      </section>
    </LiPage>
  );
}
