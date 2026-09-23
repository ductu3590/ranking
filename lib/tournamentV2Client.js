// Browser-side fetch client cho API giải đấu v2.
// Mọi component UI v2 gọi API qua module này — không truy vấn Supabase trực tiếp.
// Gửi cookie session (group_session) bằng credentials: 'same-origin'.

const BASE = '/api/tournament-v2';
function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

async function sha256(value) {
    if (!globalThis.crypto?.subtle || typeof TextEncoder === 'undefined') {
        throw new Error('Trình duyệt không hỗ trợ kiểm tra toàn vẹn bản nháp.');
    }
    const bytes = new TextEncoder().encode(stableStringify(value));
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function createIdempotencyKey() {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }
    return `pickhub-${Date.now()}-${String(Date.now()).slice(-6)}`;
}

const aggregateSaveKeys = new WeakMap();

function aggregateDraft(draft, currentStep = draft?.currentStep || 1) {
    const suppliedName = String(draft?.tournament?.name || '').trim();
    return {
        draftVersion: 2,
        currentStep: Number(currentStep),
        tournament: {
            name: suppliedName,
            organizerMode: draft?.tournament?.organizerMode || 'internal',
            eventDate: draft?.tournament?.eventDate || '',
            startTime: draft?.tournament?.startTime || '',
            location: String(draft?.tournament?.location || '').trim(),
            description: String(draft?.tournament?.description || '').trim(),
            posterUrl: String(draft?.tournament?.posterUrl || '').trim(),
        },
        division: { name: String(draft?.division?.name || '').trim(), playType: draft?.division?.playType || draft?.format?.entrantType || 'doubles' },
        format: {
            entrantType: draft?.format?.entrantType,
            formatKey: draft?.format?.formatKey,
            config: {
                ...(draft?.format?.config || {}),
                courtCount: Math.max(1, Number(draft?.format?.config?.courtCount || 1)),
            },
        },
        participants: {
            memberIds: (draft?.participants?.memberIds || draft?.participants?.selectedMemberIds || []).map(String),
            guests: Array.isArray(draft?.participants?.guests) ? draft.participants.guests.map((guest) => ({
                clientRef: String(guest?.clientRef || guest?.client_ref || '').trim(),
                displayName: String(guest?.displayName || guest?.display_name || '').trim(),
            })) : [],
        },
        pairs: Array.isArray(draft?.pairs) ? draft.pairs : [],
        unpairedMemberIds: Array.isArray(draft?.unpairedMemberIds) ? draft.unpairedMemberIds.map(String) : [],
        invitedClubs: Array.isArray(draft?.invitedClubs) ? draft.invitedClubs : [],
        draw: {
            ...(draft?.draw || {}),
            // The database finalizer owns this camelCase contract. The wizard
            // keeps its historic snake_case slots for the frozen local draw API.
            assignments: Array.isArray(draft?.draw?.assignments)
                ? draft.draw.assignments.map((assignment) => ({
                    entrantId: String(assignment?.entrantId ?? assignment?.entry_id ?? ''),
                    groupLabel: assignment?.groupLabel ?? assignment?.group_label ?? 'A',
                    slot: Number(assignment?.slot ?? assignment?.seed_in_stage ?? 0),
                })).filter((assignment) => assignment.entrantId && assignment.slot > 0)
                : [],
        },
    };
}

function aggregateKeysFor(draft) {
    const cached = draft && typeof draft === 'object' ? aggregateSaveKeys.get(draft) : null;
    const clientDraftKey = String(draft?.clientDraftKey || draft?.client_draft_key || cached?.clientDraftKey || createIdempotencyKey());
    const idempotencyKey = String(draft?.idempotencyKey || draft?.idempotency_key || cached?.idempotencyKey || createIdempotencyKey());
    const keys = { clientDraftKey, idempotencyKey };
    if (draft && typeof draft === 'object') aggregateSaveKeys.set(draft, keys);
    return keys;
}

