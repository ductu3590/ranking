---
name: pickhub-engineering
description: Quy ước kỹ thuật BẮT BUỘC của dự án Pickhub (Next.js 14 App Router JS thuần + Supabase, multi-tenant theo group_id). Dùng khi viết bất kỳ code nào trong dự án này — API route, truy vấn Supabase, migration SQL, component React, hay node test. Bao gồm auth/group-scoping, admin guard, client Supabase nào dùng ở đâu, style migration & test, quy ước UI mobile-first tiếng Việt.
---

# Pickhub Engineering Conventions

Áp dụng cho MỌI code trong dự án `quy-pickleball`. Mục tiêu: code mới khớp y hệt code đang chạy, không tạo pattern lạ.

## Stack (cố định)
- **Next.js 14.1 App Router, JavaScript thuần** (KHÔNG TypeScript). Import alias `@/` → gốc dự án.
- **Supabase** (PostgreSQL). Multi-tenant: mọi bảng dữ liệu CLB có cột `group_id`.
- React 18, không thư viện UI ngoài. CSS file thường kèm mỗi component.
- Test = node script thuần (không Jest).

## Auth & group-scoping (lib/groupSession.js) — KHÔNG được sai
Đây là xương sống multi-tenant. Mọi route phải tuân:

```js
import { requireGroupAdmin, getEffectiveGroupContext, getGroupIdForDatabase } from '@/lib/groupSession';
```

- **Ghi dữ liệu (POST/PATCH/DELETE)**: đầu handler gọi
  ```js
  const adminCheck = requireGroupAdmin();
  if (!adminCheck.ok) return adminCheck.response; // tự trả 403
  const groupId = adminCheck.groupId;
  ```
- **Đọc công khai (GET)**: `const { group_id: groupId } = getEffectiveGroupContext();` (có fallback `DEFAULT_GROUP_ID`).
- **Mọi query** scope theo tenant: `.eq('group_id', groupId)` và đúng `.eq('tournament_id', id)` / `.eq('stage_id', id)`. **TUYỆT ĐỐI không hardcode** `tournament_id = 1` hay UUID sentinel.
- Auth là cookie `group_session` (HMAC ký, role `admin|member`). KHÔNG dùng Supabase Auth (đã gỡ). Browser KHÔNG truy vấn Supabase trực tiếp — mọi thứ qua API route.

## Supabase client nào dùng ở đâu
- Server route: `const db = supabaseAdmin || supabaseServer;` (`@/lib/supabaseAdmin` service-role; fallback `@/lib/supabaseServer`).
- `@/lib/supabaseClient` (browser): CHỈ cho Realtime tournament-live, không cho auth/CRUD.

## API route pattern (app/api/.../route.js)
- Export `GET/POST/PATCH/DELETE` async, trả `NextResponse.json(...)`.
- Validate input bằng **allowlist field** (xem `ALLOWED_TOURNAMENT_FIELDS` trong `app/api/tournaments/route.js`), không nhận bừa body.
- `try/catch`, lỗi → `NextResponse.json({ error: err.message }, { status })` + `console.error`.
- Thuật toán nặng (sinh lịch, tính điểm) gọi từ `lib/...`, KHÔNG nhúng vào route.

## Migration SQL (database/migrations/NNN_tên.sql)
- Đánh số tăng dần (hiện cao nhất: 014). Idempotent: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.
- Mọi bảng CLB có `group_id`. RLS để `DISABLE` (backstop, app tự scope ở server). Comment mô tả bằng tiếng Việt (`COMMENT ON ...`).
- **Lưu ý vận hành**: user tự apply migration + tự deploy Vercel. KHÔNG bao giờ áp migration phá vỡ (RLS bật) lên prod trước khi code tương ứng deploy. Clean-slate giải đấu: được phép drop bảng giải cũ (user đã đồng ý).

## Node test (tests/*.test.js) — contract test
Pattern hiện có (xem `tests/tournament-admin-redesign.test.js`):
```js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const exists = f => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
// ... assert nội dung/shape file ...
console.log('... contract ok');
```
- Đăng ký script trong `package.json`: `"test:tournament-xxx": "node tests/tournament-xxx.test.js"`.
- Engine JS thuần → có thể test runtime thật (require hàm, kiểm output), ưu tiên loại test này cho logic thể thức.

## UI/Component
- File JS + file CSS kèm (vd `TournamentConsole.js` + `admin-tournament.css`). **Mobile-first** (~380px trước), nhãn **tiếng Việt**.
- Role client: `getCurrentGroupClient()` (`@/lib/groupClient`) — ẩn hành động admin với member.
- Trang giải đấu nằm dưới `app/giai-dau/...`. Tái dùng biến/style CSS sẵn có.

## Settings dạng key-value
Cài đặt giải lưu theo dòng `(group_id, tournament_id, setting_key, setting_value)`, upsert `onConflict: 'group_id,tournament_id,setting_key'`. Không thêm cột phẳng cho từng setting.
