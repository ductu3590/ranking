// Trang thai "thiet lap CLB lan dau".
//
// Nguyen tac: SUY RA, DUNG LUU. Nam trong sau buoc deu suy ra duoc tu du lieu
// that (logo, danh sach thanh vien, QR quy, tai khoan ngan hang, giai dau) nen
// khong bao gio lech. Chi hai su kien thuan UI phai luu trong bang groups:
// onboarding_seen_at va onboarding_dismissed_at (migration 053).
//
// "Chia se ma CLB" KHONG phai mot buoc co trang thai: no la hanh dong bam mot
// phat, khong de lai dau vet. No nam o header checklist duoi dang shareAction
// va khong dem vao tien do.
//
// File nay la logic thuan, khong goi Supabase, khong dung React -> test runtime
// that duoc bang node (tests/club-onboarding.test.js).

// Cac hanh dong client duoc phep gui len PATCH /api/club/onboarding.
const ONBOARDING_ACTIONS = ['mark_welcome_seen', 'dismiss', 'restore'];

const STEP_KEYS = ['identity', 'roster', 'fund_qr', 'sepay', 'tournament'];

function toCount(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function hasText(value) {
    return typeof value === 'string' && value.trim() !== '';
}

// Mot buoc co ba trang thai. "warning" danh cho truong hop gan xong nhung con
// rui ro that, hien chi co dung mot: da khai tai khoan ngan hang nhung chua bat
// khoa bao mat -> webhook dang chay khong xac thuc.
function buildSepayStep(facts) {
    const hasAccount = Boolean(facts.hasActiveBankAccount);
    const hasSecret = Boolean(facts.hasWebhookSecret);
    const done = hasAccount && hasSecret;

    let state = 'todo';
    let warning = null;
    if (done) {
        state = 'done';
    } else if (hasAccount && !hasSecret) {
        state = 'warning';
        warning = 'Đã có tài khoản ngân hàng nhưng chưa bật khoá bảo mật.';
    }

    return {
        key: 'sepay',
        title: 'Bật Auto Quỹ — tiền vào tự động lên sổ',
        description: 'Ai chuyển tiền vào quỹ là PickHub ghi sổ và gán đúng tên, thủ quỹ không phải gõ tay dòng nào.',
        done,
        state,
        warning,
        meta: { hasActiveBankAccount: hasAccount, hasWebhookSecret: hasSecret },
        // Neo toi section SePay ngay trong trang Cau hinh de checklist cuon tai cho.
        // Deep-link ?huong-dan=sepay de danh cho Phan B (wizard ghep noi).
        href: '/admin#set-sepay',
        cta: done ? 'Xem lại' : 'Thiết lập Auto Quỹ với SePay',
    };
}

function buildSteps(facts) {
    const memberCount = toCount(facts.memberCount);
    const tournamentCount = toCount(facts.tournamentCount);
    const hasLogo = hasText(facts.logoUrl);
    const hasFundQr = hasText(facts.fundQrUrl);

    return [
        {
            key: 'identity',
            title: 'Thêm logo và kiểm tra tên CLB',
            description: 'Logo hiển thị trên trang chủ và ảnh chia sẻ.',
            done: hasLogo,
            state: hasLogo ? 'done' : 'todo',
            warning: null,
            meta: {},
            href: '/admin#set-brand',
            cta: hasLogo ? 'Xem lại' : 'Thêm logo',
        },
        {
            key: 'roster',
            title: 'Thêm thành viên đầu tiên',
            description: memberCount > 0
                ? `Đã có ${memberCount} thành viên.`
                : 'Có danh sách thành viên thì quỹ mới tự nhận ra ai vừa chuyển tiền.',
            done: memberCount > 0,
            state: memberCount > 0 ? 'done' : 'todo',
            warning: null,
            meta: { memberCount },
            href: '/thanh-vien',
            cta: memberCount > 0 ? 'Quản lý thành viên' : 'Thêm thành viên',
        },
        {
            key: 'fund_qr',
            title: 'Tải ảnh QR nhận quỹ',
            description: 'Thành viên quét QR này để chuyển tiền vào quỹ CLB.',
            done: hasFundQr,
            state: hasFundQr ? 'done' : 'todo',
            warning: null,
            meta: {},
            href: '/admin#set-qr',
            cta: hasFundQr ? 'Xem lại' : 'Tải ảnh QR',
        },
        buildSepayStep(facts),
        {
            key: 'tournament',
            title: 'Tạo giải đấu đầu tiên',
            description: 'Sinh lịch, bảng xếp hạng và sơ đồ loại trực tiếp tự động.',
            done: tournamentCount > 0,
            state: tournamentCount > 0 ? 'done' : 'todo',
            warning: null,
            meta: { tournamentCount },
            href: '/giai-dau/v2',
            cta: tournamentCount > 0 ? 'Xem giải' : 'Tạo giải',
        },
    ];
}

function buildOnboardingState(facts = {}) {
    const steps = buildSteps(facts);
    const completedCount = steps.filter((step) => step.done).length;
    const totalCount = steps.length;
    const isComplete = completedCount === totalCount;

    const dismissedAt = facts.dismissedAt || null;
    const hasSeenWelcome = Boolean(facts.seenAt);

    return {
        // Server tinh san de client khong phai suy luan.
        visible: !dismissedAt && !isComplete,
        hasSeenWelcome,
        dismissedAt,
        completedCount,
        totalCount,
        isComplete,
        steps,
        // Hanh dong o header checklist, khong dem vao tien do.
        // Khong kem anh QR data-URL: GET /api/club/settings da sinh anh do roi,
        // checklist duoc fetch o nhieu trang nen khong duoc keo theo chi phi ay.
        shareAction: {
            clubCode: facts.clubCode || null,
            joinUrl: facts.joinUrl || null,
        },
    };
}

function isValidOnboardingAction(action) {
    return ONBOARDING_ACTIONS.includes(action);
}

module.exports = {
    ONBOARDING_ACTIONS,
    STEP_KEYS,
    buildOnboardingState,
    isValidOnboardingAction,
};
