const fs = require('fs');
const path = require('path');
// Epic 2 E1: ControlStep được thay bằng mục "Điều hành" (control/ControlCenter.js); giữ các cam kết cũ.
const source = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'giai-dau', 'v2', 'console', 'control', 'ControlCenter.js'), 'utf8');
const assert = (condition, message) => { if (!condition) { console.error(`FAIL: ${message}`); process.exit(1); } };
assert(/transitionMatch/.test(source) && /getOperationsBoard/.test(source), 'đổi trạng thái và đọc view model điều hành');
for (const label of ['Gọi vào sân', 'Bắt đầu đấu', 'Tạm dừng', 'Nhập tỉ số']) assert(source.includes(label), `có nút ${label}`);
assert(/mic|Thẻ đọc|đọc mic/.test(source), 'thẻ đọc mic');
assert(!/speechSynthesis|SpeechSynthesis|DUPR|Live Stream|livestream/i.test(source), 'không có tính năng ngoài phạm vi');
assert(/TB mỗi trận|trung bình/.test(source), 'số liệu thật');
assert(!/#[0-9a-fA-F]{6}/.test(source), 'không hardcode màu');
assert(!/Ghi điểm \/ Chốt/.test(source), 'không chốt trận không kèm tỉ số');
console.log('ui-control-step contract ok');
