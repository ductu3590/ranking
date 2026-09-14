'use strict';

// Ai được ĐỌC dữ liệu riêng của một CLB: sổ quỹ, danh sách thành viên, sự kiện
// đóng quỹ, ảnh BXH.
//
// Khác getClubReadContext(): hàm này KHÔNG có nhánh rơi về CLB mặc định.
// getClubReadContext() kết thúc bằng getDefaultGroupContext() (group_id = 1,
// signed: false) nên route đọc nào dùng nó cũng lặng lẽ mở dữ liệu CLB #1 cho
// người gọi ẩn danh. Trang /quy và /bxh có gác bằng permissions.canViewClub,
// nhưng cổng đó nằm ở trình duyệt — gọi thẳng API là đi vòng qua được.
//
// Tách thành hàm thuần (không cookie, không next/headers) để test bằng node.

const CLUB_READ_UNAUTHORIZED = Object.freeze({ ok: false, status: 401, error: 'Unauthorized' });

function toGroupId(value) {
  if (value === null || value === undefined || value === '') return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// `signed: false` / `is_default: true` là dấu hiệu của ngữ cảnh mặc định do
// getDefaultGroupContext() dựng ra. Chặn ngay tại đây để dù ai lỡ truyền nó vào
// thì vẫn không mở được dữ liệu CLB.
function usableContext(context) {
  if (!context || context.signed === false || context.is_default === true) return null;
  const groupId = toGroupId(context.group_id);
  return groupId ? { groupId, role: context.role, context } : null;
}

function decideClubReadScope({ athleteContext, clubSession } = {}) {
  // Vé VĐV thắng phiên CLB dùng chung còn sót lại trên trình duyệt — giữ đúng
  // thứ tự ưu tiên mà getClubReadContext() đã đặt ra.
  const athlete = usableContext(athleteContext);
  if (athlete) return { ok: true, ...athlete };

  const session = usableContext(clubSession);
  if (session) return { ok: true, ...session };

  return { ...CLUB_READ_UNAUTHORIZED };
}

module.exports = { CLUB_READ_UNAUTHORIZED, decideClubReadScope };
