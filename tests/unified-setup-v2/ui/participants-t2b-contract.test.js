'use strict';

const { read, exists, assert } = require('../_harness');

const files = [
    'app/giai-dau/v2/setup/steps/InfoParticipantsStep.js',
    'app/giai-dau/v2/setup/steps/FormatPairingStep.js',
    'app/giai-dau/v2/setup/participants/ParticipantRosterPicker.js',
    'app/giai-dau/v2/setup/pairing/PairingBoard.js',
];

for (const file of files) assert.ok(exists(file), `${file} exists`);

const info = read(files[0]);
const format = read(files[1]);
const roster = read(files[2]);
const pairing = read(files[3]);
const review = read('app/giai-dau/v2/setup/steps/ReviewFinalizeStep.js');
const participantsStep = read('app/giai-dau/v2/setup/steps/ParticipantsStep.js');

assert.match(roster, /Chọn toàn bộ thành viên đang hoạt động/, 'featured active-member bulk select is present');
assert.match(roster, /chọn kết quả đang hiển thị/i, 'visible-result selection is separate');
assert.match(roster, /Đã chọn \{selectedCount\}\/\{totalCount\}/, 'selected X/Y indicator is rendered');
assert.match(roster, /Đang hoạt động[\s\S]*Ngừng hoạt động[\s\S]*Tất cả/, 'active inactive all filters are rendered');
assert.match(roster, /type="checkbox"/, 'member rows use checkboxes');
assert.match(roster, /member\.member_id|memberId/, 'selection is keyed by member_id');
assert.match(roster, /inactiveSelectedCount/, 'inactive selected badge is computed');
assert.match(roster, /hiddenSelectedCount/, 'hidden selections are retained and surfaced');
assert.match(roster, /memberCode|athleteId|clubName/, 'duplicate names have extra distinguishing metadata');

assert.match(participantsStep, /ParticipantRosterPicker/, 'step 2 uses the roster picker');
assert.match(info, /TournamentDetailsForm[\s\S]*Thông tin giải/, 'step 1 captures tournament metadata before participant selection');
assert.match(review, /startTime/, 'step 1 reuses the metadata form that captures the tournament start time');

assert.match(pairing, /createPairingDraft|pairingDraft/, 'pairing UI uses domain pairingDraft module');
assert.match(pairing, /unpairedMemberIds|Danh sách chưa ghép/, 'unpaired list is rendered as blocker');
assert.match(pairing, /Khóa|Mở khóa/, 'lock and unlock controls are rendered');
assert.match(pairing, /Ghép lại các cặp chưa khóa/, 'regenerate unlocked pairs action is explicit');
assert.match(pairing, /confirm\(/, 'regenerate unlocked pairs requires confirmation');
assert.match(pairing, /Đổi người|swap/i, 'swap is an explicit action');
assert.match(pairing, /add_member[\s\S]*switch_format/, 'odd-count add/switch choices are shown');
assert.match(pairing, /data-choice="add_member"[\s\S]*onClick/, 'add-member remedy updates the pairing draft');
assert.doesNotMatch(pairing, /reserve_member|reserveMemberIds/, 'pairing UI has no reserve path');
assert.match(pairing, /disabled=\{!canSwitchToSingles\}/, 'format remedy is disabled when the format is unsupported');
assert.match(pairing, /Chưa thể đổi sang đánh đơn/, 'unsupported format has a Vietnamese reason');
assert.match(pairing, /addPerson|addMember/, 'adding a person only sends them to unpaired');
assert.match(pairing, /removePerson|removeMember/, 'removing a person preserves other pairs via domain function');
assert.doesNotMatch(pairing, /draggable|onDragStart|react-beautiful-dnd|dnd-kit/, 'mobile UI does not depend on drag and drop');

assert.match(format, /PairingBoard/, 'format step uses pairing board');
assert.match(pairing, /manual|automatic|Thủ công|Tự động/, 'manual and automatic preview/apply modes are present');
assert.match(format, /UNPAIRED_MEMBER|chưa ghép/i, 'unpaired blocker is surfaced');
assert.match(format, /memberIds/, 'pairing persists member identities through the aggregate draft');
assert.match(format, /disabled title="Unified preview hiện chưa hỗ trợ thể thức này"/, 'format chưa có preview được disabled thay vì cho chọn rồi lỗi muộn');

console.log('participants T2.B UI contract ok');
