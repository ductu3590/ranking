import { identityRepository, readSignedClubSession } from '@/lib/identityRuntime';
import duplicateModule from '@/lib/application/identity/duplicateReviews';
import { toIdentityResponse, identityRouteError } from '@/lib/application/identity/routeAdapter';

const { createSearchPotentialDuplicateAthletes } = duplicateModule;
const searchPotentialDuplicateAthletes = createSearchPotentialDuplicateAthletes({
    repository: identityRepository,
});

export async function GET(request) {
    try {
        const session = readSignedClubSession();
        const athleteId = new URL(request.url).searchParams.get('athleteId');
        const candidates = await searchPotentialDuplicateAthletes({ session, athleteId });
        return toIdentityResponse({ candidates });
    } catch (error) {
        return identityRouteError(error);
    }
}
