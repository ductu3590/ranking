-- Phase 1: lưu checksum của migration đã xác minh trên từng môi trường.
-- File lịch sử được định danh bằng filename; không đổi số các migration đã áp dụng.

CREATE TABLE IF NOT EXISTS public.pickhub_schema_migrations (
    filename text PRIMARY KEY,
    version integer NOT NULL CHECK (version > 0),
    checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
    applied_at timestamptz NOT NULL DEFAULT now(),
    applied_by text NOT NULL DEFAULT current_user
);

ALTER TABLE public.pickhub_schema_migrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pickhub_schema_migrations FROM anon;
REVOKE ALL ON TABLE public.pickhub_schema_migrations FROM authenticated;

COMMENT ON TABLE public.pickhub_schema_migrations IS
    'Ledger checksum migration đã được đối chiếu và áp dụng trên môi trường hiện tại';
COMMENT ON COLUMN public.pickhub_schema_migrations.filename IS
    'Tên file migration bất biến, dùng làm định danh kể cả khi trùng sequence lịch sử';
COMMENT ON COLUMN public.pickhub_schema_migrations.checksum IS
    'SHA-256 của nội dung SQL sau khi chuẩn hóa newline LF';
