'use strict';

const crypto = require('node:crypto');

const { normalizeLogin } = require('../../domain/identity/athleteAccount');

function hashSessionKey(sessionKey) {
  return crypto.createHash('sha256').update(String(sessionKey ?? '')).digest('hex');
}

function unwrapRelation(value) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function toRosterProjection(row, legacy = {}) {
  const athlete = unwrapRelation(row.athlete || row.athletes);
  return {
    id: row.id,
    clubId: row.club_id,
    athleteId: row.athlete_id,
    status: row.status,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? null,
    alias: row.club_alias || athlete?.display_name || '',
    // Bank-transfer matching keywords from the legacy club_members row, kept
    // separate from the display nickname above.
    transferKeywords: legacy.transferKeywords || [],
    legacyMemberId: legacy.legacyMemberId ?? null,
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

// Migration 051/052 (email/phone/Facebook trên athlete_accounts) chạy tay qua SQL Editor, nên
// code phải sống được ở khoảnh khắc deploy xong mà migration chưa chạy: PostgREST
// trả 42703 (undefined_column) và ta biến nó thành "chưa có chỗ lưu" thay vì 500.
function isUndefinedColumnError(error) {
  if (!error) return false;
  if (error.code === '42703') return true;
  return /column .* does not exist|Could not find the '.*' column/i.test(String(error.message || ''));
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
      const rows = throwOnError(result) || [];
      // club_member_athlete_map reaches both tables through composite foreign keys,
      // so the bank-transfer keywords are fetched flat and joined here.
      const [mapResult, legacyResult] = await Promise.all([
        db.from('club_member_athlete_map')
          .select('club_membership_id, legacy_club_member_id')
          .eq('club_id', groupId),
        db.from('club_members').select('id, aliases').eq('group_id', groupId),
      ]);
      const legacyIdByMembership = new Map((throwOnError(mapResult) || [])
        .map((row) => [row.club_membership_id, row.legacy_club_member_id]));
      const keywordsByLegacyId = new Map((throwOnError(legacyResult) || [])
        .map((row) => [row.id, row.aliases || []]));
      return rows.map((row) => {
        const legacyMemberId = legacyIdByMembership.get(row.id) ?? null;
        return toRosterProjection(row, {
          legacyMemberId,
          transferKeywords: legacyMemberId == null ? [] : keywordsByLegacyId.get(legacyMemberId) || [],
        });
      });
    },

    async createCompatibilityRosterEntry(input) {
      // club_members.aliases is the bank-transfer keyword list managed in /quy/admin,
      // never the display nickname. The nickname belongs to club_memberships.club_alias.
      const legacyResult = await db.from('club_members').insert({
        group_id: input.clubId,
        full_name: input.displayName.toUpperCase(),
        is_active: true,
      }).select('id').single();
      const legacy = throwOnError(legacyResult);
      const mapResult = await db.from('club_member_athlete_map')
        .select('athlete_id, club_membership_id')
        .eq('legacy_club_member_id', legacy.id)
        .eq('club_id', input.clubId)
        .single();
      const identityMap = throwOnError(mapResult);
      throwOnError(await db.from('club_memberships')
        .update({
          ...(input.effectiveFrom ? { effective_from: input.effectiveFrom, joined_on: input.effectiveFrom } : {}),
          club_alias: input.alias,
        })
        .eq('id', identityMap.club_membership_id)
        .eq('club_id', input.clubId));
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

    async updateMembershipProfile(input) {
      const renames = Boolean(input.displayName);
      const rewritesKeywords = Array.isArray(input.transferKeywords);
      let currentVersion = input.expectedVersion;
      if (renames || rewritesKeywords) {
        const mapResult = await db.from('club_member_athlete_map')
          .select('legacy_club_member_id')
          .eq('club_membership_id', input.membershipId)
          .eq('club_id', input.clubId)
          .maybeSingle();
        const identityMap = throwOnError(mapResult);
        if (identityMap) {
          const legacyPatch = {};
          if (renames) legacyPatch.full_name = input.displayName.toUpperCase();
          // club_members.aliases is the bank-transfer keyword list: it is written only
          // from an explicit keyword edit, never derived from the display nickname.
          if (rewritesKeywords) {
            legacyPatch.aliases = input.transferKeywords.length ? input.transferKeywords : null;
          }
          throwOnError(await db.from('club_members')
            .update(legacyPatch)
            .eq('id', identityMap.legacy_club_member_id)
            .eq('group_id', input.clubId));
          // Migration 028's compatibility trigger fires on full_name and advances the membership once.
          if (renames) currentVersion += 1;
        }
      }
      const patch = { club_alias: input.alias, version: currentVersion + 1 };
      // The same trigger rewrites club_alias/status from the legacy row, so restore both here.
      if (renames && input.status) patch.status = input.status;
      const result = await db.from('club_memberships')
        .update(patch)
        .eq('id', input.membershipId)
        .eq('club_id', input.clubId)
        .eq('version', currentVersion)
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

    async findClaimableMemberships(groupId) {
      const result = await db.from('club_memberships')
        .select('id, club_id, athlete_id, status, club_alias, athlete:athletes(id, display_name, status)')
        .eq('club_id', groupId)
        .eq('status', 'active')
        .order('club_alias', { ascending: true });
      const rows = throwOnError(result) || [];
      const claimed = await db.from('athlete_accounts')
        .select('athlete_id')
        .eq('club_id', groupId);
      const claimedIds = new Set((throwOnError(claimed) || []).map((row) => row.athlete_id));
      return rows
        .filter((row) => !claimedIds.has(row.athlete_id))
        .map((row) => {
          const athlete = unwrapRelation(row.athlete || row.athletes);
          return {
            membershipId: row.id,
            athleteId: row.athlete_id,
            alias: row.club_alias || athlete?.display_name || '',
            displayName: athlete?.display_name || '',
            athleteStatus: athlete?.status || null,
          };
        })
        .filter((row) => row.athleteStatus === 'unclaimed');
    },

    async findMembershipWithAthlete(membershipId, groupId) {
      const result = await db.from('club_memberships')
        .select('id, club_id, athlete_id, status, club_alias, athlete:athletes(id, display_name, status)')
        .eq('id', membershipId)
        .eq('club_id', groupId)
        .maybeSingle();
      const row = throwOnError(result);
      if (!row) return null;
      return { membership: row, athlete: unwrapRelation(row.athlete || row.athletes) };
    },

    async findAthleteAccountByLogin(login) {
      // So khop chinh xac: ilike coi '_' va '%' la wildcard, ma login hop le
      // duoc phep chua '_' nen 'a_c' se khop sai voi 'abc'. Login da duoc
      // normalizeLogin() lowercase o tang domain; unique index lower(login)
      // giu rang buoc case-insensitive o DB.
      const result = await db.from('athlete_accounts')
        .select('id, login, status')
        .eq('login', normalizeLogin(login))
        .limit(1);
      const rows = throwOnError(result) || [];
      return rows[0] || null;
    },

    async findAthleteAccountByAthleteId(athleteId) {
      const result = await db.from('athlete_accounts')
        .select('id, login, athlete_id, club_id, status')
        .eq('athlete_id', athleteId)
        .maybeSingle();
      return throwOnError(result) || null;
    },

    async createAthleteAccount(input) {
      const result = await db.from('athlete_accounts').insert({
        login: input.login,
        password_hash: input.passwordHash,
        display_name: input.displayName,
        athlete_id: input.athleteId,
        club_id: input.clubId,
        club_membership_id: input.membershipId,
      }).select('id, login, display_name, athlete_id, club_id, club_membership_id, status').single();
      const row = throwOnError(result);
      // Athlete chuyển sang 'linked' để roster và duplicate review thấy hồ sơ đã có chủ.
      throwOnError(await db.from('athletes')
        .update({ status: 'linked', updated_at: new Date().toISOString() })
        .eq('id', input.athleteId)
        .eq('status', 'unclaimed'));
      return {
        id: row.id,
        login: row.login,
        displayName: row.display_name,
        athleteId: row.athlete_id,
        clubId: row.club_id,
        membershipId: row.club_membership_id,
        status: row.status,
      };
    },

    // --- Đăng nhập tài khoản VĐV ---------------------------------------------

    async findAthleteAccountForLogin(login) {
      // Khác findAthleteAccountByLogin (chỉ kiểm tra tồn tại khi đăng ký): ở đây cần
      // password_hash + đủ khoá để phát phiên. So khớp chính xác trên login đã
      // normalize, không dùng ilike (xem ghi chú ở findAthleteAccountByLogin).
      const result = await db.from('athlete_accounts')
        .select('id, login, password_hash, display_name, athlete_id, club_id, club_membership_id, status, access_version')
        .eq('login', normalizeLogin(login))
        .limit(1);
      const rows = throwOnError(result) || [];
      return rows[0] || null;
    },

    async findAthleteAccountById(accountId) {
      const result = await db.from('athlete_accounts')
        .select('id, login, display_name, athlete_id, club_id, club_membership_id, status, access_version')
        .eq('id', accountId)
        .maybeSingle();
      return throwOnError(result) || null;
    },

    async createAthleteAccountSession(input) {
      const result = await db.from('athlete_account_sessions').insert({
        account_id: input.accountId,
        session_key_hash: hashSessionKey(input.sessionKey),
        issued_at: new Date(input.issuedAt).toISOString(),
        expires_at: new Date(input.expiresAt).toISOString(),
      }).select('id, account_id, issued_at, expires_at').single();
      return throwOnError(result);
    },

    async findAthleteAccountSession(sessionKey, accountId) {
      const result = await db.from('athlete_account_sessions')
        .select('id, account_id, session_key_hash, issued_at, expires_at, revoked_at')
        .eq('session_key_hash', hashSessionKey(sessionKey))
        .eq('account_id', accountId)
        .maybeSingle();
      return throwOnError(result) || null;
    },

    async revokeAthleteAccountSession(sessionKey, now) {
      const result = await db.from('athlete_account_sessions')
        .update({ revoked_at: new Date(now).toISOString() })
        .eq('session_key_hash', hashSessionKey(sessionKey))
        .is('revoked_at', null)
        .select('id')
        .maybeSingle();
      return Boolean(throwOnError(result));
    },

    // Liên hệ tách riêng khỏi findAthleteAccountById: hàm đó nằm trên đường đăng
    // nhập / giải vé, thêm cột chưa tồn tại vào đó là làm sập cả việc đăng nhập.
    // Ở đây cột thiếu chỉ khiến contact rỗng + storageReady=false.
    async findAthleteAccountContact(accountId) {
      const result = await db.from('athlete_accounts')
        .select('id, email, phone, facebook_profile_url, contact_updated_at')
        .eq('id', accountId)
        .maybeSingle();
      if (result?.error) {
        if (isUndefinedColumnError(result.error)) {
          return {
            email: null,
            phone: null,
            facebookProfileUrl: null,
            contactUpdatedAt: null,
            storageReady: false,
          };
        }
        throw result.error;
      }
      const row = result?.data;
      if (!row) return null;
      return {
        email: row.email ?? null,
        phone: row.phone ?? null,
        facebookProfileUrl: row.facebook_profile_url ?? null,
        contactUpdatedAt: row.contact_updated_at ?? null,
        storageReady: true,
      };
    },

    // `changes` chỉ chứa các khoá thật sự được sửa (xem validateAthleteAccountContact),
    // nên PATCH một trường không xoá trường còn lại.
    async updateAthleteAccountContact(accountId, changes = {}, updatedAt = Date.now()) {
      const patch = { contact_updated_at: new Date(updatedAt).toISOString() };
      if ('email' in changes) patch.email = changes.email;
      if ('phone' in changes) patch.phone = changes.phone;
      if ('facebookProfileUrl' in changes) patch.facebook_profile_url = changes.facebookProfileUrl;
      const result = await db.from('athlete_accounts')
        .update(patch)
        .eq('id', accountId)
        .select('id, email, phone, facebook_profile_url, contact_updated_at')
        .maybeSingle();
      if (result?.error) {
        if (isUndefinedColumnError(result.error)) return { storageReady: false };
        throw result.error;
      }
      const row = result?.data;
      if (!row) return null;
      return {
        email: row.email ?? null,
        phone: row.phone ?? null,
        facebookProfileUrl: row.facebook_profile_url ?? null,
        contactUpdatedAt: row.contact_updated_at ?? null,
        storageReady: true,
      };
    },

    async findAthleteAccountProfile(accountId) {
      // Hồ sơ "của chính tôi": tài khoản + membership + athlete + CLB, một lượt đọc
      // cho mỗi bảng và luôn ràng buộc theo club_id của chính tài khoản.
      const account = await this.findAthleteAccountById(accountId);
      if (!account) return null;
      const [membershipResult, athleteResult, clubResult, contact] = await Promise.all([
        db.from('club_memberships')
          .select('id, club_id, athlete_id, status, effective_from, effective_to, club_alias, version')
          .eq('id', account.club_membership_id)
          .eq('club_id', account.club_id)
          .maybeSingle(),
        db.from('athletes').select('id, display_name, status').eq('id', account.athlete_id).maybeSingle(),
        db.from('groups').select('id, code, name').eq('id', account.club_id).maybeSingle(),
        this.findAthleteAccountContact(accountId),
      ]);
      const membership = throwOnError(membershipResult);
      const athlete = throwOnError(athleteResult);
      const club = throwOnError(clubResult);
      return {
        account: {
          id: account.id,
          login: account.login,
          displayName: account.display_name,
          status: account.status,
          athleteId: account.athlete_id,
          clubId: account.club_id,
          membershipId: account.club_membership_id,
          email: contact?.email ?? null,
          phone: contact?.phone ?? null,
          facebookProfileUrl: contact?.facebookProfileUrl ?? null,
          contactUpdatedAt: contact?.contactUpdatedAt ?? null,
          contactStorageReady: contact?.storageReady !== false,
        },
        club: club ? { id: club.id, code: club.code, name: club.name } : null,
        athlete: athlete ? { id: athlete.id, displayName: athlete.display_name, status: athlete.status } : null,
        membership: membership ? {
          id: membership.id,
          status: membership.status,
          alias: membership.club_alias || athlete?.display_name || '',
          effectiveFrom: membership.effective_from,
          effectiveTo: membership.effective_to ?? null,
        } : null,
      };
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
