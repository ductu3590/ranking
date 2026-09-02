-- PickHub Phase 1 schema preflight.
-- Chạy nguyên file trong Supabase SQL Editor. Transaction READ ONLY là hàng rào
-- an toàn: file này không được phép thay đổi schema hoặc dữ liệu nghiệp vụ.

BEGIN TRANSACTION READ ONLY;

-- 1. Inventory và phân loại ownership của các bảng phải có trong Phase 1.
WITH expected(table_name, data_scope, tenant_column_required) AS (
    VALUES
        ('groups', 'platform', false),
        ('group_members', 'club', true),
        ('group_bank_accounts', 'club', true),
        ('club_members', 'club', true),
        ('quy_pickleball', 'club', true),
        ('ranking_snapshots', 'club', true),
        ('fund_events', 'club', true),
        ('fund_event_participants', 'club', true),
        ('tournaments', 'club', true),
        ('tournament_stages', 'club', true),
        ('tournament_entrants', 'club', true),
        ('tournament_entrant_members', 'club', true),
        ('tournament_stage_entrants', 'club', true),
        ('tournament_matches', 'club', true),
        ('tournament_games', 'club', true),
        ('pickhub_schema_migrations', 'platform', false)
)
SELECT
    expected.table_name,
    expected.data_scope,
    expected.tenant_column_required,
    to_regclass(format('public.%I', expected.table_name)) IS NOT NULL AS table_exists,
    columns.column_name IS NOT NULL AS has_group_id,
    columns.is_nullable AS group_id_nullable,
    columns.data_type AS group_id_type
FROM expected
LEFT JOIN information_schema.columns AS columns
    ON columns.table_schema = 'public'
   AND columns.table_name = expected.table_name
   AND columns.column_name = 'group_id'
ORDER BY expected.table_name;

-- 2. Migration ledger presence. So sánh checksum bằng JSON/SQL do
-- `npm run migration:ledger` sinh ra sau khi migration 017 đã được áp dụng.
SELECT
    to_regclass('public.pickhub_schema_migrations') IS NOT NULL AS ledger_exists,
    CASE
        WHEN to_regclass('public.pickhub_schema_migrations') IS NULL
            THEN 'apply 017_phase1_migration_ledger.sql after review'
        ELSE 'compare stored checksums with phase-1-local-migration-ledger.json'
    END AS next_action;

-- 3. Exact NULL tenant counts trên các bảng hiện đang có group_id.
SELECT 'club_members' AS table_name, count(*) AS row_count,
       count(*) FILTER (WHERE group_id IS NULL) AS null_group_id
FROM public.club_members
UNION ALL
SELECT 'quy_pickleball', count(*), count(*) FILTER (WHERE group_id IS NULL)
FROM public.quy_pickleball
UNION ALL
SELECT 'fund_events', count(*), count(*) FILTER (WHERE group_id IS NULL)
FROM public.fund_events
UNION ALL
SELECT 'fund_event_participants', count(*),
       CASE
           WHEN EXISTS (
               SELECT 1
               FROM information_schema.columns
               WHERE table_schema = 'public'
                 AND table_name = 'fund_event_participants'
                 AND column_name = 'group_id'
           )
           THEN count(*) FILTER (WHERE to_jsonb(fund_event_participants)->>'group_id' IS NULL)
           ELSE NULL
       END
FROM public.fund_event_participants
UNION ALL
SELECT 'group_members', count(*), count(*) FILTER (WHERE group_id IS NULL)
FROM public.group_members
UNION ALL
SELECT 'group_bank_accounts', count(*), count(*) FILTER (WHERE group_id IS NULL)
FROM public.group_bank_accounts
UNION ALL
SELECT 'tournaments', count(*), count(*) FILTER (WHERE group_id IS NULL)
FROM public.tournaments
UNION ALL
SELECT 'tournament_stages', count(*), count(*) FILTER (WHERE group_id IS NULL)
FROM public.tournament_stages
UNION ALL
SELECT 'tournament_entrants', count(*), count(*) FILTER (WHERE group_id IS NULL)
FROM public.tournament_entrants
UNION ALL
SELECT 'tournament_entrant_members', count(*), count(*) FILTER (WHERE group_id IS NULL)
FROM public.tournament_entrant_members
UNION ALL
SELECT 'tournament_stage_entrants', count(*), count(*) FILTER (WHERE group_id IS NULL)
FROM public.tournament_stage_entrants
UNION ALL
SELECT 'tournament_matches', count(*), count(*) FILTER (WHERE group_id IS NULL)
FROM public.tournament_matches
UNION ALL
SELECT 'tournament_games', count(*), count(*) FILTER (WHERE group_id IS NULL)
FROM public.tournament_games
ORDER BY table_name;

