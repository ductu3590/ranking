'use strict';
// Epic 4 · C2 — domain đăng ký cộng đồng (spec lat-c2-dang-ky-ghep-cap.md §3, D56–D60). Thuần, không DB.

const { assert, lib, suite } = require('../_harness');

const reg = lib('lib/tournament/communityRegistration.js');
const pub = lib('lib/tournament/communityPublic.js');
const link = lib('lib/tournament/communityPartnerLink.js');
const messages = lib('lib/tournament/communityMessages.js');
const { safeNext } = lib('lib/domain/identity/safeNext.js');

const MIXED = { entrant_type: 'pair', gender_mode: 'mixed', rating_cap: 3.5, age_min: null, age_max: null, entry_fee: 150000 };
const MENS = { entrant_type: 'pair', gender_mode: 'male', rating_cap: null, age_min: null, age_max: null, entry_fee: 0 };
const SINGLES = { entrant_type: 'individual', gender_mode: null, rating_cap: null, entry_fee: 0 };
const PLAYER = { displayName: 'Nguyễn Minh', gender: 'male', dob: '1990-01-02', selfDeclaredPhr: 3.25 };
const submit = (division, patch = {}) => reg.validateCommunitySubmission({ division, account: PLAYER, partnerMode: 'need', ...patch });

suite('C2 gửi đăng ký', {
  'đôi thiếu bạn: needsPartner, ghế 1 lấy từ hồ sơ tài khoản': () => {
    const result = submit(MIXED);
    assert.equal(result.ok, true);
    assert.equal(result.value.needsPartner, true);
    assert.equal(result.value.partnerPhoneNorm, null);
    assert.deepEqual({ ...result.value.seat1 }, { fullName: 'Nguyễn Minh', gender: 'male', dob: '1990-01-02', selfDeclaredPhr: 3.25 });
  },
  'đôi đã có bạn: chuẩn hóa SĐT bạn, không needsPartner': () => {
    const result = submit(MIXED, { partnerMode: 'have', partnerPhone: '+84 987 654 321' });
    assert.equal(result.ok, true);
    assert.equal(result.value.needsPartner, false);
    assert.equal(result.value.partnerPhoneNorm, '0987654321');
  },
  'đã có bạn nhưng SĐT sai hoặc thiếu': () => {
    assert.equal(submit(MIXED, { partnerMode: 'have', partnerPhone: '12' }).code, 'COMMUNITY_PARTNER_PHONE_INVALID');
    assert.equal(submit(MIXED, { partnerMode: 'have' }).code, 'COMMUNITY_PARTNER_PHONE_INVALID');
  },
  'đôi bắt buộc chọn cách ghép': () => {
    assert.equal(submit(MIXED, { partnerMode: undefined }).code, 'COMMUNITY_PARTNER_MODE_REQUIRED');
    assert.equal(submit(MIXED, { partnerMode: 'x' }).code, 'COMMUNITY_PARTNER_MODE_REQUIRED');
  },
  'nội dung đơn: không cần bạn ghép, bỏ qua partnerMode': () => {
    const result = submit(SINGLES, { partnerMode: undefined });
    assert.equal(result.ok, true);
    assert.equal(result.value.needsPartner, false);
    assert.equal(result.value.partnerPhoneNorm, null);
  },
  'nội dung Nam-Nữ cần giới tính, có PHR cap cần PHR tự khai': () => {
    assert.equal(reg.validateCommunitySubmission({ division: MIXED, account: { ...PLAYER, gender: null }, partnerMode: 'need' }).code, 'COMMUNITY_GENDER_REQUIRED');
    assert.equal(reg.validateCommunitySubmission({ division: MIXED, account: { ...PLAYER, selfDeclaredPhr: null }, partnerMode: 'need' }).code, 'COMMUNITY_PHR_REQUIRED');
    assert.equal(reg.validateCommunitySubmission({ division: { ...MIXED, gender_mode: 'male', rating_cap: null, age_min: 18 }, account: { ...PLAYER, dob: null }, partnerMode: 'need' }).code, 'COMMUNITY_DOB_REQUIRED');
    assert.equal(submit(MENS, { account: { displayName: 'A', gender: null, dob: null, selfDeclaredPhr: null } }).ok, true);
  },
  'thiếu tên hiển thị trong hồ sơ bị từ chối': () => {
    assert.equal(reg.validateCommunitySubmission({ division: MENS, account: { ...PLAYER, displayName: '' }, partnerMode: 'need' }).code, 'PLAYER_NAME_INVALID');
    assert.equal(reg.validateCommunitySubmission({ division: MENS, account: null, partnerMode: 'need' }).code, 'PLAYER_SESSION_REQUIRED');
  },
});

