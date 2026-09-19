'use strict';

const { read, assert } = require('../unified-setup-v2/_harness');
const wizard = read('app/giai-dau/v2/TournamentWizard.js');
const client = read('lib/tournamentV2Client.js');
const consoleSource = read('app/giai-dau/v2/console/TournamentConsoleV2.js');

for (const token of ['getDivisionSetup', 'saveDraft', 'previewSchedule', 'finalize', 'idempotency', 'revision']) {
    assert(wizard.includes(token) || client.includes(token), `draft lifecycle includes ${token}`);
}
assert(/resume|Tiếp tục|draft/i.test(wizard), 'wizard resumes an existing draft');
assert(/invalidation|invalidated|DRAW_STALE/.test(wizard), 'wizard exposes invalidation state');
assert(/entrant|pairId|entry|draw/.test(wizard), 'preview is based on real entrant/pair/draw identity');
assert(/save draft|Lưu nháp|saveDraft/i.test(wizard), 'save draft is distinct from finalize');
assert(/schedule|Lịch thi đấu/.test(wizard), 'finalize redirects to schedule');
assert(!/setLive|status\s*[:=]\s*["']LIVE/.test(wizard), 'finalize does not set LIVE');
assert(!/setup|wizard|Thiết lập/i.test(consoleSource) || /redirect|workspace|finalized/i.test(consoleSource), 'console does not own an independent setup flow');

console.log('ui T0.2 red contract: draft, preview, finalize boundary checks');
