import { supabaseAdmin } from './supabaseAdmin';
import { supabaseServer } from './supabaseServer';
import { signGroupSession, verifyGroupSession, GROUP_SESSION_COOKIE } from './groupSession';
import { cookies } from 'next/headers';

import repositoryModule from './repositories/identity/compatibilityRepository';
import issuerModule from './application/identity/sessionIssuer';
import authorizationModule from './application/identity/authorization';
import athleteSessionModule from './application/identity/athleteSessions';
import { signAthleteSessionCookie } from './athleteSession';

const { createSupabaseIdentityRepository } = repositoryModule;
const { createClubSessionIssuer } = issuerModule;
const { authorizeClubSession } = authorizationModule;
const {
    createAthleteLogin,
    createAthleteLogout,
    createGetAthleteProfile,
    createResolveAthleteSession,
    createUpdateAthleteContact,
} = athleteSessionModule;

export const identityRepository = createSupabaseIdentityRepository(supabaseAdmin || supabaseServer);
export const issueClubSession = createClubSessionIssuer({
    repository: identityRepository,
    signSession: signGroupSession,
});

export const loginAthleteAccount = createAthleteLogin({
    repository: identityRepository,
    signSession: signAthleteSessionCookie,
});
export const logoutAthleteAccount = createAthleteLogout({ repository: identityRepository });
export const resolveAthleteSession = createResolveAthleteSession({ repository: identityRepository });
export const getAthleteProfile = createGetAthleteProfile({ repository: identityRepository });
export const updateAthleteContact = createUpdateAthleteContact({ repository: identityRepository });

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
