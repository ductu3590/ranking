import crypto from 'crypto';
import { consumeRateLimit, getClientIdentifier } from '@/lib/rateLimit';
import errors from './errors';

const { IdentityServiceError } = errors;

export function correlationIdFrom(request) {
    return request.headers.get('x-request-id') || crypto.randomUUID();
}

export function enforceIdentityMutationRateLimit(request, operation, groupId) {
    const rate = consumeRateLimit(
        `identity:${operation}:${groupId || 'unknown'}:${getClientIdentifier(request)}`,
        { limit: 20, windowMs: 60_000 },
    );
    if (!rate.allowed) {
        throw new IdentityServiceError('RATE_LIMITED', undefined, {
            retryAfterSeconds: rate.retryAfterSeconds,
            rate,
        });
    }
}
