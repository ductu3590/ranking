import crypto from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from './supabaseAdmin';
import {
  verifyPassword,
  signPlatformSession,
  verifyPlatformSession,
  authorizePlatformActor,
  PlatformLoginRateLimiter,
  validatePlatformSessionRecord,
} from './platformSessionCore';

export const PLATFORM_SESSION_COOKIE = 'platform_session';
const limiter = new PlatformLoginRateLimiter();

function secret() {
  if (!process.env.PLATFORM_SESSION_SECRET) throw new Error('Missing PLATFORM_SESSION_SECRET');
  return process.env.PLATFORM_SESSION_SECRET;
}

function hashSessionKey(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function setPlatformSessionCookie(response, value) {
  response.cookies.set(PLATFORM_SESSION_COOKIE, value, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearPlatformSessionCookie(response) {
  response.cookies.set(PLATFORM_SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
}

export async function getValidatedPlatformSessionFromCookies() {
  try {
    const value = cookies().get(PLATFORM_SESSION_COOKIE)?.value;
    const token = verifyPlatformSession(value, secret());
    if (!token || !supabaseAdmin) return null;
    const { data: session } = await supabaseAdmin.from('platform_sessions')
      .select('session_key_hash, revoked_at, expires_at')
      .eq('account_id', token.account_id).eq('session_key_hash', hashSessionKey(token.session_key)).maybeSingle();
    const { data: account } = await supabaseAdmin.from('platform_accounts')
      .select('id, role, status, access_version').eq('id', token.account_id).maybeSingle();
    const validated = validatePlatformSessionRecord(value, secret(), Date.now(), session, account);
    return validated ? { ...validated, actor_type: 'platform' } : null;
  } catch { return null; }
}

export async function requirePlatformAdmin(allowedRoles = ['community_admin', 'platform_admin']) {
  const session = await getValidatedPlatformSessionFromCookies();
  const result = authorizePlatformActor(session, allowedRoles);
  if (result.allowed) return { ok: true, session, actor: session };
  return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: result.reason === 'platform_role_forbidden' ? 403 : 401 }) };
}

export { limiter, secret, hashSessionKey, verifyPassword, signPlatformSession };
