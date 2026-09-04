import { identityRepository, requireIdentitySession, readSignedClubSession } from '@/lib/identityRuntime';
import rosterModule from '@/lib/application/identity/roster';
import { toIdentityResponse, identityRouteError } from '@/lib/application/identity/routeAdapter';
import {
    correlationIdFrom,
    enforceIdentityMutationRateLimit,
} from '@/lib/application/identity/routeRequest';

const {
    createCreateUnclaimedAthlete,
    createUpdateMembershipAlias,
    createEndClubMembership,
} = rosterModule;
const createUnclaimedAthlete = createCreateUnclaimedAthlete({ repository: identityRepository });
const updateMembershipAlias = createUpdateMembershipAlias({ repository: identityRepository });
const endClubMembership = createEndClubMembership({ repository: identityRepository });

export async function GET() {
    try {
        const session = await requireIdentitySession('read');
        return toIdentityResponse({ roster: await identityRepository.listRoster(session.group_id) });
    } catch (error) {
        return identityRouteError(error);
    }
}

export async function POST(request) {
    try {
        const session = readSignedClubSession();
        enforceIdentityMutationRateLimit(request, 'roster-create', session?.group_id);
        const body = await request.json();
        const result = await createUnclaimedAthlete({
            session,
            displayName: body?.displayName,
            alias: body?.alias,
            effectiveFrom: body?.effectiveFrom,
            correlationId: correlationIdFrom(request),
        });
        return toIdentityResponse(result, 201);
    } catch (error) {
        return identityRouteError(error);
    }
}

export async function PATCH(request) {
    try {
        const session = readSignedClubSession();
        enforceIdentityMutationRateLimit(request, 'roster-alias', session?.group_id);
        const body = await request.json();
        const result = await updateMembershipAlias({
            session,
            membershipId: body?.membershipId,
            alias: body?.alias,
            expectedVersion: body?.expectedVersion,
            correlationId: correlationIdFrom(request),
        });
        return toIdentityResponse({ membership: result });
    } catch (error) {
        return identityRouteError(error);
    }
}

export async function DELETE(request) {
    try {
        const session = readSignedClubSession();
        enforceIdentityMutationRateLimit(request, 'roster-end', session?.group_id);
        const body = await request.json();
        const result = await endClubMembership({
            session,
            membershipId: body?.membershipId,
            effectiveTo: body?.effectiveTo,
            expectedVersion: body?.expectedVersion,
            correlationId: correlationIdFrom(request),
        });
        return toIdentityResponse({ membership: result });
    } catch (error) {
        return identityRouteError(error);
    }
}
