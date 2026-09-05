const assert = require('assert');
const { validateInterclubPool, previewPairing, confirmPairing, evaluateRatingWarning, distributeEntriesAcrossPools } = require('../../lib/tournament/interclub');
const { generateSchedule } = require('../../lib/tournament/engines/roundRobin');

const throwsCode = (fn, code) => { try { fn(); } catch (error) { return error.code === code; } return false; };
const pool = [{ id: 1, club_id: 10, seed: 1 }, { id: 2, club_id: 10, seed: 2 }, { id: 3, club_id: 20, seed: 3 }];
const spread = validateInterclubPool(pool, { policy: 'spread_if_possible' });
assert(spread.entries.length === 3, 'spread policy giữ đủ entry');
assert(spread.warnings.some((warning) => warning.code === 'POOL_CLUB_SPREAD_LIMITED'), 'spread policy trả warning khi không rải đều được');
assert(throwsCode(() => validateInterclubPool(pool, { policy: 'unique_per_pool' }), 'POOL_CLUB_DUPLICATE'), 'unique_per_pool hard-block duplicate club');
assert(validateInterclubPool(pool, { policy: 'allow_multiple' }).warnings.length === 0, 'allow_multiple cho phép duplicate club không warning');

const athletes = [
  { id: 1, tournament_athlete_id: 1, club_id: 10, phr_rating: 5.0 },
  { id: 2, tournament_athlete_id: 2, club_id: 10, phr_rating: 4.8 },
  { id: 3, tournament_athlete_id: 3, club_id: 20, phr_rating: 3.2 },
  { id: 4, tournament_athlete_id: 4, club_id: 20, phr_rating: 3.0 },
];
const balanced = previewPairing({ play_type: 'doubles', pairing_mode: 'random_balanced', athletes, seed: 42 });
assert.strictEqual(balanced.pairs.length, 2, 'doubles tạo đúng hai cặp');
assert(balanced.pairs.every((pair) => pair.members.length === 2), 'mỗi cặp có hai VĐV');
assert.deepStrictEqual(balanced.pairs.map((pair) => pair.members.map((member) => member.tournament_athlete_id)), [[1, 4], [2, 3]], 'pairing PHR ghép cao với thấp để cân bằng');
assert(balanced.pairs.every((pair) => pair.phr_rating_snapshot === 8), 'pair snapshot PHR được lưu theo tổng');
assert.deepStrictEqual(previewPairing({ play_type: 'doubles', pairing_mode: 'random_balanced', athletes, seed: 42 }).pairs, balanced.pairs, 'cùng seed cho cùng pairing');

const withoutRating = athletes.map(({ phr_rating, ...athlete }) => athlete);
const randomA = previewPairing({ play_type: 'doubles', pairing_mode: 'random_balanced', athletes: withoutRating, seed: 7 });
const randomB = previewPairing({ play_type: 'doubles', pairing_mode: 'random_balanced', athletes: withoutRating, seed: 7 });
assert.deepStrictEqual(randomA.pairs, randomB.pairs, 'fallback random vẫn deterministic theo seed');
assert(randomA.warnings.some((warning) => warning.code === 'PHR_RATING_MISSING'), 'thiếu PHR trả warning');
assert.strictEqual(evaluateRatingWarning({ members: [{ tournament_athlete_id: 1, phr_rating: 5, phr_status: 'confirmed' }, { tournament_athlete_id: 2, phr_rating: 4.5, phr_status: 'confirmed' }] }, { rating_policy: 'capped', rating_cap: 9 }).status, 'over_limit', 'cặp vượt cap trả warning over_limit');
assert.strictEqual(evaluateRatingWarning({ members: [{ tournament_athlete_id: 1, phr_rating: 5, phr_status: 'pending' }, { tournament_athlete_id: 2, phr_rating: 4.5, phr_status: 'confirmed' }] }, { rating_policy: 'capped', rating_cap: 12 }).status, 'pending', 'PHR pending trả đúng status');
assert.strictEqual(evaluateRatingWarning({ members: [{ tournament_athlete_id: 1, phr_rating: null }, { tournament_athlete_id: 2, phr_rating: 4.5, phr_status: 'confirmed' }] }, { rating_policy: 'capped', rating_cap: 12 }).status, 'missing', 'PHR thiếu trả đúng status');
assert.strictEqual(evaluateRatingWarning({ members: [{ tournament_athlete_id: 1, phr_rating: 5, phr_status: 'rejected' }, { tournament_athlete_id: 2, phr_rating: 4.5, phr_status: 'confirmed' }] }, { rating_policy: 'capped', rating_cap: 12 }).status, 'rejected', 'PHR rejected trả đúng status');
assert.strictEqual(previewPairing({ play_type: 'doubles', pairing_mode: 'manual', athletes: [{ id: 9, phr_rating: 6 }, { id: 10, phr_rating: 5 }], division: { rating_policy: 'capped', rating_cap: 10 } }).pairs[0].rating_warning.status, 'over_limit', 'preview nối rating warning vào từng pair');

