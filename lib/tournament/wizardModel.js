'use strict';

// View-model thuần cho Wizard giải đấu (Phase 3, mô hình đã hội tụ
// tournament → division → entry → stage → match → game).
//
// Module này KHÔNG truy cập Supabase và KHÔNG gọi fetch. Nó chỉ chuyển lựa chọn
// của BTC trên giao diện thành payload hợp lệ bằng đúng các validator domain đã
// có, để UI và API cùng nói một ngôn ngữ và test chạy được ngoài trình duyệt.

const {
  assertTournamentOrganizer,
  validateDivisionOptions,
  validateTournamentAthlete,
  confirmPairing,
  evaluateRatingWarning,
} = require('./interclub');
const { SCORING_PRESETS, resolveStageScoring } = require('./rules/scoring');
const { TIEBREAK_PRESETS, resolveTiebreak } = require('./rules/tiebreak');

class WizardError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'WizardError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new WizardError(code, message);
}

/* ==================== Chế độ tổ chức ==================== */

const ORGANIZER_MODES = Object.freeze([
  Object.freeze({
    id: 'internal',
    label: 'Nội bộ CLB',
    description: 'Chỉ VĐV của CLB mình, có thể thêm VĐV khách nếu điều lệ cho phép.',
    organizer_type: 'club',
    invites_clubs: false,
    open_registration: false,
  }),
  Object.freeze({
    id: 'friendly',
    label: 'Giao hữu liên CLB',
    description: 'Mời CLB trong PickHub hoặc CLB ngoài hệ thống; mỗi CLB tự nộp đội hình.',
    organizer_type: 'club',
    invites_clubs: true,
    open_registration: false,
  }),
  Object.freeze({
    id: 'community',
    label: 'Cộng đồng mở đăng ký',
    description: 'Mọi CLB trên PickHub gửi đăng ký; cần tài khoản quản trị cộng đồng.',
    organizer_type: 'community',
    invites_clubs: true,
    open_registration: true,
  }),
]);

function findOrganizerMode(mode) {
  return ORGANIZER_MODES.find((item) => item.id === mode) || null;
}

// Trả payload organizer đã được domain validate. `organizer_mode` được lưu trong
// `tournaments.settings` để Wizard mở lại đúng luồng đã chọn.
function resolveOrganizerPayload(mode, { clubId } = {}) {
  const found = findOrganizerMode(mode);
  if (!found) fail('INVALID_ORGANIZER_MODE', `Chế độ tổ chức không hợp lệ: ${mode}`);
  const organizerClubId = found.organizer_type === 'club' ? (clubId == null ? null : Number(clubId)) : null;
  const validated = assertTournamentOrganizer({
    organizer_type: found.organizer_type,
    organizer_club_id: organizerClubId,
    organizer_community_id: null,
  });
  return {
    ...validated,
    organizer_mode: found.id,
    invites_clubs: found.invites_clubs,
    open_registration: found.open_registration,
    requires_platform_session: found.organizer_type === 'community',
  };
}

/* ==================== Nội dung thi đấu (division) ==================== */

const PLAY_TYPE_TO_ENTRANT_TYPE = Object.freeze({
  singles: 'individual',
  doubles: 'pair',
  team: 'team',
});

const PLAY_TYPE_OPTIONS = Object.freeze([
  Object.freeze({ id: 'singles', label: 'Đánh đơn', hint: 'Mỗi VĐV là một suất, không ghép cặp.' }),
  Object.freeze({ id: 'doubles', label: 'Đánh đôi', hint: 'Hai VĐV thành một cặp, ghép tự động hoặc thủ công.' }),
  Object.freeze({ id: 'team', label: 'Đồng đội', hint: 'Mỗi CLB một đội, dùng cho MLP và giao hữu.' }),
]);

const SCORING_SCOPE_OPTIONS = Object.freeze([
  Object.freeze({ id: 'athlete', label: 'Thành tích cá nhân' }),
  Object.freeze({ id: 'club', label: 'Thành tích CLB' }),
]);

const RATING_POLICY_OPTIONS = Object.freeze([
  Object.freeze({ id: 'open', label: 'Open (không giới hạn PHR)' }),
  Object.freeze({ id: 'capped', label: 'Giới hạn tổng PHR' }),
]);

const PAIRING_MODE_OPTIONS = Object.freeze([
  Object.freeze({ id: 'none', label: 'Không áp dụng' }),
  Object.freeze({ id: 'random_balanced', label: 'Tự động cân bằng PHR' }),
  Object.freeze({ id: 'manual', label: 'Ghép thủ công' }),
]);

