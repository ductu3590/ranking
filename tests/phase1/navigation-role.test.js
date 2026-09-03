const assert = require('assert');
const navigation = require('../../lib/globalNavigation');

assert.strictEqual(
    typeof navigation.getGlobalNavLinksForRole,
    'function',
    'Navigation must expose a role-aware menu function.'
);

const memberLinks = navigation.getGlobalNavLinksForRole('member');
const adminLinks = navigation.getGlobalNavLinksForRole('admin');
const unknownRoleLinks = navigation.getGlobalNavLinksForRole('unexpected');

assert.deepStrictEqual(
    memberLinks.map((link) => link.href),
    ['/quy', '/quy/members', '/quy/bxh', '/giai-dau', '/thong-tin'],
    'Members must get the five-tab navigation with Thông tin instead of admin settings.'
);
assert.deepStrictEqual(
    adminLinks,
    navigation.GLOBAL_NAV_LINKS,
    'Admins must see the complete global navigation.'
);
assert.deepStrictEqual(
    unknownRoleLinks,
    memberLinks,
    'Unknown roles must fail closed to member navigation.'
);

console.log('phase 1 navigation role behavior ok');
