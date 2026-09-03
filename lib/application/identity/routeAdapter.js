import { NextResponse } from 'next/server';

import errors from './errors';

const { IdentityServiceError } = errors;

const PUBLIC_MESSAGES = Object.freeze({
    INVALID_INPUT: 'Dữ liệu yêu cầu không hợp lệ.',
    CLUB_CREDENTIALS_INVALID: 'Mã CLB hoặc mật khẩu không đúng.',
    SESSION_UNAUTHORIZED: 'Phiên CLB không hợp lệ.',
    SESSION_INVALID: 'Phiên CLB không hợp lệ.',
    SESSION_EXPIRED: 'Phiên CLB đã hết hạn.',
    SESSION_REVOKED: 'Phiên CLB đã bị thu hồi.',
    SESSION_NOT_YET_VALID: 'Phiên CLB chưa có hiệu lực.',
    ADMIN_REQUIRED: 'Cần quyền quản trị CLB.',
    CLUB_SCOPE_MISMATCH: 'Không có quyền truy cập CLB này.',
    NOT_FOUND: 'Không tìm thấy dữ liệu.',
    VERSION_CONFLICT: 'Dữ liệu đã thay đổi. Vui lòng tải lại.',
    RATE_LIMITED: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.',
    INTERNAL_ERROR: 'Không thể xử lý yêu cầu.',
});

export function toIdentityResponse(body, status = 200) {
    return NextResponse.json(body, { status });
}

export function identityRouteError(error) {
    const serviceError = error instanceof IdentityServiceError
        ? error
        : new IdentityServiceError('INTERNAL_ERROR');
    const headers = {};
    if (serviceError.code === 'RATE_LIMITED' && serviceError.retryAfterSeconds) {
        headers['Retry-After'] = String(serviceError.retryAfterSeconds);
    }
    return NextResponse.json({
        error: PUBLIC_MESSAGES[serviceError.code] || PUBLIC_MESSAGES.INTERNAL_ERROR,
        code: serviceError.code,
    }, { status: serviceError.status, headers });
}
