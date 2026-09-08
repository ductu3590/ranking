const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const tokens = read('app/styles/tokens.css');
const globals = read('app/globals.css');
const layout = read('app/layout.js');

const REQUIRED_TOKENS = [
    ['--ph-ink', '#28243D'],
    ['--ph-ink-2', '#514A72'],
    ['--ph-indigo', '#6F48C9'],
    ['--ph-lavender', '#EEE9FF'],
    ['--ph-gold', '#FFC95E'],
    ['--ph-cyan', '#A8DFE9'],
    ['--ph-coral', '#FF8B83'],
    ['--ph-surface', '#F5F6FB'],
    ['--ph-card', '#FFFFFF'],
    ['--ph-line', '#E4E9F2'],
    ['--ph-muted', '#667085'],
    ['--ph-text', '#20213A'],
    ['--ph-positive', '#1F7A52'],
    ['--ph-negative', '#C2453A'],
    ['--ph-radius-sm', '12px'],
    ['--ph-radius-md', '20px'],
    ['--ph-radius-lg', '28px'],
    ['--ph-tint-indigo', '#F4F2FE'],
    ['--ph-tint-indigo-line', '#DED6FA'],
    ['--ph-tint-gold', '#FFF4DC'],
    ['--ph-tint-gold-line', '#F5E2B8'],
    ['--ph-tint-gold-text', '#8A5B00'],
    ['--ph-tint-cyan', '#EFFAFD'],
    ['--ph-tint-cyan-line', '#C9EDF6'],
    ['--ph-tint-coral', '#FFF1EF'],
    ['--ph-tint-coral-line', '#FBD8D3'],
    ['--ph-tint-positive', '#E8F5EE'],
    ['--ph-tint-negative', '#FDECEA'],
    ['--ph-tint-neutral', '#EEF0F5'],
    ['--ph-tint-neutral-strong', '#F7F8FB'],
];

for (const [name, value] of REQUIRED_TOKENS) {
    assert(
        new RegExp(String.raw`${name}\s*:\s*${value}`, 'i').test(tokens),
        `tokens.css phai khai ${name}: ${value}`
    );
}

assert(!/Outfit/i.test(globals), 'globals.css khong duoc con font Outfit');
assert(!/@import\s+url\(/i.test(globals), 'globals.css khong duoc @import font tu Google');
assert(/Montserrat/.test(layout), 'app/layout.js phai nap Montserrat qua next/font');
assert(/--ph-font/.test(layout), 'app/layout.js phai xuat bien --ph-font');
assert(/--ph-backdrop\s*:\s*rgba\(40,\s*36,\s*61,\s*\.45\)/.test(tokens),
    'tokens.css phai khai --ph-backdrop: rgba(40, 36, 61, .45)');

// Chi legacy-aliases.css duoc phep dinh nghia mau cu.
const OLD_TOKEN_DEF = /^\s*--(court|pickle|surface-court|live-cyan|rally-coral)[a-z-]*\s*:/gm;
function collectCss(dir, acc = []) {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) collectCss(rel, acc);
        else if (entry.name.endsWith('.css')) acc.push(rel);
    }
    return acc;
}
const cssFiles = [...collectCss('app'), ...collectCss('components')];
for (const file of cssFiles) {
    if (file.endsWith('legacy-aliases.css')) continue;
    assert(
        !OLD_TOKEN_DEF.test(read(file)),
        `${file} khong duoc dinh nghia token mau cu; chi legacy-aliases.css duoc phep`
    );
    OLD_TOKEN_DEF.lastIndex = 0;
}

// In ra so tham chieu con lai de con so luon nhin thay duoc.
let remaining = 0;
for (const file of cssFiles) {
    remaining += (read(file).match(/var\(--(court|pickle|surface-court|live-cyan|rally-coral|gradient-court|gradient-live)[a-z-]*\)/g) || []).length;
}
console.log(`[ph-design-system] tham chieu token khai tu con lai: ${remaining}`);

// Khong hardcode #rrggbb trong CSS moi - moi mau phai di qua token.
const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/g;
const NEW_CSS_FILES = ['app/styles/primitives.css', 'components/pickhub/AppShell.css', 'app/quy/bxh/page.css'];
for (const file of NEW_CSS_FILES) {
    const fullPath = path.join(root, file);
    if (!fs.existsSync(fullPath)) continue;
    const hits = read(file).match(HEX_COLOR) || [];
    assert.strictEqual(hits.length, 0, `${file} khong duoc hardcode mau (thay: ${hits.join(', ')}); dung var(--ph-*)`);
}

console.log('ph-design-system: PASS');
