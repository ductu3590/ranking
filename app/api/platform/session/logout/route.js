import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { clearPlatformSessionCookie, getValidatedPlatformSessionFromCookies, hashSessionKey } from '@/lib/platformSession';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  const session = await getValidatedPlatformSessionFromCookies();
  if (session && supabaseAdmin) {
    await supabaseAdmin.from('platform_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('account_id', session.account_id)
      .eq('session_key_hash', hashSessionKey(session.session_key));
  }
  clearPlatformSessionCookie(response);
  return response;
}
