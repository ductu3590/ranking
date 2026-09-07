const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exit(1); } };

// C1: GET danh sách giải cộng đồng
const f = 'app/api/tournament-v2/public/community/route.js';
assert(exists(f), 'route community tồn tại');
const s = read(f);
assert(!s.includes('requireValidatedGroupAdmin'), 'public: không dùng admin guard');
assert(s.includes('organizer_mode') && s.includes('open_registration'), 'lọc giải cộng đồng đang mở');
assert(/visibility/.test(s), 'chỉ giải unlisted/public');

// C2: GET chi tiết + POST nộp
const rf = 'app/api/tournament-v2/public/registration/route.js';
assert(exists(rf), 'route registration tồn tại');
const rs = read(rf);
assert(/export async function GET/.test(rs) && /export async function POST/.test(rs), 'có GET + POST');
assert(rs.includes('public_slug'), 'resolve theo slug');
assert(rs.includes('isRegistrationOpen'), 'POST kiểm tra cổng mở');
assert(rs.includes('validateSubmission'), 'POST dùng validateSubmission domain');
assert(rs.includes('contact_phone_norm'), 'chống trùng theo SĐT');
assert(!rs.includes('requireValidatedGroupAdmin'), 'public: không admin guard');

// C3: GET trạng thái theo token/SĐT
const sf = 'app/api/tournament-v2/public/registration/status/route.js';
assert(exists(sf), 'route status tồn tại');
const ss = read(sf);
assert(ss.includes('track_token') && ss.includes('phone'), 'tra theo token hoặc SĐT');

// C4: Pair-invite công khai
const pf = 'app/api/tournament-v2/public/pair-invite/route.js';
assert(exists(pf), 'route pair-invite tồn tại');
const ps = read(pf);
assert(/export async function POST/.test(ps) && /export async function PATCH/.test(ps), 'POST tạo + PATCH phản hồi');
assert(ps.includes('track_token'), 'xác thực bằng token của VĐV');
assert(ps.includes('tournament_pair_invites'), 'ghi bảng lời mời');

// D1: divisions PATCH nhận cấu hình mở đăng ký
const df = 'app/api/tournament-v2/divisions/route.js';
const ds = read(df);
for (const k of ['registration_open', 'registration_capacity', 'registration_deadline', 'allow_late_registration', 'gender_mode']) {
  assert(ds.includes(k), 'divisions PATCH nhận ' + k);
}

// D2: board GET
const bf = 'app/api/tournament-v2/registrations/board/route.js';
assert(exists(bf), 'route board tồn tại');
const bs = read(bf);
assert(bs.includes('requireValidatedGroupAdmin') || bs.includes('requireTournamentAccess'), 'admin guard');
assert(bs.includes('waitlistView'), 'dùng waitlistView domain');
assert(bs.includes("'approved'") && bs.includes("'submitted'") && bs.includes("'awaiting_partner'"), 'phân nhóm trạng thái');

// D3: registrations PATCH hành động open-reg
const regf = 'app/api/tournament-v2/registrations/route.js';
const regs2 = read(regf);
for (const a of ['admit', 'remove', 'restore', 'pair', 'approve_pair']) assert(regs2.includes(a), 'PATCH hỗ trợ action ' + a);
assert(regs2.includes('canAdmit') || regs2.includes('transitionOpenRegistration'), 'dùng domain open-reg');

// E1: client helpers
const cl = read('lib/tournamentV2Client.js');
for (const fn of ['listCommunityTournaments', 'getPublicRegistration', 'submitPublicRegistration', 'getRegistrationStatus', 'sendPairInvite', 'respondPairInvite', 'getRegistrationBoard', 'reviewOpenRegistration']) {
  assert(cl.includes('export function ' + fn) || cl.includes('export async function ' + fn), 'client có ' + fn);
}

console.log('open-registration api contract: OK');
