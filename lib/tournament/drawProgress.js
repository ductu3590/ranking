'use strict';
// Thanh tiến độ % khi bốc thăm / cập nhật xem trước / chốt & tạo lịch (setup v3, mọi thể thức). Thuần, không I/O.
// API là MỘT request nên % là mô phỏng: chạy êm 0 → 90% trong lúc chờ (chậm dần), có kết quả thì 100%, giữ một nhịp
// rồi ẩn; tổng thời gian hiển thị tối thiểu để không nháy. Lỗi → caller ẩn ngay (không kẹt ở 90%).

const WAIT_CAP = 90;          // % tối đa khi còn chờ server
const EASE_MS = 1800;         // hằng số thời gian của đường cong chậm dần
const HOLD_MS = 350;          // giữ 100% trước khi ẩn
const MIN_VISIBLE_MS = 1000;  // tổng thời gian hiển thị tối thiểu (tính cả nhịp giữ 100%)
const TICK_MS = 120;          // nhịp cập nhật %
const LABEL_ON_BAR_FROM = 55; // chữ % ở giữa rãnh: từ mức này nằm trên phần thanh tím → chữ trắng

const LABELS = Object.freeze({
  draw: 'Đang bốc thăm…',
  preview: 'Đang cập nhật xem trước…',
  finalize: 'Đang chốt & tạo lịch…',
});

// % theo thời gian đã chờ: tăng đơn điệu, tiệm cận WAIT_CAP, không bao giờ vượt.
function simulatedPercent(elapsedMs) {
  const t = Math.max(0, Number(elapsedMs) || 0);
  return Math.min(WAIT_CAP, Math.round(WAIT_CAP * (1 - Math.exp(-t / EASE_MS))));
}

// Chờ thêm bao lâu (ms) sau khi có kết quả rồi mới ẩn: luôn giữ ≥ HOLD_MS ở 100%, và tổng ≥ MIN_VISIBLE_MS.
function finishDelay(elapsedMs) {
  const t = Math.max(0, Number(elapsedMs) || 0);
  return Math.max(HOLD_MS, MIN_VISIBLE_MS - t);
}

function progressLabel(action) {
  return LABELS[action] || LABELS.draw;
}

function labelOnBar(percent) {
  return Number(percent) >= LABEL_ON_BAR_FROM;
}

// Kết quả coi là thành công: mọi thứ trừ { ok: false } (draw/finalize của studio trả { ok }).
function isSuccess(result) {
  return !(result && typeof result === 'object' && result.ok === false);
}

module.exports = {
  WAIT_CAP, EASE_MS, HOLD_MS, MIN_VISIBLE_MS, TICK_MS, LABEL_ON_BAR_FROM, LABELS,
  simulatedPercent, finishDelay, progressLabel, labelOnBar, isSuccess,
};
