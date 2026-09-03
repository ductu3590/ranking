const CLUBS_STORAGE_KEY = 'pickhub-club-contexts';
const DEFAULT_CLUB_STORAGE_KEY = 'pickhub-default-club-id';
const LEGACY_GROUP_STORAGE_KEY = 'teamfund-current-group';

function publicClubContext(group) {
    if (!group?.id || !group?.code) return null;
    return {
        id: group.id,
        code: group.code,
        name: group.name || 'CLB PickHub',
    };
}

export function readClubAccessContexts() {
    if (typeof window === 'undefined') return [];
    const contexts = [];
    try {
        const stored = JSON.parse(window.localStorage.getItem(CLUBS_STORAGE_KEY) || '[]');
        if (Array.isArray(stored)) contexts.push(...stored);
    } catch {
        window.localStorage.removeItem(CLUBS_STORAGE_KEY);
    }
    try {
        const legacy = publicClubContext(JSON.parse(window.localStorage.getItem(LEGACY_GROUP_STORAGE_KEY) || 'null'));
        if (legacy) contexts.push(legacy);
    } catch {
        window.localStorage.removeItem(LEGACY_GROUP_STORAGE_KEY);
    }
    return [...new Map(contexts.map((club) => [String(club.id), publicClubContext(club)]))]
        .map(([, club]) => club)
        .filter(Boolean);
}

export function readDefaultClubId() {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(DEFAULT_CLUB_STORAGE_KEY)
        || readClubAccessContexts()[0]?.id
        || null;
}

export function rememberClubAccessContext(group) {
    if (typeof window === 'undefined') return;
    const context = publicClubContext(group);
    if (!context) return;
    const next = [context, ...readClubAccessContexts().filter((club) => String(club.id) !== String(context.id))];
    window.localStorage.setItem(CLUBS_STORAGE_KEY, JSON.stringify(next));
    window.localStorage.setItem(DEFAULT_CLUB_STORAGE_KEY, String(context.id));
    window.localStorage.setItem(LEGACY_GROUP_STORAGE_KEY, JSON.stringify(context));
}
