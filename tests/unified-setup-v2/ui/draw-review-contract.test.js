'use strict';

const path = require('node:path');
const { ROOT, assert, exists, read } = require('../_harness');

const drawStep = 'app/giai-dau/v2/setup/steps/DrawScheduleStep.js';
const reviewStep = 'app/giai-dau/v2/setup/steps/ReviewFinalizeStep.js';
const drawModel = 'app/giai-dau/v2/setup/draw/drawReviewModel.js';
const drawCss = 'app/giai-dau/v2/setup/draw/draw-review.css';

assert.ok(exists(drawStep), 'DrawScheduleStep.js exists');
assert.ok(exists(reviewStep), 'ReviewFinalizeStep.js exists');
assert.ok(exists(drawModel), 'drawReviewModel.js exists');
assert.ok(exists(drawCss), 'draw-review.css exists');

const model = require(path.join(ROOT, drawModel));
assert.equal(typeof model.buildDrawPreviewModel, 'function', 'exports buildDrawPreviewModel');
assert.equal(typeof model.buildReviewSummaryModel, 'function', 'exports buildReviewSummaryModel');
assert.equal(typeof model.markDrawStaleOnSetupChange, 'function', 'exports markDrawStaleOnSetupChange');

const pairs = Array.from({ length: 7 }, (_, index) => ({ pairId: `pair-${index + 1}`, nameSnapshot: `Cặp ${index + 1}` }));
const draft = {
  tournament: { name: 'Giải nội bộ 14 VĐV' },
  format: {
    entrantType: 'doubles',
    formatKey: 'group_knockout',
    config: {
      groupCount: 2,
      groupSizes: [4, 3],
      qualifiersPerGroup: 2,
      bracketPairing: 'cross_seed',
      thirdPlaceEnabled: false,
      courtCount: 2,
      minutesPerMatch: 25,
    },
  },
  pairs,
  draw: { status: 'drafted', seed: 19, assignments: [] },
  readiness: { blockers: [], warnings: ['GROUP_SIZE_IMBALANCE'] },
};

const preview = model.buildDrawPreviewModel(draft);
assert.equal(preview.metrics.groupMatches, 9, '14 athlete case has 9 group matches');
assert.equal(preview.metrics.semifinalMatches, 2, '14 athlete case has 2 semifinals');
assert.equal(preview.metrics.finalMatches, 1, '14 athlete case has 1 final');
assert.equal(preview.metrics.totalMatches, 12, '14 athlete case totals 12 matches without third place');
assert.deepEqual(preview.groupSizes, [4, 3], 'groups split 4/3');
assert.ok(preview.progressionLines.includes('Nhất A – Nhì B'), 'shows real cross progression Nhất A – Nhì B');
assert.ok(preview.progressionLines.includes('Nhất B – Nhì A'), 'shows real cross progression Nhất B – Nhì A');
assert.ok(preview.warnings.some((warning) => warning.code === 'GROUP_SIZE_IMBALANCE'), 'group imbalance is warning');
assert.equal(preview.blockers.length, 0, 'imbalance is not blocker');
assert.ok(preview.courtPlan.estimatedRounds > 0, 'court/time metrics include rounds');
assert.ok(preview.courtPlan.estimatedMinutes > 0, 'court/time metrics include minutes');

const thirdPlace = model.buildDrawPreviewModel({
  ...draft,
  format: { ...draft.format, config: { ...draft.format.config, thirdPlaceEnabled: true } },
});
assert.equal(thirdPlace.metrics.totalMatches, 13, 'third place toggles total to 13');

const stale = model.markDrawStaleOnSetupChange(draft, 'PAIRING_CHANGED');
assert.equal(stale.draw.status, 'stale', 'setup changes mark draw stale');
assert.ok(stale.invalidation.draw, 'draw invalidation flag is set');
assert.equal(stale.draw.matches, undefined, 'stale marker does not auto-regenerate matches');

const lockedReview = model.buildReviewSummaryModel({
  ...draft,
  matchState: { hasScore: true },
});
assert.ok(lockedReview.finalizeDisabled, 'finalize disabled when score exists');
assert.equal(lockedReview.finalizeDisabledCode, 'STRUCTURE_LOCKED_BY_RESULTS', 'disabled reason is stable code');
assert.equal(lockedReview.destinationLabel, 'Lịch thi đấu', 'post-finalize destination is schedule');

const drawSource = read(drawStep);
assert.match(drawSource, /ghép cặp -> bốc thăm -> sinh trận -> xếp sân\/giờ/, 'draw step labels four operations distinctly');
assert.match(drawSource, /Bốc lại/, 'draw step exposes reroll action');
assert.match(drawSource, /Đổi vị trí/, 'draw step exposes swap action');
assert.match(drawSource, /số bảng/i, 'draw step configures group count');
assert.match(drawSource, /suất đi tiếp/i, 'draw step configures qualifiers');
assert.match(drawSource, /tranh hạng ba/i, 'draw step configures third place');
assert.match(drawSource, /cần bốc lại/i, 'draw step shows stale draw state');

const reviewSource = read(reviewStep);
assert.match(reviewSource, /Lưu nháp/, 'review step has save draft action');
assert.match(reviewSource, /Chốt bốc thăm & tạo lịch/, 'review step has finalize action');
assert.match(reviewSource, /Thử lại/, 'review step has retry action');
assert.match(reviewSource, /Lịch thi đấu/, 'review step names post-finalize schedule destination');
assert.match(reviewSource, /blocker/i, 'review step distinguishes blockers');
assert.match(reviewSource, /warning/i, 'review step distinguishes warnings');

console.log('draw/review ui contract ok');
