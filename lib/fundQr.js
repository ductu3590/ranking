// PickHub tu sinh QR nhan quy tu tai khoan da khai voi SePay.
//
// Vi sao van "di qua SePay": SePay khong dung giua dong tien, no chi doc bien
// dong so du cua tai khoan ngan hang da lien ket roi ban webhook ve PickHub
// (xem app/api/webhook/route.js). Dieu kien DUY NHAT de mot khoan tien duoc ghi
// so tu dong la tien phai vao dung group_bank_accounts.account_number cua CLB.
// Vi vay module nay CHI ghep anh QR tu chinh so tai khoan da luu — khong tu bia
// ra so nao khac, khong dung tai khoan ao (VA).
//
// Hai nha cung cap anh QR. Uu tien SePay: dung ha tang cua chinh dich vu dang
// ghi nhan giao dich cho CLB, dung tinh than "van di qua SePay" ma anh Tu chot.
// vietqr.app chi la duong lui khi SePay loi/timeout.
//
// GHI CHU KIEM CHUNG (2026-09-22): tu sandbox trien khai, ca hai endpoint anh
// — https://qr.sepay.vn/img va https://vietqr.app/img — deu KHONG phan hoi
// (TCP/TLS bat tay xong nhung khong tra du lieu, het han sau 20-45s) khi goi
// bang curl, kem ca khi gia lap User-Agent trinh duyet. https://vietqr.app/
// (trang goc) tra 403 Cloudflare cho cung request. Day co the la chan bot cua
// Cloudflare doi voi IP datacenter cua moi truong build/sandbox, KHONG chac la
// hai endpoint that su hong voi trinh duyet nguoi dung that. Vi khong co tin
// hieu phan biet duoc provider nao thuc su loi, GIU NGUYEN thu tu mac dinh theo
// ke hoach (['sepay','vietqr']) va de co che thu-lan-luot (QR_PROVIDERS) trong
// route xu ly | phai kiem tra lai bang trinh duyet/thiet bi that truoc khi phat
// QR cho CLB that (xem cach kiem thu tay #3-#4 trong ke hoach).
const SEPAY_QR_IMAGE_BASE = 'https://qr.sepay.vn/img';
const VIETQR_IMAGE_BASE = 'https://vietqr.app/img';
const QR_PROVIDERS = ['sepay', 'vietqr']; // dung lam thu tu thu lan luot

// bin  : ma BIN NAPAS 6 so — chuoi ca hai nha cung cap deu chap nhan cho tham so `bank`
// code : ten ngan cua VietQR (vd 'MBBank') — de hien thi/tuong thich nguoc
// name : ten tieng Viet hien tren <select>
// Doi chieu voi danh sach BIN cong khai cua NAPAS/VietQR (napas.com.vn, vietqr.vn).
const FUND_QR_BANKS = [
    { bin: '970425', code: 'ABBANK', name: 'ABBANK (An Bình)' },
    { bin: '970416', code: 'ACB', name: 'ACB' },
    { bin: '970405', code: 'Agribank', name: 'Agribank' },
    { bin: '970409', code: 'BacABank', name: 'Bac A Bank' },
    { bin: '970418', code: 'BIDV', name: 'BIDV' },
    { bin: '970454', code: 'BVBank', name: 'BVBank (Bản Việt)' },
    { bin: '970431', code: 'Eximbank', name: 'Eximbank' },
    { bin: '970437', code: 'HDBank', name: 'HDBank' },
    { bin: '970449', code: 'LPBank', name: 'LPBank (Bưu điện Liên Việt)' },
    { bin: '970422', code: 'MBBank', name: 'MB Bank (Quân đội)' },
    { bin: '970426', code: 'MSB', name: 'MSB (Hàng Hải)' },
    { bin: '970428', code: 'NamABank', name: 'Nam Á Bank' },
    { bin: '970448', code: 'OCB', name: 'OCB (Phương Đông)' },
    { bin: '970412', code: 'PVcomBank', name: 'PVcomBank' },
    { bin: '970403', code: 'Sacombank', name: 'Sacombank' },
    { bin: '970429', code: 'SCB', name: 'SCB (Sài Gòn)' },
    { bin: '970440', code: 'SeABank', name: 'SeABank' },
    { bin: '970443', code: 'SHB', name: 'SHB' },
    { bin: '970423', code: 'TPBank', name: 'TPBank' },
    { bin: '970407', code: 'Techcombank', name: 'Techcombank' },
    { bin: '970415', code: 'VietinBank', name: 'VietinBank' },
    { bin: '970436', code: 'Vietcombank', name: 'Vietcombank' },
    { bin: '970441', code: 'VIB', name: 'VIB' },
    { bin: '970432', code: 'VPBank', name: 'VPBank' },
].sort((a, b) => a.name.localeCompare(b.name, 'vi'));

