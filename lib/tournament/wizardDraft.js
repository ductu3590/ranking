'use strict';

// Bản nháp wizard tạo giải — trạng thái bền vững theo từng checkpoint.
// Module thuần (không React, lõi thuần không tự truy cập storage): mọi hàm nhận
// dữ liệu vào và trả dữ liệu ra, nên chạy được bằng node trong test hợp đồng.
// Các hàm đọc/ghi storage nhận đối tượng storage từ bên ngoài (localStorage trình duyệt).
//
// Vì sao cần bản nháp: tạo giải KHÔNG phải một giao dịch nguyên tử. Nó là chuỗi
// checkpoint có tên; mỗi checkpoint ghi lại id máy chủ trả về để tải lại trang vẫn
// tiếp tục đúng chỗ, không tạo trùng giải / VĐV / cặp / entry.

const DRAFT_KEY_PREFIX = 'pickhub:wizard-draft:v1:';
const DRAFT_VERSION = 2;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

// Tên checkpoint — dùng chung giữa wizard và test hợp đồng.
const CHECKPOINT = Object.freeze({
    TOURNAMENT: 'tournament',
    HOST_CLUB: 'host_club',
    DIVISION: 'division',
    GROUP_STAGE: 'group_stage',
    PARTICIPANTS: 'participants',
    PAIRS: 'pairs',
    PLAYOFF_STAGE: 'playoff_stage',
    PLAYOFF_PLAN: 'playoff_plan',
    VERIFY: 'verify',
    LEGACY_ENTRIES: 'legacy_entries',
    CLUB_INVITES: 'club_invites',
});

// Chuỗi 8 checkpoint của luồng nội bộ đánh đôi + bước kiểm tra lại (verify).
// 'verify' không ghi dữ liệu: nó đọc lại getDivisionSetup và chỉ cho phép báo
// thành công khi readiness.status === 'ready'.
const UNIFIED_DOUBLES_PLAN = Object.freeze([
    CHECKPOINT.TOURNAMENT,
    CHECKPOINT.HOST_CLUB,
    CHECKPOINT.DIVISION,
    CHECKPOINT.GROUP_STAGE,
    CHECKPOINT.PARTICIPANTS,
    CHECKPOINT.PAIRS,
    CHECKPOINT.PLAYOFF_STAGE,
    CHECKPOINT.PLAYOFF_PLAN,
    CHECKPOINT.VERIFY,
]);

// Nhãn tiếng Việt cho từng checkpoint — thông báo lỗi phải chỉ rõ bước nào hỏng.
const CHECKPOINT_LABELS = Object.freeze({
    [CHECKPOINT.TOURNAMENT]: 'Tạo giải',
    [CHECKPOINT.HOST_CLUB]: 'Thêm CLB chủ giải vào giải',
    [CHECKPOINT.DIVISION]: 'Tạo nội dung thi đấu',
    [CHECKPOINT.GROUP_STAGE]: 'Tạo giai đoạn vòng bảng',
    [CHECKPOINT.PARTICIPANTS]: 'Lưu danh sách vận động viên',
    [CHECKPOINT.PAIRS]: 'Chốt ghép cặp',
    [CHECKPOINT.PLAYOFF_STAGE]: 'Tạo giai đoạn play-off',
    [CHECKPOINT.PLAYOFF_PLAN]: 'Thiết lập nhánh bán kết / chung kết',
    [CHECKPOINT.VERIFY]: 'Kiểm tra lại thiết lập',
    [CHECKPOINT.LEGACY_ENTRIES]: 'Lưu suất thi đấu',
    [CHECKPOINT.CLUB_INVITES]: 'Mời câu lạc bộ',
});

/* ==================== Tiện ích thuần ==================== */

function draftStorageKey(groupId) {
    return DRAFT_KEY_PREFIX + (groupId == null ? 'unknown' : groupId);
}

// JSON ổn định: khóa đối tượng được sắp xếp nên cùng một payload luôn cho cùng một chuỗi.
function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value === undefined ? null : value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return '{' + keys.map((key) => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
}

// Vân tay payload (FNV-1a 32 bit + độ dài) — đủ để phát hiện payload đổi.
function fingerprintPayload(payload) {
    const text = stableStringify(payload === undefined ? null : payload);
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0') + text.length.toString(36);
}

function randomToken(random) {
    const rnd = typeof random === 'function' ? random : Math.random;
    return Math.floor(rnd() * 0xffffffff).toString(36);
}

// Mã bản nháp của giải: gửi kèm createTournament để thử lại không tạo giải thứ hai.
function newClientDraftKey(groupId, options) {
    const opts = options || {};
    const stamp = (typeof opts.now === 'function' ? opts.now() : Date.now()).toString(36);
    return 'wd-' + (groupId == null ? 'x' : groupId) + '-' + stamp + '-' + randomToken(opts.random);
}

// client_ref: mã ổn định của MỘT DÒNG nhập liệu trong bản nháp, KHÔNG phải mã người.
// Sinh đúng một lần lúc thêm tên và không bao giờ sinh lại.
function newClientRef(sequence, options) {
    const opts = options || {};
    const stamp = (typeof opts.now === 'function' ? opts.now() : Date.now()).toString(36);
    return 'p-' + stamp + '-' + (Number(sequence) || 0) + '-' + randomToken(opts.random);
}

