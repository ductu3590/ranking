-- Phase 2: lock down all tables with RLS. The anon role gets NO policy and is
-- therefore denied. Authenticated admins see only the clubs they belong to
-- (via group_members). The service_role key bypasses RLS for server routes.

-- groups: an admin can see/manage groups they are a member of.
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY groups_admin_all ON groups
    FOR ALL TO authenticated
    USING (id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()))
    WITH CHECK (id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()));

-- group_members: a user can read their own membership rows.
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY group_members_self ON group_members
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- Data tables: access limited to the caller's clubs.
ALTER TABLE club_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY club_members_by_group ON club_members FOR ALL TO authenticated
    USING (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()))
    WITH CHECK (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()));

ALTER TABLE quy_pickleball ENABLE ROW LEVEL SECURITY;
CREATE POLICY quy_pickleball_by_group ON quy_pickleball FOR ALL TO authenticated
    USING (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()))
    WITH CHECK (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()));

ALTER TABLE fund_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY fund_events_by_group ON fund_events FOR ALL TO authenticated
    USING (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()))
    WITH CHECK (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()));

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tournaments_by_group ON tournaments FOR ALL TO authenticated
    USING (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()))
    WITH CHECK (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()));

ALTER TABLE tournament_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY tournament_teams_by_group ON tournament_teams FOR ALL TO authenticated
    USING (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()))
    WITH CHECK (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()));

ALTER TABLE tournament_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY tournament_players_by_group ON tournament_players FOR ALL TO authenticated
    USING (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()))
    WITH CHECK (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()));

ALTER TABLE tournament_pairings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tournament_pairings_by_group ON tournament_pairings FOR ALL TO authenticated
    USING (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()))
    WITH CHECK (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()));

ALTER TABLE tournament_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY tournament_matches_by_group ON tournament_matches FOR ALL TO authenticated
    USING (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()))
    WITH CHECK (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()));

ALTER TABLE tournament_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tournament_settings_by_group ON tournament_settings FOR ALL TO authenticated
    USING (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()))
    WITH CHECK (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()));

-- fund_event_participants has no group_id; scope it through its parent event.
ALTER TABLE fund_event_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY fund_event_participants_by_group ON fund_event_participants FOR ALL TO authenticated
    USING (event_id IN (
        SELECT fe.id FROM fund_events fe
        WHERE fe.group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid())
    ))
    WITH CHECK (event_id IN (
        SELECT fe.id FROM fund_events fe
        WHERE fe.group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid())
    ));
