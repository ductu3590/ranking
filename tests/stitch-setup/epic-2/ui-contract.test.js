'use strict';
// Epic 2 E1 §2, §5, §6: shell 4 mục, mục Điều hành, sheet nhập tỉ số (đọc mã nguồn).

const { read, exists, lib, assert, suite } = require('../_harness');

const shell = read('app/giai-dau/v2/console/ConsoleShell.js');
const consoleSource = read('app/giai-dau/v2/console/TournamentConsoleV2.js');
const control = read('app/giai-dau/v2/console/control/ControlCenter.js');
const sheet = read('app/giai-dau/v2/console/control/ScoreSheet.js');
const css = read('app/giai-dau/v2/console/control/control.css') + read('app/giai-dau/v2/console/shell.css');

// Bảng ánh xạ link cũ phải có đích cho mọi khóa của console 8 bước trước Epic 2.
const OLD_TAB_KEYS = ['overview', 'results', 'standings', 'bracket', 'teams', 'openreg', 'settings'];
const OLD_STEP_KEYS = ['config', 'courts', 'athletes', 'draw', 'control', 'schedule', 'standings', 'log'];

function evalShellMaps() {
  const pick = (name) => {
    const match = new RegExp(`export const ${name} = (\\{[\\s\\S]*?\\});`).exec(shell);
    assert.ok(match, name);
    return Function(`return (${match[1]});`)();
  };
  return { tabs: pick('LEGACY_TAB_TO_STEP'), steps: pick('LEGACY_STEP_TO_STEP') };
}

suite('epic-2 · ui contract', {
  'shell đúng 4 mục, có thanh tab đáy, không nhóm chuẩn bị': () => {
    const labels = [...shell.matchAll(/\{ key: '(\w+)', label: '([^']+)'/g)].map((match) => [match[1], match[2]]);
    assert.deepEqual(labels, [['control', 'Điều hành'], ['matches', 'Trận đấu'], ['bracket', 'Sơ đồ & xếp hạng'], ['settings', 'Cài đặt']]);
    assert.match(shell, /v2-console-tabbar/);
    assert.match(css, /\.v2-console-tabbar \{ position: fixed/);
    assert.doesNotMatch(shell, /Chuẩn bị|Trung tâm điều hành|drawer/);
  },
  'link cũ: mọi khóa có đích; overview→control, openreg→settings': () => {
    const { tabs, steps } = evalShellMaps();
    for (const key of OLD_TAB_KEYS) assert.ok(tabs[key], `tab=${key}`);
    for (const key of OLD_STEP_KEYS) assert.ok(steps[key], `step=${key}`);
    assert.equal(tabs.overview, 'control');
    assert.equal(tabs.openreg, 'settings');
    assert.equal(steps.schedule, 'matches', 'finalize redirect ?step=schedule vẫn tới Trận đấu');
  },
  'đổi mục đi qua requestLeave (chặn rời khi chưa lưu)': () => {
    assert.match(shell, /requestLeave\(/);
    assert.match(sheet, /registerLeaveGuard\(/);
    assert.match(sheet, /beforeunload/);
    assert.match(sheet, /popstate/);
    assert.match(sheet, /Bạn có tỉ số chưa lưu/);
  },
  'mục Điều hành: không chuỗi kỹ thuật, không chốt không tỉ số': () => {
    for (const bad of ['Trận #', 'needs_call', 'Ghi điểm / Chốt', "'live'}", 'Đội A', 'Đội B']) {
      assert.ok(!control.includes(bad), bad);
      assert.ok(!sheet.includes(bad), bad);
    }
    assert.doesNotMatch(control, /to: 'finalized'/);
    assert.match(control, /Gọi vào sân…/);
    assert.doesNotMatch(control, /draggable|onDrag/, 'D33: không kéo-thả');
  },
  'W.O./bỏ cuộc gọi withdrawMatch với kind; hủy gọi cần lý do': () => {
    assert.match(control, /withdrawMatch\(\{ match_id: match\.id, loser_entry_id: loserEntryId, reason, kind \}\)/);
    assert.match(control, /to: 'pending', reason/);
  },
  'sheet: không có ô chọn BO; luật chỉ đọc; trận đã chốt không có nút lưu': () => {
    assert.doesNotMatch(sheet, /BO1<|BO3<|BO5<|updateRoundRule/);
    assert.match(sheet, /ops-rule-chip/);
    // E2: trận đã chốt chỉ sửa qua "Sửa kết quả" (corrections), không có nút lưu/chốt (ADR-006 mục E2).
    assert.match(sheet, /const readOnly = !isAdmin \|\| \(finalized && !correcting\)/);
    assert.match(sheet, /\{!readOnly && !finalized \? <footer/);
  },
  'xung đột phiên bản: không lưu một chạm, đã chốt thì không sửa đè': () => {
    const keepMine = sheet.slice(sheet.indexOf('function keepMine'), sheet.indexOf('function keepMine') + 260);
    assert.doesNotMatch(keepMine, /save\(/, '"Sửa tiếp từ tỉ số của tôi" không tự lưu');
    assert.match(sheet, /MATCH_VERSION_CONFLICT/);
    assert.match(sheet, /serverFinalized/);
  },
  'ResultsTab: stage v4 không còn ô BO theo lượt, không "Đội A/B"': () => {
    const results = read('app/giai-dau/v2/console/tabs/ResultsTab.js');
    assert.match(results, /fixedRules=\{Boolean\(stage\?\.config\?\.scoring\)\}/);
    assert.match(results, /fixedRules \|\| group\.locked \|\| !isAdmin/);
    assert.doesNotMatch(results, /'Đội A'|'Đội B'/);
  },
  'ControlStep cũ đã gỡ': () => {
    assert.ok(!exists('app/giai-dau/v2/console/steps/ControlStep.js'));
    assert.doesNotMatch(consoleSource, /ControlStep/);
    assert.match(consoleSource, /<ControlCenter/);
  },
  'mobile: sheet dạng bottom sheet, ô điểm ≥ 44px': () => {
    assert.match(css, /\.ops-sheet-backdrop \{ place-items: end stretch/);
    assert.match(css, /\.ops-step \{ width: 44px; height: 44px/);
  },
  'module client dùng được trong trình duyệt (CommonJS thuần)': () => {
    const { matchLabel } = lib('lib/tournament/matchLabels');
    assert.equal(typeof matchLabel, 'function');
  },
});