assert.strictEqual(confirmPairing({ members: [{ tournament_athlete_id: 1 }, { tournament_athlete_id: 2 }] })[0].status, 'locked', 'athlete assignments hợp lệ trong division');
assert(throwsCode(() => confirmPairing([{ members: [{ tournament_athlete_id: 1 }, { tournament_athlete_id: 2 }] }, { members: [{ tournament_athlete_id: 2 }, { tournament_athlete_id: 3 }] }]), 'DIVISION_ATHLETE_DUPLICATE'), 'một athlete không thuộc hai cặp trong division');

const locked = confirmPairing(balanced.pairs[0])[0];
const originalRating = locked.phr_rating_snapshot;
balanced.pairs[0].phr_rating_snapshot = 1;
assert.strictEqual(locked.status, 'locked', 'pair confirmed tạo snapshot locked');
assert.strictEqual(locked.phr_rating_snapshot, originalRating, 'locked snapshot không đổi theo object preview');

const odd = previewPairing({ play_type: 'doubles', pairing_mode: 'manual', athletes: athletes.slice(0, 3), seed: 1 });
assert(odd.unpaired.length === 1 && odd.warnings.some((warning) => warning.code === 'ODD_ATHLETE'), 'doubles lẻ trả người dư và warning');
const singles = previewPairing({ play_type: 'singles', pairing_mode: 'none', athletes: athletes.slice(0, 1), seed: 1 });
assert.deepStrictEqual(singles.pairs, [], 'singles không tạo pair record');
assert(singles.entries.length === 1, 'singles trả entry trực tiếp');

const sixEntries = [10, 11, 12, 20, 21, 22].map((id, index) => ({ id, club_id: id < 20 ? 1 : 2, seed: index + 1 }));
const threePools = distributeEntriesAcrossPools(sixEntries, { poolCount: 3, policy: 'spread_if_possible' });
assert(threePools.pools.every((poolEntries) => poolEntries.filter((entry) => entry.club_id === 1).length === 1), '3 entry CLB A được rải đều 3 pool');
assert.strictEqual(threePools.warnings.length, 0, 'rải đủ không warning');
const fourA = [...sixEntries, { id: 13, club_id: 1, seed: 7 }];
const limitedPools = distributeEntriesAcrossPools(fourA, { poolCount: 3, policy: 'spread_if_possible' });
assert(limitedPools.warnings.some((warning) => warning.code === 'POOL_CLUB_SPREAD_LIMITED'), '4 entry CLB A/3 pool trả warning');
const scheduled = generateSchedule({ config: { groupCount: 3, duplicate_club_policy: 'spread_if_possible', shuffle: false } }, sixEntries, 1);
assert(scheduled.every((match) => match.group_label), 'đường sinh lịch nhận policy và gắn pool');
const entriesByPool = new Map();
for (const entry of sixEntries) entriesByPool.set(entry.id, []);
for (const match of scheduled) for (const id of [match.entrant_a_id, match.entrant_b_id]) if (entriesByPool.has(id)) entriesByPool.get(id).push(match.group_label);
assert(new Set([...entriesByPool.entries()].filter(([id]) => id < 20).flatMap(([, pools]) => pools)).size === 3, 'engine rải entry CLB A qua 3 pool');
const scheduledLimited = generateSchedule({ config: { groupCount: 3, duplicate_club_policy: 'spread_if_possible', shuffle: false } }, fourA, 1);
assert(scheduledLimited.warnings.some((warning) => warning.code === 'POOL_CLUB_SPREAD_LIMITED'), 'engine phát warning khi không rải đủ');
console.log('phase3 interclub competition ok');
