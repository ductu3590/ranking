// Requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in env.
// Loads them from .env.local if present so it can run via plain node.
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnvLocal() {
    const envPath = path.join(__dirname, '..', '.env.local');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) {
            process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
    }
}

async function main() {
    loadEnvLocal();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
        console.error('FAIL: missing Supabase env vars');
        process.exit(1);
    }
    const anonClient = createClient(url, anon);

    // With RLS on and no auth session, the anon role must read ZERO rows.
    const { data, error } = await anonClient.from('quy_pickleball').select('id').limit(5);
    if (error && /permission|rls|policy/i.test(error.message)) {
        console.log('isolation ok (anon denied)');
        return;
    }
    if (Array.isArray(data) && data.length === 0) {
        console.log('isolation ok (anon sees no rows)');
        return;
    }
    console.error(`FAIL: anon client read ${data ? data.length : '?'} rows — RLS not isolating`);
    process.exit(1);
}

main();
