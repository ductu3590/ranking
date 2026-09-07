'use strict';

// Live integration test cho luồng đăng ký công khai (open registration).
// Chạy thật qua PostgREST + HTTP route handlers để bắt được lớp bug mà contract
// test (chỉ grep chuỗi nguồn) không thấy — ví dụ lọc sai cột organizer_type.
//
// Yêu cầu: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY trong .env.local (migration 042
// đã apply nên PostgREST đọc/ghi được các cột/bảng mới). Test tự spawn `next dev`.
//
// An toàn dữ liệu: chỉ INSERT bản ghi test (giải/nội dung/đăng ký) rồi DELETE đúng
// theo id đã tạo ở cuối. KHÔNG DROP/TRUNCATE, KHÔNG đụng dữ liệu CLB thật.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const { signSession } = require('../../lib/groupSessionCore');

const PORT = 4199;
const BASE = `http://127.0.0.1:${PORT}`;

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const fail = (msg) => { console.error('FAIL: ' + msg); process.exitCode = 1; throw new Error(msg); };
const assert = (cond, msg) => { if (!cond) fail(msg); };

async function waitForServer() {
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await fetch(BASE);
      if (res.status) return;
    } catch { /* chưa lên */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Next dev server không khởi động kịp');
}

async function json(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { __raw: text }; }
}