function findBank(codeOrBin) {
    const value = String(codeOrBin || '').trim();
    if (!value) return null;
    return FUND_QR_BANKS.find((b) => b.code === value || b.bin === value) || null;
}

function isSupportedBankCode(codeOrBin) {
    return Boolean(findBank(codeOrBin));
}

// Dung mot QR image base + provider cu the de dung URL.
function buildQrImageUrl({ provider, bankCode, accountNumber, accountHolder = '', template = 'compact' }) {
    const acc = String(accountNumber || '').trim();
    if (!acc) throw new Error('Thiếu số tài khoản để tạo mã QR.');

    const bank = findBank(bankCode);
    if (!bank) throw new Error('Ngân hàng không hợp lệ.');

    const holder = String(accountHolder || '').trim();

    if (provider === 'sepay') {
        const params = new URLSearchParams({
            acc,
            bank: bank.bin,
            template,
            download: 'false',
        });
        return `${SEPAY_QR_IMAGE_BASE}?${params.toString()}`;
    }

    if (provider === 'vietqr') {
        // SUA VONG 3 (Reviewer #15): 'qronly' la ten template cua SePay.
        // vietqr.app dung ten khac cho cung y nghia: 'qr_only'. Chi doi rieng
        // gia tri nay khi goi vietqr, giu nguyen 'compact' (giong nhau ca hai).
        const vietqrTemplate = template === 'qronly' ? 'qr_only' : template;
        const params = new URLSearchParams({
            bank: bank.bin,
            acc,
            template: vietqrTemplate,
            showinfo: 'true',
        });
        if (holder) params.set('holder', holder);
        return `${VIETQR_IMAGE_BASE}?${params.toString()}`;
    }

    throw new Error(`Nhà cung cấp QR không hợp lệ: ${provider}`);
}

// Che bot so tai khoan khi hien ra ngoai: giu 4 so dau va 2 so cuoi. Ban sao
// cua lib/sepayVerify.js#maskAccountNumber — KHONG import truc tiep tu do vi
// sepayVerify.js keo theo lib/sepayWebhookAuth.js (require('crypto'), module
// Node core) se lam vo build client-side. lib/fundQr.js phai giu thuan tuy de
// FundQrShare.js (client component) import an toan.
function maskAccountNumber(accountNumber) {
    const value = String(accountNumber || '').trim();
    if (value.length <= 6) return value;
    return `${value.slice(0, 4)}${'•'.repeat(Math.max(2, value.length - 6))}${value.slice(-2)}`;
}

// SUA VONG 4: xoa buildShareMessage() — nut "Sao chep loi nhan" da bo theo yeu
// cau anh Tu (thay bang goi y "sao chep anh QR roi ghim vao nhom Zalo CLB"
// hien thang trong FundQrShare.js). Cau nhac "ghi HO TEN trong noi dung
// chuyen khoan" (ly do: lib/transaction-parser.js gan ten nguoi nop bang cach
// quet noi dung chuyen khoan) van con, chuyen thang thanh JSX tinh trong
// FundQrShare.js thay vi qua ham dung chuoi nay.

module.exports = {
    SEPAY_QR_IMAGE_BASE,
    VIETQR_IMAGE_BASE,
    QR_PROVIDERS,
    FUND_QR_BANKS,
    findBank,
    isSupportedBankCode,
    maskAccountNumber,
    buildQrImageUrl,
};
