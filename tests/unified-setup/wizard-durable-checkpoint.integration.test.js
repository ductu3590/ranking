// Regression tích hợp cho durable checkpoint.
//
// Chạy CHÍNH orchestration thật (lib/tournament/wizardRunner.js) mà UI dùng, ghép
// với một "máy chủ" giả mô phỏng đúng ngữ nghĩa của migration 074:
//   * bộ nhớ phát lại theo (operation, idempotency_key) + payload_fingerprint,
//   * CAS trên setup_revision,
//   * mỗi lần ghi thành công tăng revision đúng một lần.
// Draft được lưu vào một storage giả bền (khảo sát được sau khi "reload").
//
// Lỗi gốc: metadata của attempt (revision ghim + idempotency key) chỉ được lưu SAU
// khi RPC thành công, nên server commit xong mà mất response thì client thử lại
// bằng key mới -> RPC chạy lại -> nhân đôi dữ liệu.

const assert = require('assert');
const {
  createDraft, readDraft, writeDraft, UNIFIED_DOUBLES_PLAN, CHECKPOINT,
  checkpointResult, pinnedRevision, newClientRef,
} = require('../../lib/tournament/wizardDraft');
const { runCheckpointSequence, beginMutation } = require('../../lib/tournament/wizardRunner');

/* ---------- storage giả, bền qua "reload" ---------- */
function makeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
  };
}

/* ---------- "máy chủ" giả theo ngữ nghĩa migration 074 ---------- */
function makeServer() {
  return {
    revision: 1,
    participants: [],        // mỗi phần tử = một lần RPC THỰC SỰ chạy
    replayCache: new Map(),  // key -> { fingerprint, response }
    calls: 0,
    replaceParticipants(body) {
      this.calls += 1;
      const key = body.idempotency_key;
      const fingerprint = JSON.stringify(body.participants);
      const cached = this.replayCache.get(key);
      if (cached) {
        if (cached.fingerprint !== fingerprint) {
          const e = new Error('IDEMPOTENCY_KEY_REUSED'); e.status = 409; e.code = 'IDEMPOTENCY_KEY_REUSED';
          throw e;
        }
        return cached.response; // replay: KHÔNG ghi thêm gì
      }
      if (Number(body.expected_setup_revision) !== this.revision) {
        const e = new Error('SETUP_REVISION_CONFLICT'); e.status = 409; e.code = 'SETUP_REVISION_CONFLICT';
        throw e;
      }
      this.participants.push(body.participants);
      this.revision += 1;
      const response = {
        success: true,
        setup_revision: this.revision,
        athletes: body.participants.map((p, i) => ({ client_ref: p.client_ref, tournament_athlete_id: 1000 + i })),
      };
      this.replayCache.set(key, { fingerprint, response });
      return response;
    },
  };
}

function makeDraft(storage) {
  const participants = [
    { client_ref: newClientRef(1), display_name: 'A', athlete_id: null, source: 'guest' },
    { client_ref: newClientRef(2), display_name: 'B', athlete_id: null, source: 'guest' },
  ];
  const draft = createDraft({
    plan: [CHECKPOINT.PARTICIPANTS],
    groupId: 7,
    config: { scope: 'internal', unit: 'doi' },
    participants,
  });
  // các bước trước đã xong
  draft.results = { tournament: { tournament_id: 90 }, host_club: { tournament_club_id: 5 }, division: { division_id: 11 } };
  writeDraft(storage, draft);
  return draft;
}

// Handler THẬT về mặt hình dạng: chuẩn bị attempt (persist trước), rồi gọi mạng.
function participantsHandler(server, net) {
  return async ({ draft, name, commit }) => {
    const payload = {
      tournament_id: 90,
      division_id: 11,
      tournament_club_id: 5,
      participants: (draft.participants || []).map((p) => ({
        client_ref: p.client_ref, display_name: p.display_name, athlete_id: null, source: 'guest',
      })),
    };
    const attempt = await beginMutation({
      draft, name, payload, commit,
      readRevision: async () => server.revision,
    });
    const res = await net(attempt.body);
    return { draft: attempt.draft, result: { setup_revision: res.setup_revision } };
  };
}

