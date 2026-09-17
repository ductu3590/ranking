// Cau noi giua cac phan cua trang Cau hinh CLB.
//
// Truoc day luu mot thay doi (logo, QR quy, tai khoan ngan hang, ket noi SePay)
// xong thi thanh "Thiet lap CLB" van hien tien do cu — phai F5 moi thay. Cac
// phan nay khong phai cha-con cua nhau nen khong truyen prop duoc; dung mot su
// kien tren window la cach nhe nhat.
//
// Ben luu goi notifyClubSettingsChanged(); ben hien thi dang ky
// onClubSettingsChanged(handler) de tu tai lai.

export const CLUB_SETTINGS_CHANGED = 'club-settings-changed';

export function notifyClubSettingsChanged() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event(CLUB_SETTINGS_CHANGED));
}

// Tra ve ham huy dang ky, dung thang trong useEffect.
export function onClubSettingsChanged(handler) {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener(CLUB_SETTINGS_CHANGED, handler);
    return () => window.removeEventListener(CLUB_SETTINGS_CHANGED, handler);
}
