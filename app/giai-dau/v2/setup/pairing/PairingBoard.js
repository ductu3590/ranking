'use client';

import { useMemo, useState } from 'react';
import { createPairingDraft } from '@/lib/tournament/pairingDraft';
import './pairing.css';

function memberName(memberMap, memberId) {
    const member = memberMap.get(String(memberId));
    if (!member) return `Thành viên ${memberId}`;
    return member.full_name || member.displayName || member.display_name || member.name || `Thành viên ${memberId}`;
}

function ensureDraft(value, selectedMemberIds) {
    if (value && Array.isArray(value.pairs) && Array.isArray(value.unpairedMemberIds)) return value;
    return createPairingDraft({ memberIds: selectedMemberIds });
}

export default function PairingBoard({ roster = [], selectedMemberIds = [], value, onChange, entrantType = 'doubles', supportedEntrantTypes = [] }) {
    const [mode, setMode] = useState('automatic');
    const [swapSource, setSwapSource] = useState(null);
    const draft = ensureDraft(value, selectedMemberIds.map(String));
    const memberMap = useMemo(() => new Map(roster.map((member) => [String(member.member_id ?? member.memberId ?? member.id), member])), [roster]);
    const blockers = createPairingDraft.finalizeBlockers(draft);
    const oddChoices = createPairingDraft.oddChoices(draft);

    function update(next, change) {
        onChange?.(next, change);
    }

    function addPerson(memberId) {
        update(createPairingDraft.addMember(draft, memberId), { type: 'add_member', memberId: String(memberId) });
    }

    function removePerson(memberId) {
        update(createPairingDraft.removeMember(draft, memberId));
    }

    function toggleLock(pair) {
        update(createPairingDraft.setLocked(draft, pair.pairId, !pair.locked));
    }

    function regenerateUnlockedPairs() {
        if (!window.confirm('Ghép lại các cặp chưa khóa? Các cặp đã khóa sẽ được giữ nguyên.')) return;
        update(createPairingDraft.regenerateUnlockedPairs(draft));
    }

    function applyManualPreview() {
        update(draft);
    }

    function applyAutomaticPreview() {
        const next = createPairingDraft.regenerateUnlockedPairs(draft);
        update(next);
    }

    function pickSwap(pairId, memberId) {
        const current = { pairId, memberId: String(memberId) };
        if (!swapSource) {
            setSwapSource(current);
            return;
        }
        if (swapSource.memberId === current.memberId) {
            setSwapSource(null);
            return;
        }
        const next = JSON.parse(JSON.stringify(draft));
        next.pairs = next.pairs.map((pair) => ({ ...pair, memberIds: pair.memberIds.map(String) }));
        for (const pair of next.pairs) {
            pair.memberIds = pair.memberIds.map((id) => {
                if (id === swapSource.memberId) return current.memberId;
                if (id === current.memberId) return swapSource.memberId;
                return id;
            });
        }
        setSwapSource(null);
        update(next);
    }

    const missingSelected = selectedMemberIds.map(String).filter((id) => !draft.memberIds.includes(id));
    const oddMemberId = draft.unpairedMemberIds.length % 2 ? draft.unpairedMemberIds[draft.unpairedMemberIds.length - 1] : null;
    const availableMembers = roster.filter((member) => {
        const memberId = String(member.member_id ?? member.memberId ?? member.id);
        return memberId && !draft.memberIds.includes(memberId) && !draft.reserveMemberIds.includes(memberId);
    });
    const canSwitchToSingles = supportedEntrantTypes.includes('singles');

    function reserveOddMember() {
        if (!oddMemberId) return;
        const next = createPairingDraft.removeMember(draft, oddMemberId);
        next.reserveMemberIds = Array.from(new Set([...next.reserveMemberIds, oddMemberId]));
        update(next, { type: 'reserve_member', memberId: oddMemberId });
    }

    function switchFormat() {
        if (!canSwitchToSingles) return;
        update(draft, { type: 'switch_format', entrantType: 'singles' });
    }

    return (
        <section className="pairing-card" aria-label="Ghép cặp thi đấu">
            <div className="pairing-head">
                <div>
                    <p className="setup-eyebrow">Bước 2</p>
                    <h2>Thể thức & ghép cặp</h2>
                    <p>Ghép cặp ổn định theo member_id. Mobile dùng nút rõ ràng, không cần kéo-thả.</p>
                </div>
                <div className="pairing-mode" role="group" aria-label="Chế độ ghép cặp">
                    <button type="button" aria-pressed={mode === 'manual'} onClick={() => setMode('manual')}>Thủ công</button>
                    <button type="button" aria-pressed={mode === 'automatic'} onClick={() => setMode('automatic')}>Tự động</button>
                </div>
            </div>

            <div className="pairing-actions">
                <button type="button" onClick={mode === 'automatic' ? applyAutomaticPreview : applyManualPreview}>
                    {mode === 'automatic' ? 'Áp dụng gợi ý tự động' : 'Áp dụng ghép thủ công'}
                </button>
                <button type="button" className="pairing-secondary" onClick={regenerateUnlockedPairs}>Ghép lại các cặp chưa khóa</button>
            </div>

            {missingSelected.length > 0 ? (
                <div className="pairing-unpaired">
                    <strong>Thành viên mới chọn chưa có trong bản ghép</strong>
                    {missingSelected.map((id) => <button key={id} type="button" onClick={() => addPerson(id)}>Thêm {memberName(memberMap, id)} vào danh sách chưa ghép</button>)}
                </div>
            ) : null}

            {blockers.includes('UNPAIRED_MEMBER') ? <div className="pairing-blocker">UNPAIRED_MEMBER · Còn thành viên chưa ghép, chưa thể sang bước bốc thăm.</div> : null}

            <div className="pairing-grid">
                {draft.pairs.map((pair, index) => (
                    <article key={pair.pairId} className="pairing-pair">
                        <div className="pairing-pair-head">
                            <strong>Cặp {index + 1}</strong>
                            <button type="button" onClick={() => toggleLock(pair)}>{pair.locked ? 'Mở khóa' : 'Khóa'}</button>
                        </div>
                        {pair.memberIds.map((memberId) => (
                            <div key={memberId} className="pairing-member">
                                <button type="button" aria-pressed={swapSource?.memberId === String(memberId)} onClick={() => pickSwap(pair.pairId, memberId)}>
                                    Đổi người · {memberName(memberMap, memberId)}
                                </button>
                                <button type="button" onClick={() => removePerson(memberId)}>Bỏ khỏi cặp</button>
                            </div>
                        ))}
                    </article>
                ))}
            </div>

            <section className="pairing-unpaired" aria-label="Danh sách chưa ghép">
                <h3>Danh sách chưa ghép</h3>
                {draft.unpairedMemberIds.length === 0 ? <p>Không còn người chờ ghép.</p> : null}
                {draft.unpairedMemberIds.map((memberId) => (
                    <div key={memberId} className="pairing-unpaired-row">
                        <span>{memberName(memberMap, memberId)}</span>
                        <button type="button" onClick={() => removePerson(memberId)}>Bỏ khỏi danh sách</button>
                    </div>
                ))}
            </section>

            {entrantType === 'doubles' && oddChoices.length > 0 ? (
                <div className="pairing-odd">
                    <strong>Số người lẻ: chọn một cách xử lý</strong>
                    <span>Thành viên cần xử lý: {memberName(memberMap, oddMemberId)}</span>
                    <div className="pairing-odd-options">
                        <strong>add_member · Thêm một người cho đủ cặp</strong>
                        {availableMembers.length ? availableMembers.map((member) => {
                            const memberId = String(member.member_id ?? member.memberId ?? member.id);
                            return <button key={memberId} type="button" data-choice="add_member" onClick={() => addPerson(memberId)}>Thêm {memberName(memberMap, memberId)}</button>;
                        }) : <span>Không còn thành viên nào để thêm. Hãy quay lại Bước 1 để chọn thêm người.</span>}
                    </div>
                    <button type="button" data-choice="reserve_member" onClick={reserveOddMember}>reserve_member · Đưa {memberName(memberMap, oddMemberId)} vào dự bị ngoài danh sách thi đấu</button>
                    <button type="button" data-choice="switch_format" disabled={!canSwitchToSingles} aria-describedby={!canSwitchToSingles ? 'pairing-switch-format-reason' : undefined} onClick={switchFormat}>switch_format · Đổi sang đánh đơn</button>
                    {!canSwitchToSingles ? <span id="pairing-switch-format-reason">Đánh đơn chưa được hỗ trợ trong cấu hình giải này.</span> : null}
                </div>
            ) : null}
        </section>
    );
}
