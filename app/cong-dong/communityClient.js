// Tiện ích phía client dùng chung cho khu /cong-dong (Epic 4 C2). Không truy vấn cơ sở dữ liệu: mọi dữ liệu đi qua API route.

export async function api(url, { method = 'GET', body } = {}) {
    try {
        const response = await fetch(url, {
            method,
            credentials: 'same-origin',
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined,
        });
        const data = await response.json().catch(() => ({}));
        return { ok: response.ok, status: response.status, data, retryAfter: Number(response.headers.get('Retry-After')) || 0 };
    } catch {
        return { ok: false, status: 0, data: { error: 'Không kết nối được máy chủ. Vui lòng thử lại.' }, retryAfter: 0 };
    }
}

export function errorText(result, fallback = 'Có lỗi xảy ra. Vui lòng thử lại.') {
    return result?.data?.error || fallback;
}

const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

// "2026-10-18" → "18/10/2026"; withWeekday → "Thứ Bảy 18/10/2026". Không phụ thuộc múi giờ máy (chỉ đọc ngày trong chuỗi).
export function formatDate(value, { withWeekday = false } = {}) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
    if (!match) return '';
    const [, year, month, day] = match;
    const text = `${day}/${month}/${year}`;
    if (!withWeekday) return text;
    const weekday = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay();
    return `${WEEKDAYS[weekday]} ${text}`;
}

export function formatDateTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// 150000 → "150.000đ"
export function formatVnd(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return 'Miễn phí';
    return `${number.toLocaleString('vi-VN')}đ`;
}

export function initialOf(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    return (parts[parts.length - 1] || '?').charAt(0).toUpperCase();
}

// Nội dung đôi Nam-Nữ / Nam / Nữ / Đơn — tên chip hiển thị theo dữ liệu thật (tên nội dung do admin đặt).
export function loginUrl(nextPath, tab = 'dang-nhap') {
    return `/cong-dong/tai-khoan?tab=${tab}&next=${encodeURIComponent(nextPath)}`;
}
