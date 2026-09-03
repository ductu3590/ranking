import { identityRepository, readSignedClubSession } from '@/lib/identityRuntime';
import duplicateModule from '@/lib/application/identity/duplicateReviews';
import { toIdentityResponse, identityRouteError } from '@/lib/application/identity/routeAdapter';
import {
    correlationIdFrom,
    enforceIdentityMutationRateLimit,
} from '@/lib/application/identity/routeRequest';

const { createReviewAthleteLink } = duplicateModule;
const reviewAthleteLink = createReviewAthleteLink({ repository: identityRepository });

export async function POST(request) {
    try {
        const session = readSignedClubSession();
        enforceIdentityMutationRateLimit(request, 'duplicate-review', session?.group_id);
        const body = await request.json();
        const review = await reviewAthleteLink({
            session,
            athleteId: body?.athleteId,
            candidateAthleteId: body?.candidateAthleteId,
            decision: body?.decision,
            reason: body?.reason,
            correlationId: correlationIdFrom(request),
        });
        return toIdentityResponse({ review }, 201);
    } catch (error) {
        return identityRouteError(error);
    }
}
