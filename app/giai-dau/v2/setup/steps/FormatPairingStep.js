'use client';

import PairingBoard from '../pairing/PairingBoard';

export default function FormatPairingStep({ draft = {}, roster = [], onDraftChange }) {
    const participants = draft.participants || {};
    const format = draft.format || {};
    const selectedMemberIds = participants.memberIds || participants.selectedMemberIds || [];
    const guests = Array.isArray(participants.guests) ? participants.guests : [];
    const guestParticipantIds = guests
        .map((guest) => String(guest?.clientRef || guest?.client_ref || '').trim())
        .filter(Boolean)
        .map((clientRef) => `guest:${clientRef}`);
    const participantIds = [...selectedMemberIds.map(String), ...guestParticipantIds];
    const pairingRoster = [
        ...roster,
        ...guests.map((guest) => ({
            id: `guest:${guest.clientRef || guest.client_ref}`,
            displayName: guest.displayName || guest.display_name || 'Khách mời',
            source: 'guest',
        })),
    ];
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

    const existingPairing = draft.pairingDraft || {};
    const existingIds = Array.isArray(existingPairing.memberIds) ? existingPairing.memberIds.map(String) : [];
    const pairingMembers = Array.from(new Set([...existingIds, ...participantIds]));
    const pairs = existingPairing.pairs || draft.pairs || [];
    // `unpairedMemberIds` là dữ liệu dẫn xuất: sau auto-pair, reducer có thể
    // render lại cùng snapshot cũ một nhịp. Không để snapshot đó giữ một người
    // đồng thời trong cặp và trong danh sách chưa ghép.
    const pairedMemberIds = new Set(pairs.flatMap((pair) => Array.isArray(pair?.memberIds) ? pair.memberIds.map(String) : []));
    const pairingValue = {
        memberIds: pairingMembers,
        pairs,
        unpairedMemberIds: pairingMembers.filter((id) => !pairedMemberIds.has(id)),
        nextPairNumber: existingPairing.nextPairNumber || (draft.pairs || []).length + 1,
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
                        <strong>Vòng tròn</strong><span>Chưa khả dụng trong luồng thiết lập này</span>
                    </button>
                    <button type="button" disabled title="Unified preview hiện chưa hỗ trợ thể thức này" className={(format.formatKey || 'group_knockout') === 'knockout' ? 'is-active' : ''} aria-pressed={(format.formatKey || 'group_knockout') === 'knockout'} onClick={() => chooseFormat('knockout')}>
                        <strong>Loại trực tiếp</strong><span>Chưa khả dụng trong luồng thiết lập này</span>
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
                roster={pairingRoster}
                selectedMemberIds={participantIds}
                value={pairingValue}
                onChange={updatePairs}
                entrantType={entrantType}
                supportedEntrantTypes={supportedEntrantTypes}
            />
        </div>
    );
}