suite('C2 ghép cặp Nam-Nữ và trạng thái', {
  'kiểm giới tính hai ghế nội dung Nam-Nữ': () => {
    assert.equal(reg.checkPairGenders({ gender_mode: 'mixed' }, ['male', 'female']).ok, true);
    assert.equal(reg.checkPairGenders({ gender_mode: 'mixed' }, ['female', 'male']).ok, true);
    assert.equal(reg.checkPairGenders({ gender_mode: 'mixed' }, ['male', 'male']).code, 'COMMUNITY_MIXED_GENDER_REQUIRED');
    assert.equal(reg.checkPairGenders({ gender_mode: 'mixed' }, ['male', null]).code, 'COMMUNITY_MIXED_GENDER_REQUIRED');
    assert.equal(reg.checkPairGenders({ gender_mode: 'male' }, ['male', 'male']).ok, true);
  },
  'trạng thái hiển thị cho VĐV': () => {
    const st = (status, extra = {}) => reg.communityRegistrationState({ status, ...extra });
    assert.deepEqual({ ...st('awaiting_partner') }, { key: 'awaiting_partner', label: 'Chờ bạn ghép', tone: 'warn' });
    assert.equal(st('submitted').label, 'Chờ duyệt');
    assert.equal(st('submitted', { waitlistPosition: 2 }).label, 'Danh sách chờ #2');
    assert.equal(st('submitted', { waitlistPosition: 2 }).tone, 'warn');
    assert.equal(st('approved').label, 'Đã duyệt');
    assert.equal(st('approved').tone, 'ok');
    assert.equal(st('rejected').label, 'Bị từ chối');
    assert.equal(st('withdrawn').label, 'Đã rút');
    assert.equal(st('merged').label, 'Đã ghép cặp');
    assert.equal(st('khong-co').label, 'Không xác định');
  },
  'giải đã chốt danh sách thì đơn bị khóa': () => {
    assert.equal(reg.isRegistrationLocked('draft'), false);
    assert.equal(reg.isRegistrationLocked('registration_open'), false);
    for (const status of ['scheduled', 'live', 'completed', 'archived']) assert.equal(reg.isRegistrationLocked(status), true, status);
  },
  'trạng thái phí': () => {
    assert.deepEqual({ ...reg.feeState({ entryFee: 0, feeConfirmedAt: null }) }, { key: 'free', label: 'Miễn phí', tone: 'ok' });
    assert.equal(reg.feeState({ entryFee: null }).key, 'free');
    assert.deepEqual({ ...reg.feeState({ entryFee: 150000, feeConfirmedAt: null }) }, { key: 'unpaid', label: 'Chưa thu', tone: 'warn' });
    assert.deepEqual({ ...reg.feeState({ entryFee: 150000, feeConfirmedAt: '2026-09-29T00:00:00Z' }) }, { key: 'paid', label: 'Đã xác nhận thu', tone: 'ok' });
  },
  'hành động admin theo trạng thái, chặn duyệt khi đủ hạn mức': () => {
    const actions = (status, extra = {}) => reg.nextAdminActions({ status, hasFee: true, feeConfirmed: false, capacityFull: false, ...extra }).map((a) => a.action + (a.disabled ? '!' : ''));
    assert.deepEqual(actions('submitted'), ['admit', 'reject', 'fee_confirm']);
    assert.deepEqual(actions('submitted', { capacityFull: true }), ['admit!', 'reject', 'fee_confirm']);
    assert.deepEqual(actions('approved', { feeConfirmed: true }), ['remove', 'fee_unconfirm']);
    assert.deepEqual(actions('rejected', { hasFee: false }), ['restore']);
    assert.deepEqual(actions('awaiting_partner', { hasFee: false }), ['withdraw']);
    assert.deepEqual(actions('withdrawn', { hasFee: false }), []);
    assert.deepEqual(actions('merged', { hasFee: false }), []);
  },
  'mã lỗi cộng đồng đều có thông điệp tiếng Việt': () => {
    for (const code of reg.COMMUNITY_ERRORS) {
      const text = messages.messageFor(code);
      assert.notEqual(text, messages.GENERIC_MESSAGE, `thiếu thông điệp cho ${code}`);
      assert.ok(text.length > 5, code);
    }
    assert.ok(Object.isFrozen(reg.COMMUNITY_ERRORS));
    for (const code of ['COMMUNITY_NOT_OPEN', 'COMMUNITY_DEADLINE_PASSED', 'COMMUNITY_ALREADY_REGISTERED', 'COMMUNITY_ALREADY_PAIRED',
      'COMMUNITY_CAPACITY_FULL', 'COMMUNITY_INVITE_SELF', 'COMMUNITY_LINK_INVALID', 'COMMUNITY_GENDER_REQUIRED',
      'COMMUNITY_MIXED_GENDER_REQUIRED', 'COMMUNITY_FEE_NOT_APPLICABLE', 'COMMUNITY_TOURNAMENT_LOCKED', 'COMMUNITY_CONFLICT']) {
      assert.ok(reg.COMMUNITY_ERRORS.includes(code), code);
    }
  },
});

