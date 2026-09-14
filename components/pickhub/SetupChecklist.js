'use client';

// Checklist "Thiet lap CLB".
//
// Hinh thai: THANH GON DINH (~52px) + panel bung ra khi bam.
// Ban dau lam dang the day du o dau trang thi no cao 697px va day section cau
// hinh dau tien xuong 1058px — admin phai cuon gan 3 man hinh moi toi noi dung.
// Thanh gon dinh giai quyet ca hai: chiem mot dong, va vi dinh nen van trong
// tam tay khi dang cuon lam viec.
//
// Panel DE LEN noi dung (position:absolute) chu khong day noi dung xuong —
// neu day thi lai quay ve dung van de cu.
//
// Mobile-first ~380px. Fetch qua API route, KHONG goi Supabase truc tiep.

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import './SetupChecklist.css';

const TICK_BY_STATE = { done: '✓', warning: '!' };

// Section duoc chi toi se sang vien trong ngan nay roi tu tat.
const HIGHLIGHT_MS = 2400;

function splitHref(href) {
    const [path, hash] = String(href || '').split('#');
    return { path: path || '', hash: hash || '' };
}

export default function SetupChecklist({ onShareClub }) {
    const [onboarding, setOnboarding] = useState(null);
    const [busy, setBusy] = useState(false);
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    const pathname = usePathname();

    useEffect(() => {
        let active = true;
        fetch('/api/club/onboarding', { cache: 'no-store' })
            .then((res) => (res.ok ? res.json() : null))
            .then((payload) => { if (active && payload?.onboarding) setOnboarding(payload.onboarding); })
            .catch(() => { /* khong phai admin hoac loi mang: an thang, khong bao loi */ });
        return () => { active = false; };
    }, []);

    // Dong panel khi bam ra ngoai hoac bam Esc.
    useEffect(() => {
        if (!open) return undefined;
        function onPointerDown(event) {
            if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
        }
        function onKeyDown(event) {
            if (event.key === 'Escape') setOpen(false);
        }
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    const sendAction = useCallback(async (action) => {
        setBusy(true);
        try {
            const res = await fetch('/api/club/onboarding', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            });
            const payload = await res.json();
            if (res.ok && payload?.onboarding) setOnboarding(payload.onboarding);
        } catch {
            /* giu nguyen trang thai hien tai */
        } finally {
            setBusy(false);
        }
    }, []);

    // Buoc nam ngay trong trang dang mo: dong panel, cuon muot toi section va
    // vien sang no vai giay — de admin biet minh vua duoc dua di dau.
    // Buoc o trang khac: de trinh duyet dieu huong nhu binh thuong.
    const goToStep = useCallback((event, href) => {
        const { path, hash } = splitHref(href);
        if (!hash || path !== pathname) return;
        const node = document.getElementById(hash);
        if (!node) return;

        event.preventDefault();
        setOpen(false);
        node.scrollIntoView({ behavior: 'smooth', block: 'start' });
        node.classList.add('is-onboarding-target');
        window.setTimeout(() => node.classList.remove('is-onboarding-target'), HIGHLIGHT_MS);
    }, [pathname]);

    if (!onboarding) return null;
    if (onboarding.dismissedAt) return null;
    if (!onboarding.visible && !onboarding.isComplete) return null;

    const { completedCount, totalCount, isComplete, steps } = onboarding;
    const percent = Math.round((completedCount / totalCount) * 100);
    const hasWarning = steps.some((step) => step.state === 'warning');
    const toneClass = isComplete ? 'is-complete' : hasWarning ? 'is-warning' : 'is-todo';

    return (
        <div className={`setupbar ${toneClass}`} ref={rootRef}>
            <div className="setupbar__row">
                <span className="setupbar__dot" aria-hidden="true">{isComplete ? '✓' : hasWarning ? '!' : '◔'}</span>

                <span className="setupbar__label">
                    {isComplete ? 'CLB đã thiết lập xong' : 'Thiết lập CLB'}
                </span>

                {!isComplete && (
                    <>
                        <span className="setupbar__count">{completedCount}/{totalCount}</span>
                        <div
                            className="setupbar__bar"
                            role="progressbar"
                            aria-valuenow={completedCount}
                            aria-valuemin={0}
                            aria-valuemax={totalCount}
                            aria-label="Tiến độ thiết lập CLB"
                        >
                            <i style={{ width: `${percent}%` }} />
                        </div>
                    </>
                )}

                <div className="setupbar__actions">
                    {!isComplete && (
                        <button
                            type="button"
                            className="ph-btn ph-btn--outline ph-btn--sm"
                            aria-expanded={open}
                            onClick={() => setOpen((v) => !v)}
                        >
                            {open ? 'Thu gọn' : 'Xem các bước'} <span aria-hidden="true">{open ? '▴' : '▾'}</span>
                        </button>
                    )}
                    <button type="button" className="ph-btn ph-btn--ghost ph-btn--sm" disabled={busy} onClick={() => sendAction('dismiss')}>
                        Ẩn
                    </button>
                </div>
            </div>

            {open && !isComplete && (
                <div className="setupbar__panel" role="group" aria-label="Các bước thiết lập CLB">
                    <p className="setupbar__panelhint">
                        Làm xong {totalCount} bước này là CLB chạy đủ chức năng. Có thể làm dần, không cần xong hôm nay.
                    </p>

                    <ul className="setup__list">
                        {steps.map((step, index) => (
                            <li key={step.key} className={`setup__item is-${step.state}`}>
                                <span className="setup__tick" aria-hidden="true">
                                    {TICK_BY_STATE[step.state] || index + 1}
                                </span>
                                <div className="setup__body">
                                    <p className="setup__name">{step.title}</p>
                                    <p className="setup__desc">{step.description}</p>
                                    {step.warning && <p className="setup__warn">⚠ {step.warning}</p>}
                                    {step.key === 'sepay' && !step.done && (
                                        <p className="setup__warn">
                                            🏦 Trước khi bắt đầu, hãy mở một <b>tài khoản ngân hàng riêng cho quỹ CLB</b>.
                                            Mở trên app ngân hàng khoảng 5 phút, miễn phí.
                                        </p>
                                    )}
                                </div>
                                <div className="setup__cta">
                                    {step.done
                                        ? <span className="ph-badge ph-badge--positive">Đã xong</span>
                                        : (
                                            <a
                                                className={`ph-btn ph-btn--sm ${step.state === 'warning' ? 'ph-btn--primary' : 'ph-btn--outline'}`}
                                                href={step.href}
                                                onClick={(event) => goToStep(event, step.href)}
                                            >{step.cta}</a>
                                        )}
                                </div>
                            </li>
                        ))}
                    </ul>

                    <div className="setupbar__panelfoot">
                        {onShareClub
                            ? <button type="button" className="ph-btn ph-btn--outline ph-btn--sm" onClick={onShareClub}>🔗 Chia sẻ mã CLB</button>
                            : <a className="ph-btn ph-btn--outline ph-btn--sm" href="/admin#set-code" onClick={(event) => goToStep(event, '/admin#set-code')}>🔗 Chia sẻ mã CLB</a>}
                    </div>
                </div>
            )}
        </div>
    );
}
