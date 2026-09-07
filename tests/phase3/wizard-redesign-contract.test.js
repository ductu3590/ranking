const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exit(1); } };

// Wizard đã tách khỏi một-file: TournamentWizard.js điều phối, các bước nằm
// trong app/giai-dau/v2/wizard/*. Kiểm hành vi trên toàn bộ nguồn wizard gộp lại
// (file điều phối + các component con) để refactor cấu trúc không phá contract.
function readWizardSource() {
    let src = read('app/giai-dau/v2/TournamentWizard.js');
    const dir = path.join(root, 'app/giai-dau/v2/wizard');
    if (fs.existsSync(dir)) {
        for (const file of fs.readdirSync(dir)) {
            if (file.endsWith('.js')) src += '\n' + fs.readFileSync(path.join(dir, file), 'utf8');
        }
    }
    return src;
}

assert(exists('app/api/tournament-v2/preview-schedule/route.js'), 'route preview tồn tại');
const rt = read('app/api/tournament-v2/preview-schedule/route.js');
assert(rt.includes('requireValidatedGroupAdmin'), 'preview có admin guard');
assert(rt.includes('buildSchedulePreview'), 'preview dùng schedulePreview');
assert(!/\.rpc\(|\.insert\(|\.update\(/.test(rt), 'preview không ghi database');

const cl = read('lib/tournamentV2Client.js');
assert(cl.includes('export function previewSchedule'), 'client export previewSchedule');

// Các file bước sau khi tách.
for (const part of ['StepConfig', 'StepInfo', 'StepRegister', 'LivePreview']) {
    assert(exists('app/giai-dau/v2/wizard/' + part + '.js'), 'có component wizard/' + part + '.js');
}

const w = readWizardSource();
for (const label of ['Thể thức', 'Thông tin giải', 'Đăng ký']) assert(w.includes(label), 'wizard có bước "' + label + '"');
assert(/showStep|setStep|currentStep|step\s*===\s*1|useState\(1\)/.test(w), 'wizard có điều hướng bước');
assert(w.includes('/api/groups/session'), 'wizard đọc quyền từ session server');
assert(w.includes('previewSchedule'), 'wizard gọi previewSchedule');
for (const t of ['Đơn vị vào sân', 'Tính thành tích', 'Số ván', 'Cấu hình trận đội']) assert(w.includes(t), 'bước 1 có nhóm "' + t + '"');
for (const t of ['Vòng tròn', 'Loại trực tiếp 1 nhánh', 'Loại trực tiếp 2 nhánh', 'Vòng bảng']) assert(w.includes(t), 'thể thức "' + t + '"');
assert(w.includes('engine đang xây'), 'double elim đánh dấu cần engine');
assert(w.includes('Cộng đồng') && w.includes('disabled'), 'ô cộng đồng khoá');
for (const t of ['Tên giải', 'Link chia sẻ', 'Mô tả', 'Poster']) assert(w.includes(t), 'bước 2 có "' + t + '"');
assert(/slugify|normalize\("NFD"\)|normalize\('NFD'\)/.test(w), 'slug tự sinh từ tên');
assert(w.includes('Người chơi') && w.includes('Ghép cặp'), 'nội bộ: người + ghép cặp');
assert(w.includes('Các đội') && w.includes('Chia ngẫu nhiên'), 'nội bộ đội: chia đội');
assert(w.includes('CLB được mời') && w.includes('Hạn nộp'), 'giao hữu: mời + hạn');
assert(w.includes('Link đăng ký') && w.includes('Hạn đăng ký'), 'cộng đồng: link + hạn');

// Nối dữ liệu thật (thay dữ liệu mẫu): roster CLB thật + CLB PickHub mời được,
// và bỏ PHR giả (samplePhr). Cảnh báo PHR chỉ là thông tin, không chặn bước.
assert(w.includes('listClubRoster'), 'wizard nối roster CLB thật (listClubRoster)');
assert(w.includes('listAvailableTournamentClubs'), 'wizard nối danh sách CLB PickHub mời được');
assert(!w.includes('samplePhr'), 'bỏ PHR giả (samplePhr) khỏi wizard');

console.log('phase3 wizard redesign contract: preview ok');
