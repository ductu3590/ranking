'use client';

import { useEffect, useState } from 'react';
import PhModal from '@/components/pickhub/PhModal';

export default function FundTransactionEditor({ open, transaction, members, onClose, onSaved }) {
    const [form, setForm] = useState({ nguoi_nop: '', loai_giao_dich: 'khac', admin_note: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!transaction) return;
        setForm({
            nguoi_nop: transaction.nguoi_nop || '',
            loai_giao_dich: transaction.loai_giao_dich || 'khac',
            admin_note: transaction.admin_note || '',
        });
        setError('');
    }, [transaction]);

    if (!transaction) return null;

    async function submit(event) {
        event.preventDefault();
        setSaving(true);
        setError('');
        const response = await fetch('/api/club/transactions', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ids: [transaction.id],
                updates: {
                    nguoi_nop: form.nguoi_nop || null,
                    loai_giao_dich: form.loai_giao_dich,
                    admin_note: form.admin_note.trim() || null,
                    is_manually_categorized: true,
                },
            }),
        });
        setSaving(false);
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            setError(payload.error || 'Không lưu được thay đổi.');
            return;
        }
        onSaved();
    }

    return (
        <PhModal open={open} title="Sửa giao dịch" onClose={onClose}>
            <p className="ph-state__text">
                {transaction.ma_giao_dich} · {transaction.created_at ? new Date(transaction.created_at).toLocaleString('vi-VN') : ''}
            </p>
            <form onSubmit={submit}>
                <label className="ph-field">
                    <span className="ph-field__label">Người nộp</span>
                    <select className="ph-field__control" value={form.nguoi_nop} onChange={(event) => setForm((c) => ({ ...c, nguoi_nop: event.target.value }))}>
                        <option value="">— Chưa gán —</option>
                        {members.map((member) => <option key={member.id} value={member.full_name}>{member.full_name}</option>)}
                    </select>
                </label>
                <label className="ph-field">
                    <span className="ph-field__label">Loại giao dịch</span>
                    <select className="ph-field__control" value={form.loai_giao_dich} onChange={(event) => setForm((c) => ({ ...c, loai_giao_dich: event.target.value }))}>
                        <option value="nop_quy">Nộp quỹ</option>
                        <option value="nop_phat">Nộp phạt</option>
                        <option value="khac">Khác</option>
                    </select>
                </label>
                <label className="ph-field">
                    <span className="ph-field__label">Ghi chú của thủ quỹ</span>
                    <input className="ph-field__control" value={form.admin_note} onChange={(event) => setForm((c) => ({ ...c, admin_note: event.target.value }))} placeholder="Không bắt buộc" />
                </label>
                {error && <p className="ph-field__error" role="alert">{error}</p>}
                <div className="ph-modal__actions">
                    <button type="button" className="ph-btn ph-btn--outline" onClick={onClose} disabled={saving}>Hủy</button>
                    <button type="submit" className="ph-btn ph-btn--primary" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu thay đổi'}</button>
                </div>
            </form>
        </PhModal>
    );
}
