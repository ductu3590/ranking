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

  const created = { tournamentId: null, divisionId: null, regIds: [] };
  let server = null;

  try {
    // ---- Seed: cần một group thật để làm chủ giải (chỉ dùng làm FK owner) ----
    const { data: group, error: gErr } = await db.from('groups').select('id').limit(1).maybeSingle();
    if (gErr) throw gErr;
    assert(group && group.id, 'phải có ít nhất một group để gắn giải test');
    const groupId = group.id;

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

    console.log('open-registration live integration: OK');
  } finally {
    // (7) Dọn an toàn theo đúng id đã tạo (cascade sẽ xoá members/invites).
    try {
      if (created.divisionId) {
        await db.from('tournament_registrations').delete().eq('division_id', created.divisionId);
        await db.from('tournament_divisions').delete().eq('id', created.divisionId);
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