async function main() {
  loadEnvLocal();
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('FAIL: thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY trong .env.local');
    process.exit(1);
  }
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  const created = { tournamentId: null, divisionId: null, pairDivisionId: null, regIds: [] };
  let server = null;

  try {
    // ---- Seed: cần một group thật để làm chủ giải (chỉ dùng làm FK owner) ----
    // Lấy thêm code + access_version để ký được cookie group_session admin hợp lệ,
    // vì bước BTC duyệt cặp gọi PATCH /registrations thật qua HTTP.
    const { data: group, error: gErr } = await db.from('groups')
      .select('id, code, name, access_version').limit(1).maybeSingle();
    if (gErr) throw gErr;
    assert(group && group.id, 'phải có ít nhất một group để gắn giải test');
    const groupId = group.id;

    // Cookie admin ký bằng cùng GROUP_SESSION_SECRET route dùng. Không set session_key
    // để bỏ qua kiểm tra phiên trong DB; access_version phải khớp bản ghi group hiện tại.
    const adminCookie = signSession({
      groupId: group.id,
      groupCode: group.code,
      groupName: group.name || 'CLB Test',
      role: 'admin',
      accessVersion: Number(group.access_version) || 1,
    }, process.env.GROUP_SESSION_SECRET);
    const adminHeaders = {
      'content-type': 'application/json',
      cookie: `group_session=${adminCookie}`,
    };

    const slug = `test-open-reg-${Date.now()}`;

    // (1) Giải organizer_type='club' NHƯNG settings.organizer_mode='community' + open_registration
    //     => chính là ca bug: cột organizer_type không hề mang giá trị 'community'.
    const { data: t, error: tErr } = await db.from('tournaments').insert({
      group_id: groupId,
      name: `[TEST] Open Registration ${slug}`,
      status: 'registration_open',
      entrant_type: 'pair',
      organizer_type: 'club',
      organizer_club_id: groupId,
      public_slug: slug,
      visibility: 'unlisted',
      settings: { organizer_mode: 'community', open_registration: true },
    }).select('id').single();
    if (tErr) throw tErr;
    created.tournamentId = t.id;

    // (2) Nội dung đôi Nam-Nữ, cap 4.8, mở đăng ký, sức chứa 1 cặp.
    const { data: d, error: dErr } = await db.from('tournament_divisions').insert({
      group_id: groupId,
      tournament_id: t.id,
      name: 'Đôi Nam-Nữ (test)',
      entrant_type: 'pair',
      play_type: 'doubles',
      gender_mode: 'mixed',
      rating_policy: 'capped',
      rating_cap: 4.8,
      registration_open: true,
      registration_capacity: 1,
    }).select('id').single();
    if (dErr) throw dErr;
    created.divisionId = d.id;

    // (2b) Nội dung đôi Nam-Nữ RIÊNG cho luồng ghép cặp (đủ chỗ: sức chứa 4 cặp).
    const { data: dp, error: dpErr } = await db.from('tournament_divisions').insert({
      group_id: groupId,
      tournament_id: t.id,
      name: 'Đôi Nam-Nữ ghép cặp (test)',
      entrant_type: 'pair',
      play_type: 'doubles',
      gender_mode: 'mixed',
      rating_policy: 'capped',
      rating_cap: 4.8,
      registration_open: true,
      registration_capacity: 4,
    }).select('id').single();
    if (dpErr) throw dpErr;
    created.pairDivisionId = dp.id;

    // ---- Server ----
    const nextBin = require.resolve('next/dist/bin/next');
    server = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', String(PORT)], {
      cwd: path.join(__dirname, '..', '..'),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.on('data', () => {});
    server.stderr.on('data', () => {});
    await waitForServer();

    // (3) GET /public/community PHẢI trả về giải này (ca bug: trước đây luôn rỗng).
    {
      const res = await fetch(`${BASE}/api/tournament-v2/public/community`);
      const body = await json(res);
      assert(res.status === 200, `community trả 200, nhận ${res.status}`);
      const found = (body.tournaments || []).find((x) => x.public_slug === slug);
      assert(found, 'community PHẢI liệt kê giải cộng đồng đang mở (ca bug organizer_type)');
      assert(found.organizer_mode === 'community', 'community trả organizer_mode=community');
      assert((found.divisions || []).some((x) => String(x.id) === String(d.id)), 'kèm nội dung đang mở');
    }

    const pairA = [
      { full_name: 'Nguyen Van A', phone: '0900000001', gender: 'male', phr: 4.0 },
      { full_name: 'Tran Thi B', phone: '0900000002', gender: 'female', phr: 3.8 },
    ];
    const pairB = [
      { full_name: 'Le Van C', phone: '0900000003', gender: 'male', phr: 4.2 },
      { full_name: 'Pham Thi D', phone: '0900000004', gender: 'female', phr: 3.9 },
    ];

    // (4) POST cặp hợp lệ => 200 + track_token.
    let tokenA = null;
    {
      const res = await fetch(`${BASE}/api/tournament-v2/public/registration`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, divisionId: d.id, members: pairA, self_declared_club: 'CLB Test' }),
      });
      const body = await json(res);
      assert(res.status === 200, `POST hợp lệ trả 200, nhận ${res.status} (${body.error || ''})`);
      assert(body.track_token, 'POST hợp lệ trả track_token');
      tokenA = body.track_token;
      if (body.registration && body.registration.id) created.regIds.push(body.registration.id);
    }

    // (4b) POST lại trùng SĐT => 409 DUPLICATE_PHONE.
    {
      const res = await fetch(`${BASE}/api/tournament-v2/public/registration`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, divisionId: d.id, members: pairA }),
      });
      const body = await json(res);
      assert(res.status === 409, `POST trùng SĐT trả 409, nhận ${res.status}`);
      assert(body.code === 'DUPLICATE_PHONE', `code DUPLICATE_PHONE, nhận ${body.code}`);
    }

    // (5) BTC duyệt cặp A => approved. (Route PATCH cần admin session, nên mô phỏng
    //     hành động BTC bằng cập nhật DB trực tiếp — vốn đã có test auth riêng.)
    {
      const { data: regA } = await db.from('tournament_registrations')
        .select('id').eq('track_token', tokenA).maybeSingle();
      assert(regA && regA.id, 'tìm được đăng ký A theo track_token');
      const { error: upErr } = await db.from('tournament_registrations')
        .update({ status: 'approved', admitted_at: new Date().toISOString() })
        .eq('id', regA.id);
      if (upErr) throw upErr;
    }

    // Đăng ký kế tiếp phải vào danh sách chờ #1 (sức chứa = 1, đã duyệt 1).
    let tokenB = null;
    {
      const res = await fetch(`${BASE}/api/tournament-v2/public/registration`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, divisionId: d.id, members: pairB }),
      });
      const body = await json(res);
      assert(res.status === 200, `POST cặp B trả 200, nhận ${res.status} (${body.error || ''})`);
      tokenB = body.track_token;
      if (body.registration && body.registration.id) created.regIds.push(body.registration.id);
    }

    // (6) Tra cứu trạng thái theo token và theo SĐT.
    {
      const res = await fetch(`${BASE}/api/tournament-v2/public/registration/status?token=${tokenB}`);
      const body = await json(res);
      assert(res.status === 200, `status theo token trả 200, nhận ${res.status}`);
      assert(body.registration.status === 'submitted', 'cặp B đang submitted');
      assert(body.waitlist_position === 1, `cặp B ở danh sách chờ #1, nhận ${body.waitlist_position}`);
    }
    {
      const res = await fetch(`${BASE}/api/tournament-v2/public/registration/status?token=${tokenA}`);
      const body = await json(res);
      assert(res.status === 200, `status token A trả 200, nhận ${res.status}`);
      assert(body.registration.status === 'approved', 'cặp A đã approved');
    }
    {
      const res = await fetch(`${BASE}/api/tournament-v2/public/registration/status?slug=${slug}&divisionId=${d.id}&phone=0900000003`);
      const body = await json(res);
      assert(res.status === 200, `status theo SĐT trả 200, nhận ${res.status}`);
      assert(body.registration && body.registration.status === 'submitted', 'tra theo SĐT trả đúng đăng ký B');
    }

    // ================= LUỒNG GHÉP CẶP (solo → mời → duyệt) =================
    // Đây là phần mutate nhiều bản ghi nhất: hai đăng ký solo, một lời mời, và
    // bước BTC duyệt gộp thành một cặp submitted + đánh dấu bản ghi phụ merged.

    // Helper: POST một đăng ký SOLO (1 VĐV) vào nội dung ghép cặp dp.
    async function postSolo(member) {
      const res = await fetch(`${BASE}/api/tournament-v2/public/registration`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, divisionId: dp.id, members: [member] }),
      });
      const body = await json(res);
      return { res, body };
    }

    // (a+b) Hai đăng ký solo: một nam, một nữ => cả hai awaiting_partner + needs_partner.
    const soloMale = { full_name: 'Solo Nam', phone: '0900001001', gender: 'male', phr: 4.1 };
    const soloFemale = { full_name: 'Solo Nu', phone: '0900001002', gender: 'female', phr: 3.7 };
    let tokenSolo1 = null; let tokenSolo2 = null; let regId1 = null; let regId2 = null;
    {
      const a = await postSolo(soloMale);
      assert(a.res.status === 200, `solo nam trả 200, nhận ${a.res.status} (${a.body.error || ''})`);
      assert(a.body.registration && a.body.registration.status === 'awaiting_partner', 'solo nam status=awaiting_partner');
      assert(a.body.registration.needs_partner === true, 'solo nam needs_partner=true');
      tokenSolo1 = a.body.track_token; regId1 = a.body.registration.id;
      created.regIds.push(regId1);

      const b = await postSolo(soloFemale);
      assert(b.res.status === 200, `solo nữ trả 200, nhận ${b.res.status} (${b.body.error || ''})`);
      assert(b.body.registration && b.body.registration.status === 'awaiting_partner', 'solo nữ status=awaiting_partner');
      assert(b.body.registration.needs_partner === true, 'solo nữ needs_partner=true');
      tokenSolo2 = b.body.track_token; regId2 = b.body.registration.id;
      created.regIds.push(regId2);
    }

    // (c) A mời B bằng track_token của A => invite 'pending'.
    let inviteId = null;
    {
      const res = await fetch(`${BASE}/api/tournament-v2/public/pair-invite`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ track_token: tokenSolo1, to_registration_id: regId2 }),
      });
      const body = await json(res);
      assert(res.status === 200, `gửi lời mời trả 200, nhận ${res.status} (${body.error || ''})`);
      assert(body.invite && body.invite.status === 'pending', 'lời mời ở trạng thái pending');
      inviteId = body.invite.id;
    }

    // (d) B chấp nhận bằng track_token của B => 'accepted'.
    {
      const res = await fetch(`${BASE}/api/tournament-v2/public/pair-invite`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ track_token: tokenSolo2, invite_id: inviteId, action: 'accept' }),
      });
      const body = await json(res);
      assert(res.status === 200, `chấp nhận lời mời trả 200, nhận ${res.status} (${body.error || ''})`);
      assert(body.status === 'accepted', `lời mời chuyển accepted, nhận ${body.status}`);
    }

    // (e) BTC duyệt cặp (primary=A, secondary=B) qua PATCH /registrations action='approve_pair'.
    {
      const res = await fetch(`${BASE}/api/tournament-v2/registrations`, {
        method: 'PATCH', headers: adminHeaders,
        body: JSON.stringify({ id: regId1, action: 'approve_pair', partner_registration_id: regId2 }),
      });
      const body = await json(res);
      assert(res.status === 200, `approve_pair trả 200, nhận ${res.status} (${body.error || body.code || ''})`);
      assert(body.registration && body.registration.status === 'submitted', `A sau ghép status=submitted, nhận ${body.registration && body.registration.status}`);
      assert(body.registration.needs_partner === false, 'A needs_partner=false sau ghép');
      assert(String(body.merged_id) === String(regId2), 'merged_id trỏ đúng B');

      // A phải có ĐÚNG 2 member (ghế 1 và 2).
      const { data: mems } = await db.from('tournament_registration_members')
        .select('seat').eq('registration_id', regId1).order('seat');
      const seats = (mems || []).map((m) => m.seat).sort();
      assert(seats.length === 2 && seats[0] === 1 && seats[1] === 2, `A phải có đúng 2 ghế (1,2), nhận ${JSON.stringify(seats)}`);

      // B phải là merged + merged_into=A.id.
      const { data: regB } = await db.from('tournament_registrations')
        .select('status, merged_into').eq('id', regId2).maybeSingle();
      assert(regB && regB.status === 'merged', `B status=merged, nhận ${regB && regB.status}`);
      assert(String(regB.merged_into) === String(regId1), 'B.merged_into trỏ đúng A');
    }

    // (f) Ca lỗi: ghép hai người CÙNG GIỚI ở nội dung mixed => 400 MIXED_GENDER_REQUIRED.
    {
      const m1 = await postSolo({ full_name: 'Nam Mot', phone: '0900002001', gender: 'male', phr: 4.0 });
      const m2 = await postSolo({ full_name: 'Nam Hai', phone: '0900002002', gender: 'male', phr: 4.0 });
      assert(m1.res.status === 200 && m2.res.status === 200, 'seed hai solo cùng giới OK');
      created.regIds.push(m1.body.registration.id, m2.body.registration.id);
      const res = await fetch(`${BASE}/api/tournament-v2/registrations`, {
        method: 'PATCH', headers: adminHeaders,
        body: JSON.stringify({ id: m1.body.registration.id, action: 'approve_pair', partner_registration_id: m2.body.registration.id }),
      });
      const body = await json(res);
      assert(res.status === 400, `ghép cùng giới trả 400, nhận ${res.status}`);
      assert(body.code === 'MIXED_GENDER_REQUIRED', `code MIXED_GENDER_REQUIRED, nhận ${body.code}`);
    }

    // (f2) Ca lỗi: ghép hai người TRÙNG SĐT => 400 DUPLICATE_IN_PAIR.
    //      Dùng insert trực tiếp (POST public sẽ chặn trùng SĐT trước đó), để chạm
    //      đúng nhánh buildPairFromSolos ở D3.
    {
      const dupPhone = '0900003001';
      const { data: rDup1 } = await db.from('tournament_registrations').insert({
        group_id: groupId, division_id: dp.id, tournament_club_id: null, entrant_type: 'pair',
        status: 'awaiting_partner', origin: 'public_self', contact_phone_norm: dupPhone,
        needs_partner: true, track_token: `dup1-${Date.now()}`,
      }).select('id').single();
      const { data: rDup2 } = await db.from('tournament_registrations').insert({
        group_id: groupId, division_id: dp.id, tournament_club_id: null, entrant_type: 'pair',
        status: 'awaiting_partner', origin: 'public_self', contact_phone_norm: dupPhone,
        needs_partner: true, track_token: `dup2-${Date.now()}`,
      }).select('id').single();
      created.regIds.push(rDup1.id, rDup2.id);
      await db.from('tournament_registration_members').insert([
        { group_id: groupId, registration_id: rDup1.id, seat: 1, full_name: 'Trung SDT 1', phone_norm: dupPhone, gender: 'male' },
        { group_id: groupId, registration_id: rDup2.id, seat: 1, full_name: 'Trung SDT 2', phone_norm: dupPhone, gender: 'female' },
      ]);
      const res = await fetch(`${BASE}/api/tournament-v2/registrations`, {
        method: 'PATCH', headers: adminHeaders,
        body: JSON.stringify({ id: rDup1.id, action: 'approve_pair', partner_registration_id: rDup2.id }),
      });
      const body = await json(res);
      assert(res.status === 400, `ghép trùng SĐT trả 400, nhận ${res.status}`);
      assert(body.code === 'DUPLICATE_IN_PAIR', `code DUPLICATE_IN_PAIR, nhận ${body.code}`);
    }

    console.log('open-registration live integration: OK');
  } finally {
    // (7) Dọn an toàn theo đúng id đã tạo (cascade sẽ xoá members/invites).
    try {
      for (const divId of [created.divisionId, created.pairDivisionId]) {
        if (!divId) continue;
        await db.from('tournament_pair_invites').delete().eq('division_id', divId);
        await db.from('tournament_registrations').delete().eq('division_id', divId);
        await db.from('tournament_divisions').delete().eq('id', divId);
      }
      if (created.tournamentId) {
        await db.from('tournaments').delete().eq('id', created.tournamentId);
      }
    } catch (e) {
      console.error('WARN: dọn dữ liệu test lỗi:', e.message);
    }
    if (server) server.kill();
  }
}

main().then(() => {
  setTimeout(() => process.exit(process.exitCode || 0), 200);
}).catch((err) => {
  console.error(err.message);
  setTimeout(() => process.exit(1), 200);
});
