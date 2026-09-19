// Contract test cho release hardening (round 3).
// Khoa chat cac bat bien da duoc chung minh bang thuc nghiem tren DB that, de
// khong ai vo tinh go ra. Day la STATIC EVIDENCE: bang chung runtime nam o
// 07_EXECUTION_REPORT.md muc Round 3 (do thoi gian, hai ket noi, HTTP status).

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const exists = (f) => fs.existsSync(path.join(root, f));

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error(`FAIL: ${msg}`); failed += 1; } };

/* ---------- 1. Khong con dung SQLSTATE 40001 cho xung dot nghiep vu ---------- */
{
  ok(exists('database/migrations/078_business_conflict_errcode_ph409.sql'),
    '078 phai ton tai (doi 40001 -> PH409)');
  const m078 = read('database/migrations/078_business_conflict_errcode_ph409.sql');
  ok(/PH409/.test(m078), '078 dat ma xung dot moi PH409');
  ok(/serialization_failure/.test(m078), '078 ghi ro ly do: 40001 la serialization_failure bi tu dong retry');

  // Route phai coi CA PH409 lan 40001 la xung dot -> 409 (tuong thich nguoc).
  for (const f of ['setup', 'corrections', 'advance', 'draw', 'games', 'generate', 'registrations']) {
    const src = read(`app/api/tournament-v2/${f}/route.js`);
    ok(/CONFLICT_CODES\s*=\s*\['PH409',\s*'40001'\]/.test(src),
      `${f}/route.js phai khai bao CONFLICT_CODES = ['PH409','40001']`);
    ok(!/===\s*'40001'/.test(src), `${f}/route.js khong duoc so sanh cung '40001' nua`);
  }
}

/* ---------- 2. Race seed <-> correction ---------- */
{
  const m079 = read('database/migrations/079_seed_correction_race_and_advance_hardening.sql');
  const m080 = read('database/migrations/080_seed_guard_nowait_conflict.sql');
  const m081 = read('database/migrations/081_conflict_lock_timeout_fail_fast.sql');

  ok(/group_stage_results_fingerprint/.test(m079), '079 tao van tay ket qua vong bang');
  ok(/p_expected_results_fingerprint/.test(m079), 'advance nhan van tay de CAS');
  ok(/GROUP_RESULTS_CHANGED/.test(m079), 'advance tu choi khi ket qua vong bang da doi');

  // Guard phai lay khoa GIONG advance, va ban cuoi dung NOWAIT de tu choi nhanh.
  ok(/tournament_stages[\s\S]{0,120}FOR UPDATE NOWAIT/.test(m080),
    '080: guard lay FOR UPDATE NOWAIT tren dong stage nguon');
  ok(/GROUP_SEEDING_IN_PROGRESS/.test(m080), '080: tu choi ro rang khi seed dang chay');
  ok(/lock_not_available/.test(m080), '080: bat lock_not_available thay vi cho den timeout');

  ok(/lock_timeout/.test(m081), '081 dat lock_timeout de khong cho den statement timeout');
  ok(/apply_tournament_result_correction_graph_aware/.test(m081), '081 ap cho ham correction');
  ok(/advance_division_group_rank_transitions/.test(m081), '081 ap cho ham advance');

  // Route correction phai dich lock-busy thanh 409, khong phai 500.
  const corr = read('app/api/tournament-v2/corrections/route.js');
  ok(/LOCK_BUSY_CODES\s*=\s*\['55P03',\s*'57014'\]/.test(corr),
    'corrections/route.js coi 55P03 + 57014 la ban khoa');
  ok(/GROUP_SEEDING_IN_PROGRESS/.test(corr), 'corrections/route.js tra ma ro rang khi ban khoa');
}

/* ---------- 3. E4 / E7 / E3 tai mutation boundary ---------- */
{
  const m079 = read('database/migrations/079_seed_correction_race_and_advance_hardening.sql');
  // E4: chi bump version khi assignment thuc su doi.
  ok(/v_changed\s*:=/.test(m079) && /IF v_changed THEN/.test(m079),
    'E4: advance chi UPDATE (va bump version) khi assignment doi');
  ok(/'changed',changed/.test(m079), 'E4: tra ve so luong thuc su doi de kiem chung');
  // E7: cam mot suat vao hai nhanh.
  ok(/GROUP_RANK_ENTRY_DUPLICATE/.test(m079), 'E7: tu choi suat trung');
  ok(/assigned_ids/.test(m079), 'E7: theo doi cac suat da gan');
  // E3: bao ro khi bang qua it doi.
  ok(/GROUP_TOO_SMALL_FOR_TOP_TWO/.test(m079), 'E3: advance bao ro bang qua it doi');

  // E3 tu choi SOM tai buoc lap ke hoach.
  const m083 = read('database/migrations/083_record_group_too_small_guard.sql');
  ok(/GROUP_TOO_SMALL_FOR_TOP_TWO/.test(m083), 'E3: guard som o configure_top_two');
  ok(/2\*v_groups/.test(m083), 'E3: dieu kien entry >= 2 * so bang');
}

