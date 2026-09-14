import { getAthleteProfile, updateAthleteContact } from '@/lib/identityRuntime';
import { readSignedAthleteSession } from '@/lib/athleteSession';
import { toIdentityResponse, identityRouteError } from '@/lib/application/identity/routeAdapter';
import { enforceIdentityMutationRateLimit } from '@/lib/application/identity/routeRequest';

// Hồ sơ của chính người đang đăng nhập. Không nhận id từ query: accountId lấy trong
// vé đã ký, nên không thể đọc hồ sơ tài khoản khác qua route này.
export async function GET() {
    try {
        const profile = await getAthleteProfile(readSignedAthleteSession());
        return toIdentityResponse({ profile });
    } catch (error) {
        return identityRouteError(error);
    }
}

// Cài đặt liên hệ (email / SĐT / Facebook) của chính chủ. Cũng chỉ dùng accountId trong vé:
// body chỉ được phép mang email + phone + facebookProfileUrl, mọi khoá khác bị bỏ qua.
export async function PATCH(request) {
    try {
        const token = readSignedAthleteSession();
        enforceIdentityMutationRateLimit(request, 'athlete-contact-update', token?.club_id);
        const body = await request.json().catch(() => ({}));
        const input = {};
        if (body && 'email' in body) input.email = body.email;
        if (body && 'phone' in body) input.phone = body.phone;
        if (body && 'facebookProfileUrl' in body) input.facebookProfileUrl = body.facebookProfileUrl;
        const contact = await updateAthleteContact(token, input);
        return toIdentityResponse({ contact });
    } catch (error) {
        return identityRouteError(error);
    }
}
