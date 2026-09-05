'use strict';

const { hashPassword } = require('../lib/platformSessionCore');
const { createClient } = require('@supabase/supabase-js');

async function main() {
  const email = String(process.env.PICKHUB_PLATFORM_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.PICKHUB_PLATFORM_ADMIN_PASSWORD;
  const role = process.env.PICKHUB_PLATFORM_ADMIN_ROLE || 'community_admin';
  if (!email || !password) throw new Error('Set PICKHUB_PLATFORM_ADMIN_EMAIL and PICKHUB_PLATFORM_ADMIN_PASSWORD');
  if (!['community_admin', 'platform_admin'].includes(role)) throw new Error('Invalid PICKHUB_PLATFORM_ADMIN_ROLE');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  const passwordHash = await hashPassword(password);
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const existing = await db.from('platform_accounts').select('id').eq('login', email).maybeSingle();
  if (existing.error) throw existing.error;
  const payload = { login: email, password_hash: passwordHash, role, status: 'active' };
  const result = existing.data
    ? await db.from('platform_accounts').update(payload).eq('id', existing.data.id).select('id, login, role, status').single()
    : await db.from('platform_accounts').insert(payload).select('id, login, role, status').single();
  if (result.error) throw result.error;
  console.log(JSON.stringify({ account: result.data, action: existing.data ? 'updated' : 'created' }));
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { main };
