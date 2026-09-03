const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const migrationPath = path.join(
  __dirname,
  '..',
  'database',
  'migrations',
  '028_phase2_athlete_identity.sql'
);
assert.equal(fs.existsSync(migrationPath), true, 'migration 028 must exist after Phase 1 migration 027');

const sql = fs.readFileSync(migrationPath, 'utf8');
assert.match(sql, /^BEGIN;/m, 'schema creation and legacy backfill run atomically');
assert.match(sql, /COMMIT;\s*$/i, 'migration commits only after verification succeeds');
for (const table of [
  'athletes',
  'club_memberships',
  'club_member_athlete_map',
  'membership_assessments',
  'group_sessions',
]) {
  assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`, 'i'), `${table} is created`);
  assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'), `${table} has RLS`);
  assert.match(sql, new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated`, 'i'), `${table} denies direct shared-session access`);
}

assert.match(sql, /ALTER TABLE public\.groups\s+ADD COLUMN IF NOT EXISTS access_version bigint NOT NULL DEFAULT 1/i);
assert.match(sql, /INSERT INTO public\.athletes[\s\S]+FROM public\.club_members/i, 'legacy members create athletes');
assert.match(sql, /INSERT INTO public\.club_memberships[\s\S]+FROM public\.club_members/i, 'legacy members create memberships');
assert.match(sql, /INSERT INTO public\.club_member_athlete_map[\s\S]+FROM public\.club_members/i, 'legacy mapping is backfilled');
assert.match(sql, /legacy_club_member_id bigint NOT NULL UNIQUE/i, 'mapping is one-to-one with legacy rows');
assert.match(sql, /source_athlete_id bigint NOT NULL UNIQUE/i, 'mapping retains immutable source-athlete provenance');
assert.match(
  sql,
  /club_member_athlete_map[\s\S]+FOREIGN KEY \(legacy_club_member_id, club_id\)[\s\S]+REFERENCES public\.club_members\(id, group_id\)[\s\S]+FOREIGN KEY \(club_membership_id, club_id, athlete_id\)[\s\S]+REFERENCES public\.club_memberships\(id, club_id, athlete_id\)/i,
  'legacy mapping preserves both legacy and new tenant relationships'
);
assert.match(sql, /UNIQUE NULLS NOT DISTINCT \(club_id, athlete_id, effective_to\)/i, 'membership history prevents duplicate periods');
assert.match(sql, /CHECK \(effective_to IS NULL OR effective_to > effective_from\)/i, 'membership end is exclusive and after start');
assert.match(sql, /skill_level >= 1(?:\.0)? AND skill_level <= 5(?:\.0)?/i, 'PHR skill level stays in the approved 1.0–5.0 range');
assert.ok(
  sql.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS club_memberships_id_club_athlete_key') <
    sql.indexOf('CREATE TABLE IF NOT EXISTS public.membership_assessments'),
  'the composite membership key must exist before the assessment foreign key is declared'
);

for (const legacyConsumer of ['fund_event_participants', 'tournament_entrant_members']) {
  assert.match(
    sql,
    new RegExp(`ALTER TABLE public\\.${legacyConsumer}[\\s\\S]+ADD COLUMN IF NOT EXISTS athlete_id bigint`, 'i'),
    `${legacyConsumer} receives a compatibility-safe athlete reference`
  );
}
assert.match(
  sql,
  /fund_event_participants_identity_fk[\s\S]+FOREIGN KEY \(club_membership_id, group_id, athlete_id\)[\s\S]+REFERENCES public\.club_memberships\(id, club_id, athlete_id\)/i,
  'fund participants enforce membership, athlete and tenant as one relationship'
);
assert.match(
  sql,
  /tournament_entrant_members_identity_fk[\s\S]+FOREIGN KEY \(club_membership_id, membership_club_id, athlete_id\)[\s\S]+REFERENCES public\.club_memberships\(id, club_id, athlete_id\)/i,
  'tournament entrants preserve athlete source-club identity independently of organizer scope'
);
assert.match(sql, /CREATE OR REPLACE FUNCTION public\.sync_phase2_identity_compatibility/i, 'legacy/new references are synchronized');
assert.match(sql, /CREATE TRIGGER fund_event_participants_sync_phase2_identity/i);
assert.match(sql, /CREATE TRIGGER tournament_entrant_members_sync_phase2_identity/i);
assert.match(sql, /CREATE OR REPLACE FUNCTION public\.sync_club_member_identity/i, 'legacy roster writes synchronize Phase 2 identity');
assert.match(sql, /CREATE TRIGGER club_members_sync_phase2_identity[\s\S]+AFTER INSERT OR UPDATE/i);
assert.match(sql, /CREATE OR REPLACE FUNCTION public\.soft_delete_club_member/i, 'legacy delete has explicit soft-delete semantics');
assert.match(sql, /CREATE TRIGGER club_members_soft_delete[\s\S]+BEFORE DELETE/i);
assert.match(sql, /CREATE OR REPLACE FUNCTION public\.enforce_club_member_athlete_provenance/i, 'mapping provenance is enforced');
assert.match(sql, /CREATE TRIGGER club_member_athlete_map_provenance/i);
assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_fund_event_participants_event_membership[\s\S]+ON public\.fund_event_participants\(event_id, club_membership_id\)[\s\S]+WHERE club_membership_id IS NOT NULL/i);
assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_fund_event_participants_event_athlete[\s\S]+ON public\.fund_event_participants\(event_id, athlete_id\)[\s\S]+WHERE athlete_id IS NOT NULL/i);
assert.match(sql, /UNIQUE\s*\(\s*event_id,\s*member_id\s*\)/i, 'legacy event/member uniqueness remains intact');

console.log('identity migration 028 contract ok');
