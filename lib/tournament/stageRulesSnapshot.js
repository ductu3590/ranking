'use strict';
// Chốt (snapshot) luật điểm + tie-break vào chính giai đoạn, ngay khi lịch thi
// đấu được sinh ra.
//
// Vì sao cần: engine chỉ đọc `stage.config`. Nếu giai đoạn không mang theo
// snapshot thì chính sách hiệu lực phải resolve lại từ giải/nội dung mỗi lần
// đọc — và BTC đổi cấu hình giữa giải sẽ làm bảng xếp hạng đổi theo trong khi
// vòng sau đã giữ suất cũ. Đó đúng là điều guard E5 cấm.
//
// Trước đây chỉ route `generate` (đường cũ) làm việc này; route `draw` —
// đường mà giao diện thật sự dùng để chốt lịch — thì không, nên lỗ hổng vẫn
// còn. Hàm này là nơi DUY NHẤT thực hiện việc chốt, dùng chung cho cả hai.

const { resolveStageScoring } = require('./rules/scoring');
const { resolveTiebreak } = require('./rules/tiebreak');

// Trả { ok, stage, snapshotted, code, error }. Không ném lỗi.
// CAS trên chính `config` cũ: nếu ai đó vừa đổi cấu hình giai đoạn thì từ chối
// thay vì ghi đè.
async function snapshotStageRules(db, stage, groupId) {
  if (stage.config && stage.config.scoring && stage.config.tiebreak) {
    return { ok: true, stage, snapshotted: false };
  }

  const [tournamentResult, divisionResult] = await Promise.all([
    db.from('tournaments')
      .select('default_scoring, tiebreak_policy')
      .eq('id', stage.tournament_id)
      .eq('group_id', groupId)
      .maybeSingle(),
    stage.division_id
      ? db.from('tournament_divisions')
        .select('scoring_override, tiebreak_override')
        .eq('id', stage.division_id)
        .eq('group_id', groupId)
        .maybeSingle()
      : Promise.resolve({ data: {}, error: null }),
  ]);
  if (tournamentResult.error || divisionResult.error) {
    return {
      ok: false,
      code: 'STAGE_RULES_SNAPSHOT_READ_FAILED',
      error: (tournamentResult.error || divisionResult.error).message,
    };
  }

  const tournament = tournamentResult.data || {};
  const division = divisionResult.data || {};
  const nextConfig = {
    ...(stage.config || {}),
    scoring: (stage.config && stage.config.scoring) || resolveStageScoring(tournament, division, stage),
    tiebreak: (stage.config && stage.config.tiebreak) || resolveTiebreak(tournament, division, stage),
  };

  let query = db.from('tournament_stages')
    .update({ config: nextConfig })
    .eq('id', stage.id)
    .eq('group_id', groupId);
  // `IS DISTINCT FROM` phía RPC phân biệt null với {}, nên CAS ở đây cũng phải
  // phân biệt đúng như vậy.
  query = stage.config == null
    ? query.is('config', null)
    : query.eq('config', JSON.stringify(stage.config));
  const { data, error } = await query.select('id, config').maybeSingle();
  if (error) return { ok: false, code: 'STAGE_RULES_SNAPSHOT_FAILED', error: error.message };
  if (!data) {
    return {
      ok: false,
      code: 'STAGE_CONFIG_CHANGED',
      error: 'Cấu hình giai đoạn vừa thay đổi. Hãy tải lại trước khi tiếp tục.',
    };
  }
  return { ok: true, stage: { ...stage, config: data.config }, snapshotted: true };
}

module.exports = { snapshotStageRules };
