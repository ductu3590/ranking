const assert = require('assert');
const { validateInterclubPool, buildDoublesPairingPreview, validateDivisionPairAssignments, lockPairSnapshot } = require('../../lib/tournament/interclub');

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
const balanced = buildDoublesPairingPreview({ play_type: 'doubles', pairing_mode: 'random_balanced', athletes, seed: 42 });
assert.strictEqual(balanced.pairs.length, 2, 'doubles tạo đúng hai cặp');
assert(balanced.pairs.every((pair) => pair.members.length === 2), 'mỗi cặp có hai VĐV');
assert.deepStrictEqual(balanced.pairs.map((pair) => pair.members.map((member) => member.tournament_athlete_id)), [[1, 4], [2, 3]], 'pairing PHR ghép cao với thấp để cân bằng');
assert(balanced.pairs.every((pair) => pair.phr_rating_snapshot === 8), 'pair snapshot PHR được lưu theo tổng');
assert.deepStrictEqual(buildDoublesPairingPreview({ play_type: 'doubles', pairing_mode: 'random_balanced', athletes, seed: 42 }).pairs, balanced.pairs, 'cùng seed cho cùng pairing');

const withoutRating = athletes.map(({ phr_rating, ...athlete }) => athlete);
const randomA = buildDoublesPairingPreview({ play_type: 'doubles', pairing_mode: 'random_balanced', athletes: withoutRating, seed: 7 });
const randomB = buildDoublesPairingPreview({ play_type: 'doubles', pairing_mode: 'random_balanced', athletes: withoutRating, seed: 7 });
assert.deepStrictEqual(randomA.pairs, randomB.pairs, 'fallback random vẫn deterministic theo seed');
assert(randomA.warnings.some((warning) => warning.code === 'PHR_RATING_MISSING'), 'thiếu PHR trả warning');

assert.strictEqual(validateDivisionPairAssignments([{ members: [{ tournament_athlete_id: 1 }, { tournament_athlete_id: 2 }] }, { members: [{ tournament_athlete_id: 3 }, { tournament_athlete_id: 4 }] }]).length, 2, 'athlete assignments hợp lệ trong division');
assert(throwsCode(() => validateDivisionPairAssignments([{ members: [{ tournament_athlete_id: 1 }, { tournament_athlete_id: 2 }] }, { members: [{ tournament_athlete_id: 2 }, { tournament_athlete_id: 3 }] }]), 'DIVISION_ATHLETE_DUPLICATE'), 'một athlete không thuộc hai cặp trong division');

const locked = lockPairSnapshot(balanced.pairs[0]);
const originalRating = locked.phr_rating_snapshot;
balanced.pairs[0].phr_rating_snapshot = 1;
assert.strictEqual(locked.status, 'locked', 'pair confirmed tạo snapshot locked');
assert.strictEqual(locked.phr_rating_snapshot, originalRating, 'locked snapshot không đổi theo object preview');

const singles = buildDoublesPairingPreview({ play_type: 'singles', pairing_mode: 'none', athletes: athletes.slice(0, 1), seed: 1 });
assert.deepStrictEqual(singles.pairs, [], 'singles không tạo pair record');
assert(singles.entries.length === 1, 'singles trả entry trực tiếp');
console.log('phase3 interclub competition ok');
