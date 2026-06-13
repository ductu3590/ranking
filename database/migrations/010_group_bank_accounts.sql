-- Phase 5: per-club bank accounts for routing SePay webhooks.
-- account_number is globally unique so an incoming transfer maps to exactly one club.

CREATE TABLE IF NOT EXISTS group_bank_accounts (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    group_id       bigint NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
    account_number text   NOT NULL,
    bank_name      text,
    label          text,
    is_active      boolean NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (account_number)
);

CREATE INDEX IF NOT EXISTS idx_group_bank_accounts_group_id ON group_bank_accounts (group_id);

ALTER TABLE group_bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY group_bank_accounts_by_group ON group_bank_accounts FOR ALL TO authenticated
    USING (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()))
    WITH CHECK (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()));
