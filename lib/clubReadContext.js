import { NextResponse } from 'next/server';
import {
    getClubScope,
    getDefaultGroupContext,
    getGroupSessionFromCookies,
} from './groupSession';
import { decideClubReadScope } from './clubReadScopeCore';
import { readSignedAthleteSession } from './athleteSession';
import {
    identityRepository,
    requireIdentitySession,
    resolveAthleteSession,
} from './identityRuntime';

// Ngữ cảnh ĐỌC dữ liệu CLB. Trước đây chỉ cookie group_session mới mở được dữ liệu
// CLB, nên VĐV đăng nhập bằng tài khoản cá nhân vào /thanh-vien, /bxh, /giai-dau đều
// bị chặn. Ở đây thêm đúng một nhánh: khi có athlete_session hợp lệ thì ưu tiên dùng
// quyền đọc trong đúng CLB ghi trong vé.
//
// Ba ràng buộc giữ cho thay đổi này không phá multi-tenant:
//  1. Khi không có athlete_session, nhánh phiên CLB giữ nguyên y hệt.
//  2. group_id LUÔN lấy từ vé đã đối chiếu DB, không bao giờ từ query/body của client.
//  3. role 'athlete' không nằm trong allowlist của requireGroupAdmin / authorizeActor,
//     nên mọi route ghi vẫn từ chối như cũ. Đây là quyền chỉ-đọc.
export const ATHLETE_READ_ROLE = 'athlete';

// Trả về ngữ cảnh CLB suy ra từ vé VĐV, hoặc null nếu không có vé / vé không dùng được.
// Mọi lỗi đều nuốt thành null: đây là nhánh dự phòng, không phải cổng xác thực.
export async function getAthleteClubContext() {
    try {
        const token = readSignedAthleteSession();
        if (!token) return null;
        const { account } = await resolveAthleteSession(token);
        const club = await identityRepository.findClubById(account.clubId);
        if (!club) return null;
        return {
            group_id: club.id,
            group_code: club.code,
            group_name: club.name,
            role: ATHLETE_READ_ROLE,
            athlete_account_id: account.id,
            athlete_id: account.athleteId,
            membership_id: account.membershipId,
            is_default: false,
            signed: true,
        };
    } catch {
        return null;
    }
}

// Dùng cho route đọc công khai (trước đây gọi getEffectiveGroupContext).
export async function getClubReadContext() {
    // Danh tính cá nhân luôn thắng phiên CLB dùng chung còn sót lại trên trình duyệt.
    // Điều này giữ scope theo đúng CLB/membership đã xác thực của VĐV.
    const athleteContext = await getAthleteClubContext();
    if (athleteContext) return athleteContext;
    const clubSession = getGroupSessionFromCookies();
    if (clubSession) return clubSession;
    return getDefaultGroupContext();
}

// Dùng cho route đọc DỮ LIỆU RIÊNG của CLB: sổ quỹ, thành viên, sự kiện, ảnh BXH.
//
// Thay cho getClubReadScopeId() cũ (đã bỏ): hàm đó suy group_id qua
// getClubReadContext(), mà nhánh cuối của getClubReadContext() là ngữ cảnh CLB
// mặc định — nên người gọi ẩn danh lại đọc được trọn dữ liệu CLB #1. Ở đây
// không có danh tính thì trả 401, không có CLB nào để rơi về.
//
// Hình dạng kết quả giống getClubScope(): { ok, groupId, role } hoặc
// { ok:false, response }. KHÔNG dùng cho route ghi — đường ghi vẫn phải qua
// requireValidatedGroupAdmin().
export async function requireClubReadScope() {
    const athleteContext = await getAthleteClubContext();
    const clubSession = athleteContext ? null : getGroupSessionFromCookies();
    const decision = decideClubReadScope({ athleteContext, clubSession });
    if (decision.ok) return decision;
    return {
        ...decision,
        response: NextResponse.json({ error: decision.error }, { status: decision.status }),
    };
}

// Bản async của getClubScope() cho các handler GET. Giữ nguyên hình dạng kết quả
// ({ ok, groupId, role } hoặc { ok:false, response }) để route đọc không phải đổi cấu
// trúc. KHÔNG dùng cho handler ghi: đường ghi vẫn phải qua getClubScope/requireGroupAdmin.
export async function getClubReadScope() {
    const athleteContext = await getAthleteClubContext();
    if (athleteContext) {
        return {
            ok: true,
            groupId: athleteContext.group_id,
            role: athleteContext.role,
            actor: {
                groupId: athleteContext.group_id,
                groupCode: athleteContext.group_code,
                groupName: athleteContext.group_name,
                role: athleteContext.role,
                session: athleteContext,
            },
        };
    }
    return getClubScope();
}

// Dùng cho route đọc của module identity (trước đây gọi requireIdentitySession('read')).
// athlete_session hợp lệ thắng phiên CLB dùng chung còn sót lại. Không có vé VĐV thì
// vẫn đi đường phiên CLB như trước.
export async function requireClubReadSession() {
    const athleteContext = await getAthleteClubContext();
    if (athleteContext) return athleteContext;
    return requireIdentitySession('read');
}
