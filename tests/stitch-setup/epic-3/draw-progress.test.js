'use strict';
// Thanh tiến độ % khi bốc thăm / cập nhật xem trước / chốt & tạo lịch — mọi thể thức, nội bộ lẫn giao hữu.
// Chạy thật hàm thuần lib/tournament/drawProgress.js + hợp đồng component/CSS.

const { assert, read, lib, suite } = require('../_harness');

const src = (file) => read(file).replace(/\r\n?/g, '\n');
const P = lib('lib/tournament/drawProgress.js');
const SETUP = 'app/giai-dau/v2/setup-v3';

suite('thanh tiến độ bốc thăm — hàm thuần', {
  '% mô phỏng: 0 lúc đầu, tăng đơn điệu, chậm dần, không vượt 90% khi còn chờ'() {
    assert.equal(P.simulatedPercent(0), 0);
    let previous = -1;
    for (let t = 0; t <= 60000; t += 100) {
      const value = P.simulatedPercent(t);
      assert.ok(value >= previous && value <= 90, `t=${t}: ${value}`);
      previous = value;
    }
    assert.ok(P.simulatedPercent(1000) - P.simulatedPercent(0) > P.simulatedPercent(5000) - P.simulatedPercent(4000), 'chậm dần');
    assert.equal(P.simulatedPercent(60000), 90);
    assert.equal(P.simulatedPercent(-5), 0);
  },

  'xong: giữ ≥ 300–400ms ở 100%, tổng hiển thị ≥ 1s để không nháy'() {
    assert.ok(P.HOLD_MS >= 300 && P.HOLD_MS <= 400);
    assert.equal(P.MIN_VISIBLE_MS, 1000);
    assert.equal(P.finishDelay(100), 900, 'request nhanh → kéo dài tới 1s');
    assert.equal(P.finishDelay(5000), P.HOLD_MS, 'request lâu → chỉ giữ một nhịp');
    for (const t of [0, 200, 650, 999, 3000]) assert.ok(t + P.finishDelay(t) >= 1000 && P.finishDelay(t) >= P.HOLD_MS);
  },

  'nhãn theo hành động; lỗi / { ok: false } → ẩn thanh; chữ % trắng chỉ khi nằm trên phần thanh'() {
    assert.equal(P.progressLabel('draw'), 'Đang bốc thăm…');
    assert.equal(P.progressLabel('preview'), 'Đang cập nhật xem trước…');
    assert.equal(P.progressLabel('finalize'), 'Đang chốt & tạo lịch…');
    assert.equal(P.isSuccess({ ok: false }), false);
    assert.equal(P.isSuccess({ ok: true }), true);
    assert.equal(P.isSuccess(undefined), true);
    assert.equal(P.labelOnBar(10), false, 'thanh còn ngắn → chữ on-surface trên rãnh sáng');
    assert.equal(P.labelOnBar(100), true);
  },
});

suite('thanh tiến độ bốc thăm — component, gắn 4 hành động, CSS', {
  'component: role progressbar + aria-valuenow/min/max + aria-label; 5 hạt; chữ % ở giữa'() {
    const c = src(`${SETUP}/DrawProgress.js`);
    assert.ok(c.includes('role="progressbar"') && c.includes('aria-valuemin={0}') && c.includes('aria-valuemax={100}') && c.includes('aria-valuenow={value}') && c.includes('aria-label={label}'));
    assert.equal((c.match(/className="pc-progress__dot"/g) || []).length, 5);
    assert.ok(c.includes('data-on-bar={labelOnBar(value) || undefined}'));
    assert.ok(c.includes('if (!isSuccess(result))') && c.includes('catch (error)') && (c.match(/setProgress\(null\)/g) || []).length >= 3, 'lỗi → ẩn, không kẹt 90%');
  },

  'gắn cho Bốc thăm, Bốc thăm lại / Bốc lại, Cập nhật xem trước (qua onDraw) và Chốt & tạo lịch — không đổi lời gọi API'() {
    const studio = src(`${SETUP}/SetupStudio.js`);
    assert.ok(studio.includes("runWithProgress(action === 'preview' ? 'preview' : 'draw', () => draw(action))"));
    assert.ok(studio.includes("runWithProgress('finalize', () => finalize())"));
    assert.ok(studio.includes('progress={drawProgress}'));
    const step = src(`${SETUP}/steps/StepDraw.js`);
    for (const call of ["onDraw('draw')", "onDraw('preview')"]) assert.ok(step.includes(call), call);
    assert.ok(step.includes("if (progress && progress.action !== 'finalize') return <DrawProgress"), 'bốc thăm/xem trước: thanh thay chỗ khu kết quả');
    assert.ok(step.includes("{progress?.action === 'finalize' ? <DrawProgress action=\"finalize\""), 'chốt: thanh thay chỗ khối chốt');
    assert.ok(studio.includes('setBusy(true);') && studio.includes('finally { setBusy(false); }'), 'nút bị khoá trong lúc chạy');
  },

  'CSS: token DESIGN.md sáng, không nền tối của mẫu gốc, có prefers-reduced-motion, rãnh ≤ 500px'() {
    const css = src(`${SETUP}/studio.css`);
    const block = css.slice(css.indexOf('/* ---------- Thanh tiến độ %'));
    assert.ok(block.length > 200);
    for (const token of ['--pc-track: #dce9ff', '--pc-outline-variant: #ccc3d8', '--pc-secondary-container: #645efb', '--pc-on-surface: #0b1c30']) {
      assert.ok(css.includes(token), `thiếu token ${token}`);
    }
    assert.ok(block.includes('linear-gradient(90deg, var(--pc-brand-600), var(--pc-secondary-container))'));
    assert.ok(block.includes('height: 20px; border-radius: 30px; overflow: hidden;') && block.includes('max-width: 500px'));
    assert.ok(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*animation: none/.test(block));
    assert.equal(/#090a0f|#0{3,6}\b|background: #000/i.test(block), false, 'không nền tối của mẫu gốc');
    const design = new Set((read('_workspace/stitch-internal-setup/canonical/DESIGN.md').match(/#[0-9a-f]{6}\b/gi) || []).map((hex) => hex.toLowerCase()));
    for (const hex of block.match(/#[0-9a-f]{3,6}\b/gi) || []) assert.ok(hex.toLowerCase() === '#fff' || design.has(hex.toLowerCase()), `màu ngoài token: ${hex}`);
    assert.ok(block.includes('font-size: 10px; font-weight: 800; letter-spacing: 1px;'));
  },
});
