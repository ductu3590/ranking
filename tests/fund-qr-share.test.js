// Test PickHub tu sinh QR nhan quy.
//
// Phan 1: chay THAT logic thuan cua lib/fundQr.js (khong mock, khong mang).
// Phan 2: contract test cho route / component / migration / checklist.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };

const {
    QR_PROVIDERS,
    FUND_QR_BANKS,
    findBank,
    isSupportedBankCode,
    buildQrImageUrl,
} = require('../lib/fundQr');

// ---------------------------------------------------------------- runtime ---

// 1. URL SePay: dung base, dung tham so, khong nhung amount/des.
{
    const url = buildQrImageUrl({ provider: 'sepay', bankCode: 'MBBank', accountNumber: '962814888' });
    assert(url.startsWith('https://qr.sepay.vn/img'), `phai bat dau bang qr.sepay.vn, nhan ${url}`);
    assert(url.includes('acc=962814888'), 'phai chua acc=so tai khoan');
    assert(url.includes('bank=970422'), 'phai chua bank=BIN cua MBBank');
    assert(url.includes('template=compact'), 'template mac dinh phai la compact');
    assert(!url.includes('amount='), 'KHONG duoc nhung amount');
    assert(!url.includes('des='), 'KHONG duoc nhung des');
}

// 2. URL VietQR: cung rang buoc.
{
    const url = buildQrImageUrl({ provider: 'vietqr', bankCode: 'MBBank', accountNumber: '962814888' });
    assert(url.startsWith('https://vietqr.app/img'), `phai bat dau bang vietqr.app, nhan ${url}`);
    assert(url.includes('acc=962814888'), 'phai chua acc=so tai khoan');
    assert(url.includes('bank=970422'), 'phai chua bank=BIN cua MBBank');
    assert(!url.includes('amount='), 'KHONG duoc nhung amount');
    assert(!url.includes('des='), 'KHONG duoc nhung des');
}

// 2b. SUA VONG 3 #15: 'qronly' la ten template cua SePay; vietqr.app dung ten
// khac ('qr_only') cho cung y nghia. Duong lui "anh qua 200KB" phai doi dung
// ten cho tung provider, khong duoc gui nguyen 'qronly' sang vietqr.
{
    const sepayUrl = buildQrImageUrl({ provider: 'sepay', bankCode: 'MBBank', accountNumber: '962814888', template: 'qronly' });
    assert(sepayUrl.includes('template=qronly'), `SePay phai giu nguyen template=qronly, nhan ${sepayUrl}`);

    const vietqrUrl = buildQrImageUrl({ provider: 'vietqr', bankCode: 'MBBank', accountNumber: '962814888', template: 'qronly' });
    assert(vietqrUrl.includes('template=qr_only'), `vietqr phai doi template=qronly thanh qr_only, nhan ${vietqrUrl}`);
    assert(!vietqrUrl.includes('template=qronly'), `vietqr khong duoc gui nguyen template=qronly, nhan ${vietqrUrl}`);
}

// 3. SePay phai la nha cung cap thu dau tien.
{
    assert(QR_PROVIDERS[0] === 'sepay', `QR_PROVIDERS[0] phai la 'sepay', nhan ${QR_PROVIDERS[0]}`);
}

// 4. Thieu du lieu / du lieu la -> nem loi.
{
    let threw = false;
    try { buildQrImageUrl({ provider: 'sepay', bankCode: 'MBBank', accountNumber: '' }); } catch { threw = true; }
    assert(threw, 'thieu accountNumber phai nem loi');

    threw = false;
    try { buildQrImageUrl({ provider: 'sepay', bankCode: 'KhongTonTai', accountNumber: '123' }); } catch { threw = true; }
    assert(threw, 'bankCode la phai nem loi');

    threw = false;
    try { buildQrImageUrl({ provider: 'khongtontai', bankCode: 'MBBank', accountNumber: '123' }); } catch { threw = true; }
    assert(threw, 'provider la phai nem loi');
}

