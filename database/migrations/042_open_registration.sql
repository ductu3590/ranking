-- 042_open_registration.sql
-- Đăng ký mở giải cộng đồng: cấu hình mở trên division, trường tự-đăng-ký trên
-- registrations, bảng members của một đăng ký, và lời mời ghép cặp.
-- Idempotent; không DROP/TRUNCATE bảng hay dữ liệu.

-- A. Cấu hình mở đăng ký theo nội dung (division)
alter table tournament_divisions add column if not exists registration_open boolean not null default false;
alter table tournament_divisions add column if not exists registration_capacity integer;
alter table tournament_divisions add column if not exists registration_deadline timestamptz;
alter table tournament_divisions add column if not exists allow_late_registration boolean not null default false;
alter table tournament_divisions add column if not exists gender_mode text not null default 'any';
alter table tournament_divisions add column if not exists age_min integer;
alter table tournament_divisions add column if not exists age_max integer;
alter table tournament_divisions add column if not exists entry_fee integer;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tournament_divisions_gender_mode_chk') then
    alter table tournament_divisions add constraint tournament_divisions_gender_mode_chk
      check (gender_mode in ('any','male','female','mixed'));
  end if;
end $$;

comment on column tournament_divisions.registration_open is 'Nội dung có nhận đăng ký công khai không';
comment on column tournament_divisions.registration_capacity is 'Số suất (đơn) / cặp (đôi) tối đa; null = không giới hạn';
comment on column tournament_divisions.registration_deadline is 'Hạn đăng ký công khai';
comment on column tournament_divisions.allow_late_registration is 'BTC bật để tiếp tục nhận sau hạn';
comment on column tournament_divisions.gender_mode is 'Điều kiện giới tính: any|male|female|mixed (mixed = ép 1 nam + 1 nữ)';

-- B. Trường tự-đăng-ký trên registrations
alter table tournament_registrations add column if not exists origin text not null default 'btc';
alter table tournament_registrations add column if not exists contact_phone_norm text;
alter table tournament_registrations add column if not exists self_declared_club text;
alter table tournament_registrations add column if not exists needs_partner boolean not null default false;
alter table tournament_registrations add column if not exists track_token text;
alter table tournament_registrations add column if not exists admitted_at timestamptz;
alter table tournament_registrations add column if not exists queue_seq bigserial;
alter table tournament_registrations add column if not exists merged_into bigint references tournament_registrations(id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tournament_registrations_origin_chk') then
    alter table tournament_registrations add constraint tournament_registrations_origin_chk
      check (origin in ('btc','public_self'));
  end if;
end $$;

-- Mở rộng vòng đời status để hỗ trợ ghép cặp công khai (awaiting_partner) và
-- đóng đăng ký khi bị gộp (merged). Giữ nguyên các trạng thái interclub cũ.
-- Drop + re-add CHECK theo đúng pattern migration 035 (không phá dữ liệu).
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'tournament_registrations_status_check') then
    alter table tournament_registrations drop constraint tournament_registrations_status_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournament_registrations_status_check') then
    alter table tournament_registrations add constraint tournament_registrations_status_check
      check (status in ('draft','submitted','approved','changes_requested','rejected','withdrawn','awaiting_partner','merged'));
  end if;
end $$;

-- Đăng ký công khai (public_self) không thuộc tournament_club nào => bỏ NOT NULL
-- ở cột tournament_club_id; ràng buộc thực thi bằng public_club_chk bên dưới.
alter table tournament_registrations alter column tournament_club_id drop not null;

-- tournament_club_id chỉ được null khi origin='public_self'
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tournament_registrations_public_club_chk') then
    alter table tournament_registrations add constraint tournament_registrations_public_club_chk
      check (tournament_club_id is not null or origin = 'public_self');
  end if;
end $$;

create unique index if not exists tournament_registrations_track_token_uidx
  on tournament_registrations(track_token) where track_token is not null;

comment on column tournament_registrations.origin is 'Nguồn tạo đăng ký: btc | public_self';
comment on column tournament_registrations.contact_phone_norm is 'SĐT liên hệ chính đã chuẩn hoá — khóa chống trùng';
comment on column tournament_registrations.needs_partner is 'Đôi đăng ký một mình, đang ở hồ chờ ghép';
comment on column tournament_registrations.track_token is 'Token để VĐV mở trang theo dõi (không cần tài khoản)';
comment on column tournament_registrations.merged_into is 'Nếu solo bị gộp vào cặp khác khi ghép: trỏ registration còn lại';

-- C. Members của một đăng ký (đơn=1, đôi=1..2)
create table if not exists tournament_registration_members (
  id bigserial primary key,
  group_id bigint not null,
  registration_id bigint not null references tournament_registrations(id) on delete cascade,
  seat smallint not null check (seat in (1,2)),
  full_name text not null,
  phone_norm text not null,
  self_declared_phr numeric,
  gender text check (gender in ('male','female')),
  dob date,
  created_at timestamptz not null default now(),
  unique (registration_id, seat)
);
create index if not exists trm_group_idx on tournament_registration_members(group_id);
create index if not exists trm_registration_idx on tournament_registration_members(registration_id);
create index if not exists trm_phone_idx on tournament_registration_members(group_id, phone_norm);

comment on table tournament_registration_members is 'Người trong một đăng ký mở (đơn=1 seat, đôi=1..2 seat)';

-- D. Lời mời ghép cặp (VĐV tự rủ)
create table if not exists tournament_pair_invites (
  id bigserial primary key,
  group_id bigint not null,
  division_id bigint not null references tournament_divisions(id) on delete cascade,
  from_registration_id bigint not null references tournament_registrations(id) on delete cascade,
  to_registration_id bigint not null references tournament_registrations(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists tpi_group_div_idx on tournament_pair_invites(group_id, division_id);
create index if not exists tpi_to_idx on tournament_pair_invites(to_registration_id, status);

comment on table tournament_pair_invites is 'Lời mời ghép cặp do VĐV tự rủ; BTC duyệt cặp sau khi accepted';

-- E. RLS: đồng bộ chuẩn bảo mật của các bảng tournament_* hiện có
-- (bật RLS, không policy => chỉ service-role truy cập; mọi ghi/đọc đi qua API route).
alter table tournament_registration_members enable row level security;
alter table tournament_pair_invites enable row level security;
