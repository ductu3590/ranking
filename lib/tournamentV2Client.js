// Browser-side fetch client cho API giải đấu v2.
// Mọi component UI v2 gọi API qua module này — không truy vấn Supabase trực tiếp.
// Gửi cookie session (group_session) bằng credentials: 'same-origin'.

const BASE = '/api/tournament-v2';

function createIdempotencyKey() {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }
    return `pickhub-${Date.now()}-${String(Date.now()).slice(-6)}`;
}

async function request(path, { method = 'GET', body, query, cache } = {}) {
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
        cache,
        body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const error = new Error(data.error || 'Request failed');
        error.status = res.status;
        throw error;
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

// --- Divisions (Nội dung thi đấu) ---

export async function listDivisions(tournamentId) {
    const data = await request('/divisions', { query: { tournamentId } });
    return data.divisions || [];
}

export function saveDivision(body) {
    if (body.id) return request('/divisions', { method: 'PATCH', body });
    return request('/divisions', { method: 'POST', body });
}

export function deleteDivision(id) {
    return request('/divisions', { method: 'DELETE', query: { id } });
}

// --- VĐV trong phạm vi giải (roster CLB + VĐV khách) ---

export async function listTournamentAthletes(tournamentId) {
    const data = await request('/athletes', { query: { tournamentId } });
    return data.athletes || [];
}

export async function listClubRoster() {
    const data = await request('/athletes', { query: { mode: 'roster' } });
    return data.roster || [];
}

export function saveTournamentAthlete(body) {
    return request('/athletes', { method: 'POST', body });
}

// --- Ghép cặp theo nội dung ---

export function previewDivisionPairing(body) {
    return request('/pairings', { method: 'POST', body: { ...body, mode: 'preview' } });
}

export function confirmDivisionPairing(body) {
    return request('/pairings', { method: 'POST', body: { ...body, mode: 'confirm' } });
}

// --- Preview lịch thi đấu (không ghi DB) ---

export function previewSchedule(body) {
    return request('/preview-schedule', { method: 'POST', body });
}

// --- Entries theo nội dung (đơn vị được xếp lịch của Phase 3) ---

export async function listDivisionEntries(divisionId) {
    const data = await request('/entries', { query: { divisionId } });
    return data.entries || [];
}

export function saveDivisionEntry(body) {
    return request('/entries', { method: 'POST', body });
}

// --- Luật điểm số và tie-break ---

export function getTournamentRules(tournamentId) {
    return request('/rules', { query: { tournamentId }, cache: 'no-store' });
}

export function updateTournamentRules(body) {
    return request('/rules', { method: 'PATCH', body });
}

// --- Đăng ký/roster và duyệt của BTC ---

export async function listRegistrations(query) {
    const data = await request('/registrations', { query });
    return data.registrations || [];
}

export function saveRegistration(body) {
    return request('/registrations', { method: 'POST', body });
}

export function reviewRegistration(body) {
    return request('/registrations', { method: 'PATCH', body });
}

// --- Interclub participation ---

export async function listTournamentClubs(tournamentId) {
    const data = await request('/clubs', { query: { tournamentId } });
    return data.clubs || [];
}

// Danh sách CLB PickHub mời được. tournamentId tuỳ chọn: wizard tạo giải gọi
// trước khi giải tồn tại nên bỏ trống; console giải đã tạo có thể truyền để rõ ngữ cảnh.
export async function listAvailableTournamentClubs(tournamentId) {
    const data = await request('/clubs', { query: { tournamentId, mode: 'available' } });
    return data.clubs || [];
}

export function inviteTournamentClub(body) {
    return request('/clubs', { method: 'POST', body });
}

export function inviteExternalClub(body) {
    return request('/clubs', { method: 'POST', body });
}

export function updateTournamentClub(body) {
    return request('/clubs', { method: 'PATCH', body });
}

// --- Generate schedule ---

export function generateSchedule(stageId, seed = 1, options = {}) {
    return request('/generate', {
        method: 'POST',
        body: {
            stageId,
            seed,
            idempotency_key: options.idempotencyKey || createIdempotencyKey(),
        },
    });
}

// --- MLP pairs (lịch ghép đôi nội bộ đội, lưu trong stage.config.pairSchedule) ---

export function getPairs(stageId) {
    return request('/pairs', { query: { stageId } });
}

export function generatePairs(stageId, seed = 1) {
    return request('/pairs', { method: 'POST', body: { stageId, seed } });
}

export function patchPairs(stageId, pairSchedule) {
    return request('/pairs', { method: 'PATCH', body: { stageId, pairSchedule } });
}

// --- Matches (danh sách trận của 1 stage, cho console nhập tỉ số) ---

export async function listMatches(stageId) {
    const data = await request('/matches', { query: { stageId } });
    return { matches: data.matches || [], gamesByMatchId: data.gamesByMatchId || {} };
}

// --- Games (tỉ số) ---

export function saveGames(matchId, games, options = {}) {
    return request('/games', {
        method: 'PUT',
        body: {
            matchId,
            games,
            idempotency_key: options.idempotencyKey || createIdempotencyKey(),
            expected_version: options.expectedVersion,
        },
    });
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
    return request('/public', { query: { slug }, cache: 'no-store' });
}

// --- Vận hành tại sân (Phase 4) ---
// Các route này chỉ là lớp client; mọi kiểm tra role, group scope và audit
// được thực hiện ở server. UI không truy cập Supabase trực tiếp.
export async function listCourts(tournamentId) {
    const data = await request('/courts', { query: { tournamentId } });
    return data.courts;
}

export function updateCourt(body) {
    return request('/courts', { method: 'PATCH', body });
}

// --- Đăng ký mở giải cộng đồng (open registration) ---
// Endpoint /public/* không cần auth; các endpoint BTC dùng cookie session như bình thường.

export async function listCommunityTournaments() {
    const data = await request('/public/community', { cache: 'no-store' });
    return data.tournaments || [];
}

export function getPublicRegistration(slug, divisionId) {
    return request('/public/registration', { query: { slug, divisionId }, cache: 'no-store' });
}

export function submitPublicRegistration(body) {
    return request('/public/registration', { method: 'POST', body });
}

export function getRegistrationStatus(query) {
    return request('/public/registration/status', { query, cache: 'no-store' });
}

export function getPairInviteContext(token) {
    return request('/public/pair-invite', { query: { token }, cache: 'no-store' });
}

export function sendPairInvite(body) {
    return request('/public/pair-invite', { method: 'POST', body });
}

export function respondPairInvite(body) {
    return request('/public/pair-invite', { method: 'PATCH', body });
}

export function getRegistrationBoard(divisionId) {
    return request('/registrations/board', { query: { divisionId }, cache: 'no-store' });
}

export function reviewOpenRegistration(body) {
    return request('/registrations', { method: 'PATCH', body });
}

// --- So van theo vong (Spec 1) ---
export async function getRoundRules(stageId) {
    return request('/round-rules', { query: { stageId } });
}
export function updateRoundRule(body) {
    return request('/round-rules', { method: 'PATCH', body });
}

// --- Dia diem va san (Spec 2) ---
export async function listVenues(tournamentId) {
    const data = await request('/venues', { query: { tournamentId } });
    return data.venues;
}
export function saveVenue(body) {
    return request('/venues', { method: 'POST', body });
}
export function saveCourt(body) {
    return request('/courts', { method: 'POST', body });
}
export function setCourtActive(body) {
    return request('/courts', { method: 'PATCH', body });
}
export function deleteCourt(tournamentId, id) {
    return request('/courts', { method: 'DELETE', query: { tournamentId, id } });
}

// --- Vong doi tran va bang san (Spec 2) ---
export function transitionMatch(body) {
    return request('/match-transition', { method: 'POST', body });
}
export async function getCourtBoard(tournamentId) {
    return request('/assignments', { query: { tournamentId } });
}
export function assignMatchCourt(body) {
    return request('/assignments', { method: 'PATCH', body });
}
export async function listOperationLogs(tournamentId, limit) {
    const data = await request('/operation-logs', { query: { tournamentId, limit } });
    return data.logs;
}

// --- Boc tham (Spec 3) ---
export async function getDraw(stageId) {
    return request('/draw', { query: { stageId } });
}
export function rollDraw(body) {
    return request('/draw', { method: 'POST', body: { ...body, action: 'roll' } });
}
export function swapDrawEntries(body) {
    return request('/draw', { method: 'POST', body: { ...body, action: 'swap' } });
}
export function lockDraw(body) {
    return request('/draw', { method: 'POST', body: { ...body, action: 'lock' } });
}
export function unlockDraw(body) {
    return request('/draw', { method: 'POST', body: { ...body, action: 'unlock' } });
}

// Hai hàm getRoundRules/updateRoundRule đã khai ở khối "So van theo vong (Spec 1)"
// phía trên — Task 0 viết trọn bộ client một lần để ba luồng không tranh file này.


// --- Sửa kết quả đã chốt (Spec 3) ---

export async function listCorrections(query) {
    const data = await request('/corrections', { query, cache: 'no-store' });
    return data.corrections || [];
}

export function previewCorrection(body) {
    return request('/corrections', { method: 'POST', body: { ...body, preview: true } });
}

export function applyCorrection(body) {
    return request('/corrections', { method: 'POST', body });
}
