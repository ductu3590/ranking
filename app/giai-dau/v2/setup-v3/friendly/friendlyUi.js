import { MESSAGES, messageFor } from '@/lib/tournament/setupMessages';

// Tiện ích hiển thị dùng chung cho màn giao hữu (chủ nhà + CLB khách). Không I/O.

// Câu lỗi: ưu tiên câu tiếng Việt của server (đã qua setupMessages), rồi câu theo mã; không bao giờ hiện mã thô.
export function errorText(error, fallback = 'Có lỗi xảy ra. Thử lại sau.') {
  const code = error?.code;
  const params = error?.details?.params;
  if (code && MESSAGES[code]) return messageFor(code, params).text;
  const message = String(error?.message || '');
  if (message && message !== 'Request failed' && !/^[A-Z_]+$/.test(message) && !/fetch/i.test(message)) return message;
  return fallback;
}

// Chữ cái đại diện CLB: bỏ tiền tố "CLB" để các CLB không cùng ra chữ "C" (ghi chú Stitch §3.4).
export function clubInitial(name) {
  const text = String(name || '').replace(/^\s*(CLB|Câu lạc bộ)\s+/i, '').trim();
  return (text.charAt(0) || '?').toUpperCase();
}

// Chữ cái cuối của tên người (như danh sách thành viên ở setup).
export function personInitial(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return (parts[parts.length - 1] || '?').charAt(0).toUpperCase();
}

const VN_TZ = 'Asia/Ho_Chi_Minh';

export function timeLabel(iso) {
  const date = new Date(iso || '');
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: VN_TZ });
}

export function dateTimeLabel(iso) {
  const date = new Date(iso || '');
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: VN_TZ });
  return `${timeLabel(iso)} · ${day}`;
}

// Hạn chót nhập theo giờ Việt Nam: "YYYY-MM-DD" + "HH:MM" → ISO có múi giờ +07:00 (route đòi có múi giờ).
export function deadlineToIso(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  const hhmm = /^\d{2}:\d{2}$/.test(time || '') ? time : '23:59';
  return `${date}T${hhmm}:00+07:00`;
}

export function isoToDeadlineParts(iso) {
  const date = new Date(iso || '');
  if (Number.isNaN(date.getTime())) return { date: '', time: '23:59' };
  const local = new Date(date.getTime() + 7 * 3600 * 1000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

// Lớp màu chip trạng thái lời mời (FRD-01): nhãn luôn lấy từ statusLabel của API.
export const STATUS_TONE = {
  invited: 'wait',
  accepted: 'reg',
  roster_submitted: 'review',
  changes_requested: 'fix',
  approved: 'ok',
  declined: 'off',
  withdrawn: 'off',
};

export function StatusChip({ status, label }) {
  if (!label) return null;
  return <span className="fr-status" data-tone={STATUS_TONE[status] || 'wait'}>{label}</span>;
}

// Bộ đếm cặp theo D51: hạn mức là mức tối đa — "2 cặp (tối đa 3)", chỉ đỏ khi vượt.
export function pairCounterText(count, quota) {
  return quota == null ? `${count} cặp` : `${count} cặp (tối đa ${quota})`;
}
