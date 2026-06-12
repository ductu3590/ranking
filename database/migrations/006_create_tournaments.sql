-- Migration 006: Tournament parent table
-- Adds a parent list of tournaments so /giai-dau can manage multiple tournaments.

CREATE TABLE IF NOT EXISTS tournaments (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    event_date DATE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'completed')),
    location TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tournaments DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE tournaments IS 'Danh sách các giải đấu đã tạo';
COMMENT ON COLUMN tournaments.status IS 'Trạng thái giải: draft, active, completed';

INSERT INTO tournaments (id, name, description, event_date, status, location)
VALUES (
    1,
    'Giao hữu HANA - Bảo Lâm',
    '20 VĐV đỉnh cao, 3 vòng thi đấu đồng đội',
    '2026-01-27',
    'active',
    'CLB Pickleball 246'
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    event_date = EXCLUDED.event_date,
    status = EXCLUDED.status,
    location = EXCLUDED.location,
    updated_at = NOW();

