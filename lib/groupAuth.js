import crypto from 'crypto';
import { DEFAULT_GROUP_CODE, DEFAULT_GROUP_ID } from './groupConstants';
import passwordHelpers from './domain/identity/password';
import clubCodeHelpers from './domain/identity/clubCode';

export { DEFAULT_GROUP_CODE, DEFAULT_GROUP_ID };

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const { hashPassword: hashIdentityPassword, verifyPassword: verifyIdentityPassword } = passwordHelpers;
const { normalizeClubCode } = clubCodeHelpers;

export function generateGroupCode(length = 8) {
    let code = '';
    for (let i = 0; i < length; i += 1) {
        const index = crypto.randomInt(0, CODE_ALPHABET.length);
        code += CODE_ALPHABET[index];
    }
    return code;
}

export function normalizeGroupCode(code) {
    return normalizeClubCode(code);
}

export function hashPassword(password) {
    return hashIdentityPassword(password);
}

export function verifyPassword(password, storedHash) {
    return verifyIdentityPassword(password, storedHash);
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
