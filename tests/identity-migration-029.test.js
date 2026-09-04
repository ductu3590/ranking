'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const sql = fs.readFileSync(
  path.join(__dirname, '..', 'database', 'migrations', '029_phase2_athlete_link_reviews.sql'),
  'utf8'
);

assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.athlete_link_reviews/i);
assert.match(sql, /group_id bigint NOT NULL REFERENCES public\.groups\(id\)/i);
assert.match(sql, /athlete_id bigint NOT NULL REFERENCES public\.athletes\(id\)/i);
assert.match(sql, /candidate_athlete_id bigint NOT NULL REFERENCES public\.athletes\(id\)/i);
assert.match(sql, /decision text NOT NULL[\s\S]+CHECK \(decision IN \('approve', 'reject'\)\)/i);
assert.match(sql, /CHECK \(athlete_id <> candidate_athlete_id\)/i);
assert.match(sql, /actor_type text NOT NULL[\s\S]+club_admin_session/i);
assert.match(sql, /correlation_id text/i);
assert.match(sql, /ENABLE ROW LEVEL SECURITY/i);
assert.match(sql, /REVOKE ALL ON TABLE public\.athlete_link_reviews FROM PUBLIC, anon, authenticated/i);
assert.doesNotMatch(sql, /UPDATE\s+public\.club_member_athlete_map/i,
  'review audit must never rewrite immutable compatibility provenance');

console.log('identity migration 029 contract ok');