// 5. Ten chu tai khoan co dau/khoang trang -> encodeURIComponent, khong con khoang trang tho.
{
    const url = buildQrImageUrl({
        provider: 'vietqr', bankCode: 'MBBank', accountNumber: '962814888', accountHolder: 'Nguyễn Văn A',
    });
    assert(!url.includes(' '), `URL khong duoc chua khoang trang tho: ${url}`);
    assert(url.includes('holder='), 'phai co tham so holder khi co ten chu tai khoan');
}

// 6. SUA VONG 4: buildShareMessage() da bi xoa khoi lib/fundQr.js (nut "Sao
// chep loi nhan" bi bo theo yeu cau anh Tu — xem test 9b/11 ben duoi). Kiem
// tra KHONG con ton tai de tranh ai do vo tinh them lai ham chet.
{
    const fundQr = require('../lib/fundQr');
    assert(!('buildShareMessage' in fundQr), 'buildShareMessage phai da bi xoa khoi lib/fundQr.js (khong con noi nao goi)');
}

// 7. FUND_QR_BANKS: khong trung bin/code, bin dung dinh dang, co name.
{
    assert(FUND_QR_BANKS.length >= 24, `phai co it nhat 24 ngan hang, nhan ${FUND_QR_BANKS.length}`);
    const bins = new Set();
    const codes = new Set();
    for (const b of FUND_QR_BANKS) {
        assert(/^\d{6}$/.test(b.bin), `bin phai la 6 chu so, nhan ${b.bin} (${b.code})`);
        assert(typeof b.name === 'string' && b.name.trim() !== '', `${b.code} phai co name`);
        assert(!bins.has(b.bin), `bin ${b.bin} bi trung`);
        assert(!codes.has(b.code), `code ${b.code} bi trung`);
        bins.add(b.bin);
        codes.add(b.code);
    }
}

// isSupportedBankCode / findBank hop le voi ca code lan bin.
{
    assert(isSupportedBankCode('MBBank'), 'MBBank phai hop le');
    assert(isSupportedBankCode('970422'), 'BIN 970422 phai hop le');
    assert(!isSupportedBankCode('KhongTonTai'), 'ma la khong duoc hop le');
    assert(findBank('MBBank')?.bin === '970422', 'findBank phai tra dung bin cho MBBank');
}

// 7b. SUA VONG 3 #12 (Reviewer): NEO CUNG gia tri BIN that cho 8 ngan hang pho
// bien — test 7 truoc day chi kiem TINH TOAN VEN (du 6 so, khong trung), KHONG
// kiem TINH DUNG: neu ai do go nham Vietcombank thanh BIN cua HDBank (970437),
// test 7 van xanh 100% vi 970437 van la 6 so va khong con ai khac dung no nua
// (HDBank cung doi theo). Day la diem nguy hiem nhat cua ca tinh nang (sai BIN
// = QR tro nham ngan hang, tien khong toi tai khoan quy) ma truoc gio test phu
// mong nhat. Doi chieu voi danh sach cong khai NAPAS/VietQR.
{
    const ANCHORED_BINS = {
        Vietcombank: '970436',
        BIDV: '970418',
        Techcombank: '970407',
        ACB: '970416',
        VPBank: '970432',
        Agribank: '970405',
        VietinBank: '970415',
        MBBank: '970422',
    };
    for (const [code, bin] of Object.entries(ANCHORED_BINS)) {
        const bank = findBank(code);
        assert(bank, `thieu ngan hang ${code} trong FUND_QR_BANKS`);
        assert(bank.bin === bin, `${code} phai co BIN ${bin}, nhan ${bank?.bin}`);
    }
}

// ---------------------------------------------------------------- contract ---

