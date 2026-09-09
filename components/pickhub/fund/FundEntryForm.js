'use client';

import { useState } from 'react';
import PhModal from '@/components/pickhub/PhModal';

const EMPTY = {
    so_tien: '',
    loai_giao_dich: 'khac',
    noi_dung: '',
    ngay_giao_dich: '',
    ghi_chu: '',
};

export default function FundEntryForm({ open, direction, onClose, onSaved }) {
    const isIncome = direction === 'in';
    const [form, setForm] = useState({
        ...EMPTY,
        loai_giao_dich: isIncome ? 'nop_quy' : 'khac',
        ngay_giao_dich: new Date().toISOString().split('T')[0],
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    function update(field, value) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    async function submit(event) {
        event.preventDefault();
        setError('');
        const amount = Math.abs(Number(String(form.so_tien).replace(/[^\d]/g, '')));
        if (!amount) { setError('Số tiền phải lớn hơn 0.'); return; }
        if (!form.noi_dung.trim()) { setError('Vui lòng nhập nội dung giao dịch.'); return; }

        setSaving(true);
        const response = await fetch('/api/club/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                direction,
                so_tien: amount,
                loai_giao_dich: form.loai_giao_dich,
                noi_dung: form.noi_dung.trim(),
                ngay_giao_dich: form.ngay_giao_dich,
                ghi_chu: form.ghi_chu.trim(),
            }),
        });
        setSaving(false);
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            setError(payload.error || 'Không ghi được giao dịch.');
            return;
        }
        setForm({ ...EMPTY, loai_giao_dich: isIncome ? 'nop_quy' : 'khac', ngay_giao_dich: new Date().toISOString().split('T')[0] });
        onSaved();
    }

    return (
        <PhModal open={open} title={isIncome ? 'Ghi nhận khoản thu' : 'Ghi nhận khoản chi'} onClose={onClose}>
            <form onSubmit={submit}>
                <label className="ph-field">
                    <span className="ph-field__label">Số tiền</span>
                    <input className="ph-field__control" inputMode="numeric" value={form.so_tien} onChange={(event) => update('so_tien', event.target.value)} placeholder="0" />
                </label>
                <label className="ph-field">
                    <span className="ph-field__label">Loại giao dịch</span>
                    <select className="ph-field__control" value={form.loai_giao_dich} onChange={(event) => update('loai_giao_dich', event.target.value)}>
                        <option value="nop_quy">Nộp quỹ</option>
                        <option value="nop_phat">Nộp phạt</option>
                        <option value="khac">Khác</option>
                    </select>
                </label>
                <label className="ph-field">
                    <span className="ph-field__label">Nội dung</span>
                    <input className="ph-field__control" value={form.noi_dung} onChange={(event) => update('noi_dung', event.target.value)} placeholder={isIncome ? 'VD: Thu quỹ tháng 9' : 'VD: Thanh toán tiền sân tháng 9'} />
                </label>
                <label className="ph-field">
                    <span className="ph-field__label">Ngày giao dịch</span>
                    <input className="ph-field__control" type="date" value={form.ngay_giao_dich} onChange={(event) => update('ngay_giao_dich', event.target.value)} />
                </label>
                <label className="ph-field">
                    <span className="ph-field__label">Ghi chú</span>
                    <input className="ph-field__control" value={form.ghi_chu} onChange={(event) => update('ghi_chu', event.target.value)} placeholder="Không bắt buộc" />
                </label>
                {error && <p className="ph-field__error" role="alert">{error}</p>}
                <div className="ph-modal__actions">
                    <button type="button" className="ph-btn ph-btn--outline" onClick={onClose} disabled={saving}>Hủy</button>
                    <button type="submit" className="ph-btn ph-btn--primary" disabled={saving}>
                        {saving ? 'Đang lưu…' : (isIncome ? 'Ghi khoản thu' : 'Ghi khoản chi')}
                    </button>
                </div>
            </form>
        </PhModal>
    );
}
