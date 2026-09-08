'use client';

import { useEffect, useId, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function PhModal({ open, title, onClose, children, footer }) {
    const dialogRef = useRef(null);
    const previouslyFocused = useRef(null);
    const titleId = useId();

    useEffect(() => {
        if (!open) return undefined;

        previouslyFocused.current = document.activeElement;
        const node = dialogRef.current;
        const first = node?.querySelector(FOCUSABLE);
        (first || node)?.focus();

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        function onKeyDown(event) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                onClose();
                return;
            }
            if (event.key !== 'Tab') return;
            const items = Array.from(node?.querySelectorAll(FOCUSABLE) || []);
            if (items.length === 0) return;
            const firstItem = items[0];
            const lastItem = items[items.length - 1];
            if (event.shiftKey && document.activeElement === firstItem) {
                event.preventDefault();
                lastItem.focus();
            } else if (!event.shiftKey && document.activeElement === lastItem) {
                event.preventDefault();
                firstItem.focus();
            }
        }

        document.addEventListener('keydown', onKeyDown, true);
        return () => {
            document.removeEventListener('keydown', onKeyDown, true);
            document.body.style.overflow = previousOverflow;
            if (previouslyFocused.current instanceof HTMLElement) previouslyFocused.current.focus();
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="ph-modal__backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
            <div
                className="ph-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                ref={dialogRef}
            >
                <h2 className="ph-modal__title" id={titleId}>{title}</h2>
                {children}
                {footer && <div className="ph-modal__actions">{footer}</div>}
            </div>
        </div>
    );
}
