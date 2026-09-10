'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AssignTransactionDialog from './AssignTransactionDialog';
import './PhNotificationBell.css';

const PANEL_WIDTH = 360;
const EDGE = 12;
const GAP = 10;

/* Panel neo theo nut chuong va luon nam gon trong khung nhin.
   Man hinh hep thi trai thanh tam duoi day. */
function panelStyleFor(button) {
    if (typeof window === 'undefined' || !button) return null;
    const rect = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (viewportWidth < 640) {
        /* Chua thanh dieu huong duoi day de panel khong bi che. */
        const bottomNav = document.querySelector('.mobile-bottom-nav');
        const navTop = bottomNav?.getClientRects().length ? bottomNav.getBoundingClientRect().top : viewportHeight;
        return { left: EDGE, right: EDGE, bottom: Math.max(EDGE, viewportHeight - navTop + GAP), width: 'auto' };
    }

    const width = Math.min(PANEL_WIDTH, viewportWidth - EDGE * 2);
    const left = Math.min(Math.max(rect.left, EDGE), viewportWidth - width - EDGE);
    const openUpward = rect.top > viewportHeight / 2;
    return openUpward
        ? { left, bottom: Math.max(EDGE, viewportHeight - rect.top + GAP), width }
        : { left, top: Math.min(rect.bottom + GAP, viewportHeight - EDGE), width };
}

export default function PhNotificationBell() {
    const [items, setItems] = useState([]);
    const [open, setOpen] = useState(false);
    const [assigning, setAssigning] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [panelStyle, setPanelStyle] = useState(null);
    const buttonRef = useRef(null);
    const panelRef = useRef(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await fetch('/api/club/notifications', { cache: 'no-store' });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(data?.error || 'Không tải được thông báo.');
            setItems(data?.notifications || []);
        } catch (_) {
            setError('Không tải được thông báo. Vui lòng thử lại.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const closePanel = useCallback(() => {
        setOpen(false);
        setPanelStyle(null);
    }, []);

    useEffect(() => {
        if (!open) return undefined;

        const reposition = () => setPanelStyle(panelStyleFor(buttonRef.current));
        reposition();

        function onPointerDown(event) {
            if (panelRef.current?.contains(event.target)) return;
            if (buttonRef.current?.contains(event.target)) return;
            closePanel();
        }
        function onKeyDown(event) {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            closePanel();
            buttonRef.current?.focus();
        }

        document.addEventListener('mousedown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('resize', reposition);
        window.addEventListener('scroll', reposition, true);
        return () => {
            document.removeEventListener('mousedown', onPointerDown, true);
            document.removeEventListener('keydown', onKeyDown, true);
            window.removeEventListener('resize', reposition);
            window.removeEventListener('scroll', reposition, true);
        };
    }, [open, closePanel]);

    async function dismiss(item) {
        try {
            const response = await fetch('/api/club/notifications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: item.id, status: 'dismissed' }),
            });
            if (!response.ok) throw new Error('Không thể cập nhật thông báo.');
            load();
        } catch (dismissError) {
            setError(dismissError.message || 'Không thể cập nhật thông báo.');
        }
    }

    /* Mo hop thoai gan thi dong panel truoc: moi luc chi mot lop hien len. */
    function startAssign(item) {
        closePanel();
        setAssigning(item);
    }

    const panel = open && typeof document !== 'undefined' ? createPortal(
        <div className="ph-notification-layer">
            <div
                className="ph-notification-panel"
                role="dialog"
                aria-label="Việc cần xử lý"
                ref={panelRef}
                style={panelStyle || { left: EDGE, top: EDGE, width: PANEL_WIDTH, visibility: 'hidden' }}
            >
                <div className="ph-notification-panel__head">
                    <h2 className="ph-notification-panel__title">Việc cần xử lý</h2>
                    <button type="button" className="ph-notification-panel__close" aria-label="Đóng" onClick={closePanel}>×</button>
                </div>
                <div className="ph-notification-panel__body">
                    {loading ? <p className="ph-notification-panel__empty">Đang tải thông báo...</p> : null}
                    {!loading && error ? <div className="ph-state">
                        <p className="ph-notification-panel__empty">{error}</p>
                        <button type="button" className="ph-btn ph-btn--outline ph-btn--sm" onClick={() => void load()}>Thử lại</button>
                    </div> : null}
                    {!loading && !error && items.length === 0 ? <p className="ph-notification-panel__empty">Không có việc nào cần xử lý.</p> : null}
                    {!loading && !error && items.map((item) => <div key={item.id} className="ph-notification-item">
                        <p className="ph-notification-item__amount">{Number(item.payload?.so_tien || 0).toLocaleString('vi-VN')}đ chưa rõ người nộp</p>
                        <p className="ph-notification-item__raw">{item.payload?.noi_dung_goc}</p>
                        <div className="ph-notification-item__actions">
                            <button type="button" className="ph-btn ph-btn--primary ph-btn--sm" onClick={() => startAssign(item)}>Gán cho thành viên</button>
                            <button type="button" className="ph-btn ph-btn--outline ph-btn--sm" onClick={() => dismiss(item)}>Bỏ qua</button>
                        </div>
                    </div>)}
                </div>
            </div>
        </div>,
        document.body,
    ) : null;

    return (
        <>
            <button
                type="button"
                ref={buttonRef}
                className="ph-btn ph-btn--ghost ph-btn--sm"
                aria-label={`Thông báo${items.length ? `, ${items.length} việc cần xử lý` : ''}`}
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={() => {
                    if (open) { closePanel(); return; }
                    setPanelStyle(panelStyleFor(buttonRef.current));
                    setOpen(true);
                    void load();
                }}
            >
                <span aria-hidden="true">🔔</span>
                {items.length > 0 && <span className="ph-badge ph-badge--gold">{items.length}</span>}
            </button>
            {panel}
            <AssignTransactionDialog
                open={Boolean(assigning)}
                transaction={assigning ? { id: assigning.subject_id, ...(assigning.payload || {}) } : null}
                onClose={() => setAssigning(null)}
                onAssigned={() => { setAssigning(null); load(); }}
            />
        </>
    );
}
