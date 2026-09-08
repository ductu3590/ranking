'use client';

import { useCallback, useEffect, useState } from 'react';
import PhModal from './PhModal';
import AssignTransactionDialog from './AssignTransactionDialog';

export default function PhNotificationBell() {
    const [items, setItems] = useState([]);
    const [open, setOpen] = useState(false);
    const [assigning, setAssigning] = useState(null);

    const load = useCallback(() => {
        fetch('/api/club/notifications', { cache: 'no-store' })
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => setItems(data?.notifications || []))
            .catch(() => {});
    }, []);

    useEffect(() => { load(); }, [load]);

    async function dismiss(item) {
        await fetch('/api/club/notifications', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: item.id, status: 'dismissed' }),
        });
        load();
    }

    return (
        <>
            <button type="button" className="ph-btn ph-btn--ghost ph-btn--sm" aria-label={`Thông báo${items.length ? `, ${items.length} việc cần xử lý` : ''}`} onClick={() => { setOpen(true); load(); }}>
                <span aria-hidden="true">🔔</span>
                {items.length > 0 && <span className="ph-badge ph-badge--gold">{items.length}</span>}
            </button>
            <PhModal open={open} title="Việc cần xử lý" onClose={() => setOpen(false)}>
                {items.length === 0 && <p className="ph-state__text">Không có việc nào cần xử lý.</p>}
                <div>
                    {items.map((item) => <div key={item.id} className="ph-card ph-card--flat">
                        <p><strong>{Number(item.payload?.so_tien || 0).toLocaleString('vi-VN')}đ chưa rõ người nộp</strong></p>
                        <p>{item.payload?.noi_dung_goc}</p>
                        <button type="button" className="ph-btn ph-btn--primary ph-btn--sm" onClick={() => setAssigning(item)}>Gán cho thành viên</button>{' '}
                        <button type="button" className="ph-btn ph-btn--outline ph-btn--sm" onClick={() => dismiss(item)}>Bỏ qua</button>
                    </div>)}
                </div>
            </PhModal>
            <AssignTransactionDialog open={Boolean(assigning)} notification={assigning} onClose={() => setAssigning(null)} onAssigned={() => { setAssigning(null); load(); }} />
        </>
    );
}
