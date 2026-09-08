const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const modal = read('components/pickhub/PhModal.js');
assert(/role="dialog"/.test(modal), 'PhModal phai co role="dialog"');
assert(/aria-modal="true"/.test(modal), 'PhModal phai co aria-modal');
assert(/aria-labelledby/.test(modal), 'PhModal phai tro aria-labelledby toi tieu de');
assert(/Escape/.test(modal), 'PhModal phai dong bang phim Escape');
assert(/previouslyFocused|previousFocus/.test(modal), 'PhModal phai nho va tra lai focus');
assert(/Tab/.test(modal), 'PhModal phai bay focus bang Tab');

const seg = read('components/pickhub/PhSeg.js');
assert(/role="tablist"/.test(seg), 'PhSeg phai co role="tablist"');
assert(/role="tab"/.test(seg), 'PhSeg moi muc phai co role="tab"');
assert(/aria-selected/.test(seg), 'PhSeg phai co aria-selected');
assert(/tabIndex/.test(seg), 'PhSeg phai dung roving tabindex');
assert(/ArrowRight/.test(seg) && /ArrowLeft/.test(seg), 'PhSeg phai ho tro mui ten trai/phai');
assert(/\bHome\b/.test(seg) && /\bEnd\b/.test(seg), 'PhSeg phai ho tro Home/End');

const confirmSrc = read('components/pickhub/PhConfirm.js');
assert(/PhModal/.test(confirmSrc), 'PhConfirm phai dung tren PhModal');

for (const f of ['components/pickhub/PhConfirm.js', 'components/pickhub/PhModal.js']) {
    assert(!/window\.(confirm|prompt)\s*\(/.test(read(f)), `${f} khong duoc dung window.confirm/prompt`);
}

console.log('ph-components: PASS');
