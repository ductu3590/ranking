'use strict';

const { assert, read } = require('../_harness');

const route = read('app/api/tournament-v2/setup/route.js');
const client = read('lib/tournamentV2Client.js');
const migration = read('database/migrations/091_unified_setup_aggregate_draft.sql');

assert.ok(route.includes("action === 'save_aggregate'"), 'setup route exposes only the explicit aggregate save action');
assert.ok(route.includes('requireValidatedGroupAdmin'), 'aggregate save derives the group from the server admin session');
assert.ok(route.includes("db.rpc('save_unified_setup_aggregate_draft'"), 'route delegates every aggregate write to one atomic RPC');
assert.ok(route.includes('setup_draft'), 'route source selects the persisted aggregate draft');
assert.ok(route.includes('draft: division.setup_draft || null'), 'GET returns the persisted snapshot with authoritative division data');
assert.ok(client.includes("action: 'save_aggregate'"), 'client uses the aggregate persistence contract');
assert.ok(client.includes('memberIds') && client.includes('guests') && !client.includes('athlete_ids: (draft?.participants'), 'draft save sends member/guest identities and no longer writes roster athlete ids');
assert.ok(migration.includes('ADD COLUMN IF NOT EXISTS setup_draft jsonb'), 'migration adds the additive draft snapshot column');
assert.ok(migration.includes('save_unified_setup_aggregate_draft'), 'migration defines aggregate save RPC');
assert.ok(migration.includes('SECURITY DEFINER SET search_path = public'), 'RPC pins the security-definer search path');
assert.ok(migration.includes('REVOKE ALL ON FUNCTION') && migration.includes('TO service_role'), 'RPC is service-role only');
assert.ok(migration.includes('client_draft_key') && !migration.includes('INSERT INTO public.tournaments'), 'aggregate save uses a durable client key but never bootstraps a tournament');
assert.ok(migration.includes('SET setup_draft = normalized, setup_revision = setup_revision + 1'), 'successful save atomically stores snapshot and bumps CAS revision');
assert.ok(migration.includes("operation = 'save_unified_setup_aggregate_draft'") && migration.includes('payload_fingerprint'), 'idempotency uses a canonical payload fingerprint');
assert.ok(migration.includes('p_tournament_id IS NULL OR p_division_id IS NULL') && route.includes('!hasTournamentId || !hasDivisionId'), 'aggregate save requires both authoritative target ids at both boundaries');
assert.ok(migration.includes("':aggregate-draft:' || btrim(p_client_draft_key)") && !migration.includes("':aggregate-draft:' || p_idempotency_key"), 'bootstrap lock is scoped by group and durable client draft key');
assert.ok(migration.includes("'tournament_id', p_tournament_id") && migration.includes("'expected_setup_revision', p_expected_setup_revision"), 'idempotency fingerprint binds target ids and expected revision');
assert.ok(!migration.includes('SETUP_DRAFT_DIVISION_AMBIGUOUS') && !migration.includes("setup_draft->>'clientDraftKey'"), 'target division is explicit rather than inferred from a bootstrap key');
assert.ok(migration.includes("jsonb_typeof(p_draft->'participants'->'memberIds') <> 'array'") && migration.includes("jsonb_array_elements(COALESCE(p_draft->'pairs'"), 'SQL validates persisted member/guest participant components and array members');
assert.ok(route.includes("code: 'SETUP_READ_FAILED'") && !route.includes('return NextResponse.json({ error: err.message }, { status: 500 });'), 'GET failures use a stable non-leaky error contract');
assert.ok(client.includes('const aggregateSaveKeys = new WeakMap()') && client.includes('const { clientDraftKey, idempotencyKey } = aggregateKeysFor(draft)'), 'client preserves separate save keys over a failed retry');
assert.ok(!client.includes('clientDraftKey,\n            idempotencyKey,'), 'a successful save does not reuse its idempotency key for a later revision');
assert.ok(!migration.includes('INSERT INTO public.tournament_clubs') && !migration.includes('INSERT INTO public.tournament_external_clubs'), 'friendly draft round-trips only and never writes invitation tables');
assert.ok(migration.includes("v_organizer_mode NOT IN ('internal', 'friendly')") && migration.includes("v_format_key NOT IN ('round_robin', 'knockout', 'group_knockout', 'mlp')"), 'SQL validates normalized enum fields rather than accepting arbitrary aggregate JSON');
assert.ok(!migration.includes('reserveMemberIds') && !client.includes('reserveMemberIds'), 'aggregate client contract no longer persists reserves');
assert.ok(client.includes('startTime') && client.includes('courtCount'), 'aggregate client persists start time and court count');
assert.ok(!client.includes('UNTITLED_INTERNAL_TOURNAMENT') && !migration.includes("v_name IS NULL OR"), 'draft save does not inject a bootstrap name or require a title before step 4');

console.log('unified setup aggregate draft API contract ok');
