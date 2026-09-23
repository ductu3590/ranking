'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { assert, read, ROOT, suite } = require('../_harness');

const DIR = 'app/giai-dau/v2/setup-v3';
function files(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`;
    return entry.isDirectory() ? files(rel) : [rel];
  });
}
const sources = files(DIR).filter((file) => file.endsWith('.js')).map((file) => ({ file, text: read(file) }));
const css = read(`${DIR}/studio.css`);
const all = sources.map((item) => item.text).join('\n');

// Chuỗi hiển thị trong JSX: nội dung giữa > và <, cộng các literal tiếng Việt trong nháy.
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function visibleStrings(raw) {
  const text = stripComments(raw);
  // Bỏ đoạn là code (sau `=>`, chứa ===, ;, (, =) — chỉ giữ văn bản JSX thật.
  const jsxText = [...text.matchAll(/>([^<>{}]+)</g)].map((match) => match[1]).filter((chunk) => !/[=;()]/.test(chunk));
  const literals = [...text.matchAll(/'([^'\n]*[À-ỹ][^'\n]*)'/g)].map((match) => match[1]);
  return jsxText.concat(literals).join('\n');
}
const shown = sources.map((item) => visibleStrings(item.text)).join('\n');

suite('ui contract lát 0', {
  'không hiển thị seed/hash/DUPR/Athlete_ID/dự bị giả'() {
    for (const banned of [/DUPR/i, /\bseed\b/i, /hạt giống/i, /\bhash\b/i, /Athlete_ID/i, /PHR/]) {
      assert.equal(banned.test(shown), false, `chuỗi hiển thị chứa ${banned}`);
    }
  },

  'không có "Đã lưu tự động"; trạng thái lưu đủ 5 nhãn trung thực'() {
    assert.equal(/tự động lúc|lưu tự động/i.test(all), false);
    for (const label of ['Chưa lưu', 'Có thay đổi chưa lưu', 'Đang lưu', 'Đã lưu lúc', 'Lưu thất bại']) {
      assert.ok(all.includes(label), `thiếu nhãn ${label}`);
    }
  },

  'mã lỗi thô không nằm trong chuỗi hiển thị (chỉ ở data-code)'() {
    assert.equal(/\b[A-Z]{3,}_[A-Z_]{3,}\b/.test(shown), false, 'có mã lỗi thô trong chuỗi hiển thị');
    assert.ok(all.includes('data-code={'), 'mã lỗi gắn qua data-code');
  },

  'ghép cặp chạm-hai-người: aria-pressed, không kéo-thả'() {
    assert.ok(all.includes('aria-pressed={pressed}'));
    assert.ok(all.includes("disabled={phase !== 'ready'}"), 'nút Ghép cặp chỉ bật khi đã chọn đủ hai người');
    assert.equal(/draggable|onDragStart|onDrop|dnd/i.test(all), false);
    assert.ok(all.includes("event.key === 'Escape'"), 'Esc hủy chọn');
  },

  'dirty guard: beforeunload + hộp thoại 3 lựa chọn'() {
    assert.ok(all.includes("addEventListener('beforeunload'"));
    for (const label of ['Ở lại', 'Bỏ thay đổi chưa lưu', '>Lưu<']) assert.ok(all.includes(label), `thiếu ${label}`);
    assert.ok(all.includes('role="dialog"') && all.includes('aria-modal="true"'));
  },

  'không bypass bước bằng URL: bước mở do allowedStep + completedThrough của server'() {
    const hook = read(`${DIR}/useSetupStudio.js`);
    assert.ok(hook.includes('allowedStep(requestedStep'), 'bước từ URL bị kẹp');
    const studio = read(`${DIR}/SetupStudio.js`);
    assert.ok(studio.includes('allowedStep(target, completedThrough)'));
  },

  'thể thức khóa hiện "Sắp có", không có danh sách dự bị'() {
    assert.ok(all.includes('Sắp có'));
    assert.ok(all.includes('aria-disabled={!format.enabled'));
    assert.equal(/reserve/i.test(all), false);
  },

  'touch target ≥ 44px, không tràn ngang, token từ Stitch'() {
    assert.ok((css.match(/min-height: 44px|height: 44px/g) || []).length >= 5);
    assert.ok(css.includes('--pc-brand-600: #7c3aed'));
    assert.ok(css.includes('grid-template-columns: minmax(0, 1fr)'));
    assert.equal(/fonts\.googleapis|cdn\.tailwindcss/i.test(all + css), false, 'không tải font/Tailwind từ CDN lúc chạy');
  },

  'TournamentWizard chỉ mount SetupStudio, không còn shape cũ'() {
    const wizard = read('app/giai-dau/v2/TournamentWizard.js');
    assert.ok(wizard.includes("import SetupStudio from './setup-v3/SetupStudio'"));
    assert.equal(/selectedMemberIds|reserveMemberIds|ReviewFinalizeStep/.test(wizard), false);
  },

  'console dùng readiness/resume do server tính'() {
    const consoleSrc = read('app/giai-dau/v2/console/TournamentConsoleV2.js');
    assert.ok(consoleSrc.includes('setupAggregate?.setup?.resumeStep'));
    assert.equal(consoleSrc.includes('validateSetup'), false);
    assert.equal(consoleSrc.includes('selectedMemberIds'), false);
  },

  'hồi quy browser 2026-09-23: thanh hành động không bị thanh tab app che, nút Ghép cặp luôn thấy'() {
    assert.ok(/\.pc-actionbar \{[\s\S]*?position: sticky; bottom: calc\(var\(--pc-app-nav\)/.test(css), 'action bar sticky trên thanh tab');
    assert.ok(css.includes('--pc-app-nav: calc(var(--ph-bottom-nav-height, 78px))'));
    assert.equal(/\.pc-actionbar \{[^}]*position: fixed/.test(css), false);
    const board = read(`${DIR}/steps/StepFormatPairing.js`);
    assert.ok(board.indexOf('className="pc-composer"') < board.indexOf('className="pc-pairing"'), 'thanh soạn cặp đứng trước danh sách');
    assert.ok(css.includes('.pc-composer { position: sticky; top: calc(var(--pc-app-header)'));
  },

  'giải đã chốt không mở lại setup; console coi có stage là đã có lịch'() {
    assert.ok(read(`${DIR}/SetupStudio.js`).includes("save.draft.state === 'finalized'"));
    const consoleSrc = read('app/giai-dau/v2/console/TournamentConsoleV2.js');
    assert.ok(consoleSrc.includes('return (stages || []).length > 0;'));
    assert.equal(stripComments(consoleSrc).includes('match_count'), false, 'API /stages không trả match_count');
  },

  'console không có editor setup thứ hai (chuyển từ ui-unified-wizard, ADR-006)'() {
    const consoleSrc = read('app/giai-dau/v2/console/TournamentConsoleV2.js');
    assert.equal(/DivisionSetupPanel/.test(consoleSrc), false, 'console không render setup editor riêng');
    assert.ok(/play_type === 'doubles' \? false/.test(consoleSrc), 'TeamsTab chỉ đọc với nội dung đôi');
    assert.equal(/setLive|status\s*[:=]\s*["']LIVE/.test(all), false, 'setup không tự chuyển LIVE');
  },
});