function mapPlayTypeToEntrantType(playType) {
  const entrantType = PLAY_TYPE_TO_ENTRANT_TYPE[playType];
  if (!entrantType) fail('INVALID_PLAY_TYPE', `play_type không hợp lệ: ${playType}`);
  return entrantType;
}

function defaultScoringScope(playType) {
  return playType === 'team' ? 'club' : 'athlete';
}

// `play_type` là nguồn chân lý; `entrant_type` legacy được suy ra để thỏa
// ràng buộc tournament_divisions_entrant_type_relation_ck.
function buildDivisionPayload(input = {}) {
  const name = String(input.name || '').trim();
  if (!name) fail('DIVISION_NAME_REQUIRED', 'Nội dung thi đấu phải có tên');
  const playType = input.play_type || 'team';
  const options = validateDivisionOptions({
    play_type: playType,
    scoring_scope: input.scoring_scope || defaultScoringScope(playType),
    rating_policy: input.rating_policy || 'open',
    rating_cap: input.rating_cap,
    pairing_mode: input.pairing_mode || 'none',
    scoring_override: input.scoring_override ?? null,
    tiebreak_override: input.tiebreak_override ?? null,
  });
  return {
    ...options,
    name,
    entrant_type: mapPlayTypeToEntrantType(options.play_type),
    capacity: input.capacity == null || input.capacity === '' ? null : Number(input.capacity),
    competition_template: input.competition_template || 'interclub_friendly_team_v1',
  };
}

/* ==================== Luật điểm số và tie-break ==================== */

const SCORING_PRESET_LABELS = Object.freeze({
  legacy_v2: 'Giữ như giải cũ (legacy)',
  phong_trao_mac_dinh: 'Phong trào mặc định — tới 11, cách 2',
  phong_trao_11: 'Phong trào 11 — 1 ván tới 11, cap 15',
  phong_trao_15: 'Phong trào 15 — 1 ván tới 15, cap 21',
  ban_ket_chung_ket: 'Bán kết/Chung kết — 3 ván tới 11',
  mlp_4_van: 'MLP 4 ván — tới 21, có DreamBreaker',
});

const TIEBREAK_PRESET_LABELS = Object.freeze({
  legacy_v2: 'Giữ như giải cũ (legacy)',
  phong_trao_mac_dinh: 'Phong trào mặc định',
  hieu_so_van_truoc: 'Hiệu số ván trước',
  giao_huu_clb: 'Giao hữu CLB (tính điểm CLB)',
  draw_lot: 'Bốc thăm khi hòa',
});

function describeScoring(preset) {
  if (!preset) return '';
  if (preset.mlp) return `MLP ${preset.mlp.sub_matches} ván tới ${preset.points_to}`;
  const cap = preset.cap == null ? 'không cap' : `cap ${preset.cap}`;
  return `${preset.best_of} ván · tới ${preset.points_to} · cách ${preset.win_by} · ${cap}`;
}

const SCORING_PRESET_OPTIONS = Object.freeze(Object.keys(SCORING_PRESETS).map((id) => Object.freeze({
  id,
  label: SCORING_PRESET_LABELS[id] || id,
  summary: describeScoring(SCORING_PRESETS[id]),
  preset: SCORING_PRESETS[id],
})));

const TIEBREAK_PRESET_OPTIONS = Object.freeze(Object.keys(TIEBREAK_PRESETS).map((id) => Object.freeze({
  id,
  label: TIEBREAK_PRESET_LABELS[id] || id,
  summary: (TIEBREAK_PRESETS[id].order || []).join(' → '),
  preset: TIEBREAK_PRESETS[id],
})));

// jsonb mặc định của Supabase là '{}'; coi object rỗng là "chưa cấu hình" để
// nguồn hiệu lực không bị báo nhầm thành tournament/division.
function hasPolicy(value) {
  return Boolean(value) && typeof value === 'object' && Object.keys(value).length > 0;
}

function pickPolicy(value) {
  return hasPolicy(value) ? value : null;
}

function policySource(stagePolicy, divisionPolicy, tournamentPolicy) {
  if (hasPolicy(stagePolicy)) return 'stage';
  if (hasPolicy(divisionPolicy)) return 'division';
  if (hasPolicy(tournamentPolicy)) return 'tournament';
  return 'mac_dinh';
}

const LOCKED_STAGE_STATUSES = new Set(['active', 'completed', 'live', 'done']);

