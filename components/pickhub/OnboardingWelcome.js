'use client';

// Wizard chao mung, CHI hien mot lan cho moi CLB (khi onboarding_seen_at IS NULL).
//
// Khong ep: nut "De sau", Esc va click backdrop deu dong duoc — dong kieu nao
// cung ghi mark_welcome_seen nen khong hoi lai lan hai. Admin thuong tao CLB de
// xem thu truoc khi moi nguoi that; chan duong vao bang wizard bat buoc la cach
// nhanh nhat de mat nguoi dung.
//
// Dung PhModal (da co focus trap, Esc, khoa scroll, tra focus).

import { Fragment, useCallback, useEffect, useState } from 'react';
import PhModal from './PhModal';
import './OnboardingWelcome.css';

const SLIDES = [
    {
        key: 'welcome',
        chip: 'Chào mừng',
        title: (clubName) => `Chào mừng đến PickHub, ${clubName}!`,
        body: (
            <p className="onb__lead">
                CLB của bạn đã được tạo. Còn vài bước ngắn để mọi thứ chạy trơn tru —
                mất khoảng <b>10 phút</b>, và bạn có thể làm dần, không cần xong ngay hôm nay.
            </p>
        ),
    },
    {
        key: 'features',
        chip: 'Làm được gì',
        title: () => 'PickHub lo giúp bạn ba việc',
        body: (
            <ul className="onb__list">
                <li><span className="onb__emo" aria-hidden="true">👥</span><span><b>Quản lý thành viên</b> — danh sách thành viên, trình độ, hồ sơ vận động viên.</span></li>
                <li><span className="onb__emo" aria-hidden="true">💰</span><span><b>Quỹ tự động</b> — ai chuyển tiền vào quỹ là PickHub ghi sổ và gán đúng tên, thủ quỹ không phải gõ tay.</span></li>
                <li><span className="onb__emo" aria-hidden="true">🏆</span><span><b>Giải đấu</b> — sinh lịch, bảng xếp hạng, sơ đồ loại trực tiếp tự động.</span></li>
            </ul>
        ),
    },
    {
        key: 'start',
        chip: 'Bắt đầu',
        title: () => 'Bắt đầu từ đâu cũng được',
        body: (
            <p className="onb__lead">
                Thẻ <b>&ldquo;Hoàn tất thiết lập CLB&rdquo;</b> ở đầu trang sẽ đi cùng bạn: làm xong bước nào là tick xanh bước đó.
                Ẩn đi lúc nào cũng được, và bật lại được từ trang Cấu hình.
            </p>
        ),
    },
];

export default function OnboardingWelcome({ clubName = 'câu lạc bộ' }) {
    const [open, setOpen] = useState(false);
    const [index, setIndex] = useState(0);

    useEffect(() => {
        let active = true;
        fetch('/api/club/onboarding', { cache: 'no-store' })
            .then((res) => (res.ok ? res.json() : null))
            .then((payload) => {
                if (!active || !payload?.onboarding) return;
                if (!payload.onboarding.hasSeenWelcome) setOpen(true);
            })
            .catch(() => { /* khong phai admin hoac loi mang: khong mo wizard */ });
        return () => { active = false; };
    }, []);

    // Dong kieu nao cung danh dau da xem — khong hoi lai lan hai.
    const close = useCallback(() => {
        setOpen(false);
        fetch('/api/club/onboarding', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'mark_welcome_seen' }),
        }).catch(() => { /* lan sau mo lai cung khong sao */ });
    }, []);

    if (!open) return null;

    const slide = SLIDES[index];
    const isLast = index === SLIDES.length - 1;

    return (
        <PhModal
            open={open}
            title={slide.title(clubName)}
            onClose={close}
            footer={(
                <>
                    <button type="button" className="ph-btn ph-btn--ghost" onClick={close}>
                        {isLast ? 'Đóng' : 'Để sau'}
                    </button>
                    {isLast
                        ? <button type="button" className="ph-btn ph-btn--primary" onClick={close}>Bắt đầu thiết lập</button>
                        : <button type="button" className="ph-btn ph-btn--primary" onClick={() => setIndex((i) => i + 1)}>Tiếp tục →</button>}
                </>
            )}
        >
            <div className="ph-stepper" aria-label="Tiến trình chào mừng">
                {/* Fragment chu khong phai the boc: .ph-stepline phai la flex item
                    truc tiep cua .ph-stepper thi flex:1 moi an. */}
                {SLIDES.map((item, i) => (
                    <Fragment key={item.key}>
                        <span className={`ph-stepchip ${i === index ? 'is-active' : i < index ? 'is-done' : ''}`}>
                            <span className="ph-stepchip__n">{i < index ? '✓' : i + 1}</span>
                            {item.chip}
                        </span>
                        {i < SLIDES.length - 1 && <span className={`ph-stepline ${i < index ? 'is-done' : ''}`} />}
                    </Fragment>
                ))}
            </div>
            {slide.body}
        </PhModal>
    );
}
