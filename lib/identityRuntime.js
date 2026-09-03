import { supabaseAdmin } from './supabaseAdmin';
import { supabaseServer } from './supabaseServer';
import { signGroupSession, verifyGroupSession, GROUP_SESSION_COOKIE } from './groupSession';
import { cookies } from 'next/headers';

import repositoryModule from './repositories/identity/compatibilityRepository';
import issuerModule from './application/identity/sessionIssuer';
import authorizationModule from './application/identity/authorization';

const { createSupabaseIdentityRepository } = repositoryModule;
const { createClubSessionIssuer } = issuerModule;
const { authorizeClubSession } = authorizationModule;

export const identityRepository = createSupabaseIdentityRepository(supabaseAdmin || supabaseServer);
export const issueClubSession = createClubSessionIssuer({
    repository: identityRepository,
    signSession: signGroupSession,
});

export function readSignedClubSession() {
    const value = cookies().get(GROUP_SESSION_COOKIE)?.value;
    return verifyGroupSession(value);
}

export async function requireIdentitySession(action = 'read') {
    const session = readSignedClubSession();
    await authorizeClubSession({
        repository: identityRepository,
        session,
        action,
        groupId: session?.group_id,
        now: Date.now(),
    });
    return session;
}
