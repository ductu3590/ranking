/** Pure tournament finance ledger helpers. Amounts are signed minor units. */
function normalizeAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount === 0) throw new Error('Amount must be a non-zero number');
  return Math.round(amount * 100) / 100;
}

function createLedgerEntry(input = {}) {
  if (!input.tournament_id) throw new Error('tournament_id is required');
  return {
    tournament_id: input.tournament_id,
    division_id: input.division_id ?? null,
    entry_id: input.entry_id ?? null,
    entrant_id: input.entrant_id ?? null,
    amount: normalizeAmount(input.amount),
    currency: String(input.currency || 'VND').trim().toUpperCase(),
    kind: String(input.kind || 'adjustment').trim().toLowerCase(),
    description: input.description ? String(input.description).trim() : null,
    external_ref: input.external_ref ? String(input.external_ref).trim() : null,
    status: 'posted',
    reversal_of_id: input.reversal_of_id ?? null,
  };
}

function reverseLedgerEntry(entry, reason) {
  if (!entry || !entry.id) throw new Error('Ledger entry id is required');
  if (entry.reversal_of_id) throw new Error('Cannot reverse a reversal entry');
  return createLedgerEntry({
    tournament_id: entry.tournament_id,
    division_id: entry.division_id,
    entry_id: entry.entry_id,
    entrant_id: entry.entrant_id,
    amount: -Number(entry.amount),
    currency: entry.currency,
    kind: 'reversal',
    description: reason || `Reversal of ${entry.id}`,
    reversal_of_id: entry.id,
  });
}

function summarizeLedger(rows = []) {
  const totals = {};
  let net = 0;
  for (const row of rows) {
    const currency = String(row.currency || 'VND').toUpperCase();
    const amount = Number(row.amount || 0);
    if (!Number.isFinite(amount)) continue;
    totals[currency] = Math.round(((totals[currency] || 0) + amount) * 100) / 100;
    if (currency === 'VND') net = Math.round((net + amount) * 100) / 100;
  }
  return { net, totals, count: rows.length };
}

module.exports = { normalizeAmount, createLedgerEntry, reverseLedgerEntry, summarizeLedger };