// 8. Route generate: admin guard, group-scope, co co che thu-lan-luot, khong DEFAULT_GROUP_ID.
{
    const f = 'app/api/club/fund-qr/generate/route.js';
    assert(exists(f), `thieu ${f}`);
    const src = read(f);
    assert(src.includes('requireValidatedGroupAdmin'), 'route phai dung requireValidatedGroupAdmin');
    assert(src.includes(".eq('group_id'"), 'moi truy van phai scope theo group_id');
    assert(src.includes('QR_PROVIDERS'), 'route phai dung QR_PROVIDERS de thu lan luot');
    assert(!src.includes('DEFAULT_GROUP_ID'), 'route moi khong duoc dung DEFAULT_GROUP_ID');
}

// 8b. SUA VONG 2 — ngan sach thoi gian phai du kip fallback truoc khi Vercel
// Hobby cat serverless function o 10s. Khong goi mang that, chi doc hang so tu
// source (regex) roi kiem tra logic toan hoc.
{
    const f = 'app/api/club/fund-qr/generate/route.js';
    const src = read(f);

    const grab = (name) => {
        const m = src.match(new RegExp(`const ${name}\\s*=\\s*(\\d+)`));
        assert(m, `thieu hang so ${name} trong route generate`);
        return Number(m[1]);
    };

    const primary = grab('PRIMARY_PROVIDER_TIMEOUT_MS');
    const fallback = grab('FALLBACK_PROVIDER_TIMEOUT_MS');
    const budget = grab('IMAGE_FETCH_BUDGET_MS');

    // SePay la provider dau (uu tien) nen phai duoc ngan sach NGAN hon —
    // that bai nhanh de nhuong thoi gian cho fallback, dung tinh than "provider
    // dau ngan sach ngan, phan con lai danh cho fallback".
    assert(primary < fallback, `provider dau (${primary}ms) phai co ngan sach ngan hon fallback (${fallback}ms)`);

    // Truong hop xau nhat: ca hai provider deu khong phan hoi (bi bo qua template
    // thu hai ngay) -> tong thoi gian toi da la primary + fallback. Phai nam
    // trong tran IMAGE_FETCH_BUDGET_MS (co che kiem ngan sach truoc moi lan thu
    // dam bao dieu nay du logic co doi khac di trong tuong lai).
    assert(primary + fallback <= budget + 1,
        `truong hop xau nhat (${primary}+${fallback}ms) phai nam trong ngan sach tong ${budget}ms`);

    // Ngan sach tong phai du nho de con margin an toan truoc tran cung 10s cua
    // Vercel Hobby, ke ca khi cong them vai giay cho cac truy van DB truoc/sau.
    assert(budget < 10000, `IMAGE_FETCH_BUDGET_MS (${budget}ms) phai duoi 10000ms (tran cung Vercel Hobby)`);
    assert(budget <= 8000, `IMAGE_FETCH_BUDGET_MS (${budget}ms) nen <= 8000ms de con margin cho truy van DB truoc/sau`);

    // Cau hinh cu (8000ms x 2 template x 2 provider = 32000ms toi da) khong
    // duoc quay lai — day chinh la loi da gay 504 o vong 1.
    assert(budget < 32000 && primary < 8000 && fallback < 8000,
        'khong duoc quay lai cau hinh timeout cu (8000ms/lan) da gay treo o vong 1');

    // SUA VONG 3 #17 (Reviewer): bo assert khop chuoi comment tieng Viet
    // "/KHONG thu qronly khi da timeout/i" — chi can sua lai cau chu la bao do
    // oan du logic khong doi. Khoi 8c ben duoi da kiem dung CAU TRUC code that
    // (continue/break) cho dieu nay, manh hon nhieu so voi khop chuoi comment.
}

