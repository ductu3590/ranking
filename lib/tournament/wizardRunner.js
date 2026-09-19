'use strict';

// Vòng chạy checkpoint của wizard tạo giải — tách khỏi React để chạy được trong
// test tích hợp với "máy chủ" giả, và để CHÍNH nó là orchestration mà UI dùng
// (không phải một bản sao song song).
//
// Bất biến quan trọng: metadata của một lần thử (revision đã ghim + idempotency
// key) phải NẰM TRONG DRAFT ĐÃ PERSIST **TRƯỚC KHI** request rời máy client.
// Nếu chỉ lưu sau khi RPC thành công thì:
//   * server commit xong nhưng mất response  -> client không biết đã gửi key nào,
//     lần thử lại sinh key mới, bộ nhớ phát lại của server bị bỏ qua và RPC chạy
//     lại (tạo trùng identity/pair/entry hoặc kẹt 409 vĩnh viễn);
//   * reload giữa lúc chờ                     -> mất luôn revision/key của attempt.
// Vì vậy runCheckpointSequence giữ `prepared` — bản draft mới nhất đã được
// handler commit — và khi có lỗi thì lấy `prepared` chứ KHÔNG quay về snapshot cũ.

const {
  nextCheckpoint,
  markAttempt,
  recordCheckpoint,
  releaseRevision,
  pinRevision,
  pinnedRevision,
  checkpointIdempotency,
} = require('./wizardDraft');

const MAX_STEPS = 64;

function isConflictError(error) {
  return Number(error && error.status) === 409;
}

// Chuẩn bị một lần thử mutation rồi GHI DRAFT XUỐNG trước khi gọi mạng.
// readRevision chỉ được gọi khi checkpoint CHƯA ghim revision — đã ghim thì dùng
// lại đúng revision của lần thử đầu, để không nuốt mất thay đổi của admin khác và
// để vân tay payload (và do đó idempotency key) không đổi giữa các lần thử lại.
async function beginMutation({ draft, name, payload, readRevision, commit }) {
  let revision = pinnedRevision(draft, name);
  if (revision == null) {
    revision = await readRevision();
  }
  const pin = pinRevision(draft, name, revision);
  const body = { ...payload, expected_setup_revision: pin.revision };
  const stamped = checkpointIdempotency(pin.draft, name, body);
  // Điểm mấu chốt: durable TRƯỚC khi request rời máy client.
  commit(stamped.draft);
  return {
    draft: stamped.draft,
    revision: pin.revision,
    key: stamped.key,
    body: { ...body, idempotency_key: stamped.key },
  };
}

// handlers[name] = async ({ draft, name, commit }) => ({ draft?, result })
// persist(draft) phải ghi xuống storage bền (localStorage ở UI thật).
async function runCheckpointSequence({ draft, handlers, persist, onStart, onConflict }) {
  let current = draft;
  const save = (next) => { current = next; if (persist) persist(next); return next; };

  for (let guard = 0; guard < MAX_STEPS; guard += 1) {
    const name = nextCheckpoint(current);
    if (!name) break;
    if (onStart) onStart(name);

    save(markAttempt(current, name));

    // `prepared` theo dõi bản draft mới nhất mà handler đã commit. Khi handler ném
    // lỗi, ta giữ nguyên bản này — không được rơi về snapshot trước attempt.
    let prepared = current;
    const commit = (next) => { prepared = next; save(next); };

    const handler = handlers[name];
    if (typeof handler !== 'function') {
      const error = new Error(`Chưa có xử lý cho bước "${name}".`);
      error.code = 'WIZARD_CHECKPOINT_UNHANDLED';
      save(prepared);
      return { ok: false, draft: current, checkpoint: name, error };
    }

    let outcome;
    try {
      outcome = await handler({ draft: current, name, commit });
    } catch (error) {
      current = prepared;
      if (isConflictError(error)) {
        // 409 thật: bỏ ghim revision + key của ĐÚNG checkpoint này để lần gửi lại
        // (sau khi người dùng xem trạng thái mới và xác nhận) dùng revision hiện
        // hành. Mọi checkpoint đã xong giữ nguyên.
        current = releaseRevision(current, name);
        if (onConflict) await onConflict(current, name, error);
      }
      save(current);
      return { ok: false, draft: current, checkpoint: name, error };
    }

    save(recordCheckpoint(outcome.draft || prepared, name, outcome.result));
  }

  return { ok: true, draft: current };
}

module.exports = { runCheckpointSequence, beginMutation, isConflictError, MAX_STEPS };
