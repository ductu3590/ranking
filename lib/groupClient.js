import { DEFAULT_GROUP_CODE, DEFAULT_GROUP_ID } from './groupConstants';

export function getCurrentGroupClient() {
    if (typeof window === 'undefined') {
        return {
            id: DEFAULT_GROUP_ID,
            code: DEFAULT_GROUP_CODE,
            name: 'Pickleball 246 Club',
            role: 'member',
        };
    }

    const stored = window.localStorage.getItem('teamfund-current-group');
    if (!stored) {
        return {
            id: DEFAULT_GROUP_ID,
            code: DEFAULT_GROUP_CODE,
            name: 'Pickleball 246 Club',
            role: 'member',
        };
    }

    try {
        const group = JSON.parse(stored);
        return {
            id: group.id || DEFAULT_GROUP_ID,
            code: group.code || DEFAULT_GROUP_CODE,
            name: group.name || 'Pickleball 246 Club',
            role: group.role || 'member',
        };
    } catch {
        window.localStorage.removeItem('teamfund-current-group');
        return {
            id: DEFAULT_GROUP_ID,
            code: DEFAULT_GROUP_CODE,
            name: 'Pickleball 246 Club',
            role: 'member',
        };
    }
}

export function getCurrentGroupIdClient() {
    return getCurrentGroupClient().id;
}

export function isMissingGroupColumnError(error) {
    return error?.code === '42703' || String(error?.message || '').includes('group_id');
}
