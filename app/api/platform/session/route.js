import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getValidatedPlatformSessionFromCookies, hashSessionKey, limiter, setPlatformSessionCookie, secret, signPlatformSession, verifyPassword } from '@/lib/platformSession';
import { getPlatformRateLimitKey, validatePlatformLogin } from '@/lib/platformSessionCore';
import { clientIp, consumePublicRateLimit } from '@/lib/publicRateLimit';

// GET: trạng thái phiên admin hệ thống (chỉ vai trò, không trả gì nhạy cảm) — bàn điều hành giải cộng đồng dùng để hiện điều khiển.
export async function GET() {
  const session = await getValidatedPlatformSessionFromCookies();
  return NextResponse.json({ session: session ? { role: session.role } : null }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const login = String(body?.login || '').trim().toLowerCase();
    const password = String(body?.password || '');
    // Bộ đếm lưu DB chạy trước bộ đếm bộ nhớ (bộ nhớ tiến trình không bền trên serverless; Epic 4 D60).
    const dbRate = await consumePublicRateLimit('platform_login', { login, ip: clientIp(request) });
    if (!dbRate.allowed) return NextResponse.json({ error: 'Too many failed attempts' }, { status: 429, headers: { 'Retry-After': String(Math.max(1, dbRate.retryAfterSeconds)) } });
    const loginValidation = validatePlatformLogin(login);
    const rateKey = getPlatformRateLimitKey({ login, account: null });
    const attempt = limiter.canAttempt(rateKey);
    if (!attempt.allowed) return NextResponse.json({ error: 'Too many failed attempts' }, { status: 429 });
    if (!loginValidation.ok) {
      limiter.recordFailure(rateKey);
      return NextResponse.json({ error: loginValidation.error }, { status: loginValidation.status });
    }
    const { data: account } = await supabaseAdmin.from('platform_accounts')
      .select('id, login, password_hash, role, status, access_version').eq('login', login).maybeSingle();
    const accountRateKey = getPlatformRateLimitKey({ login, account });
    if (accountRateKey !== rateKey && !limiter.canAttempt(accountRateKey).allowed) {
      return NextResponse.json({ error: 'Too many failed attempts' }, { status: 429 });
    }
    if (!account || account.status !== 'active' || !(await verifyPassword(password, account.password_hash))) {
      limiter.recordFailure(accountRateKey);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    limiter.clear(accountRateKey);
    const sessionKey = crypto.randomBytes(32).toString('base64url');
    const token = signPlatformSession({ accountId: account.id, role: account.role, sessionKey, accessVersion: account.access_version }, secret());
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabaseAdmin.from('platform_sessions').insert({
      account_id: account.id, session_key_hash: hashSessionKey(sessionKey), expires_at: expiresAt,
    });
    if (error) throw error;
    const response = NextResponse.json({ ok: true, role: account.role });
    setPlatformSessionCookie(response, token);
    return response;
  } catch (error) {
    console.error('Platform login failed:', error);
    return NextResponse.json({ error: 'Unable to sign in' }, { status: 500 });
  }
}
