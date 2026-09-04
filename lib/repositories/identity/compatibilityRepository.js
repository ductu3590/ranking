'use strict';

const crypto = require('node:crypto');

function hashSessionKey(sessionKey) {
  return crypto.createHash('sha256').update(String(sessionKey ?? '')).digest('hex');
}

function unwrapRelation(value) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function toRosterProjection(row) {
  const athlete = unwrapRelation(row.athlete || row.athletes);
  return {
    id: row.id,
    clubId: row.club_id,
    athleteId: row.athlete_id,
    status: row.status,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? null,
    alias: row.club_alias || athlete?.display_name || '',
    version: row.version,
    athlete: athlete ? {
      id: athlete.id,
      displayName: athlete.display_name,
      status: athlete.status,
    } : null,
  };
}

function toAssessmentProjection(row) {
  return {
    id: row.id,
    clubId: row.club_id,
    membershipId: row.club_membership_id,
    athleteId: row.athlete_id,
    assessedAt: row.assessed_at,
    effectiveFrom: row.effective_from,
    skillLevel: Number(row.skill_level),
    source: row.source,
    notes: row.notes,
    actorType: row.actor_type,
  };
}

function toPublicCandidate(row) {
  const memberships = row.memberships || row.club_memberships || [];
  return {
    id: row.id,
    display_name: row.display_name,
    normalized_name: row.normalized_name,
    status: row.status,
    aliases: [...new Set(memberships.map((item) => item.club_alias).filter(Boolean))],
    club_ids: [...new Set(memberships.map((item) => item.club_id).filter((id) => id != null))],
  };
}

function throwOnError(result) {
  if (result?.error) throw result.error;
  return result?.data;
}

