'use client';

// Toast ket qua thao tac. Noi co dinh giua-duoi man hinh nen luon nhin thay du
// admin dang thao tac o cuoi trang — truoc day thong bao nam o DAU trang Cau
// hinh, bam Luu o cuoi trang thi khong ai thay no.
//
// Theo UI-BRAND-SYSTEM §5: toast chi dung cho KET QUA thao tac. Viec can xu ly
// lau dai nam trong inbox thong bao, khong phai toast.

import { useCallback, useEffect, useRef, useState } from 'react';
import './PhToast.css';

const AUTO_HIDE_MS = 2800;
// Loi de nguoi ta doc lau hon mot chut: thuong co viec phai sua.
const AUTO_HIDE_ERROR_MS = 4200;

// Hook dung trong component cha: const { toast, showToast, ... } = useToast();
export function useToast() {
    const [toast, setToast] = useState(null);
    const timerRef = useRef(null);

    const hideToast = useCallback(() => {
        if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
        setToast(null);
    }, []);

    const showToast = useCallback((message, tone = 'success') => {
        if (!message) return;
        if (timerRef.current) window.clearTimeout(timerRef.current);
        setToast({ message, tone, id: Date.now() });
        timerRef.current = window.setTimeout(
            () => setToast(null),
            tone === 'error' ? AUTO_HIDE_ERROR_MS : AUTO_HIDE_MS,
        );
    }, []);

    useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

    return { toast, showToast, hideToast };
}

export default function PhToast({ toast, onClose }) {
    // Esc dong som — khong bat nguoi ta cho het gio.
    useEffect(() => {
        if (!toast) return undefined;
        function onKeyDown(event) { if (event.key === 'Escape') onClose?.(); }
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [toast, onClose]);

    if (!toast) return null;

    return (
        <div className="ph-toastwrap" aria-live="polite" aria-atomic="true">
            <div key={toast.id} className={`ph-toast is-${toast.tone}`} role="status">
                <span className="ph-toast__icon" aria-hidden="true">{toast.tone === 'error' ? '⚠' : '✓'}</span>
                <span className="ph-toast__text">{toast.message}</span>
                <button type="button" className="ph-toast__close" aria-label="Đóng thông báo" onClick={onClose}>×</button>
            </div>
        </div>
    );
}
