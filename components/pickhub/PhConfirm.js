'use client';

import { useEffect, useRef } from 'react';
import PhModal from './PhModal';

export default function PhConfirm({ open, title, message, confirmLabel = 'Xác nhận', cancelLabel = 'Hủy', tone = 'default', onConfirm, onCancel }) {
    const cancelRef = useRef(null);

    useEffect(() => {
        if (open && tone === 'danger') cancelRef.current?.focus();
    }, [open, tone]);

    return (
        <PhModal
            open={open}
            title={title}
            onClose={onCancel}
            footer={
                <>
                    <button type="button" className="ph-btn ph-btn--outline" ref={cancelRef} onClick={onCancel}>{cancelLabel}</button>
                    <button
                        type="button"
                        className={`ph-btn ${tone === 'danger' ? 'ph-btn--danger' : 'ph-btn--primary'}`}
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                    </button>
                </>
            }
        >
            <p className="ph-state__text" style={{ margin: 0, maxWidth: 'none' }}>{message}</p>
        </PhModal>
    );
}
