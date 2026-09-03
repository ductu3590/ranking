import { identityRepository, readSignedClubSession } from '@/lib/identityRuntime';
import assessmentModule from '@/lib/application/identity/assessments';
import { toIdentityResponse, identityRouteError } from '@/lib/application/identity/routeAdapter';
import {
    correlationIdFrom,
    enforceIdentityMutationRateLimit,
} from '@/lib/application/identity/routeRequest';

const { createRecordMembershipAssessment } = assessmentModule;
const recordMembershipAssessment = createRecordMembershipAssessment({ repository: identityRepository });

export async function POST(request) {
    try {
        const session = readSignedClubSession();
        enforceIdentityMutationRateLimit(request, 'assessment-create', session?.group_id);
        const body = await request.json();
        const assessment = await recordMembershipAssessment({
            session,
            membershipId: body?.membershipId,
            skillLevel: body?.skillLevel,
            effectiveFrom: body?.effectiveFrom,
            source: body?.source,
            notes: body?.notes,
            correlationId: correlationIdFrom(request),
        });
        return toIdentityResponse({ assessment }, 201);
    } catch (error) {
        return identityRouteError(error);
    }
}
