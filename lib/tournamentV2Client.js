// Browser-side fetch client cho API giải đấu v2.
// Mọi component UI v2 gọi API qua module này — KHÔNG truy vấn Supabase trực tiếp
// (ngoại lệ: Realtime live qua @/lib/supabaseClient).
// Gửi cookie session (group_session) bằng credentials: 'same-origin'.

const BASE = '/api/tournament-v2';

async function request(path, { method = 'GET', body, query } = {}) {
    let url = `${BASE}${path}`;
    if (query) {
        const qs = new URLSearchParams();
        for (const [key, value] of Object.entries(query)) {
            if (value === null || value === undefined) continue;
            qs.append(key, value);
        }
        const str = qs.toString();
        if (str) url += `?${str}`;
    }

    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || 'Request failed');
    }
    return data;
}

// --- Tournaments ---

export async function listTournaments() {
    const data = await request('/tournaments');
    return data.tournaments;
}

export function createTournament(body) {
    return request('/tournaments', { method: 'POST', body });
}

export function updateTournament(body) {
    return request('/tournaments', { method: 'PATCH', body });
}

export function deleteTournament(id) {
    return request('/tournaments', { method: 'DELETE', query: { id } });
}

// --- Stages ---

export async function listStages(tournamentId) {
    const data = await request('/stages', { query: { tournamentId } });
    return data.stages;
}

export function saveStage(body) {
    if (body.id) {
        return request('/stages', { method: 'PATCH', body });
    }
    return request('/stages', { method: 'POST', body });
}

export function deleteStage(id) {
    return request('/stages', { method: 'DELETE', query: { id } });
}

// --- Entrants ---

export async function listEntrants(tournamentId) {
    const data = await request('/entrants', { query: { tournamentId } });
    return data.entrants;
}

export function saveEntrant(body) {
    if (body.id) {
        return request('/entrants', { method: 'PATCH', body });
    }
    return request('/entrants', { method: 'POST', body });
}

export function deleteEntrant(id) {
    return request('/entrants', { method: 'DELETE', query: { id } });
}

// --- Generate schedule ---

export function generateSchedule(stageId, seed = 1) {
    return request('/generate', { method: 'POST', body: { stageId, seed } });
}

// --- Matches (danh sách trận của 1 stage, cho console nhập tỉ số) ---

export async function listMatches(stageId) {
    const data = await request('/matches', { query: { stageId } });
    return { matches: data.matches || [], gamesByMatchId: data.gamesByMatchId || {} };
}

// --- Games (tỉ số) ---

export function saveGames(matchId, games) {
    return request('/games', { method: 'PUT', body: { matchId, games } });
}

// --- Standings (BXH) ---

export function getStandings(stageId) {
    return request('/standings', { query: { stageId } });
}

// --- Advance stage (mix) ---

export function advanceStage(stageId) {
    return request('/advance', { method: 'POST', body: { stageId } });
}

// --- Public snapshot ---

export function getPublic(slug) {
    return request('/public', { query: { slug } });
}