// 8c. SUA VONG 2 — kiem tra CODE THAT (khong phai comment) thuc su thuc thi
// ngan sach thoi gian. Test 8b chi doc hang so + mot dong comment; khoi nay
// bam vao than ham generateQrImage de dam bao co che khong chi duoc mo ta
// bang loi ma con NAM TRONG CODE — neu ai do xoa dieu kien kiem ngan sach
// nhung giu nguyen comment, khoi 8b se khong bat duoc nhung khoi nay se bat.
{
    const f = 'app/api/club/fund-qr/generate/route.js';
    const src = read(f);

    const fnStart = src.indexOf('async function generateQrImage');
    const fnEnd = src.indexOf('\nasync function', fnStart + 1) === -1
        ? src.indexOf('// POST —', fnStart)
        : src.indexOf('\nasync function', fnStart + 1);
    assert(fnStart >= 0, 'thieu ham generateQrImage');
    const body = src.slice(fnStart, fnEnd > fnStart ? fnEnd : undefined);

    const minBudgetMatch = src.match(/const MIN_ATTEMPT_BUDGET_MS\s*=\s*(\d+)/);
    assert(minBudgetMatch, 'thieu hang so MIN_ATTEMPT_BUDGET_MS');

    // Kiem tra ngan sach CON LAI duoc tinh lai moi lan thu (khong phai mot
    // lan duy nhat ngoai vong lap), va co dieu kien dung han khi het ngan sach.
    assert(/const remaining\s*=\s*IMAGE_FETCH_BUDGET_MS\s*-\s*\(Date\.now\(\)\s*-\s*startedAt\)/.test(body),
        'generateQrImage phai tinh lai "remaining" tu Date.now() truoc moi lan thu (khong duoc tinh mot lan ngoai vong lap)');
    assert(/if\s*\(\s*remaining\s*<\s*MIN_ATTEMPT_BUDGET_MS\s*\)/.test(body),
        'generateQrImage phai co dieu kien dung han that su khi het ngan sach (remaining < MIN_ATTEMPT_BUDGET_MS)');
    assert(/return null/.test(body.slice(body.search(/if\s*\(\s*remaining\s*<\s*MIN_ATTEMPT_BUDGET_MS\s*\)/), body.search(/if\s*\(\s*remaining\s*<\s*MIN_ATTEMPT_BUDGET_MS\s*\)/) + 200)),
        'khi het ngan sach phai return null ngay (dung han that su, khong chi canh bao)');

    // Timeout cua TUNG lan goi phai bi CHAN TRAN boi ngan sach con lai — day la
    // dieu dam bao khong co lan fetch nao "an" het budget roi con vuot qua no.
    assert(/const timeout\s*=\s*Math\.min\(\s*baseTimeout\s*,\s*remaining\s*\)/.test(body),
        'moi lan goi fetch phai lay timeout = Math.min(baseTimeout, remaining) — khong duoc dung thang baseTimeout co dinh');

    // fetchQrImage phai nhan timeout ĐỘNG (bien, khong phai so hang-code) va
    // truyen thang vao AbortSignal.timeout — dam bao AbortSignal that su dung
    // gia tri ngan sach da tinh, khong phai mot hang so co dinh khac.
    assert(/async function fetchQrImage\(\s*url\s*,\s*timeoutMs\s*\)/.test(src),
        'fetchQrImage phai nhan tham so timeoutMs dong (khong hardcode timeout ben trong)');
    assert(/AbortSignal\.timeout\(\s*timeoutMs\s*\)/.test(src),
        'fetchQrImage phai truyen dung timeoutMs (bien dong) vao AbortSignal.timeout, khong phai hang so');
    assert(/await fetchQrImage\(\s*url\s*,\s*timeout\s*\)/.test(body),
        'generateQrImage phai goi fetchQrImage voi timeout da tinh tu Math.min(baseTimeout, remaining), khong phai hang so co dinh');

    // Kiem tra CAU TRUC dieu khien that (khong phai chi comment): nhanh "co
    // phan hoi nhung qua khich thuoc" phai co continue (thu qronly), va phai
    // co mot break DUNG SAU do (cho nhanh khong phan hoi) trong cung than ham.
    const okBranchIdx = body.indexOf('if (result.ok) {');
    assert(okBranchIdx >= 0, 'thieu nhanh "if (result.ok)" (anh qua kich thuoc) trong generateQrImage');
    const continueIdx = body.indexOf('continue;', okBranchIdx);
    assert(continueIdx > okBranchIdx, 'nhanh "anh qua kich thuoc" phai co continue (thu lai template khac cung provider)');
    const breakIdx = body.indexOf('break;', continueIdx);
    assert(breakIdx > continueIdx, 'phai co break SAU nhanh continue — nhanh "khong phan hoi" phai thoat vong template, khong thu qronly');
}

