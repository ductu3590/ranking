import { verifyPassword } from '@/lib/groupAuth';
import { setGroupSessionCookie } from '@/lib/groupSession';
import { consumeRateLimit, getClientIdentifier } from '@/lib/rateLimit';
import { identityRepository, issueClubSession } from '@/lib/identityRuntime';
import joinModule from '@/lib/application/identity/joinClubWithCode';
import { toIdentityResponse, identityRouteError } from '@/lib/application/identity/routeAdapter';

const { createJoinClubWithCode } = joinModule;
const joinClubWithCode = createJoinClubWithCode({
    repository: identityRepository,
    verifyPassword,
    issueSession: issueClubSession,
    consumeRateLimit: (key) => consumeRateLimit(key, { limit: 8, windowMs: 60_000 }),
});

export async function POST(request) {
    try {
        const body = await request.json();
        const result = await joinClubWithCode({
            code: body?.code,
            password: body?.password,
            rateLimitKey: getClientIdentifier(request),
        });
        const response = toIdentityResponse({
            group: result.group,
            role: result.role,
            redirectTo: result.redirectTo,
        });
        setGroupSessionCookie(response, result.token);
        return response;
    } catch (error) {
        console.error('Join group failed:', error);
        return identityRouteError(error);
    }
}
