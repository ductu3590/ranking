const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'docs', 'pickhub-core');
const preview = path.join(root, 'ui-preview');
const read = (file) => fs.readFileSync(path.join(preview, file), 'utf8');

const html = read('index.html');
const css = read('styles.css');
const js = read('app.js');
const brand = fs.readFileSync(path.join(root, 'UI-BRAND-SYSTEM.md'), 'utf8');

for (const view of ['member', 'leader', 'public']) {
  if (!js.includes(`function ${view}View`)) throw new Error(`missing ${view} view`);
  if (!html.includes(`data-view="${view}"`)) throw new Error(`missing ${view} switcher`);
}

if (!js.includes("['Quỹ', icons.wallet], ['Thành viên', icons.users], ['BXH', icons.chart], ['Giải', icons.calendar], ['Thông tin', icons.user]")) {
  throw new Error('member navigation must contain five tabs with Thông tin in the fifth position');
}
if (!js.includes("['Quỹ', icons.wallet], ['Thành viên', icons.users], ['BXH', icons.chart], ['Giải', icons.calendar], ['Cấu hình', icons.shield]")) {
  throw new Error('leader navigation must retain Cấu hình in the fifth position');
}
if (!js.includes('function memberInfoView')) {
  throw new Error('member information view is missing');
}

if (css.includes('--ph-lime:')) {
  throw new Error('UI preview must not define the retired lime brand token');
}

for (const token of ['--ph-ink', '--ph-indigo', '--ph-lavender', '--ph-gold', '--ph-cyan', '--ph-coral']) {
  if (!css.includes(token) || !brand.includes(token.replace('--ph-', '`--ph-'))) throw new Error(`missing brand token ${token}`);
}

if (!html.includes('ui-preview/app.js') && !html.includes('./app.js')) throw new Error('preview script is not connected');
if (!fs.existsSync(path.join(preview, 'assets', 'pickhub-court-hero.png'))) throw new Error('hero asset is missing');
if (/(supabase|fetch\s*\(|\/api\/)/i.test(`${html}\n${js}`)) throw new Error('preview must not call production APIs');

console.log('UI PREVIEW TEST PASS: 3 contexts, brand tokens, local asset, no production API calls');
