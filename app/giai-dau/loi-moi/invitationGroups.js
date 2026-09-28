// Nhóm lời mời giải giao hữu của CLB khách (spec Epic 3 F3 §4.3, Stitch FRD-04). Thuần, không I/O — hộp lời mời
// và thẻ lối vào trên dashboard dùng chung để con số "(n)" khớp nhóm "Cần bạn xử lý".

export const NEED_ACTION_STATUSES = ['invited', 'changes_requested'];
const CLOSED_STATUSES = ['declined', 'withdrawn'];

export function invitationGroup(item) {
  if (!item) return 'done';
  if (item.finalized || CLOSED_STATUSES.includes(item.status)) return 'done';
  if (NEED_ACTION_STATUSES.includes(item.status) && item.window?.open) return 'need';
  return 'active';
}

export function groupInvitations(items) {
  const groups = { need: [], active: [], done: [] };
  for (const item of Array.isArray(items) ? items : []) groups[invitationGroup(item)].push(item);
  return groups;
}

export function needActionCount(items) {
  return groupInvitations(items).need.length;
}

// "Còn 2 ngày" / "Còn 5 giờ" / "Hết hạn hôm nay" — chỉ khi có hạn chót và cửa sổ đang mở.
export function deadlineLeft(deadline, now = Date.now()) {
  const end = Date.parse(deadline || '');
  if (!Number.isFinite(end)) return '';
  const ms = end - now;
  if (ms <= 0) return 'Đã qua hạn';
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return 'Còn dưới 1 giờ';
  if (hours < 24) return `Còn ${hours} giờ`;
  return `Còn ${Math.floor(hours / 24)} ngày`;
}

export function deadlineLabel(deadline) {
  const date = new Date(deadline || '');
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
  const day = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
  return `${time} · ${day}`;
}

export function eventLabel(tournament) {
  const parts = [];
  if (tournament?.eventDate) {
    const date = new Date(`${tournament.eventDate}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      parts.push(date.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' }));
    }
  }
  if (tournament?.startTime) parts.push(String(tournament.startTime).slice(0, 5));
  return parts.join(' · ');
}
