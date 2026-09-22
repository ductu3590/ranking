'use client';

import { useState } from 'react';
import ParticipantRosterPicker from '../participants/ParticipantRosterPicker';

function guestRef() {
    return globalThis.crypto?.randomUUID?.() || `guest-${Date.now()}`;
}

export default function ParticipantsStep({ draft = {}, roster = [], onDraftChange, loading = false, error = '' }) {
    const participants = draft.participants || {};
    const memberIds = participants.memberIds || participants.selectedMemberIds || [];
    const guests = Array.isArray(participants.guests) ? participants.guests : [];
    const [guestName, setGuestName] = useState('');
    const update = (patch, reasonCode) => onDraftChange?.({
        ...draft,
        participants: { ...participants, ...patch },
        invalidation: { ...(draft.invalidation || {}), pairing: true, draw: true, reasonCodes: Array.from(new Set([...(draft.invalidation?.reasonCodes || []), reasonCode])) },
    });
    const addGuest = () => {
        const displayName = guestName.trim();
        if (!displayName) return;
        update({ guests: [...guests, { clientRef: guestRef(), displayName }] }, 'GUESTS_CHANGED');
        setGuestName('');
    };
    return <div className="setup-step setup-step-participants">
        <ParticipantRosterPicker roster={roster} selectedMemberIds={memberIds} onChange={(nextIds) => update({ memberIds: nextIds }, 'ROSTER_CHANGED')} loading={loading} error={error} />
        <section className="participants-card" aria-labelledby="guest-participants-title">
            <div className="participants-head"><div><p className="setup-eyebrow">Khách mời</p><h2 id="guest-participants-title">Người tham gia ngoài CLB</h2><p>Khách được lưu trong bản nháp với danh tính cục bộ, không gắn member_id của CLB.</p></div><strong className="participants-count">{guests.length} khách</strong></div>
            <div className="participants-toolbar"><label className="participants-search"><span>Tên khách</span><input value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="Ví dụ: Nguyễn Minh An" /></label><button type="button" className="participants-primary" onClick={addGuest}>Thêm khách</button></div>
            {guests.length ? <div className="participants-list">{guests.map((guest) => <div className="participants-row" key={guest.clientRef}><span className="participants-person"><strong>{guest.displayName}</strong><small>Khách mời</small></span><button type="button" onClick={() => update({ guests: guests.filter((item) => item.clientRef !== guest.clientRef) }, 'GUESTS_CHANGED')}>Bỏ</button></div>)}</div> : null}
        </section>
    </div>;
}