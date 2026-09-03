const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const globalsCss = read('app/globals.css');
const bottomNavCss = read('components/MobileBottomNav.css');
const homeHeaderCss = read('components/HomeHeader.css');
const fundCss = read('app/quy/page.css');
const adminCss = read('app/admin/admin-center.css');

const requiredTokens = [
    '--court-midnight: #071B18',
    '--court-green: #0D7565',
    '--pickle-lime: #CAFF28',
    '--live-cyan: #2CDCFF',
    '--rally-coral: #FF6B35',
    '--surface-court: #F4FBF6',
    '--surface-court-soft: #EEF7F3',
    '--text-primary: #071B18',
    '--text-secondary: #536A64',
];

for (const token of requiredTokens) {
    assert(globalsCss.includes(token), `globals.css should define ${token}`);
}

assert(
    globalsCss.includes('--gradient-court-hero') &&
    globalsCss.includes('--gradient-court-action') &&
    globalsCss.includes('--focus-ring'),
    'Global CSS should define shared Court Energy gradients and focus ring.'
);

assert(
    bottomNavCss.includes('position: fixed') &&
    bottomNavCss.includes('env(safe-area-inset-bottom)') &&
    bottomNavCss.includes('var(--ph-lavender)') &&
    bottomNavCss.includes('var(--ph-indigo)'),
    'Mobile bottom nav should stay fixed, safe-area aware, and use the approved light PickHub styling.'
);

assert(
    homeHeaderCss.includes('var(--ph-lavender)') &&
    homeHeaderCss.includes('var(--ph-indigo)'),
    'HomeHeader should use the approved light PickHub brand colors.'
);

assert(
    fundCss.includes('var(--gradient-court-hero)') &&
    fundCss.includes('var(--rally-coral)') &&
    fundCss.includes('var(--pickle-lime)'),
    'Fund dashboard should use the Court Energy hero, warning, and action accents.'
);

assert(
    adminCss.includes('var(--surface-court)') &&
    adminCss.includes('var(--court-green)'),
    'Admin center should use the shared Court Energy surface and primary action colors.'
);

console.log('Court Energy CSS contract ok');