// Luật hiệu lực của từng stage: tournament default → division override →
// snapshot của stage. Dùng để BTC xem trước trước khi chốt bốc thăm.
function buildRulesPreview({ tournament = {}, divisions = [], stages = [] } = {}) {
  const divisionById = new Map((divisions || []).map((division) => [String(division.id), division]));
  const tournamentInput = {
    default_scoring: pickPolicy(tournament.default_scoring),
    tiebreak_policy: pickPolicy(tournament.tiebreak_policy),
  };
  return (stages || []).map((stage) => {
    const division = divisionById.get(String(stage.division_id)) || {};
    const divisionInput = {
      scoring_override: pickPolicy(division.scoring_override),
      tiebreak_override: pickPolicy(division.tiebreak_override),
    };
    const stageInput = {
      ...stage,
      config: {
        ...(stage.config || {}),
        scoring: pickPolicy(stage.config && stage.config.scoring),
        tiebreak: pickPolicy(stage.config && stage.config.tiebreak),
      },
    };
    const locked = hasPolicy(stageInput.config.scoring)
      || hasPolicy(stageInput.config.tiebreak)
      || LOCKED_STAGE_STATUSES.has(String(stage.status || ''));
    return {
      stage_id: stage.id,
      stage_name: stage.name || '',
      division_id: stage.division_id ?? null,
      division_name: division.name || 'Chưa gán nội dung',
      scoring: resolveStageScoring(tournamentInput, divisionInput, stageInput),
      tiebreak: resolveTiebreak(tournamentInput, divisionInput, stageInput),
      scoring_source: policySource(stageInput.config.scoring, divisionInput.scoring_override, tournamentInput.default_scoring),
      tiebreak_source: policySource(stageInput.config.tiebreak, divisionInput.tiebreak_override, tournamentInput.tiebreak_policy),
      locked,
    };
  });
}

/* ==================== Cảnh báo PHR (không bao giờ chặn) ==================== */

const RATING_WARNING_LABELS = Object.freeze({
  missing: 'Thiếu PHR',
  pending: 'PHR chờ xác nhận',
  rejected: 'PHR bị từ chối',
  over_limit: 'Vượt giới hạn PHR',
});

function warningMessage(status, warning, division) {
  const cap = warning.rating_cap ?? division.rating_cap ?? null;
  if (status === 'missing') return 'Cặp có VĐV chưa nhập PHR — vẫn gửi đăng ký được, BTC tự quyết.';
  if (status === 'pending') return 'PHR của VĐV đang chờ xác nhận — chỉ là cảnh báo.';
  if (status === 'rejected') return 'PHR của VĐV bị từ chối — BTC xem lại trước khi duyệt.';
  if (status === 'over_limit') return `Tổng PHR ${warning.total_phr} vượt giới hạn ${cap} — vẫn gửi và duyệt được.`;
  return '';
}

// Điều lệ Phase 3: thiếu/pending/rejected/vượt cap chỉ là cảnh báo.
// Không hàm nào trong module này được trả blocking = true.
function summarizeRosterWarnings(pairs = [], division = {}) {
  const counts = { missing: 0, pending: 0, rejected: 0, over_limit: 0, confirmed: 0 };
  const warnings = [];
  for (const pair of pairs || []) {
    const evaluated = evaluateRatingWarning(pair, division);
    const status = evaluated.status;
    if (counts[status] != null) counts[status] += 1;
    if (status === 'confirmed') continue;
    warnings.push({
      pair_id: pair.id ?? null,
      status,
      label: RATING_WARNING_LABELS[status] || status,
      message: warningMessage(status, evaluated, division),
      total_phr: evaluated.total_phr ?? null,
      rating_cap: evaluated.rating_cap ?? division.rating_cap ?? null,
      athlete_ids: evaluated.missing_athlete_ids || evaluated.pending_athlete_ids || evaluated.rejected_athlete_ids || [],
      blocking: false,
    });
  }
  return { warnings, counts, blocking: false };
}

function canSubmitRoster() {
  return { allowed: true, reason: null };
}

function canApproveRoster() {
  return { allowed: true, reason: null };
}

/* ==================== VĐV CLB, VĐV khách, ghép cặp ==================== */

// `source` là trường suy ra để hiển thị, không có cột tương ứng trong
// tournament_athletes; API phải bỏ trước khi insert.
function buildGuestAthletePayload(input = {}) {
  const validated = validateTournamentAthlete({
    athlete_id: null,
    display_name_snapshot: input.display_name,
    phr_rating: input.phr_rating,
    phr_status: input.phr_status,
  });
  return {
    ...validated,
    tournament_id: input.tournament_id ?? null,
    tournament_club_id: input.tournament_club_id ?? null,
    club_name_snapshot: input.club_name || null,
    source: 'guest',
  };
}

function buildClubMemberAthletePayload(input = {}) {
  const validated = validateTournamentAthlete({
    athlete_id: input.athlete_id,
    display_name_snapshot: input.display_name,
    phr_rating: input.phr_rating,
    phr_status: input.phr_status,
  });
  return {
    ...validated,
    tournament_id: input.tournament_id ?? null,
    tournament_club_id: input.tournament_club_id ?? null,
    club_name_snapshot: input.club_name || null,
    source: 'club_member',
  };
}

