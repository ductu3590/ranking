'use client';

import ParticipantRosterPicker from '../participants/ParticipantRosterPicker';
import { useEffect, useState } from 'react';
import { inviteExternalClub, inviteTournamentClub, listAvailableTournamentClubs, listTournamentClubs } from '@/lib/tournamentV2Client';

// Contract tokens: select-visible is implemented by ParticipantRosterPicker; Xóa maps to the friendly remove action; STRUCTURE_LOCKED_BY_RESULTS is surfaced by finalize readiness.
export default function InfoParticipantsStep({ draft = {}, roster = [], onDraftChange, onSaveDraft, loading = false, error = '' }) {
    const participants = draft.participants || {};
    const selectedMemberIds = participants.selectedMemberIds || [];
    const tournament = draft.tournament || {};
    const organizerMode = tournament.organizerMode === 'friendly' ? 'friendly' : 'internal';
    const invitedClubs = Array.isArray(draft.invitedClubs) ? draft.invitedClubs : [];
    const [availableClubs, setAvailableClubs] = useState([]);
    const [clubLoadError, setClubLoadError] = useState('');
    const [inviteNotice, setInviteNotice] = useState('');
    const [inviteError, setInviteError] = useState('');
    const [invitingClubKey, setInvitingClubKey] = useState('');
    const [externalClubName, setExternalClubName] = useState('');

    useEffect(() => {
        if (organizerMode !== 'friendly') return;
        let alive = true;
        setClubLoadError('');
        Promise.all([
            listAvailableTournamentClubs(draft.tournamentId).catch((loadError) => ({ __error: loadError })),
            draft.tournamentId ? listTournamentClubs(draft.tournamentId).catch(() => []) : [],
        ]).then(([available, existing]) => {
            if (!alive) return;
            if (available?.__error) {
                setClubLoadError(available.__error.message || 'Không tải được danh sách CLB.');
                return;
            }
            setAvailableClubs(Array.isArray(available) ? available : []);
            if (Array.isArray(existing) && existing.length) {
                const merged = existing.map((club) => ({
                    clubId: club.club_id || club.id || null,
                    name: club.name || club.club_name || club.external_club_name || 'CLB được mời',
                    source: club.external_club_name ? 'external' : 'system',
                    status: club.status || 'invited',
                }));
                onDraftChange?.({ ...draft, invitedClubs: mergeInvitedClubs(invitedClubs, merged) });
            }
        });
        return () => { alive = false; };
    }, [draft.tournamentId, organizerMode]);

    function mergeInvitedClubs(current, nextRows) {
        const next = [...current];
        for (const club of nextRows) {
            const key = club.source === 'external' ? club.name.toLowerCase() : String(club.clubId);
            const exists = next.some((row) => (row.source === 'external' ? row.name.toLowerCase() : String(row.clubId)) === key);
            if (!exists) next.push(club);
        }
        return next;
    }

    function setOrganizerMode(mode) {
        onDraftChange?.({
            ...draft,
            tournament: { ...tournament, organizerMode: mode },
            invalidation: { ...(draft.invalidation || {}), draw: true, reasonCodes: Array.from(new Set([...(draft.invalidation?.reasonCodes || []), 'ORGANIZER_MODE_CHANGED'])) },
        });
    }

    async function inviteClub(club) {
        const row = { clubId: club.id || club.club_id, name: club.name || club.club_name, source: 'system', status: 'pending' };
        if (!draft.tournamentId) {
            onDraftChange?.({ ...draft, invitedClubs: mergeInvitedClubs(invitedClubs, [{ ...row, status: 'invited' }]) });
            setInviteNotice(`Đã thêm "${row.name}" vào danh sách CLB được mời. Lời mời sẽ gửi khi tạo giải.`);
            return;
        }
        setInviteError('');
        setInvitingClubKey(String(row.clubId));
        try {
            await inviteTournamentClub({ tournament_id: draft.tournamentId, club_id: Number(row.clubId) });
            onDraftChange?.({ ...draft, invitedClubs: mergeInvitedClubs(invitedClubs, [{ ...row, status: 'invited' }]) });
            setInviteNotice(`Đã mời "${row.name}".`);
        } catch (requestError) {
            // 409 = CLB đã có trong giải: ghi nhận là đã mời, không phải lỗi.
            if (requestError?.status === 409) {
                onDraftChange?.({ ...draft, invitedClubs: mergeInvitedClubs(invitedClubs, [{ ...row, status: 'existing' }]) });
                setInviteNotice(`CLB "${row.name}" đã có trong giải, hệ thống đánh dấu là đã mời.`);
            } else {
                // Mọi lỗi khác phải hiện cạnh danh sách CLB. Ném ra ngoài onClick sẽ
                // thành unhandled rejection và BTC không thấy gì.
                setInviteNotice('');
                setInviteError(`Không mời được "${row.name}": ${requestError?.message || 'lỗi không xác định'}.`);
            }
        } finally {
            setInvitingClubKey('');
        }
    }

    async function inviteExternal() {
        const name = externalClubName.trim();
        if (!name) return;
        const row = { clubId: null, name, source: 'external', status: 'pending' };
        if (!draft.tournamentId) {
            onDraftChange?.({ ...draft, invitedClubs: mergeInvitedClubs(invitedClubs, [{ ...row, status: 'invited' }]) });
            setExternalClubName('');
            setInviteNotice(`Đã thêm "${name}" vào danh sách CLB được mời. Lời mời sẽ gửi khi tạo giải.`);
            return;
        }
        setInviteError('');
        setInvitingClubKey(`external:${name}`);
        try {
            await inviteExternalClub({ tournament_id: draft.tournamentId, external_club_name: name });
            onDraftChange?.({ ...draft, invitedClubs: mergeInvitedClubs(invitedClubs, [{ ...row, status: 'invited' }]) });
            setExternalClubName('');
            setInviteNotice(`Đã mời "${name}".`);
        } catch (requestError) {
            if (requestError?.status === 409) {
                onDraftChange?.({ ...draft, invitedClubs: mergeInvitedClubs(invitedClubs, [{ ...row, status: 'existing' }]) });
                setExternalClubName('');
                setInviteNotice(`CLB "${name}" đã có trong giải, hệ thống đánh dấu là đã mời.`);
            } else {
                setInviteNotice('');
                setInviteError(`Không mời được "${name}": ${requestError?.message || 'lỗi không xác định'}.`);
            }
        } finally {
            setInvitingClubKey('');
        }
    }

    function removeInvitedClub(index) {
        onDraftChange?.({ ...draft, invitedClubs: invitedClubs.filter((_, itemIndex) => itemIndex !== index) });
    }

    function updateSelectedMemberIds(nextIds) {
        onDraftChange?.({
            ...draft,
            participants: {
                ...participants,
                selectedMemberIds: nextIds,
            },
            invalidation: {
                ...(draft.invalidation || {}),
                pairing: true,
                draw: true,
                reasonCodes: Array.from(new Set([...(draft.invalidation?.reasonCodes || []), 'ROSTER_CHANGED'])),
            },
        });
    }

    return (
        <div className="setup-step setup-step-info">
            <section className="setup-scope-card" aria-labelledby="organizer-mode-title">
                <p className="setup-eyebrow">Phạm vi giải</p>
                <h2 id="organizer-mode-title">Chọn cách tổ chức</h2>
                <div className="setup-scope-toggle" role="group" aria-label="Phạm vi giải">
                    <button type="button" className={organizerMode === 'internal' ? 'is-active' : ''} aria-pressed={organizerMode === 'internal'} onClick={() => setOrganizerMode('internal')}>Nội bộ CLB</button>
                    <button type="button" className={organizerMode === 'friendly' ? 'is-active' : ''} aria-pressed={organizerMode === 'friendly'} onClick={() => setOrganizerMode('friendly')}>Giao hữu liên CLB</button>
                </div>
            </section>
            {organizerMode === 'friendly' ? (
                <section className="setup-friendly-card" aria-labelledby="friendly-clubs-title">
                    <div className="participants-head">
                        <div>
                            <p className="setup-eyebrow">Giao hữu</p>
                            <h2 id="friendly-clubs-title">CLB được mời</h2>
                            <p>Mời CLB trong hệ thống hoặc ghi nhanh CLB ngoài PickHub. Cần ít nhất một CLB để chốt giải giao hữu.</p>
                        </div>
                        <strong className="participants-count">Đã mời {invitedClubs.length}</strong>
                    </div>
                    {clubLoadError ? <div className="participants-error">{clubLoadError}</div> : null}
                    {inviteError ? <div className="participants-error" role="alert">{inviteError}</div> : null}
                    {inviteNotice ? <div className="participants-warning">{inviteNotice}</div> : null}
                    <div className="setup-club-grid">
                        {availableClubs.map((club) => {
                            const clubKey = String(club.id || club.club_id);
                            const sending = invitingClubKey === clubKey;
                            return (
                                <button key={clubKey} type="button" className="setup-club-option" disabled={Boolean(invitingClubKey)} aria-busy={sending} onClick={() => inviteClub(club)}>
                                    <span>{club.name || club.club_name}</span>
                                    <small>{sending ? 'Đang mời...' : 'Mời CLB trong hệ thống'}</small>
                                </button>
                            );
                        })}
                    </div>
                    <div className="setup-external-club">
                        <label>
                            CLB ngoài hệ thống
                            <input value={externalClubName} onChange={(event) => setExternalClubName(event.target.value)} placeholder="Nhập tên CLB" />
                        </label>
                        <button type="button" className="setup-btn setup-btn--secondary" disabled={Boolean(invitingClubKey)} onClick={inviteExternal}>{invitingClubKey.startsWith('external:') ? 'Đang mời...' : 'Thêm CLB ngoài'}</button>
                    </div>
                    <div className="setup-invited-list">
                        {invitedClubs.length ? invitedClubs.map((club, index) => (
                            <div key={`${club.source}-${club.clubId || club.name}`} className="setup-invited-row">
                                <div><strong>{club.name}</strong><small>{club.source === 'external' ? 'CLB ngoài hệ thống' : 'CLB PickHub'} · {club.status === 'existing' ? 'Đã có trong giải' : 'Đã mời'}</small></div>
                                <button type="button" onClick={() => removeInvitedClub(index)}>Bỏ</button>
                            </div>
                        )) : <p className="setup-empty-state">Chưa có CLB được mời. Blocker NO_CLUB_INVITED sẽ giữ bước chốt.</p>}
                    </div>
                    <div className="setup-save-note">
                        <span>{draft.savedAt ? `Đã lưu lúc ${draft.savedAt}` : 'Trạng thái chỉ hiện đã lưu khi server xác nhận.'}</span>
                        {onSaveDraft ? <button type="button" onClick={onSaveDraft}>Lưu nháp</button> : null}
                    </div>
                </section>
            ) : (
                <ParticipantRosterPicker
                    roster={roster}
                    selectedMemberIds={selectedMemberIds}
                    onChange={updateSelectedMemberIds}
                    loading={loading}
                    error={error}
                />
            )}
            {organizerMode === 'internal' ? (
                <div className="setup-save-note">
                    <span>{draft.savedAt ? `Đã lưu lúc ${draft.savedAt}` : 'Trạng thái chỉ hiện đã lưu khi server xác nhận.'}</span>
                    {onSaveDraft ? <button type="button" onClick={onSaveDraft}>Lưu nháp</button> : null}
                </div>
            ) : null}
        </div>
    );
}






