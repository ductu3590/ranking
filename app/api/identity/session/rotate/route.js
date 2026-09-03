import { setGroupSessionCookie } from '@/lib/groupSession';
import { identityRepository, issueClubSession, readSignedClubSession } from '@/lib/identityRuntime';
import sessionModule from '@/lib/application/identity/clubSessions';
import { toIdentityResponse, identityRouteError } from '@/lib/application/identity/routeAdapter';
import { enforceIdentityMutationRateLimit } from '@/lib/application/identity/routeRequest';

const { createRotateClubSession } = sessionModule;
const rotateClubSession = createRotateClubSession({
    repository: identityRepository,
    issueSession: issueClubSession,
});

export async function POST(request) {
    try {
        const session = readSignedClubSession();
        enforceIdentityMutationRateLimit(request, 'session-rotate', session?.group_id);
        const result = await rotateClubSession({ session, reason: 'manual_rotation' });
        const response = toIdentityResponse({ ok: true });
        setGroupSessionCookie(response, result.token);
        return response;
    } catch (error) {
        return identityRouteError(error);
    }
}