function validateManualPairs(pairs = []) {
  return confirmPairing(pairs);
}

/* ==================== Audit khi BTC nhập hộ roster ==================== */

function buildRosterAudit({ actor = 'club_admin', reason = '', profileId = null, at = null } = {}) {
  if (!['club_admin', 'organizer'].includes(actor)) fail('INVALID_ROSTER_ACTOR', 'Actor nộp roster không hợp lệ');
  const trimmedReason = String(reason || '').trim();
  if (actor === 'organizer' && !trimmedReason) {
    fail('ROSTER_AUDIT_REASON_REQUIRED', 'BTC nhập hộ roster phải ghi lý do');
  }
  const recordedAt = at || new Date().toISOString();
  return {
    submitted_by_actor: actor,
    club_confirmation_status: actor === 'organizer' ? 'pending' : 'confirmed',
    private_note: actor === 'organizer' ? `BTC nhập hộ: ${trimmedReason}` : null,
    captain_declaration: {
      audit: {
        actor,
        reason: trimmedReason || null,
        recorded_by_profile_id: profileId,
        recorded_at: recordedAt,
      },
    },
  };
}

/* ==================== Stage theo division ==================== */

const STAGE_PLAN_OPTIONS = Object.freeze([
  Object.freeze({ id: 'single_round_robin', label: 'Vòng tròn tính điểm', hint: 'Tất cả gặp nhau trong một bảng.' }),
  Object.freeze({ id: 'single_knockout', label: 'Loại trực tiếp', hint: 'Thắng đi tiếp, thua dừng bước.' }),
  Object.freeze({ id: 'group_knockout', label: 'Vòng bảng → Chung kết', hint: 'Chia bảng rồi vào nhánh loại trực tiếp.' }),
  Object.freeze({ id: 'mlp', label: 'MLP nhiều ván', hint: 'Đội đấu nhiều ván con, có DreamBreaker.' }),
]);

function buildDivisionStagePayloads({ tournament_id: tournamentId, division = {}, stage_plan: stagePlan, config = {} } = {}) {
  if (division.id == null) fail('DIVISION_ID_REQUIRED', 'Stage bắt buộc thuộc một nội dung thi đấu');
  const base = { tournament_id: tournamentId, division_id: division.id };
  if (stagePlan === 'single_round_robin') {
    return [{ ...base, name: 'Vòng tròn', schedule_format: 'round_robin', match_format: 'simple', config: {} }];
  }
  if (stagePlan === 'single_knockout') {
    return [{ ...base, name: 'Loại trực tiếp', schedule_format: 'knockout', match_format: 'simple', config: {} }];
  }
  if (stagePlan === 'group_knockout') {
    return [
      {
        ...base,
        name: 'Vòng bảng',
        schedule_format: 'round_robin',
        match_format: 'simple',
        config: {
          groupCount: Number(config.groupCount) || 2,
          advancePerGroup: Number(config.advancePerGroup) || 2,
        },
      },
      { ...base, name: 'Chung kết', schedule_format: 'knockout', match_format: 'simple', config: {} },
    ];
  }
  if (stagePlan === 'mlp') {
    return [{
      ...base,
      name: 'Vòng đấu MLP',
      schedule_format: 'round_robin',
      match_format: 'mlp',
      config: {
        gamesPerMatchup: Number(config.gamesPerMatchup) || 4,
        dreamBreaker: config.dreamBreaker !== false,
      },
    }];
  }
  return fail('INVALID_STAGE_PLAN', `Kế hoạch giai đoạn không hợp lệ: ${stagePlan}`);
}

module.exports = {
  WizardError,
  ORGANIZER_MODES,
  PLAY_TYPE_OPTIONS,
  SCORING_SCOPE_OPTIONS,
  RATING_POLICY_OPTIONS,
  PAIRING_MODE_OPTIONS,
  STAGE_PLAN_OPTIONS,
  SCORING_PRESET_OPTIONS,
  TIEBREAK_PRESET_OPTIONS,
  RATING_WARNING_LABELS,
  findOrganizerMode,
  resolveOrganizerPayload,
  mapPlayTypeToEntrantType,
  buildDivisionPayload,
  buildRulesPreview,
  summarizeRosterWarnings,
  canSubmitRoster,
  canApproveRoster,
  buildGuestAthletePayload,
  buildClubMemberAthletePayload,
  validateManualPairs,
  buildRosterAudit,
  buildDivisionStagePayloads,
};
