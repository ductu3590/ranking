'use strict';
// Epic 2 E1 §3: nhãn trận tiếng Việt dùng chung, nhóm theo match_key, ô chờ theo nguồn.

const { lib, assert, suite, read } = require('../_harness');
const { planFor, toDb } = require('./_fixture');

const { matchLabel, matchGroupKey, slotSourceLabel } = lib('lib/tournament/matchLabels');

function titlesOf(db) {
  const byStage = new Map();
  for (const match of db.matches) {
    if (!byStage.has(match.stage_id)) byStage.set(match.stage_id, []);
    byStage.get(match.stage_id).push(match);
  }
  return db.matches.map((match) => ({ match, label: matchLabel({ match, stageMatches: byStage.get(match.stage_id) }) }));
}

const FORBIDDEN = [/Đội A/, /Đội B/, /Trận #/, /undefined/, /null/, /NaN/];

suite('epic-2 · matchLabels', {
  'vòng tròn một bảng → "Lượt n", không lộ chữ bảng': () => {
    const db = toDb(planFor('round_robin', 5));
    for (const { match, label } of titlesOf(db)) assert.equal(label.title, `Lượt ${match.round}`);
  },
  'vòng tròn một bảng không phụ thuộc chữ A': () => {
    const matches = [{ id: 1, match_key: 'GROUP-C-1', round: 2 }, { id: 2, match_key: 'GROUP-C-2', round: 3 }];
    assert.equal(matchLabel({ match: matches[1], stageMatches: matches }).title, 'Lượt 3');
  },
  'vòng bảng ≥ 2 bảng → "Bảng X · Lượt n"; playoff → Bán kết n / Chung kết': () => {
    const db = toDb(planFor('group_knockout', 7));
    for (const { match, label } of titlesOf(db)) {
      if (match.match_key.startsWith('GROUP-')) assert.match(label.title, /^Bảng [A-Z] · Lượt \d+$/);
    }
    const titles = Object.fromEntries(titlesOf(db).map(({ match, label }) => [match.match_key, label.title]));
    assert.equal(titles.SF1, 'Bán kết 1');
    assert.equal(titles.F, 'Chung kết');
  },
  'loại trực tiếp 16 cặp: Vòng 1/8, Tứ kết, Bán kết, Chung kết, Tranh hạng ba': () => {
    const db = toDb(planFor('knockout', 16, { finalBestOf: 3, thirdPlaceEnabled: true }));
    const titles = titlesOf(db).map(({ label }) => label.title);
    assert.ok(titles.some((title) => /^Vòng 1\/8 · trận \d+$/.test(title)), titles.join(' | '));
    assert.ok(titles.includes('Tứ kết 1'));
    assert.ok(titles.includes('Bán kết 2'));
    assert.ok(titles.includes('Chung kết'));
    assert.ok(titles.includes('Tranh hạng ba'));
  },
  'loại kép: nhãn D21 + số trận trong vòng; GF là Chung kết tổng': () => {
    const db = toDb(planFor('double_elimination', 7));
    const titles = Object.fromEntries(titlesOf(db).map(({ match, label }) => [match.match_key, label.title]));
    assert.equal(titles.GF, 'Chung kết tổng');
    assert.equal(titles.WF, 'Chung kết nhánh thắng');
    assert.equal(titles.LF, 'Chung kết nhánh thua');
    assert.ok(Object.values(titles).some((title) => /^Nhánh thắng · Vòng 1 · trận \d$/.test(title)));
  },
  'không nhãn nào có "Đội A", "Trận #", null/undefined': () => {
    for (const [format, n, config] of [['round_robin', 5, {}], ['group_knockout', 9, {}], ['knockout', 12, { thirdPlaceEnabled: true }], ['double_elimination', 12, {}]]) {
      for (const { label } of titlesOf(toDb(planFor(format, n, config)))) {
        for (const pattern of FORBIDDEN) assert.doesNotMatch(label.title, pattern, `${format}: ${label.title}`);
      }
    }
    assert.equal(matchLabel({ match: { id: 9, round: null, match_order: null } }).title, 'Trận chưa xếp lượt');
    assert.equal(matchLabel({ match: { id: 9, round: 4, match_order: 2 } }).title, 'Lượt 4 · trận 3');
  },
  'matchGroupKey: Tranh hạng ba không chung nhóm Chung kết (theo match_key)': () => {
    const db = toDb(planFor('knockout', 8, { thirdPlaceEnabled: true }));
    const bronze = matchGroupKey(db.byKey('BRONZE'), db.matches);
    const final = matchGroupKey(db.byKey('F'), db.matches);
    assert.equal(bronze.key, 'third_place');
    assert.equal(final.key, 'final');
    assert.notEqual(bronze.key, final.key);
    assert.equal(db.byKey('BRONZE').round, db.byKey('F').round, 'fixture: cùng round mà vẫn tách nhóm');
  },
  'slotSourceLabel: thắng/thua/hạng bảng/suất bù': () => {
    const titles = { 11: 'Tứ kết 1', 12: 'Nhánh thắng · Vòng 1 · trận 2' };
    assert.equal(slotSourceLabel({ source_kind: 'match_outcome', source_match_id: 11, source_outcome: 'winner' }, titles), 'Thắng Tứ kết 1');
    assert.equal(slotSourceLabel({ source_kind: 'match_outcome', source_match_id: 12, source_outcome: 'loser' }, titles), 'Thua Nhánh thắng · Vòng 1 · trận 2');
    assert.equal(slotSourceLabel({ source_kind: 'group_rank', source_group_label: 'A', source_rank: 1 }), 'Nhất bảng A');
    assert.equal(slotSourceLabel({ source_kind: 'group_rank', source_group_label: 'B', source_rank: 2 }), 'Nhì bảng B');
    assert.equal(slotSourceLabel({ source_kind: 'group_rank', source_group_label: 'C', source_rank: 4 }), 'Hạng 4 bảng C');
    assert.equal(slotSourceLabel({ source_kind: 'group_rank_pool', source_rank: 3, source_pool_position: 2 }), 'Suất bù hạng 3 · thứ 2');
    assert.equal(slotSourceLabel(null), 'Chờ xác định');
  },
  'nguồn ô chờ từ transitions thật của plan (playoff + loại kép)': () => {
    for (const [format, n] of [['group_knockout', 7], ['double_elimination', 7], ['knockout', 6]]) {
      const db = toDb(planFor(format, n, format === 'knockout' ? { thirdPlaceEnabled: true } : {}));
      const titles = Object.fromEntries(titlesOf(db).map(({ match, label }) => [String(match.id), label.title]));
      for (const edge of db.transitions) {
        const text = slotSourceLabel(edge, titles);
        assert.doesNotMatch(text, /Chờ xác định|trận trước|\?/, `${format}: ${JSON.stringify(edge)} → ${text}`);
      }
    }
  },
  'module thuần, không I/O': () => {
    const source = read('lib/tournament/matchLabels.js');
    assert.doesNotMatch(source, /require\(['"](fs|path|@supabase|next)/);
  },
});