async function request(path, { method = 'GET', body, query, cache, signal } = {}) {
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
        signal,
        body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const error = new Error(data.error || 'Request failed');
        error.status = res.status;
        // Giữ mã và payload server để UI phân biệt xung đột/revision với lỗi chung.
        error.code = data.code;
        error.details = data;
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

// --- Readiness setup theo nội dung (admin) ---

export function getSetupReadiness(tournamentId, divisionId) {
    return request('/setup', { query: { tournamentId, divisionId }, cache: 'no-store' });
}

export function getDivisionSetup(tournamentId, divisionId) {
    return request('/setup', { query: { tournamentId, divisionId }, cache: 'no-store' });
}

export function saveDraft(draft) {
    const tournamentId = Number(draft?.tournamentId) || null;
    const divisionId = Number(draft?.divisionId) || null;
    if (!tournamentId || !divisionId) {
        throw new Error('Cần tạo giải và nội dung trước khi lưu nháp thiết lập.');
    }
    const expectedRevision = Math.max(1, Number(draft?.revision || 1));
    // Keep distinct durable client and per-mutation keys across a failed retry.
    const { clientDraftKey, idempotencyKey } = aggregateKeysFor(draft);
    // This boundary deliberately retains member ids rather than tournament athlete ids.
    const aggregate = aggregateDraft(draft);

    return request('/setup', {
        method: 'POST',
        body: { action: 'save_aggregate', tournamentId, divisionId, clientDraftKey, draft: aggregate, expectedSetupRevision: expectedRevision, idempotencyKey },
    }).then((result) => {
        const nextIdempotencyKey = createIdempotencyKey();
        const persistedDraw = result?.draft?.draw || {};
        const nextDraft = {
            ...draft,
            ...(result?.draft || {}),
            tournamentId: Number(result?.tournament_id || result?.tournamentId || tournamentId),
            divisionId: Number(result?.division_id || result?.divisionId || divisionId),
            clientDraftKey,
            idempotencyKey: nextIdempotencyKey,
            state: 'server_draft',
            revision: Number(result?.setup_revision || result?.revision || draft?.revision || 0),
            savedAt: new Date().toISOString(),
            draw: {
                ...persistedDraw,
                assignments: Array.isArray(persistedDraw.assignments)
                    ? persistedDraw.assignments.map((assignment) => ({
                        entry_id: String(assignment?.entry_id ?? assignment?.entrantId ?? ''),
                        group_label: assignment?.group_label ?? assignment?.groupLabel ?? 'A',
                        seed_in_stage: Number(assignment?.seed_in_stage ?? assignment?.slot ?? 0),
                    })).filter((assignment) => assignment.entry_id && assignment.seed_in_stage > 0)
                    : [],
            },
        };
        aggregateSaveKeys.set(nextDraft, { clientDraftKey, idempotencyKey: nextIdempotencyKey });
        return { ...result, draft: nextDraft };
    });
}

// --- Luồng tạo giải v3 (spec Lát 0) ---
// Caller giữ clientDraftKey (bền suốt bản nháp) và idempotencyKey (mỗi lần lưu một
// khóa; thử lại sau lỗi mạng/timeout dùng LẠI đúng khóa đó).

export function newIdempotencyKey() {
    return createIdempotencyKey();
}

export async function loadSetupDraft(tournamentId, divisionId) {
    const data = await request('/setup', { query: { tournamentId, divisionId }, cache: 'no-store' });
    return data.setup;
}

export async function saveSetupDraft({ draft, tournamentId, divisionId, revision, clientDraftKey, idempotencyKey, signal }) {
    const hasTarget = Number(tournamentId) > 0 && Number(divisionId) > 0;
    return request('/setup', {
        method: 'POST',
        signal,
        body: {
            action: 'save_aggregate',
            ...(hasTarget ? { tournamentId: Number(tournamentId), divisionId: Number(divisionId) } : {}),
            clientDraftKey,
            idempotencyKey,
            expectedSetupRevision: Math.max(1, Number(revision) || 1),
            draft,
        },
    });
}

export function finalize(draft) {
    return request('/setup/finalize', {
        method: 'POST',
        body: {
            tournamentId: draft?.tournamentId,
            divisionId: draft?.divisionId,
            expectedRevision: draft?.revision,
            idempotencyKey: draft?.idempotencyKey || createIdempotencyKey(),
            previewFingerprint: draft?.draw?.previewFingerprint || draft?.draw?.fingerprint,
        },
    });
}

export function saveDivisionRoster(body) {
    return request('/setup', { method: 'POST', body: { ...body, action: 'replace_roster' } });
}

export function lockDivisionRoster(body) {
    return request('/setup', { method: 'POST', body: { ...body, action: 'lock_roster' } });
}

export function unlockDivisionRoster(body) {
    return request('/setup', { method: 'POST', body: { ...body, action: 'unlock_roster' } });
}

// Go seed play-off (duong phuc hoi khi can sua lai ket qua vong bang da seed).
export function unseedPlayoff(body) {
    return request('/setup', { method: 'POST', body: { ...body, action: 'unseed_playoff' } });
}

export function configureTopTwoPlayoff(body) {
    return request('/setup', { method: 'POST', body: { ...body, action: 'configure_top_two_playoff' } });
}

// Danh tinh VDV + roster noi dung trong MOT lan ghi co CAS/idempotency.
// client_ref la ma on dinh cua tung dong nhap lieu trong ban nhap, KHONG phai ma nguoi.
export function replaceDivisionParticipants(body) {
    return request('/setup', { method: 'POST', body: { ...body, action: 'replace_participants' } });
}

// Sua tuong thich entry doi cu: mac dinh chi chay thu (dry_run), giu nguyen entry id.
// Muon ap dung that phai truyen dry_run: false VA confirm_apply: true.
export function repairLegacyDivisionPairs(body) {
    const dryRun = body?.dry_run !== false;
    return request('/setup', {
        method: 'POST',
        body: { ...body, action: 'repair_legacy_pairs', dry_run: dryRun },
    });
}

// --- Preview lịch thi đấu (không ghi DB) ---

export function previewSchedule(body) {
    return request('/preview-schedule', { method: 'POST', body });
}

export async function previewSavedDraft(draft) {
    const tournamentId = Number(draft?.tournamentId);
    const divisionId = Number(draft?.divisionId);
    const expectedRevision = Number(draft?.revision);
    if (!Number.isSafeInteger(tournamentId) || !Number.isSafeInteger(divisionId) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
        throw new Error('Hãy lưu bản nháp trước khi bốc thăm.');
    }
    const aggregate = aggregateDraft(draft, draft?.currentStep || 3);
    return previewSchedule({ tournamentId, divisionId, expectedRevision, draftFingerprint: await sha256(aggregate) });
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

export function withdrawMatch(body) {
    return request('/withdraw', { method: 'POST', body });
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
