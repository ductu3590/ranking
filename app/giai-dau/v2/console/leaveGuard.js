'use client';

// Chặn rời khi còn tỉ số chưa lưu (spec Epic 2, Lát E1 §6.1). Sheet nhập tỉ số đăng ký một handler;
// shell gọi requestLeave(proceed) trước khi đổi mục. Handler trả true = đã chặn (tự hiện hộp xác nhận
// và gọi proceed nếu người dùng chọn "Bỏ thay đổi").

let activeHandler = null;

export function registerLeaveGuard(handler) {
  activeHandler = handler;
  return () => {
    if (activeHandler === handler) activeHandler = null;
  };
}

export function requestLeave(proceed) {
  if (activeHandler && activeHandler(proceed)) return true;
  proceed();
  return false;
}