let failures = 0;
function check(label, fn) {
  try { fn(); console.log(`  ok  ${label}`); }
  catch (err) { failures += 1; console.error(`  FAIL ${label}\n       ${err.message}`); }
}

(async () => {
  /* 1. Server commit thành công nhưng response bị mất -> retry phải REPLAY. */
  {
    const storage = makeStorage();
    const server = makeServer();
    let draft = makeDraft(storage);

    const lossy = async (body) => { server.replaceParticipants(body); const e = new Error('network lost'); e.status = 0; throw e; };
    let run = await runCheckpointSequence({
      draft, persist: (d) => writeDraft(storage, d),
      handlers: { [CHECKPOINT.PARTICIPANTS]: participantsHandler(server, lossy) },
    });
    assert.strictEqual(run.ok, false, 'lần đầu phải thất bại (mất response)');
    assert.strictEqual(server.participants.length, 1, 'server đã ghi đúng 1 lần');

    // Draft ĐÃ PERSIST phải chứa revision + key của attempt vừa gửi.
    const persisted = readDraft(storage, 7);
    check('1a: draft durable giữ revision đã gửi', () => assert.strictEqual(pinnedRevision(persisted, CHECKPOINT.PARTICIPANTS), 1));
    check('1b: draft durable giữ idempotency key đã gửi', () => assert.ok(persisted.keys[CHECKPOINT.PARTICIPANTS]?.key));

    const sentKey = persisted.keys[CHECKPOINT.PARTICIPANTS].key;

    // Retry từ draft đã persist, lần này mạng thông.
    const ok = async (body) => server.replaceParticipants(body);
    run = await runCheckpointSequence({
      draft: persisted, persist: (d) => writeDraft(storage, d),
      handlers: { [CHECKPOINT.PARTICIPANTS]: participantsHandler(server, ok) },
    });
    check('1c: retry thành công', () => assert.strictEqual(run.ok, true));
    check('1d: retry dùng lại ĐÚNG key đã gửi', () => assert.strictEqual(
      readDraft(storage, 7).keys[CHECKPOINT.PARTICIPANTS].key, sentKey));
    check('1e: KHÔNG tạo thêm identity/pair/entry (replay, không ghi lần hai)', () => assert.strictEqual(server.participants.length, 1));
    check('1f: revision server chỉ tăng một lần', () => assert.strictEqual(server.revision, 2));
  }

  /* 2. Chưa commit; admin B đổi revision -> admin A retry bằng revision cũ phải nhận conflict. */
  {
    const storage = makeStorage();
    const server = makeServer();
    const draft = makeDraft(storage);

    const failBefore = async () => { const e = new Error('timeout trước khi tới server'); e.status = 0; throw e; };
    await runCheckpointSequence({
      draft, persist: (d) => writeDraft(storage, d),
      handlers: { [CHECKPOINT.PARTICIPANTS]: participantsHandler(server, failBefore) },
    });
    check('2a: revision của attempt đã được ghim', () => assert.strictEqual(pinnedRevision(readDraft(storage, 7), CHECKPOINT.PARTICIPANTS), 1));

    server.revision = 5; // admin B ghi trong lúc đó

    let conflict = null;
    const run = await runCheckpointSequence({
      draft: readDraft(storage, 7), persist: (d) => writeDraft(storage, d),
      handlers: { [CHECKPOINT.PARTICIPANTS]: participantsHandler(server, async (b) => server.replaceParticipants(b)) },
      onConflict: (d, n, err) => { conflict = err; },
    });
    check('2b: retry bị từ chối, không ghi đè admin B', () => assert.strictEqual(run.ok, false));
    check('2c: là xung đột CAS 409', () => assert.strictEqual(conflict && conflict.code, 'SETUP_REVISION_CONFLICT'));
    check('2d: server KHÔNG ghi gì', () => assert.strictEqual(server.participants.length, 0));
    check('2e: 409 nhả ghim để lần sau đọc revision mới', () => assert.strictEqual(pinnedRevision(readDraft(storage, 7), CHECKPOINT.PARTICIPANTS), null));
  }

  /* 3. Reload khi RPC đang pending -> khôi phục đúng metadata của attempt. */
  {
    const storage = makeStorage();
    const server = makeServer();
    const draft = makeDraft(storage);

    let sentBody = null;
    const hang = async (body) => { sentBody = body; const e = new Error('reload giữa chừng'); e.status = 0; throw e; };
    await runCheckpointSequence({
      draft, persist: (d) => writeDraft(storage, d),
      handlers: { [CHECKPOINT.PARTICIPANTS]: participantsHandler(server, hang) },
    });

    const afterReload = readDraft(storage, 7); // mô phỏng reload: chỉ còn storage
    check('3a: reload khôi phục revision của attempt', () => assert.strictEqual(
      pinnedRevision(afterReload, CHECKPOINT.PARTICIPANTS), sentBody.expected_setup_revision));
    check('3b: reload khôi phục idempotency key đã gửi', () => assert.strictEqual(
      afterReload.keys[CHECKPOINT.PARTICIPANTS].key, sentBody.idempotency_key));
    check('3c: reload giữ nguyên các checkpoint đã xong', () => assert.strictEqual(
      checkpointResult(afterReload, 'division').division_id, 11));
  }

  /* 4. Catch không được ghi đè draft mới bằng snapshot cũ. */
  {
    const storage = makeStorage();
    const server = makeServer();
    const draft = makeDraft(storage);
    const boom = async () => { throw new Error('lỗi 500 sau khi đã chuẩn bị attempt'); };
    const run = await runCheckpointSequence({
      draft, persist: (d) => writeDraft(storage, d),
      handlers: { [CHECKPOINT.PARTICIPANTS]: participantsHandler(server, boom) },
    });
    check('4a: draft TRẢ VỀ từ runner giữ revision đã ghim', () => assert.strictEqual(pinnedRevision(run.draft, CHECKPOINT.PARTICIPANTS), 1));
    check('4b: draft ĐÃ LƯU giữ revision đã ghim', () => assert.strictEqual(pinnedRevision(readDraft(storage, 7), CHECKPOINT.PARTICIPANTS), 1));
    check('4c: draft đã lưu giữ idempotency key', () => assert.ok(readDraft(storage, 7).keys[CHECKPOINT.PARTICIPANTS]?.key));
  }

  /* 5. Payload đổi THẬT -> key xoay; đổi riêng revision -> KHÔNG xoay. */
  {
    const storage = makeStorage();
    const server = makeServer();
    const draft = makeDraft(storage);
    const boom = async () => { const e = new Error('mạng lỗi'); e.status = 0; throw e; };
    await runCheckpointSequence({
      draft, persist: (d) => writeDraft(storage, d),
      handlers: { [CHECKPOINT.PARTICIPANTS]: participantsHandler(server, boom) },
    });
    const firstKey = readDraft(storage, 7).keys[CHECKPOINT.PARTICIPANTS].key;

    // cùng payload, revision server đã đổi -> key phải GIỮ NGUYÊN (ghim + loại
    // revision khỏi vân tay) để bộ nhớ phát lại của server còn dùng được.
    server.revision = 9;
    await runCheckpointSequence({
      draft: readDraft(storage, 7), persist: (d) => writeDraft(storage, d),
      handlers: { [CHECKPOINT.PARTICIPANTS]: participantsHandler(server, boom) },
    });
    check('5a: payload không đổi -> giữ nguyên key', () => assert.strictEqual(
      readDraft(storage, 7).keys[CHECKPOINT.PARTICIPANTS].key, firstKey));

    // đổi danh sách VĐV -> payload đổi thật -> key PHẢI xoay
    const changed = readDraft(storage, 7);
    changed.participants = changed.participants.slice(0, 1);
    writeDraft(storage, changed);
    await runCheckpointSequence({
      draft: readDraft(storage, 7), persist: (d) => writeDraft(storage, d),
      handlers: { [CHECKPOINT.PARTICIPANTS]: participantsHandler(server, boom) },
    });
    check('5b: payload đổi thật -> key xoay', () => assert.notStrictEqual(
      readDraft(storage, 7).keys[CHECKPOINT.PARTICIPANTS].key, firstKey));
  }

  if (failures) { console.error(`wizard-durable-checkpoint: ${failures} assertion(s) failed`); process.exit(1); }
  console.log('wizard-durable-checkpoint ok');
})().catch((err) => { console.error('FAIL (throw):', err); process.exit(1); });
