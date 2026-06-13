import crypto from 'crypto';
import { DEFAULT_GROUP_CODE, DEFAULT_GROUP_ID } from './groupConstants';

export { DEFAULT_GROUP_CODE, DEFAULT_GROUP_ID };

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = 'sha256';

export function generateGroupCode(length = 8) {
    let code = '';
    for (let i = 0; i < length; i += 1) {
        const index = crypto.randomInt(0, CODE_ALPHABET.length);
        code += CODE_ALPHABET[index];
    }
    return code;
}

export function normalizeGroupCode(code) {
    return String(code || '').trim().toUpperCase();
}

export function hashPassword(password) {
    const value = String(password || '');
    const salt = crypto.randomBytes(16).toString('base64url');
    const hash = crypto
        .pbkdf2Sync(value, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST)
        .toString('base64url');
    return `pbkdf2:${PASSWORD_ITERATIONS}:${salt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
    if (!storedHash || typeof storedHash !== 'string') return false;
    const [scheme, iterationsValue, salt, expectedHash] = storedHash.split(':');
    if (scheme !== 'pbkdf2' || !iterationsValue || !salt || !expectedHash) return false;

    const iterations = Number(iterationsValue);
    if (!Number.isInteger(iterations) || iterations <= 0) return false;

    const candidateHash = crypto
        .pbkdf2Sync(String(password || ''), salt, iterations, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST)
        .toString('base64url');

    const candidate = Buffer.from(candidateHash);
    const expected = Buffer.from(expectedHash);
    if (candidate.length !== expected.length) return false;
    return crypto.timingSafeEqual(candidate, expected);
}

export function publicGroupPayload(group) {
    if (!group) return null;
    return {
        id: group.id,
        code: group.code,
        name: group.name,
        description: group.description || '',
    };
}