-- 4. ranking_snapshots phải được backfill group_id trong Phase 1.
SELECT
    count(*) AS ranking_snapshot_rows,
    EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ranking_snapshots'
          AND column_name = 'group_id'
    ) AS has_group_id,
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'ranking_snapshots'
              AND column_name = 'group_id'
        )
        THEN count(*) FILTER (WHERE to_jsonb(ranking_snapshots)->>'group_id' IS NULL)
        ELSE NULL
    END AS null_group_id
FROM public.ranking_snapshots;

-- 5. Duplicate tên trong cùng CLB. Tên không phải identity, nhưng policy hiện
-- tại vẫn cần xác định rõ trước khi thay global unique constraint.
SELECT
    group_id,
    lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g')) AS normalized_name,
    count(*) AS duplicate_count,
    array_agg(id ORDER BY id) AS member_ids
FROM public.club_members
GROUP BY group_id, lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g'))
HAVING count(*) > 1
ORDER BY group_id, normalized_name;

-- 5b. Webhook idempotency key collisions. Migration 023 aborts rather than
-- selecting one row when a reference has already been duplicated.
SELECT
    group_id,
    lower(btrim(ma_giao_dich)) AS normalized_transaction_reference,
    count(*) AS duplicate_count,
    array_agg(id ORDER BY id) AS transaction_ids
FROM public.quy_pickleball
WHERE ma_giao_dich IS NOT NULL
  AND btrim(ma_giao_dich) <> ''
GROUP BY group_id, lower(btrim(ma_giao_dich))
HAVING count(*) > 1
ORDER BY group_id, normalized_transaction_reference;

