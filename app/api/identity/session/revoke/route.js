import { clearGroupSessionCookie } from '@/lib/groupSession';
import { identityRepository, readSignedClubSession } from '@/lib/identityRuntime';
import sessionModule from '@/lib/application/identity/clubSessions';
import { toIdentityResponse, identityRouteError } from '@/lib/application/identity/routeAdapter';
import { enforceIdentityMutationRateLimit } from '@/lib/application/identity/routeRequest';

const { createRevokeClubSessions } = sessionModule;
const revokeClubSessions = createRevokeClubSessions({ repository: identityRepository });

export async function POST(request) {
    try {
        const session = readSignedClubSession();
        enforceIdentityMutationRateLimit(request, 'session-revoke', session?.group_id);
        const body = await request.json().catch(() => ({}));
        const result = await revokeClubSessions({
            session,
            reason: String(body?.reason || 'manual_revoke'),
        });
        const response = toIdentityResponse({ ok: true, ...result });
        clearGroupSessionCookie(response);
        return response;
    } catch (error) {
        return identityRouteError(error);
    }
}
