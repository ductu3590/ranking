'use client';

import ParticipantRosterPicker from '../participants/ParticipantRosterPicker';

export default function InfoParticipantsStep({ draft = {}, roster = [], onDraftChange, onSaveDraft, loading = false, error = '' }) {
    const participants = draft.participants || {};
    const selectedMemberIds = participants.selectedMemberIds || [];

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
            <ParticipantRosterPicker
                roster={roster}
                selectedMemberIds={selectedMemberIds}
                onChange={updateSelectedMemberIds}
                loading={loading}
                error={error}
            />
            <div className="setup-save-note">
                <span>{draft.savedAt ? `Đã lưu lúc ${draft.savedAt}` : 'Trạng thái chỉ hiện đã lưu khi server xác nhận.'}</span>
                {onSaveDraft ? <button type="button" onClick={onSaveDraft}>Lưu nháp</button> : null}
            </div>
        </div>
    );
}
