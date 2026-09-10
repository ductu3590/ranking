const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
};

const shell = read('components/pickhub/AppShell.js');
const shellCss = read('components/pickhub/AppShell.css');
const tournamentLayout = read('app/giai-dau/layout.js');
const pageCss = read('app/giai-dau/v2/v2.css');
const wizardCss = read('app/giai-dau/v2/wizard.css');

assert(/className.*ph-shell--\$\{layout\}/.test(shell), 'AppShell hỗ trợ biến thể layout có scope');
assert(/<AppShell layout="tournament">/.test(tournamentLayout), 'Giải đấu dùng layout rộng riêng');
assert(/\.ph-shell--tournament\s+\.ph-shell__main[\s\S]*max-width:\s*none/.test(shellCss), 'vùng chính giải đấu không bị giới hạn 1280px');
assert(!/\.v2-page\s*\{[\s\S]*?max-width:\s*720px/.test(pageCss), 'trang quản lý giải không còn bị khóa 720px');
assert(/\.v2-page\s*\{[\s\S]*?width:\s*100%/.test(pageCss), 'trang quản lý giải dùng toàn bộ chiều rộng vùng chính');
assert(!/\.w3-formwrap\s*\{[\s\S]*?max-width:\s*640px/.test(wizardCss), 'bước thông tin và đăng ký không còn bị khóa 640px');

console.log('ui-wide-layout contract ok');
