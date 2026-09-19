'use strict';

// CONTRACT CONFORMANCE — duplicate safety of identity and draft creation.
// 08_FROZEN_CONTRACT.md section 2 (migration 074), section 3 (POST /tournaments) and
// invariant 5: "Identity creation and tournament draft creation are duplicate-safe on retry
// (client_ref, client_draft_key). Pair-RPC idempotency alone is not sufficient."
//
// Missing files FAIL LOUDLY (the contract requires them); nothing is skipped.
//
// EVIDENCE KIND: static source/SQL inspection. Real duplicate-safety on retry can only be
// proven against a live database (lead) or through the browser harness.

const { readSource, createChecker, stripJsComments, exists } = require('./_harness');

const check = createChecker('duplicate-safe identity and draft creation', 'static');

// ---------- migration 074 ----------
const MIGRATION = 'database/migrations/074_unified_setup_identity.sql';
if (!exists(MIGRATION)) {
    check.fail(
        `${MIGRATION} is MISSING`,
        'Frozen contract section 2 reserves 074 for client_ref / client_draft_key + replace_division_participants_revisioned. Without it the wizard has no duplicate-safe identity path. FAIL, not skip.',
    );
} else {
    const sql = readSource(MIGRATION);
    check.match(sql, /alter\s+table\s+(public\.)?tournament_athletes\s+add\s+column\s+if\s+not\s+exists\s+client_ref/i, '074 adds tournament_athletes.client_ref additively (IF NOT EXISTS)');
    check.match(sql, /create\s+unique\s+index\s+if\s+not\s+exists\s+idx_tournament_athletes_client_ref[\s\S]{0,200}group_id,\s*tournament_id,\s*client_ref/i, '074 creates the (group_id, tournament_id, client_ref) unique index');
    check.match(sql, /idx_tournament_athletes_client_ref[\s\S]{0,260}where\s+client_ref\s+is\s+not\s+null/i, 'the client_ref index is partial (WHERE client_ref IS NOT NULL) so legacy rows are unaffected');
    check.match(sql, /alter\s+table\s+(public\.)?tournaments\s+add\s+column\s+if\s+not\s+exists\s+client_draft_key/i, '074 adds tournaments.client_draft_key additively');
    check.match(sql, /create\s+unique\s+index\s+if\s+not\s+exists\s+idx_tournaments_client_draft_key[\s\S]{0,200}group_id,\s*client_draft_key/i, '074 creates the (group_id, client_draft_key) unique index');

    check.match(sql, /replace_division_participants_revisioned\s*\(/i, '074 defines replace_division_participants_revisioned');
    for (const param of ['p_group_id', 'p_tournament_id', 'p_division_id', 'p_tournament_club_id', 'p_participants', 'p_expected_setup_revision', 'p_idempotency_key']) {
        check.match(sql, new RegExp(param), `replace_division_participants_revisioned takes ${param}`);
    }
    for (const code of ['SETUP_REVISION_CONFLICT', 'ROSTER_LOCKED', 'IDEMPOTENCY_KEY_REUSED', 'ROSTER_MEMBER_IN_ACTIVE_PAIR']) {
        check.match(sql, new RegExp(code), `replace_division_participants_revisioned raises ${code}`);
    }
    check.match(sql, /for\s+update/i, 'the division row is locked FOR UPDATE before the CAS check');
    check.match(sql, /setup_revision\s*=\s*[a-z_.]*setup_revision\s*\+\s*1|setup_revision\s*\+\s*1/i, 'setup_revision is bumped exactly once per applied mutation');
    check.match(sql, /tournament_division_roster_members/i, 'the explicit division roster is replaced to equal the resulting athlete set');
    check.match(sql, /on\s+conflict/i, 'participants are UPSERTed (duplicate-safe replay), not blindly inserted');
    check.match(sql, /guest/i, "the guest source is supported without a global athletes row");
    check.noMatch(sql, /\btruncate\b/i, '074 contains no TRUNCATE');
    check.noMatch(sql.replace(/drop\s+function[^;]*;/gi, ' '), /\bdrop\b/i, '074 contains no DROP other than DROP FUNCTION');
    check.match(sql, /revoke\s+all[\s\S]{0,200}public/i, '074 revokes EXECUTE from PUBLIC/anon/authenticated');
    check.match(sql, /grant\s+execute[\s\S]{0,120}service_role/i, '074 grants EXECUTE to service_role only');
}

// ---------- POST /api/tournament-v2/tournaments (lead-owned) ----------
const tournamentsRoute = stripJsComments(readSource('app/api/tournament-v2/tournaments/route.js'));
check.match(tournamentsRoute, /client_draft_key/, 'tournaments route accepts client_draft_key');
check.match(tournamentsRoute, /reused:\s*true/, 'a repeated draft key returns the EXISTING tournament with reused:true instead of 409');
check.match(tournamentsRoute, /23505/, 'the unique violation on the draft key is caught (parallel retry race)');
check.match(tournamentsRoute, /eq\('group_id'|eq\("group_id"/, 'the draft-key lookup is tenant-scoped by group_id');
check.noMatch(tournamentsRoute, /group_id:\s*body|body\?\.\s*group_id|body\.group_id/, 'group_id is never taken from the request body');

// ---------- client wrapper (lead-owned, frozen) ----------
const client = stripJsComments(readSource('lib/tournamentV2Client.js'));
check.match(client, /export function replaceDivisionParticipants/, 'client exposes replaceDivisionParticipants');
check.match(client, /export function repairLegacyDivisionPairs/, 'client exposes repairLegacyDivisionPairs');
check.match(client, /dry_run[\s\S]{0,80}!==\s*false/, 'repairLegacyDivisionPairs defaults dry_run to true');
check.match(client, /action:\s*['"]replace_participants['"]/, 'replaceDivisionParticipants posts action replace_participants');
check.match(client, /action:\s*['"]repair_legacy_pairs['"]/, 'repairLegacyDivisionPairs posts action repair_legacy_pairs');

// ---------- wizard: one client_ref per entered player, generated once ----------
const wizard = stripJsComments(readSource('app/giai-dau/v2/TournamentWizard.js'));
const draftHelper = exists('lib/tournament/wizardDraft.js') ? stripJsComments(readSource('lib/tournament/wizardDraft.js')) : '';
const uiSurface = `${wizard}\n${draftHelper}`;
check.ok(Boolean(draftHelper), 'lib/tournament/wizardDraft.js exists (frozen contract section 7, UI worker)', 'lib/tournament/wizardDraft.js is missing: there is no durable draft, so a reload cannot resume without duplicating');
check.match(uiSurface, /client_draft_key|clientDraftKey/, 'the wizard generates and sends a client_draft_key for checkpoint 1');
check.match(uiSurface, /client_ref|clientRef/, 'the wizard carries a per-participant client_ref');
check.match(uiSurface, /pickhub:wizard-draft:v1:/, 'the draft uses the frozen localStorage key pickhub:wizard-draft:v1:<groupId>');
check.match(uiSurface, /localStorage/, 'the draft survives a reload via localStorage');

check.done();