// 8d. SUA VONG 3 — Reviewer #6/#7/#8/#14 tren route generate. Khong goi mang
// that, chi kiem cau truc code.
{
    const f = 'app/api/club/fund-qr/generate/route.js';
    const src = read(f);

    // #6: khong duoc tra dataUrl hai lan (imageUrl phai la image.url — URL that
    // cua provider — khong phai chinh dataUrl vua gan cho fundQrUrl).
    assert(!/imageUrl:\s*dataUrl/.test(src), 'imageUrl khong duoc trung voi dataUrl (lam response phinh gap doi)');
    assert(/imageUrl:\s*image\.url/.test(src), 'imageUrl phai lay tu image.url (URL provider that su dung)');

    // #7: catch cuoi cung khong duoc ro ri err.message ra client.
    const lastCatchIdx = src.lastIndexOf('} catch (err) {');
    assert(lastCatchIdx >= 0, 'thieu catch cuoi cung trong POST');
    const catchBody = src.slice(lastCatchIdx, lastCatchIdx + 400);
    assert(!/error:\s*err\.message/.test(catchBody), 'catch cuoi cung khong duoc tra err.message ra client (ro ri loi noi bo)');
    assert(/console\.error/.test(catchBody), 'catch cuoi cung van phai console.error de con debug duoc tren server');

    // #8: account_holder khi update khong duoc ghi de vo dieu kien bang gia
    // tri co the rong — phai fallback ve gia tri cu neu admin khong nhap moi.
    assert(!/account_holder:\s*accountHolder \|\| null[,}]/.test(src),
        'account_holder khong duoc ghi `accountHolder || null` vo dieu kien — phai fallback ve account.account_holder khi accountHolder rong');
    assert(/accountHolder \|\| account\.account_holder \|\| null/.test(src),
        'phai co fallback account_holder || account.account_holder || null');

    // SUA VONG 4: buildShareMessage/shareMessage/loadGroupName da bi xoa khoi
    // route nay — khong con UI nao doc truong shareMessage sau khi bo nut
    // "Sao chep loi nhan" (xem tests 9b/11). #14 cua vong 3 (Promise.all gop
    // loadGroupName) vi vay cung khong con — chi con MOT lenh await loadAccount.
    // Chi kiem CODE THAT (loi goi ham / khai bao / truong response), khong
    // kiem toan bo chuoi — comment lich su duoc phep nhac ten cac thu da xoa
    // de giai thich boi canh, khong phai dau hieu con sot code chet.
    assert(!/buildShareMessage\(/.test(src), 'route generate khong duoc con goi buildShareMessage() (da xoa khoi lib/fundQr.js)');
    assert(!/shareMessage[,:]/.test(src), 'route generate khong duoc con khai bao/truong shareMessage trong response (khong ai doc nua)');
    assert(!/function loadGroupName/.test(src), 'route generate khong duoc con ham loadGroupName (chi ton tai de phuc vu buildShareMessage da bi xoa)');
    assert(/const account = await loadAccount\(/.test(src),
        'sau khi bo loadGroupName, route phai await loadAccount truc tiep (khong con ly do dung Promise.all voi mot tac vu duy nhat)');
}

// 8e. SUA VONG 3 #9 (Reviewer): POST /api/club/bank-accounts phai insert du
// ca bank_code LAN bank_bin — truoc day chi insert bank_code, bank_bin luon
// NULL cho toi khi ai do goi /api/club/fund-qr/generate, du lieu khong nhat quan.
{
    const f = 'app/api/club/bank-accounts/route.js';
    assert(exists(f), `thieu ${f}`);
    const src = read(f);
    assert(/bank_bin:\s*bank\?\.bin \|\| null/.test(src), 'POST bank-accounts phai insert bank_bin tu findBank(bankCode)');
}

// 9. Component FundQrShare: client, co du hanh dong, khong con huong dan copy tay.
{
    const f = 'components/pickhub/FundQrShare.js';
    assert(exists(f), `thieu ${f}`);
    const src = read(f);
    assert(src.trimStart().startsWith("'use client'"), 'FundQrShare phai la client component');
    assert(src.includes('download'), 'phai co nut tai anh (download)');
    assert(src.includes('notifyClubSettingsChanged'), 'phai bao khi tao QR xong de checklist tu cap nhat');
    assert(!src.includes('my.sepay.vn'), 'khong duoc con huong dan copy tay tu SePay trong luong moi');
    assert(!/from\s+['"]@\/lib\/supabase/.test(src), 'khong duoc goi Supabase truc tiep tu component');
    assert(exists('components/pickhub/FundQrShare.css'), 'thieu FundQrShare.css');
}

// 9b. SUA VONG 4 (anh Tu chot): bo nut "Chia se len Zalo/Messenger" va "Sao
// chep loi nhan" — chi con "Tai anh QR" + "Sao chep anh". Phai xoa sach code
// chet theo sau (canShare/File gia/handleShare/AbortError, shareMessage/
// clientShareMessage/effectiveShareMessage, clubName prop).
{
    const f = 'components/pickhub/FundQrShare.js';
    const src = read(f);

    // Hai nut bi bo phai KHONG con trong UI.
    assert(!src.includes('Chia sẻ lên Zalo / Messenger'), 'nut "Chia se len Zalo / Messenger" phai da bi bo');
    assert(!src.includes('Sao chép lời nhắn'), 'nut "Sao chep loi nhan" phai da bi bo');

    // Hai nut con lai van phai co.
    assert(src.includes('Tải ảnh QR'), 'phai giu nut "Tai anh QR"');
    assert(src.includes('Sao chép ảnh'), 'phai giu nut "Sao chep anh"');

    // Code chet cua nut chia se phai duoc don sach hoan toan — khong chi an di.
    assert(!src.includes('handleShare'), 'ham handleShare phai bi xoa (khong con nut goi no)');
    assert(!src.includes('canShare'), 'moi logic navigator.canShare (probe File gia, canShareFiles) phai bi xoa');
    assert(!src.includes('AbortError'), 'nhanh xu ly AbortError cua navigator.share phai bi xoa cung handleShare');
    assert(!/new File\(/.test(src), 'khong duoc con tao File gia de probe canShare');

    // Code chet cua loi nhan chia se (shareMessage) phai bi xoa sach.
    assert(!src.includes('shareMessage'), 'moi bien lien quan shareMessage (state, clientShareMessage, effectiveShareMessage) phai bi xoa');
    assert(!src.includes('buildShareMessage'), 'khong duoc con import/goi buildShareMessage (ham da bi xoa khoi lib/fundQr.js)');
    assert(!src.includes('copiedMsg'), 'state copiedMsg (cho nut sao chep loi nhan da bo) phai bi xoa');

    // clubName chi ton tai de phuc vu buildShareMessage — het ly do thi bo prop.
    assert(!src.includes('clubName'), 'prop clubName phai bi xoa (khong con noi nao dung sau khi bo shareMessage)');
    assert(!/export default function FundQrShare\(\{/.test(src),
        'FundQrShare khong con prop nao (variant/clubName da het y nghia) — chu ky ham phai la FundQrShare()');

    // Goi y moi (Viec 2): BAT BUOC phai nhac ghi HO TEN — day la cho DUY NHAT
    // con nhac dieu nay sau khi bo nut sao chep loi nhan. Thieu dong nay thi
    // lib/transaction-parser.js se khong gan duoc ten nguoi nop.
    assert(/HỌ TÊN/.test(src), 'khoi goi y phai nhac thanh vien ghi HO TEN trong noi dung chuyen khoan (BAT BUOC)');
    assert(/Zalo/.test(src) && /ghim/i.test(src), 'khoi goi y phai huong dan ghim anh vao nhom Zalo CLB');

    // #2 (giu nguyen tu vong 3): accountMismatch phai phan biet dung "chua tung
    // dung tinh nang" voi "tai khoan da doi", khong chi dua vao fundQrUrl+bank_code rong.
    assert(src.includes('hasOtherConfiguredAccount'), 'accountMismatch phai phan biet "chua tung dung tinh nang" voi "tai khoan da doi" bang mot tin hieu ro rang hon');
    const mismatchLineMatch = src.match(/const accountMismatch\s*=[^\n]*/);
    assert(mismatchLineMatch, 'thieu khai bao accountMismatch');
    assert(mismatchLineMatch[0].includes('hasOtherConfiguredAccount'),
        'bieu thuc accountMismatch phai THAT SU dung hasOtherConfiguredAccount (khong duoc chi khai bao bien roi khong dung)');

    // #4 (giu nguyen tu vong 3): van dung useId() cho id dong (an toan ke ca
    // component gio chi mount mot lan — tranh hoi sinh id co dinh).
    assert(/useId/.test(src), 'phai dung useId() cho id dong (an toan du component chi con mount mot lan)');
    assert(!/id="fqs-account"/.test(src) && !/id="fqs-bank"/.test(src) && !/id="fqs-holder"/.test(src),
        'khong duoc con id co dinh (fqs-account/fqs-bank/fqs-holder) — phai la id dong tu useId()');

    // #5 (giu nguyen tu vong 3): van nghe onClubSettingsChanged — /admin co
    // section #set-bank canh ben, them/xoa tai khoan o do phai lam FundQrShare tu tai lai.
    assert(src.includes('onClubSettingsChanged'), 'phai dang ky onClubSettingsChanged de tu tai lai khi cai dat khac tren /admin thay doi');

    // #10 (giu nguyen tu vong 3): van phai che so tai khoan khi hien thi.
    assert(src.includes('maskAccountNumber'), 'phai dung maskAccountNumber khi hien so tai khoan ra man hinh');

    // #11 (giu nguyen tu vong 3): copy anh thanh cong phai bao THANH CONG.
    const copyImageIdx = src.indexOf('async function handleCopyImage');
    assert(copyImageIdx >= 0, 'thieu handleCopyImage');
    const copyImageBody = src.slice(copyImageIdx, src.indexOf('const canClipboardImage'));
    assert(/setCopiedImage\(true\)/.test(copyImageBody), 'sao chep anh thanh cong phai bao thanh cong (setCopiedImage(true))');
    assert(!/setCopiedImage\(false\)/.test(copyImageBody.slice(0, copyImageBody.indexOf('setCopiedImage(true)') + 1)),
        'khong duoc con setCopiedImage(false) ngay sau khi sao chep anh thanh cong');
}

// 10. Onboarding: sepay phai dung truoc fund_qr.
{
    const { STEP_KEYS } = require('../lib/clubOnboarding');
    const sepayIdx = STEP_KEYS.indexOf('sepay');
    const fundQrIdx = STEP_KEYS.indexOf('fund_qr');
    assert(sepayIdx >= 0 && fundQrIdx >= 0, 'STEP_KEYS phai co ca sepay va fund_qr');
    assert(sepayIdx < fundQrIdx, 'sepay phai dung truoc fund_qr trong STEP_KEYS');
}

// 11. SUA VONG 4 (anh Tu chot, bo dieu kien): muc "QR nhan quy thanh vien"
// (#set-qr) — gom ca FundQrShare lan khoi upload thu cong — phai bi xoa han
// khoi ClubSettings.js. Khong con duong dat anh QR tay cho CLB chua ket noi
// SePay — day la he qua anh Tu da duoc canh bao va van chon.
{
    const src = read('app/admin/ClubSettings.js');
    assert(!src.includes('handlePickFundQr'), 'handlePickFundQr (tai anh QR thu cong) phai bi xoa — khong con UI nao goi');
    assert(!src.includes('handleSaveFundQr'), 'handleSaveFundQr (luu anh QR thu cong) phai bi xoa — khong con UI nao goi');
    assert(!src.includes('FundQrShare'), 'ClubSettings.js khong duoc con truc tiep import/mount FundQrShare (gio chi con o SepayConnect.js)');
    assert(!/id="set-qr"/.test(src), 'section id="set-qr" phai bi xoa han');
    assert(!src.includes('fundQrUrl'), 'state fundQrUrl (rieng cho upload thu cong) phai bi xoa');

    // Duong du lieu goc PHAI con nguyen — khong duoc dong theo (rui ro thua,
    // anh Tu da chot khong dung SQL/migration, khong xoa cot).
    const settingsRoute = read('app/api/club/settings/route.js');
    assert(settingsRoute.includes('fundQrUrl') && settingsRoute.includes('fund_qr_url'),
        'app/api/club/settings/route.js phai GIU NGUYEN nhanh xu ly fundQrUrl (duong du lieu, khong duoc dong theo UI)');
}

// CSS .set-qr-* (rieng cho khoi da bo) phai khong con trong club-settings.css.
{
    const css = read('app/admin/club-settings.css');
    assert(!/\.set-qr-/.test(css), 'CSS .set-qr-* (khoi upload thu cong da bo) phai duoc don sach');
}

// ClubSettingsNav khong duoc con lien ket chet toi #set-qr.
{
    const nav = read('components/pickhub/ClubSettingsNav.js');
    assert(!nav.includes("'set-qr'"), "ClubSettingsNav khong duoc con muc id: 'set-qr' — se thanh lien ket chet");
}

// Checklist onboarding: buoc fund_qr phai tro toi #set-sepay (noi QR that su
// nam), khong con tro toi #set-qr da bi xoa. Dung THAT ham buildOnboardingState
// de kiem dung DONG bien fund_qr, khong phai chi kiem chuoi ton tai dau do
// trong file (vi buoc sepay cung dung href '/admin#set-sepay', kiem chuoi don
// thuan se luon xanh du co sua dung buoc fund_qr hay khong).
{
    const { buildOnboardingState } = require('../lib/clubOnboarding');
    const state = buildOnboardingState({ clubCode: 'TEST', joinUrl: 'https://pickhub.vn/join?group=TEST' });
    const fundQrStep = state.steps.find((s) => s.key === 'fund_qr');
    assert(fundQrStep, 'thieu buoc fund_qr trong checklist onboarding');
    assert(fundQrStep.href === '/admin#set-sepay', `buoc fund_qr phai href '/admin#set-sepay', nhan ${fundQrStep.href}`);
}

// 12. Migration 089: additive, khong DROP/TRUNCATE.
{
    const f = 'database/migrations/089_group_bank_account_qr.sql';
    assert(exists(f), `thieu ${f}`);
    const sql = read(f);
    assert(sql.includes('ADD COLUMN IF NOT EXISTS'), '089 phai dung ADD COLUMN IF NOT EXISTS');
    const statements = sql.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n');
    assert(!/\bDROP\b/i.test(statements), '089 khong duoc chua DROP');
    assert(!/\bTRUNCATE\b/i.test(statements), '089 khong duoc chua TRUNCATE');
}

// SepayConnect phai gan FundQrShare o man da ket noi, va them buoc 5 vao stepper.
{
    const src = read('components/pickhub/SepayConnect.js');
    assert(src.includes('FundQrShare'), 'SepayConnect phai gan FundQrShare o man da ket noi');
    assert(src.includes('Phát QR cho cả nhóm'), 'SETUP_STEPS phai co buoc "Phát QR cho cả nhóm"');
}

console.log('fund-qr-share: ok');
