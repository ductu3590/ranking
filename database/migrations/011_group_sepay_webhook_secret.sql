-- Phase 5 hardening: optional per-club SePay webhook HMAC secret.
-- NULL means the club accepts unsigned SePay webhooks for that registered bank account.

ALTER TABLE groups
    ADD COLUMN IF NOT EXISTS sepay_webhook_secret text;

ALTER TABLE groups
    DROP CONSTRAINT IF EXISTS groups_sepay_webhook_secret_not_blank;

ALTER TABLE groups
    ADD CONSTRAINT groups_sepay_webhook_secret_not_blank
    CHECK (sepay_webhook_secret IS NULL OR btrim(sepay_webhook_secret) <> '');

COMMENT ON COLUMN groups.sepay_webhook_secret IS 'Optional per-club SePay webhook HMAC-SHA256 secret. NULL means no webhook authentication for this club.';
