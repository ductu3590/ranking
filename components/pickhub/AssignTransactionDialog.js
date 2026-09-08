'use client';

import { useEffect, useState } from 'react';
import PhModal from './PhModal';

export default function AssignTransactionDialog({ open, notification, onClose, onAssigned }) {
    const [members, setMembers] = useState([]);
    const [query, setQuery] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open) return;
        fetch('/api/club/members')
            .then((response) => response.json())
            .then((data) => setMembers((data.members || []).filter((member) => member.is_active !== false)))
            .catch(() => setMembers([]));
    }, [open]);

    async function assign(member) {
        setSaving(true);
        setError('');
        const response = await fetch('/api/club/transactions', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [notification.subject_id], updates: { nguoi_nop: member.full_name } }),
        });
        setSaving(false);
        if (!response.ok) { setError('Không gán được, thử lại.'); return; }
        onAssigned(notification);
    }

    if (!notification) return null;
    const payload = notification.payload || {};
    const filtered = members.filter((member) => member.full_name.toLowerCase().includes(query.toLowerCase()));

    return (
        <PhModal open={open} title="Gán giao dịch cho thành viên" onClose={onClose}>
            <div className="ph-card ph-card--flat">
                <p><strong>{Number(payload.so_tien || 0).toLocaleString('vi-VN')}đ</strong></p>
                <p>{payload.noi_dung_goc || '(không có nội dung)'}</p>
                <p>{payload.created_at ? new Date(payload.created_at).toLocaleDateString('vi-VN') : ''} · {payload.ma_giao_dich}</p>
            </div>
            <label className="ph-field">
                <span className="ph-field__label">Tìm thành viên</span>
                <input className="ph-field__control" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập tên" />
            </label>
            {error && <p className="ph-field__error">{error}</p>}
            <div>
                {filtered.map((member) => <button key={member.id} type="button" className="ph-btn ph-btn--outline ph-btn--block" disabled={saving} onClick={() => assign(member)}>{member.full_name}</button>)}
                {filtered.length === 0 && <p className="ph-state__text">Không tìm thấy thành viên nào.</p>}
            </div>
        </PhModal>
    );
}