suite('C2 chiếu công khai', {
  'chỉ cặp đã duyệt, chỉ tên, đúng thứ tự duyệt': () => {
    const rows = [
      { status: 'approved', admitted_at: '2026-09-28T10:00:00Z', members: [{ seat: 2, full_name: 'Lê Hoa' }, { seat: 1, full_name: 'Nguyễn Minh' }] },
      { status: 'submitted', admitted_at: null, members: [{ seat: 1, full_name: 'Trần Tuấn' }] },
      { status: 'approved', admitted_at: '2026-09-27T10:00:00Z', members: [{ seat: 1, full_name: 'Đỗ Mai' }, { seat: 2, full_name: 'Vũ Long' }] },
      { status: 'awaiting_partner', members: [{ seat: 1, full_name: 'Phạm Lan' }] },
    ];
    const out = pub.projectPublicPairs(rows);
    assert.deepEqual(out.map((p) => p.pairLabel), ['Đỗ Mai & Vũ Long', 'Nguyễn Minh & Lê Hoa']);
    assert.deepEqual(out[1].seatNames, ['Nguyễn Minh', 'Lê Hoa']);
    assert.deepEqual(Object.keys(out[0]).sort(), ['key', 'pairLabel', 'seatNames']);
    assert.equal(JSON.stringify(out).includes('Trần Tuấn'), false, 'không lộ đơn chờ duyệt');
    assert.equal(JSON.stringify(out).includes('Phạm Lan'), false, 'không lộ người tìm bạn');
  },
  'đầu vào có khóa cấm thì ném lỗi (route phải chọn cột trước)': () => {
    for (const key of ['phone', 'phone_norm', 'contact_phone_norm', 'dob', 'track_token', 'player_account_id', 'athlete_id', 'password_hash', 'private_note']) {
      assert.throws(() => pub.projectPublicPairs([{ status: 'approved', [key]: 'x', members: [{ seat: 1, full_name: 'A' }] }]), /PUBLIC_PROJECTION_FORBIDDEN_KEY/, key);
      assert.throws(() => pub.projectPublicPairs([{ status: 'approved', members: [{ seat: 1, full_name: 'A', [key]: 'x' }] }]), /PUBLIC_PROJECTION_FORBIDDEN_KEY/, `members.${key}`);
    }
  },
  'quét payload tìm khóa cấm ở mọi độ sâu': () => {
    assert.doesNotThrow(() => pub.assertNoForbiddenKeys({ a: [{ b: { name: 'x' } }] }));
    assert.throws(() => pub.assertNoForbiddenKeys({ a: [{ b: { phone_norm: '09' } }] }), /PUBLIC_PROJECTION_FORBIDDEN_KEY/);
    assert.throws(() => pub.assertNoForbiddenKeys([{ dob: '2000-01-01' }]), /PUBLIC_PROJECTION_FORBIDDEN_KEY/);
  },
  'bộ đếm X/Y': () => {
    assert.deepEqual({ ...pub.publicSummary({ approvedCount: 12, capacity: 16 }) }, { approved: 12, capacity: 16, remaining: 4, full: false });
    assert.deepEqual({ ...pub.publicSummary({ approvedCount: 16, capacity: 16 }) }, { approved: 16, capacity: 16, remaining: 0, full: true });
    assert.deepEqual({ ...pub.publicSummary({ approvedCount: 3, capacity: null }) }, { approved: 3, capacity: null, remaining: null, full: false });
  },
});

