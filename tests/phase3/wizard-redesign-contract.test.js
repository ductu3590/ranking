'use strict';

const { read, assert } = require('../unified-setup-v2/_harness');
const source = [
    read('app/giai-dau/v2/TournamentWizard.js'),
    read('app/giai-dau/v2/setup/SetupContext.js'),
    read('app/giai-dau/v2/setup/SetupStepper.js'),
    read('app/giai-dau/v2/setup/steps/InfoParticipantsStep.js'),
    read('app/giai-dau/v2/setup/steps/FormatPairingStep.js'),
    read('app/giai-dau/v2/setup/participants/ParticipantRosterPicker.js'),
    read('app/giai-dau/v2/setup/pairing/PairingBoard.js'),
].join('\n');

for (const label of ['Thông tin & người tham gia', 'Thể thức & ghép cặp', 'Bốc thăm & xem trước lịch', 'Kiểm tra và chốt']) {
    assert(source.includes(label), `wizard has four-step label: ${label}`);
}
for (const oldLabel of ['Đăng ký', 'Thể thức', 'Thông tin giải']) {
    assert(!source.includes(`> ${oldLabel} <`), `legacy three-step label removed: ${oldLabel}`);
}
for (const feature of ['search', 'filter', 'checkbox', 'select-visible', 'Xóa']) {
    assert(new RegExp(feature, 'i').test(source), `athlete picker supports ${feature}`);
}
for (const feature of ['draft', 'invalidation', 'preview', 'finalize', 'schedule', 'group_knockout', 'locked', 'UNPAIRED_MEMBER', 'STRUCTURE_LOCKED_BY_RESULTS']) {
    assert(source.includes(feature), `wizard exposes contract behavior ${feature}`);
}

console.log('phase3 T0.2 red contract: four-step wizard acceptance checks');
