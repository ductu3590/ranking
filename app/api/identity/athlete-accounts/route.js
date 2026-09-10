import { identityRepository, requireIdentitySession, readSignedClubSession } from '@/lib/identityRuntime';
import athleteAccountModule from '@/lib/application/identity/athleteAccounts';
import { toIdentityResponse, identityRouteError } from '@/lib/application/identity/routeAdapter';
import {
    correlationIdFrom,
    enforceIdentityMutationRateLimit,
} from '@/lib/application/identity/routeRequest';

const { createListClaimableAthletes, createRegisterAthleteAccount } = athleteAccountModule;
const listClaimableAthletes = createListClaimableAthletes({ repository: identityRepository });
const registerAthleteAccount = createRegisterAthleteAccount({ repository: identityRepository });

export async function GET() {
    try {
        const session = await requireIdentitySession('read');
        return toIdentityResponse({ candidates: await listClaimableAthletes({ session }) });
    } catch (error) {
        return identityRouteError(error);
    }
}

export async function POST(request) {
    try {
        const session = readSignedClubSession();
        enforceIdentityMutationRateLimit(request, 'athlete-account-register', session?.group_id);
        const body = await request.json();
        const account = await registerAthleteAccount({
            session,
            login: body?.login,
            password: body?.password,
            displayName: body?.displayName,
            membershipId: body?.membershipId,
            correlationId: correlationIdFrom(request),
        });
        return toIdentityResponse({ account }, 201);
    } catch (error) {
        return identityRouteError(error);
    }
}
