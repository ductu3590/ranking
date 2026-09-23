'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const envCandidates = [
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(process.cwd(), '..', 'ranking', '.env.local'),
];
let env = {};
let envPathUsed = null;
for (const candidate of envCandidates) {
  if (!fs.existsSync(candidate)) continue;
  const content = fs.readFileSync(candidate, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
  });
  envPathUsed = candidate;
  break;
}

const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log('Env path:', envPathUsed || 'NONE');
console.log('Project host:', url ? new URL(url).host : 'MISSING');
if (!url || !key) {
  console.error('Missing credentials');
  process.exit(1);
}

const modulePaths = Module._nodeModulePaths(process.cwd());
const parentModules = path.resolve(process.cwd(), '..', 'ranking', 'node_modules');
if (fs.existsSync(parentModules)) modulePaths.unshift(parentModules);
const supabasePath = require.resolve('@supabase/supabase-js', { paths: modulePaths });
const { createClient } = require(supabasePath);
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function runPreflight() {
  // Fetch OpenAPI schema definitions from PostgREST
  const res = await fetch(url + '/rest/v1/', {
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
    },
  });
  if (!res.ok) {
    console.error('OpenAPI fetch failed:', res.status, res.statusText);
    return;
  }
  const spec = await res.json();
  const targetTables = [
    'tournaments',
    'tournament_divisions',
    'tournament_stages',
    'tournament_athletes',
    'tournament_division_roster_members',
    'tournament_pairs',
    'tournament_pair_members',
    'tournament_entries',
    'tournament_matches',
    'tournament_stage_transitions',
    'tournament_draw_slots',
    'tournament_setup_mutations',
    'tournament_venues',
    'tournament_courts',
    'tournament_match_assignments',
  ];

  console.log('\n=== EXACT TABLE COLUMNS (PostgREST OpenAPI) ===');
  for (const t of targetTables) {
    const def = spec.definitions ? spec.definitions[t] : null;
    if (!def) {
      console.log(`Table ${t}: NOT IN DEFINITIONS`);
    } else {
      const props = Object.keys(def.properties || {});
      console.log(`Table ${t} (${props.length} cols): ${props.join(', ')}`);
    }
  }
}

runPreflight().catch(console.error);
