const assert = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exit(1); } };
const dom = require('../../lib/tournament/openRegistration');

// B1: normalizePhone
assert(dom.normalizePhone(' 0912 345 678 ') === '0912345678', 'chuẩn hoá bỏ khoảng trắng');
assert(dom.normalizePhone('+84912345678') === '0912345678', '+84 -> 0');
assert(dom.normalizePhone('84912345678') === '0912345678', '84 -> 0');
let threw = false; try { dom.normalizePhone('abc'); } catch (e) { threw = e.code === 'INVALID_PHONE'; }
assert(threw, 'SĐT rác ném INVALID_PHONE');

// B2: requiredMemberFields
assert(JSON.stringify(dom.requiredMemberFields({})) === JSON.stringify({ phr: false, gender: false, dob: false }), 'mặc định không trường phụ');
assert(dom.requiredMemberFields({ rating_cap: 4.8 }).phr === true, 'có rating_cap -> hỏi PHR');
assert(dom.requiredMemberFields({ gender_mode: 'mixed' }).gender === true, 'mixed -> hỏi giới tính');
assert(dom.requiredMemberFields({ gender_mode: 'male' }).gender === false, 'single-gender không hỏi');
assert(dom.requiredMemberFields({ age_min: 40 }).dob === true, 'có giới hạn tuổi -> hỏi ngày sinh');

// B3: isRegistrationOpen
const T = { organizer_mode: 'community', open_registration: true };
const D = { registration_open: true, registration_deadline: '2026-09-20T00:00:00Z', allow_late_registration: false };
assert(dom.isRegistrationOpen(T, D, '2026-09-10T00:00:00Z').ok === true, 'trong hạn -> mở');
assert(dom.isRegistrationOpen(T, D, '2026-09-21T00:00:00Z').ok === false, 'quá hạn -> đóng');
assert(dom.isRegistrationOpen(T, { ...D, allow_late_registration: true }, '2026-09-21T00:00:00Z').ok === true, 'nhận muộn -> mở');
assert(dom.isRegistrationOpen({ ...T, open_registration: false }, D, '2026-09-10T00:00:00Z').ok === false, 'giải chưa mở');
assert(dom.isRegistrationOpen({ ...T, organizer_mode: 'internal' }, D, '2026-09-10T00:00:00Z').ok === false, 'không phải cộng đồng');

// B4: validateSubmission
const singles = { entrant_type: 'individual', gender_mode: 'any' };
const okSingle = dom.validateSubmission({ division: singles, members: [{ full_name: 'A', phone: '0912345678' }] });
assert(okSingle.members.length === 1 && okSingle.members[0].phone_norm === '0912345678', 'đơn 1 member hợp lệ');

const doubles = { entrant_type: 'pair', gender_mode: 'mixed', rating_cap: 4.8 };
let e1 = false; try { dom.validateSubmission({ division: doubles, members: [{ full_name: 'A', phone: '0912345678', gender: 'male' }, { full_name: 'B', phone: '0912345678', gender: 'female' }] }); } catch (e) { e1 = e.code === 'DUPLICATE_IN_PAIR'; }
assert(e1, 'hai người trùng SĐT trong cặp -> lỗi');

let e2 = false; try { dom.validateSubmission({ division: doubles, members: [{ full_name: 'A', phone: '0912345678', gender: 'male' }, { full_name: 'B', phone: '0912345679', gender: 'male' }] }); } catch (e) { e2 = e.code === 'MIXED_GENDER_REQUIRED'; }
assert(e2, 'mixed cần 1 nam 1 nữ');

const solo = dom.validateSubmission({ division: doubles, members: [{ full_name: 'A', phone: '0912345678', gender: 'male' }] });
assert(solo.needs_partner === true, 'đôi điền 1 -> needs_partner');