-- 6. Orphan và cross-tenant rows ở mô hình giải đấu/fund hiện tại.
WITH violations AS (
    SELECT 'fund_event_participants.event_id' AS relation_name, count(*) AS violation_count
    FROM public.fund_event_participants AS child
    LEFT JOIN public.fund_events AS parent ON parent.id = child.event_id
    WHERE parent.id IS NULL

    UNION ALL
    SELECT 'fund_event_participants.member_id', count(*)
    FROM public.fund_event_participants AS child
    JOIN public.fund_events AS event ON event.id = child.event_id
    LEFT JOIN public.club_members AS member ON member.id = child.member_id
    WHERE child.member_id IS NOT NULL
      AND (member.id IS NULL OR member.group_id IS DISTINCT FROM event.group_id)

    UNION ALL
    SELECT 'tournament_stages.tournament_id', count(*)
    FROM public.tournament_stages AS child
    LEFT JOIN public.tournaments AS parent ON parent.id = child.tournament_id
    WHERE parent.id IS NULL OR child.group_id IS DISTINCT FROM parent.group_id

    UNION ALL
    SELECT 'tournament_entrants.tournament_id', count(*)
    FROM public.tournament_entrants AS child
    LEFT JOIN public.tournaments AS parent ON parent.id = child.tournament_id
    WHERE parent.id IS NULL OR child.group_id IS DISTINCT FROM parent.group_id

    UNION ALL
    SELECT 'tournament_entrant_members.entrant_id', count(*)
    FROM public.tournament_entrant_members AS child
    LEFT JOIN public.tournament_entrants AS parent ON parent.id = child.entrant_id
    WHERE parent.id IS NULL OR child.group_id IS DISTINCT FROM parent.group_id

    UNION ALL
    SELECT 'tournament_entrant_members.member_id', count(*)
    FROM public.tournament_entrant_members AS child
    LEFT JOIN public.club_members AS parent ON parent.id = child.member_id
    WHERE child.member_id IS NOT NULL
      AND (parent.id IS NULL OR child.group_id IS DISTINCT FROM parent.group_id)

    UNION ALL
    SELECT 'tournament_stage_entrants.stage_id', count(*)
    FROM public.tournament_stage_entrants AS child
    LEFT JOIN public.tournament_stages AS parent ON parent.id = child.stage_id
    WHERE parent.id IS NULL OR child.group_id IS DISTINCT FROM parent.group_id

    UNION ALL
    SELECT 'tournament_stage_entrants.entrant_id', count(*)
    FROM public.tournament_stage_entrants AS child
    LEFT JOIN public.tournament_entrants AS parent ON parent.id = child.entrant_id
    WHERE parent.id IS NULL OR child.group_id IS DISTINCT FROM parent.group_id

    UNION ALL
    SELECT 'tournament_matches.stage_id', count(*)
    FROM public.tournament_matches AS child
    LEFT JOIN public.tournament_stages AS parent ON parent.id = child.stage_id
    WHERE parent.id IS NULL OR child.group_id IS DISTINCT FROM parent.group_id

    UNION ALL
    SELECT 'tournament_matches.entrant_a_id', count(*)
    FROM public.tournament_matches AS child
    LEFT JOIN public.tournament_entrants AS parent ON parent.id = child.entrant_a_id
    WHERE child.entrant_a_id IS NOT NULL
      AND (parent.id IS NULL OR child.group_id IS DISTINCT FROM parent.group_id)

    UNION ALL
    SELECT 'tournament_matches.entrant_b_id', count(*)
    FROM public.tournament_matches AS child
    LEFT JOIN public.tournament_entrants AS parent ON parent.id = child.entrant_b_id
    WHERE child.entrant_b_id IS NOT NULL
      AND (parent.id IS NULL OR child.group_id IS DISTINCT FROM parent.group_id)

    UNION ALL
    SELECT 'tournament_matches.winner_entrant_id', count(*)
    FROM public.tournament_matches AS child
    LEFT JOIN public.tournament_entrants AS parent ON parent.id = child.winner_entrant_id
    WHERE child.winner_entrant_id IS NOT NULL
      AND (parent.id IS NULL OR child.group_id IS DISTINCT FROM parent.group_id)

    UNION ALL
    SELECT 'tournament_matches.parent_match_id', count(*)
    FROM public.tournament_matches AS child
    LEFT JOIN public.tournament_matches AS parent ON parent.id = child.parent_match_id
    WHERE child.parent_match_id IS NOT NULL
      AND (parent.id IS NULL OR child.group_id IS DISTINCT FROM parent.group_id)

    UNION ALL
    SELECT 'tournament_games.match_id', count(*)
    FROM public.tournament_games AS child
    LEFT JOIN public.tournament_matches AS parent ON parent.id = child.match_id
    WHERE parent.id IS NULL OR child.group_id IS DISTINCT FROM parent.group_id

    UNION ALL
    SELECT 'tournament_games.winner_entrant_id', count(*)
    FROM public.tournament_games AS child
    LEFT JOIN public.tournament_entrants AS parent ON parent.id = child.winner_entrant_id
    WHERE child.winner_entrant_id IS NOT NULL
      AND (parent.id IS NULL OR child.group_id IS DISTINCT FROM parent.group_id)
)
SELECT relation_name, violation_count
FROM violations
ORDER BY relation_name;

-- 7. Constraints/FK thực tế, gồm định nghĩa để phát hiện FK chỉ theo id.
SELECT
    relation.relname AS table_name,
    constraint_record.conname AS constraint_name,
    constraint_record.contype AS constraint_type,
    pg_get_constraintdef(constraint_record.oid, true) AS definition
FROM pg_constraint AS constraint_record
JOIN pg_class AS relation ON relation.oid = constraint_record.conrelid
JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
WHERE namespace.nspname = 'public'
ORDER BY relation.relname, constraint_record.contype, constraint_record.conname;

-- 8. Index thực tế để phát hiện unique toàn cục và thiếu tenant prefix.
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 9. Toàn bộ RLS policy. Nhiều policy permissive có thể cộng quyền với nhau.
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 10. Cờ RLS và FORCE RLS của từng bảng public.
SELECT
    relation.relname AS table_name,
    relation.relrowsecurity AS rls_enabled,
    relation.relforcerowsecurity AS force_rls
FROM pg_class AS relation
JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
WHERE namespace.nspname = 'public'
  AND relation.relkind = 'r'
ORDER BY relation.relname;

COMMIT;