function makeParticipant(input) {
    const source = input || {};
    const name = String(source.display_name || '').trim();
    const rawAthleteId = source.athlete_id;
    const athleteId = rawAthleteId == null || rawAthleteId === '' ? null : Number(rawAthleteId);
    // athlete_id NULL là khách hợp lệ — tuyệt đối không bịa ra danh tính toàn cục.
    const resolvedSource = source.source === 'club_member' && athleteId != null ? 'club_member' : 'guest';
    return { client_ref: String(source.client_ref), display_name: name, athlete_id: athleteId, source: resolvedSource };
}

/* ==================== Vòng đời bản nháp ==================== */

function createDraft(input) {
    const source = input || {};
    const plan = source.plan;
    if (!Array.isArray(plan) || !plan.length) throw new Error('WIZARD_DRAFT_PLAN_REQUIRED');
    const nowValue = typeof source.now === 'function' ? source.now() : Date.now();
    return {
        version: DRAFT_VERSION,
        group_id: source.groupId == null ? null : Number(source.groupId),
        client_draft_key: String(source.clientDraftKey || newClientDraftKey(source.groupId, { now: source.now })),
        created_at: new Date(nowValue).toISOString(),
        plan: plan.slice(),
        config: { ...(source.config || {}) },
        participants: (source.participants || []).map((item) => ({ ...item })),
        pairs: (source.pairs || []).map((pair) => pair.slice()),
        results: {},
        keys: {},
        attempts: {},
        partials: {},
        revisions: {},
    };
}

function cloneDraft(draft) {
    return {
        ...draft,
        plan: (draft.plan || []).slice(),
        config: { ...(draft.config || {}) },
        participants: (draft.participants || []).map((item) => ({ ...item })),
        pairs: (draft.pairs || []).map((pair) => pair.slice()),
        results: { ...(draft.results || {}) },
        keys: { ...(draft.keys || {}) },
        attempts: { ...(draft.attempts || {}) },
        partials: { ...(draft.partials || {}) },
        revisions: { ...(draft.revisions || {}) },
    };
}

// Checkpoint kế tiếp chưa hoàn tất — điều khiển cả lần chạy đầu lẫn lần tiếp tục sau reload.
function nextCheckpoint(draft) {
    if (!draft || !Array.isArray(draft.plan)) return null;
    const results = draft.results || {};
    for (const name of draft.plan) {
        if (!Object.prototype.hasOwnProperty.call(results, name)) return name;
    }
    return null;
}

function isComplete(draft) {
    return nextCheckpoint(draft) === null;
}

function completedCheckpoints(draft) {
    if (!draft || !Array.isArray(draft.plan)) return [];
    const results = draft.results || {};
    return draft.plan.filter((name) => Object.prototype.hasOwnProperty.call(results, name));
}

function checkpointResult(draft, name) {
    if (!draft || !draft.results) return null;
    const value = draft.results[name];
    return value === undefined ? null : value;
}

function recordCheckpoint(draft, name, result) {
    const next = cloneDraft(draft);
    next.results[name] = result === undefined ? {} : result;
    return next;
}

function recordPartial(draft, name, partial) {
    const next = cloneDraft(draft);
    next.partials[name] = { ...(next.partials[name] || {}), ...(partial || {}) };
    return next;
}

function partialOf(draft, name) {
    if (!draft || !draft.partials) return {};
    return draft.partials[name] || {};
}

function markAttempt(draft, name) {
    const next = cloneDraft(draft);
    next.attempts[name] = Number(next.attempts[name] || 0) + 1;
    return next;
}

function attemptCount(draft, name) {
    if (!draft || !draft.attempts) return 0;
    return Number(draft.attempts[name] || 0);
}

/* ==================== Khóa idempotency theo checkpoint ==================== */

// Thử lại dùng đúng khóa cũ khi payload không đổi (máy chủ phát lại kết quả thay vì
// tạo trùng). Payload đổi (ví dụ revision mới sau 409) thì khóa PHẢI xoay, nếu không
// máy chủ sẽ báo IDEMPOTENCY_KEY_REUSED vì cùng khóa nhưng khác vân tay.
// expected_setup_revision KHÔNG được nằm trong vân tay. Máy chủ cũng không tính nó
// vào payload_fingerprint (xem migration 074), nên nếu client tính vào thì sau một
// lần ghi thành công mà mất phản hồi, revision đã nhảy -> khóa xoay -> bộ nhớ phát
// lại của máy chủ bị bỏ qua và RPC chạy lại. Loại nó ra để khóa ổn định đúng như
// máy chủ mong đợi; giá trị thực gửi đi được giữ ổn định riêng bằng pinRevision().
function fingerprintCheckpointPayload(payload) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const rest = { ...source };
    delete rest.expected_setup_revision;
    delete rest.expectedSetupRevision;
    delete rest.idempotency_key;
    return fingerprintPayload(rest);
}

