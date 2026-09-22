'use client';

import PairingBoard from '../pairing/PairingBoard';

export default function FormatPairingStep({ draft = {}, roster = [], onDraftChange }) {
    const participants = draft.participants || {};
    const format = draft.format || {};
    const selectedMemberIds = participants.memberIds || participants.selectedMemberIds || [];
    const entrantType = format.entrantType || 'doubles';

    function chooseFormat(formatKey) {
        if (formatKey === (format.formatKey || 'group_knockout')) return;
        onDraftChange?.({
            ...draft,
            format: {
                ...format,
                entrantType: 'doubles',
                formatKey,
                config: { ...(format.config || {}) },
            },
            draw: { ...(draft.draw || {}), status: 'stale', assignments: [], matches: [] },
            invalidation: {
                ...(draft.invalidation || {}),
                draw: true,
                reasonCodes: Array.from(new Set([...(draft.invalidation?.reasonCodes || []), 'FORMAT_CHANGED'])),
            },
        });
    }

    function updatePairs(pairingDraft, change = {}) {
        const selectedIds = selectedMemberIds.map(String);
        const nextMemberIds = change.type === 'add_member'
            ? Array.from(new Set([...selectedIds, String(change.memberId)]))
                : selectedMemberIds;
        onDraftChange?.({
            ...draft,
            participants: {
                ...participants,
                memberIds: nextMemberIds,
            },
            format: change.type === 'switch_format'
                ? { ...format, entrantType: change.entrantType }
                : format,
            pairs: pairingDraft.pairs,
            unpairedMemberIds: pairingDraft.unpairedMemberIds,
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
        nextPairNumber: (draft.pairs || []).length + 1,
    };
    const hasUnpaired = (pairingValue.unpairedMemberIds || []).length > 0;
    const supportedEntrantTypes = Array.isArray(format.supportedEntrantTypes)
        ? format.supportedEntrantTypes
        : [];

    return (
        <div className="setup-step setup-step-format-pairing">
            <div className="setup-format-summary">
                <p className="setup-eyebrow">Bước 3</p>
                <h2>Thể thức & ghép cặp</h2>
                <p>Chọn thể thức trước. Hệ thống sẽ tư vấn theo số cặp sau khi bạn ghép đội.</p>
                <div className="setup-format-options" role="group" aria-label="Chọn thể thức thi đấu">
                    <button type="button" disabled title="Unified preview hiện chưa hỗ trợ thể thức này" className={(format.formatKey || 'group_knockout') === 'round_robin' ? 'is-active' : ''} aria-pressed={(format.formatKey || 'group_knockout') === 'round_robin'} onClick={() => chooseFormat('round_robin')}>
                        <strong>Vòng tròn</strong><span>Chưa hỗ trợ trong unified setup</span>
                    </button>
                    <button type="button" disabled title="Unified preview hiện chưa hỗ trợ thể thức này" className={(format.formatKey || 'group_knockout') === 'knockout' ? 'is-active' : ''} aria-pressed={(format.formatKey || 'group_knockout') === 'knockout'} onClick={() => chooseFormat('knockout')}>
                        <strong>Loại trực tiếp</strong><span>Chưa hỗ trợ trong unified setup</span>
                    </button>
                    <button type="button" className={(format.formatKey || 'group_knockout') === 'group_knockout' ? 'is-active' : ''} aria-pressed={(format.formatKey || 'group_knockout') === 'group_knockout'} onClick={() => chooseFormat('group_knockout')}>
                        <strong>Vòng bảng → loại trực tiếp</strong><span>Chia bảng rồi chọn suất đi tiếp</span>
                    </button>
                </div>
                <div className="setup-format-tags">
                    <span>{entrantType === 'doubles' ? 'Đánh đôi' : entrantType}</span>
                    {hasUnpaired ? <strong>Còn người chưa ghép cặp</strong> : <span>Sẵn sàng bốc thăm</span>}
                </div>
            </div>
            <PairingBoard
                roster={roster}
                selectedMemberIds={selectedMemberIds}
                value={pairingValue}
                onChange={updatePairs}
                entrantType={entrantType}
                supportedEntrantTypes={supportedEntrantTypes}
            />
        </div>
    );
}
