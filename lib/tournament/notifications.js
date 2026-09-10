/** Minimal notification adapter. Provider failures never fail the tournament mutation. */
function buildNotification(input = {}) {
  if (!input.tournament_id || !input.recipient) throw new Error('tournament_id and recipient are required');
  return {
    tournament_id: input.tournament_id,
    division_id: input.division_id ?? null,
    recipient: String(input.recipient).trim(),
    channel: String(input.channel || 'in_app').trim().toLowerCase(),
    template: String(input.template || 'generic').trim(),
    payload: input.payload && typeof input.payload === 'object' ? input.payload : {},
    status: 'queued',
  };
}

async function deliverWithIsolation(notification, provider) {
  try {
    const result = await provider(notification);
    return { ok: true, status: 'sent', result };
  } catch (error) {
    console.error('Tournament notification provider failed:', error);
    return { ok: false, status: 'provider_failed', error: error.message || 'Provider failed' };
  }
}

module.exports = { buildNotification, deliverWithIsolation };