/* ---------- 4. Duong phuc hoi: go seed ---------- */
{
  const m082 = read('database/migrations/082_unseed_division_group_playoff.sql');
  ok(/unseed_division_group_playoff/.test(m082), '082 tao ham go seed');
  ok(/UNSEED_BLOCKED_MATCH_STARTED/.test(m082),
    'go seed phai TU CHOI khi tran vong sau da bat dau / co ti so');
  ok(/tournament_games/.test(m082), 'go seed kiem tra ca ban ghi game, khong chi status');
  ok(!/DROP TABLE|TRUNCATE/i.test(m082), 'go seed khong duoc xoa bang');

  // Phai co lo vao tren UI, neu khong la "huong dan thao tac chua co".
  const client = read('lib/tournamentV2Client.js');
  ok(/export function unseedPlayoff/.test(client), 'client co wrapper unseedPlayoff');
  const route = read('app/api/tournament-v2/setup/route.js');
  ok(/action === 'unseed_playoff'/.test(route), 'setup route co action unseed_playoff');
  const panel = read('app/giai-dau/v2/console/tabs/DivisionSetupPanel.js');
  ok(/unseedPlayoff/.test(panel) && /Gỡ seed play-off/.test(panel),
    'console co nut "Gỡ seed play-off"');

  // Hanh dong tien cap cung phai co lo vao (truoc day OverviewTab khong duoc mount).
  const standings = read('app/giai-dau/v2/console/tabs/StandingsTab.js');
  ok(/advanceStage/.test(standings) && /Tiến cấp vào play-off/.test(standings),
    'console co nut "Tiến cấp vào play-off"');
}

/* ---------- 5. actor khong duoc truyen nguyen object vao p_actor text ---------- */
{
  ok(exists('lib/tournament/actorName.js'), 'co helper actorName dung chung');
  const helper = read('lib/tournament/actorName.js');
  ok(/session/.test(helper), 'helper giai thich vi sao khong duoc truyen ca object (co ca session)');
  for (const f of ['setup', 'corrections', 'draw']) {
    const src = read(`app/api/tournament-v2/${f}/route.js`);
    ok(!/p_actor:\s*(access|adminCheck)\.actor\b/.test(src),
      `${f}/route.js khong truyen thang object actor vao p_actor`);
  }
}

/* ---------- 6. Pre-deploy: policy race, DELETE guard, RLS, strict gate ---------- */
{
  const m088 = read('database/migrations/088_predeploy_tournament_hardening.sql');
  ok(/'tiebreak'/.test(m088) && /tiebreak_override/.test(m088) && /tiebreak_policy/.test(m088),
    '088: fingerprint bao gom effective tie-break policy');
  ok(/ORDER BY s\.id[\s\S]*FOR UPDATE/.test(m088),
    '088: doi policy khoa source stages theo thu tu on dinh');
  ok(/pg_trigger_depth\(\)\s*>\s*1/.test(m088),
    '088: chi bypass DELETE guard cho cascade teardown');
  ok(/BEFORE INSERT OR UPDATE OR DELETE ON public\.tournament_games/.test(m088),
    '088: DELETE game truc tiep van qua E5 guard');
  ok(/tournament_stage_transitions ENABLE ROW LEVEL SECURITY/.test(m088)
    && /club_notifications ENABLE ROW LEVEL SECURITY/.test(m088),
    '088: bat RLS cho bang operational moi va club_notifications');

  const advance = read('app/api/tournament-v2/advance/route.js');
  ok(advance.indexOf("db.rpc('group_stage_results_fingerprint'") < advance.indexOf('const scoringContext = await loadScoringContext'),
    'advance chup fingerprint truoc khi doc policy va tinh BXH');
  const runner = read('tests/unified-setup/run-all.js');
  ok(/allowBlocked\s*&&\s*result\.code\s*===\s*2/.test(runner),
    'release runner mac dinh coi browser BLOCKED la that bai');
}

if (failed) { console.error(`release-hardening: ${failed} assertion(s) failed`); process.exit(1); }
console.log('release-hardening contract ok');
