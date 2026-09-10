const crypto = require('crypto');

function hashQrCheckinToken(token) {
    return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

function normalizeScoreSubmission(body) {
    const games = Array.isArray(body?.games) ? body.games : [];
    const clientMutationId = String(body?.client_mutation_id || body?.clientMutationId || '').trim();
    if (!clientMutationId || clientMutationId.length > 200) throw new Error('client_mutation_id không hợp lệ');
    const expectedVersion = body?.expected_version == null ? null : Number(body.expected_version);
    if (expectedVersion !== null && !Number.isInteger(expectedVersion)) throw new Error('expected_version không hợp lệ');
    return { games, clientMutationId, expectedVersion, deviceTimestamp: body?.device_timestamp || body?.deviceTimestamp || null };
}

module.exports = { hashQrCheckinToken, normalizeScoreSubmission };