function checkpointIdempotency(draft, name, payload) {
    const fingerprint = fingerprintCheckpointPayload(payload);
    const existing = draft && draft.keys ? draft.keys[name] : null;
    if (existing && existing.fingerprint === fingerprint && existing.key) {
        return { draft, key: existing.key, fingerprint, rotated: false };
    }
    const key = (draft.client_draft_key + ':' + name + ':' + fingerprint).slice(0, MAX_IDEMPOTENCY_KEY_LENGTH);
    const next = cloneDraft(draft);
    next.keys[name] = { key, fingerprint };
    return { draft: next, key, fingerprint, rotated: Boolean(existing) };
}

/* ==================== Ghim revision theo checkpoint ==================== */

// Vì sao phải ghim: vân tay payload có chứa expected_setup_revision. Nếu mỗi lần
// thử lại đều đọc revision mới thì sau một lần ghi ĐÃ THÀNH CÔNG nhưng mất phản hồi
// (lỗi mạng mơ hồ), revision đã nhảy -> vân tay đổi -> khóa idempotency xoay ->
// máy chủ KHÔNG phát lại kết quả cũ mà chạy lại RPC. Với checkpoint ghép cặp thì
// lần chạy lại luôn bị trigger 059 chặn bằng ATHLETE_ALREADY_PAIRED_IN_DIVISION,
// tức là kẹt vĩnh viễn. Ghim revision của lần thử ĐẦU TIÊN giữ nguyên vân tay,
// nên lần thử lại dùng đúng khóa cũ và được phát lại kết quả.
function pinRevision(draft, name, revision) {
    const stored = Number(draft && draft.revisions ? draft.revisions[name] : NaN);
    if (Number.isSafeInteger(stored) && stored > 0) {
        return { draft, revision: stored, pinned: true };
    }
    const value = Number(revision);
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('WIZARD_DRAFT_REVISION_INVALID');
    const next = cloneDraft(draft);
    next.revisions[name] = value;
    return { draft: next, revision: value, pinned: false };
}

// Sau một 409 thật (người khác đã sửa), phải bỏ ghim VÀ bỏ khóa cũ để lần gửi lại
// dùng revision mới — nếu không sẽ gửi mãi một revision đã cũ.
// Revision đã ghim cho checkpoint (null nếu chưa ghim). Dùng để KHÔNG đọc lại
// revision ở các lần thử sau — đọc lại sẽ nuốt mất 409 của admin khác.
function pinnedRevision(draft, name) {
    const stored = Number(draft && draft.revisions ? draft.revisions[name] : NaN);
    return (Number.isSafeInteger(stored) && stored > 0) ? stored : null;
}

function releaseRevision(draft, name) {
    const next = cloneDraft(draft);
    delete next.revisions[name];
    delete next.keys[name];
    return next;
}

/* ==================== Đọc/ghi storage (storage truyền từ ngoài vào) ==================== */

function readDraft(storage, groupId) {
    if (!storage || typeof storage.getItem !== 'function') return null;
    let raw = null;
    try {
        raw = storage.getItem(draftStorageKey(groupId));
    } catch (storageError) {
        return null; // trình duyệt chặn storage — coi như không có bản nháp
    }
    if (!raw) return null;
    let parsed = null;
    try {
        parsed = JSON.parse(raw);
    } catch (parseError) {
        return null; // bản nháp hỏng — bỏ qua, không làm vỡ wizard
    }
    if (!parsed || parsed.version !== DRAFT_VERSION || !Array.isArray(parsed.plan) || !parsed.plan.length) return null;
    return {
        results: {}, keys: {}, attempts: {}, partials: {}, participants: [], pairs: [], config: {},
        ...parsed,
    };
}

function writeDraft(storage, draft) {
    if (!storage || typeof storage.setItem !== 'function' || !draft) return false;
    try {
        storage.setItem(draftStorageKey(draft.group_id), JSON.stringify(draft));
        return true;
    } catch (storageError) {
        return false; // hết quota hoặc bị chặn — luồng tạo giải vẫn chạy tiếp
    }
}

function clearDraft(storage, groupId) {
    if (!storage || typeof storage.removeItem !== 'function') return false;
    try {
        storage.removeItem(draftStorageKey(groupId));
        return true;
    } catch (storageError) {
        return false;
    }
}

module.exports = {
    DRAFT_KEY_PREFIX,
    DRAFT_VERSION,
    CHECKPOINT,
    CHECKPOINT_LABELS,
    UNIFIED_DOUBLES_PLAN,
    draftStorageKey,
    stableStringify,
    fingerprintPayload,
    newClientDraftKey,
    newClientRef,
    makeParticipant,
    createDraft,
    cloneDraft,
    nextCheckpoint,
    isComplete,
    completedCheckpoints,
    checkpointResult,
    recordCheckpoint,
    recordPartial,
    partialOf,
    markAttempt,
    attemptCount,
    checkpointIdempotency,
    fingerprintCheckpointPayload,
    pinRevision,
    pinnedRevision,
    releaseRevision,
    readDraft,
    writeDraft,
    clearDraft,
};
