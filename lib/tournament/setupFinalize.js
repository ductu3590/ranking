const STABLE_CODES = new Set([
    'TOURNAMENT_NAME_REQUIRED', 'ROSTER_EMPTY', 'MEMBER_OUTSIDE_GROUP', 'ATHLETE_ID_MISSING',
    'UNPAIRED_MEMBER', 'PAIR_MEMBER_COUNT_INVALID', 'DIVISION_CONFIG_INVALID', 'DRAW_REQUIRED',
    'DRAW_STALE', 'STAGE_PLAN_INVALID', 'STRUCTURE_LOCKED_BY_RESULTS', 'REVISION_CONFLICT',
    'FINALIZE_NOT_ATOMIC', 'IDEMPOTENCY_KEY_REUSED', 'ADVANCE_RESULTS_INCOMPLETE',
]);

function setupError(code, message, field) {
    const error = new Error(message);
    error.code = STABLE_CODES.has(code) ? code : 'FINALIZE_NOT_ATOMIC';
    if (field) error.field = field;
    return error;
}

function validateFinalizePayload(body) {
    if (!body || typeof body !== 'object') throw setupError('DIVISION_CONFIG_INVALID', 'Payload không hợp lệ');
    const tournamentId = Number(body.tournament_id ?? body.tournamentId);
    const divisionId = Number(body.division_id ?? body.divisionId);
    const expectedRevision = Number(body.expected_revision ?? body.expectedRevision);
    const idempotencyKey = String(body.idempotency_key ?? body.idempotencyKey ?? '').trim();
    if (!Number.isSafeInteger(tournamentId) || tournamentId < 1) throw setupError('DIVISION_CONFIG_INVALID', 'tournament_id không hợp lệ', 'tournament_id');
    if (!Number.isSafeInteger(divisionId) || divisionId < 1) throw setupError('DIVISION_CONFIG_INVALID', 'division_id không hợp lệ', 'division_id');
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw setupError('REVISION_CONFLICT', 'expected_revision là bắt buộc', 'expected_revision');
    if (!idempotencyKey || idempotencyKey.length > 200) throw setupError('DIVISION_CONFIG_INVALID', 'idempotency_key là bắt buộc', 'idempotency_key');
    if (!body.draw || body.draw.status !== 'drafted' && body.draw.status !== 'ready') throw setupError('DRAW_REQUIRED', 'Bản bốc thăm chưa sẵn sàng', 'draw');
    if (!Array.isArray(body.stage_plan) && !Array.isArray(body.stagePlan)) throw setupError('STAGE_PLAN_INVALID', 'stage_plan là bắt buộc', 'stage_plan');
    return { tournamentId, divisionId, expectedRevision, idempotencyKey };
}

function mapRpcError(error) {
    const message = error?.message || 'Không thể chốt bốc thăm';
    const known = [...STABLE_CODES].find((code) => message.includes(code));
    const mapped = new Error(message);
    mapped.code = known || (error?.code === 'P0002' ? 'STRUCTURE_LOCKED_BY_RESULTS' : 'FINALIZE_NOT_ATOMIC');
    mapped.status = error?.code === 'P0002' ? 409 : 409;
    return mapped;
}

module.exports = { validateFinalizePayload, mapRpcError, setupError };