// B5: transitionOpenRegistration + waitlistView
assert(dom.transitionOpenRegistration('submitted', 'admit') === 'approved', 'admit');
assert(dom.transitionOpenRegistration('approved', 'remove') === 'submitted', 'remove trả về chờ');
assert(dom.transitionOpenRegistration('rejected', 'restore') === 'submitted', 'restore');
assert(dom.transitionOpenRegistration('awaiting_partner', 'pair') === 'submitted', 'ghép xong vào chờ');
let te = false; try { dom.transitionOpenRegistration('approved', 'admit'); } catch (e) { te = e.code === 'INVALID_TRANSITION'; }
assert(te, 'transition sai bị chặn');

const view = dom.waitlistView({ capacity: 2, approvedCount: 1, pending: [{ id: 10, queue_seq: 1 }, { id: 11, queue_seq: 2 }, { id: 12, queue_seq: 3 }] });
assert(view.freeSlots === 1, 'còn 1 suất');
assert(view.rows[0].isWaitlist === false && view.rows[1].isWaitlist === true && view.rows[1].position === 1, 'dòng 2 là waitlist #1');
assert(view.rows[2].position === 2, 'dòng 3 waitlist #2');

// B6: buildPairFromSolos
const div = { entrant_type: 'pair', gender_mode: 'mixed' };
const A = { id: 1, members: [{ seat: 1, full_name: 'A', phone_norm: '0912345678', gender: 'male' }] };
const B = { id: 2, members: [{ seat: 1, full_name: 'B', phone_norm: '0912345679', gender: 'female' }] };
const pair = dom.buildPairFromSolos(A, B, div);
assert(pair.primary_id === 1 && pair.merged_id === 2, 'A là entry chính, B bị gộp');
assert(pair.members.length === 2 && pair.members[1].seat === 2, 'B thành seat 2');
let pe = false; try { dom.buildPairFromSolos(A, { id: 3, members: [{ seat: 1, full_name: 'C', phone_norm: '0912345678', gender: 'female' }] }, div); } catch (e) { pe = e.code === 'DUPLICATE_IN_PAIR'; }
assert(pe, 'ghép trùng SĐT bị chặn');

// B7: resolveOrganizerMode — chế độ cộng đồng nằm ở settings.organizer_mode,
// cột organizer_type chỉ nhận 'platform' | 'club'.
assert(dom.resolveOrganizerMode({ organizer_type: 'community' }) === 'community', 'organizer_type community -> community');
assert(dom.resolveOrganizerMode({ organizer_type: 'club', settings: { organizer_mode: 'community' } }) === 'community', 'club + settings.community -> community');
assert(dom.resolveOrganizerMode({ organizer_type: 'club', settings: { organizer_mode: 'friendly' } }) === 'friendly', 'settings.friendly -> friendly');
assert(dom.resolveOrganizerMode({ organizer_type: 'club' }) === null, 'settings rỗng -> null');
assert(dom.resolveOrganizerMode({}) === null, 'row rỗng -> null');

// B8: isPubliclyOpen — community + open_registration=true trong settings
assert(dom.isPubliclyOpen({ organizer_type: 'club', settings: { organizer_mode: 'community', open_registration: true } }) === true, 'club community + open -> true');
assert(dom.isPubliclyOpen({ organizer_type: 'community', settings: { open_registration: true } }) === true, 'organizer_type community + open -> true');
assert(dom.isPubliclyOpen({ organizer_type: 'club', settings: { organizer_mode: 'friendly', open_registration: true } }) === false, 'friendly -> false');
assert(dom.isPubliclyOpen({ organizer_type: 'club', settings: { organizer_mode: 'community', open_registration: false } }) === false, 'community nhưng chưa mở -> false');
assert(dom.isPubliclyOpen({ organizer_type: 'club', settings: {} }) === false, 'settings rỗng -> false');
assert(dom.isPubliclyOpen({ organizer_type: 'club' }) === false, 'không settings -> false');

console.log('open-registration domain: OK');
