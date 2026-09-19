'use client';

import PairingBoard from '../pairing/PairingBoard';

export default function FormatPairingStep({ draft = {}, roster = [], onDraftChange }) {
    const participants = draft.participants || {};
    const format = draft.format || {};
    const selectedMemberIds = participants.selectedMemberIds || [];
    const entrantType = format.entrantType || 'doubles';

    function updatePairs(pairingDraft) {
        onDraftChange?.({
            ...draft,
            pairs: pairingDraft.pairs,
            unpairedMemberIds: pairingDraft.unpairedMemberIds,
            reserveMemberIds: pairingDraft.reserveMemberIds,
            pairingDraft,
            invalidation: {
                ...(draft.invalidation || {}),
                draw: true,
                reasonCodes: Array.from(new Set([...(draft.invalidation?.reasonCodes || []), 'PAIRING_CHANGED'])),
            },
        });
    }

    const pairingValue = draft.pairingDraft || {
        memberIds: selectedMemberIds.map(String),
        pairs: draft.pairs || [],
        unpairedMemberIds: draft.unpairedMemberIds || selectedMemberIds.map(String),
        reserveMemberIds: draft.reserveMemberIds || [],
        nextPairNumber: (draft.pairs || []).length + 1,
    };
    const hasUnpaired = (pairingValue.unpairedMemberIds || []).length > 0;

    return (
        <div className="setup-step setup-step-format-pairing">
            <div className="setup-format-summary">
                <h2>Thể thức & ghép cặp</h2>
                <p>Chọn cách xem trước Thủ công hoặc Tự động, sau đó áp dụng vào bản nháp.</p>
                <div className="setup-format-tags">
                    <span>{entrantType === 'doubles' ? 'Đánh đôi' : entrantType}</span>
                    <span>Preview/apply: Thủ công · Tự động</span>
                    {hasUnpaired ? <strong>UNPAIRED_MEMBER · còn người chưa ghép</strong> : <span>Sẵn sàng bốc thăm</span>}
                </div>
            </div>
            <PairingBoard
                roster={roster}
                selectedMemberIds={selectedMemberIds}
                value={pairingValue}
                onChange={updatePairs}
                entrantType={entrantType}
            />
        </div>
    );
}
