import { projectPlayerAccount } from '@/lib/domain/identity/playerAccount';
import { requirePlayerSession } from '@/lib/playerSession';
import { communityError, communityJson, loadMyCommunity } from '@/lib/communityServer';

export const dynamic = 'force-dynamic';

// "Đơn của tôi" (PLC-06) + lời mời ghép cặp đến (PLC-05). Chỉ dữ liệu của chính tài khoản; không SĐT của ai.
export async function GET() {
    try {
        const auth = await requirePlayerSession();
        if (!auth.ok) return auth.response;
        const data = await loadMyCommunity(auth.account.id);
        return communityJson({ account: projectPlayerAccount(auth.account), ...data });
    } catch (error) {
        console.error('community my GET error:', error);
        return communityError('INTERNAL', 500);
    }
}