function createSupabaseIdentityRepository(db) {
  if (!db?.from) throw new TypeError('A server-side database client is required');

  return {
    async findClubByCode(code) {
      const result = await db.from('groups')
        .select('id, code, name, description, admin_password_hash, member_password_hash, access_version')
        .eq('code', code)
        .maybeSingle();
      return throwOnError(result) || null;
    },

    async findClubById(groupId) {
      const result = await db.from('groups')
        .select('id, code, name, description, access_version')
        .eq('id', groupId)
        .maybeSingle();
      return throwOnError(result) || null;
    },

    async createSession(input) {
      const result = await db.from('group_sessions').insert({
        group_id: input.groupId,
        group_code: input.groupCode,
        role: input.role,
        session_key_hash: hashSessionKey(input.sessionKey),
        issued_at: new Date(input.issuedAt).toISOString(),
        expires_at: new Date(input.expiresAt).toISOString(),
        session_version: input.sessionVersion,
      }).select('id, group_id, group_code, role, issued_at, expires_at, session_version').single();
      return throwOnError(result);
    },

    async isSessionActive(sessionKey, { groupId, role, now }) {
      const result = await db.from('group_sessions')
        .select('id')
        .eq('session_key_hash', hashSessionKey(sessionKey))
        .eq('group_id', groupId)
        .eq('role', role)
        .is('revoked_at', null)
        .gt('expires_at', new Date(now).toISOString())
        .maybeSingle();
      return Boolean(throwOnError(result));
    },

    async revokeSession(sessionKey, reason, now) {
      const result = await db.from('group_sessions')
        .update({ revoked_at: new Date(now).toISOString(), revoke_reason: reason })
        .eq('session_key_hash', hashSessionKey(sessionKey))
        .is('revoked_at', null)
        .select('id')
        .maybeSingle();
      return Boolean(throwOnError(result));
    },

    async bumpClubAccessVersion(groupId, expectedVersion) {
      const result = await db.from('groups')
        .update({ access_version: expectedVersion + 1 })
        .eq('id', groupId)
        .eq('access_version', expectedVersion)
        .select('access_version')
        .maybeSingle();
      return throwOnError(result)?.access_version || null;
    },

    async revokeSessionsByClub(groupId, reason, now) {
      const result = await db.from('group_sessions')
        .update({ revoked_at: new Date(now).toISOString(), revoke_reason: reason })
        .eq('group_id', groupId)
        .is('revoked_at', null)
        .select('id');
      return (throwOnError(result) || []).length;
    },

    async listRoster(groupId) {
      const result = await db.from('club_memberships')
        .select('id, club_id, athlete_id, status, effective_from, effective_to, club_alias, version, athlete:athletes(id, display_name, status)')
        .eq('club_id', groupId)
        .order('club_alias', { ascending: true });
      return (throwOnError(result) || []).map(toRosterProjection);
    },

    async createCompatibilityRosterEntry(input) {
      const legacyResult = await db.from('club_members').insert({
        group_id: input.clubId,
        full_name: input.displayName.toUpperCase(),
        aliases: input.alias && input.alias !== input.displayName ? [input.alias] : null,
        is_active: true,
      }).select('id').single();
      const legacy = throwOnError(legacyResult);
      const mapResult = await db.from('club_member_athlete_map')
        .select('athlete_id, club_membership_id')
        .eq('legacy_club_member_id', legacy.id)
        .eq('club_id', input.clubId)
        .single();
      const identityMap = throwOnError(mapResult);
      if (input.effectiveFrom) {
        throwOnError(await db.from('club_memberships')
          .update({
            effective_from: input.effectiveFrom,
            joined_on: input.effectiveFrom,
            club_alias: input.alias,
          })
          .eq('id', identityMap.club_membership_id)
          .eq('club_id', input.clubId));
      }
      const [athleteResult, membershipResult] = await Promise.all([
        db.from('athletes').select('id, display_name, status').eq('id', identityMap.athlete_id).single(),
        db.from('club_memberships')
          .select('id, club_id, athlete_id, status, effective_from, effective_to, club_alias, version')
          .eq('id', identityMap.club_membership_id).eq('club_id', input.clubId).single(),
      ]);
      return { athlete: throwOnError(athleteResult), membership: throwOnError(membershipResult) };
    },

    async findMembershipById(membershipId, groupId) {
      const result = await db.from('club_memberships')
        .select('id, club_id, athlete_id, status, effective_from, effective_to, club_alias, version')
        .eq('id', membershipId)
        .eq('club_id', groupId)
        .maybeSingle();
      return throwOnError(result) || null;
    },

    async updateMembershipAlias(input) {
      const mapResult = await db.from('club_member_athlete_map')
        .select('legacy_club_member_id')
        .eq('club_membership_id', input.membershipId)
        .eq('club_id', input.clubId)
        .maybeSingle();
      const identityMap = throwOnError(mapResult);
      if (identityMap) {
        throwOnError(await db.from('club_members')
          .update({ aliases: [input.alias] })
          .eq('id', identityMap.legacy_club_member_id)
          .eq('group_id', input.clubId));
      }
      const result = await db.from('club_memberships')
        .update({ club_alias: input.alias, version: input.expectedVersion + 1 })
        .eq('id', input.membershipId)
        .eq('club_id', input.clubId)
        .eq('version', input.expectedVersion)
        .select('id, club_id, athlete_id, status, effective_from, effective_to, club_alias, version')
        .maybeSingle();
      const membership = throwOnError(result);
      if (!membership) return null;
      return membership;
    },

    async endMembership(input) {
      const mapResult = await db.from('club_member_athlete_map')
        .select('legacy_club_member_id')
        .eq('club_membership_id', input.membershipId)
        .eq('club_id', input.clubId)
        .maybeSingle();
      const identityMap = throwOnError(mapResult);
      let currentVersion = input.expectedVersion;
      if (identityMap) {
        throwOnError(await db.from('club_members')
          .update({ is_active: false })
          .eq('id', identityMap.legacy_club_member_id)
          .eq('group_id', input.clubId));
        // Migration 028's compatibility trigger advances the membership once.
        currentVersion += 1;
      }
      const result = await db.from('club_memberships')
        .update({
          status: 'ended',
          effective_to: input.effectiveTo,
          left_on: input.effectiveTo,
          version: currentVersion + 1,
        })
        .eq('id', input.membershipId)
        .eq('club_id', input.clubId)
        .eq('version', currentVersion)
        .select('id, club_id, athlete_id, status, effective_from, effective_to, club_alias, version')
        .maybeSingle();
      return throwOnError(result) || null;
    },

    async createMembershipAssessment(input) {
      const result = await db.from('membership_assessments').insert({
        club_id: input.clubId,
        club_membership_id: input.membershipId,
        athlete_id: input.athleteId,
        effective_from: input.effectiveFrom,
        skill_level: input.skillLevel,
        source: input.source,
        notes: input.notes,
        actor_type: input.actorType,
      }).select('id, club_id, club_membership_id, athlete_id, assessed_at, effective_from, skill_level, source, notes, actor_type').single();
      const row = throwOnError(result);
      return {
        id: row.id,
        clubId: row.club_id,
        membershipId: row.club_membership_id,
        athleteId: row.athlete_id,
        assessedAt: row.assessed_at,
        effectiveFrom: row.effective_from,
        skillLevel: Number(row.skill_level),
        source: row.source,
        notes: row.notes,
        actorType: row.actor_type,
      };
    },

    async listMembershipAssessments(groupId, membershipId = null) {
      let query = db.from('membership_assessments')
        .select('id, club_id, club_membership_id, athlete_id, assessed_at, effective_from, skill_level, source, notes, actor_type')
        .eq('club_id', groupId)
        .order('effective_from', { ascending: false });
      if (membershipId) query = query.eq('club_membership_id', membershipId);
      const result = await query;
      return (throwOnError(result) || []).map(toAssessmentProjection);
    },

    async findAthleteById(athleteId) {
      const result = await db.from('athletes')
        .select('id, display_name, normalized_name, status, memberships:club_memberships(club_id, club_alias)')
        .eq('id', athleteId)
        .maybeSingle();
      const row = throwOnError(result);
      return row ? toPublicCandidate(row) : null;
    },

    async searchDuplicateCandidates(athlete) {
      const result = await db.from('athletes')
        .select('id, display_name, normalized_name, status, memberships:club_memberships(club_id, club_alias)')
        .eq('normalized_name', String(athlete.displayName || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi'))
        .neq('id', athlete.id)
        .limit(50);
      return (throwOnError(result) || []).map(toPublicCandidate);
    },

    async recordAthleteLinkReview(input) {
      const result = await db.from('athlete_link_reviews').insert({
        group_id: input.clubId,
        athlete_id: input.athleteId,
        candidate_athlete_id: input.candidateAthleteId,
        decision: input.decision,
        reason: input.reason,
        actor_type: input.actorType,
        correlation_id: input.correlationId,
        created_at: new Date(input.reviewedAt).toISOString(),
      }).select('id, decision').single();
      const row = throwOnError(result);
      return { id: row.id, status: row.decision };
    },
  };
}

module.exports = {
  createSupabaseIdentityRepository,
  hashSessionKey,
  toRosterProjection,
  toAssessmentProjection,
  toPublicCandidate,
};