suite('C2 link rủ ghép cặp', {
  'phát token 43 ký tự, chỉ băm được lưu, hết hạn 7 ngày': () => {
    const now = Date.parse('2026-09-29T00:00:00Z');
    const issued = link.issuePartnerToken({ now });
    assert.match(issued.rawToken, /^[A-Za-z0-9_-]{43}$/);
    assert.match(issued.tokenHash, /^[a-f0-9]{64}$/);
    assert.notEqual(issued.rawToken, issued.tokenHash);
    assert.equal(link.hashPartnerToken(issued.rawToken), issued.tokenHash);
    assert.equal(issued.expiresAt, '2026-10-06T00:00:00.000Z');
    assert.notEqual(link.issuePartnerToken({ now }).rawToken, issued.rawToken);
  },
  'token sai định dạng bị từ chối': () => {
    for (const bad of ['', 'abc', 'x'.repeat(42), 'x'.repeat(44), `${'x'.repeat(42)}!`, null, undefined, 42]) {
      assert.equal(link.isPartnerTokenShape(bad), false);
      assert.throws(() => link.hashPartnerToken(bad), /COMMUNITY_LINK_INVALID/);
    }
  },
  'hết hạn theo mốc': () => {
    const expiresAt = '2026-10-06T00:00:00.000Z';
    assert.equal(link.isPartnerLinkExpired(expiresAt, Date.parse('2026-10-05T23:59:59Z')), false);
    assert.equal(link.isPartnerLinkExpired(expiresAt, Date.parse('2026-10-06T00:00:00Z')), true);
    assert.equal(link.isPartnerLinkExpired(null, Date.now()), true);
    assert.equal(link.isPartnerLinkExpired('khong-phai-ngay', Date.now()), true);
  },
  'đường dẫn link và đăng nhập quay lại đều qua safeNext': () => {
    const { rawToken } = link.issuePartnerToken();
    assert.equal(link.partnerLinkPath(rawToken), `/cong-dong/ghep/${rawToken}`);
    assert.equal(safeNext(link.partnerLinkPath(rawToken)), link.partnerLinkPath(rawToken));
    const login = link.partnerLoginPath(rawToken);
    assert.ok(login.startsWith('/cong-dong/tai-khoan?tab=dang-nhap&next='));
    assert.equal(decodeURIComponent(login.split('next=')[1]), link.partnerLinkPath(rawToken));
    assert.equal(link.partnerLoginPath('xau-la'), '/cong-dong/tai-khoan?tab=dang-nhap', 'không phản chiếu chuỗi lạ');
  },
});
