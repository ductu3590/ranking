-- Phase 2: club membership for Supabase Auth users (admins/owners).
-- Members (code + password) are NOT stored here; their access is server-mediated.

CREATE TABLE IF NOT EXISTS group_members (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    group_id bigint NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members (user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members (group_id);
