'use strict';

const NO_PERMISSIONS = Object.freeze({
  canViewClub: false,
  canManageFund: false,
  canManageRoster: false,
  canManagePhr: false,
  canManageSettings: false,
});

function buildClubSessionView(session) {
  const active = Boolean(session?.signed !== false && session?.group_id && ['member', 'admin'].includes(session?.role));
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

module.exports = { buildClubSessionView };
