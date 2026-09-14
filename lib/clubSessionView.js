'use strict';

const NO_PERMISSIONS = Object.freeze({
  canViewClub: false,
  canManageFund: false,
  canManageRoster: false,
  canManagePhr: false,
  canManageSettings: false,
});

// 'athlete' = VĐV đăng nhập bằng tài khoản cá nhân (cookie athlete_session). Được xem
// dữ liệu CLB của mình như member, nhưng không bao giờ được quyền quản lý: mọi cờ
// canManage* dưới đây đều suy ra từ role === 'admin'.
const CLUB_VIEW_ROLES = Object.freeze(['member', 'admin', 'athlete']);

function buildClubSessionView(session) {
  const active = Boolean(session?.signed !== false && session?.group_id && CLUB_VIEW_ROLES.includes(session?.role));
  const isAdmin = active && session.role === 'admin';

  return {
    session: session || null,
    permissions: active ? {
      canViewClub: true,
      canManageFund: isAdmin,
      canManageRoster: isAdmin,
      canManagePhr: isAdmin,
      canManageSettings: isAdmin,
    } : { ...NO_PERMISSIONS },
  };
}

module.exports = { buildClubSessionView, CLUB_VIEW_ROLES };
