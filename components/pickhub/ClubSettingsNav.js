'use client';

import { useEffect, useState } from 'react';
import './ClubSettingsNav.css';

const SECTIONS = [
    { id: 'set-brand', label: 'Nhận diện' },
    { id: 'set-code', label: 'Mã CLB' },
    { id: 'set-pw-admin', label: 'MK quản trị' },
    { id: 'set-pw-member', label: 'MK thành viên' },
    { id: 'set-qr', label: 'QR nhận quỹ' },
    { id: 'set-sepay', label: 'SePay' },
    { id: 'set-bank', label: 'Ngân hàng' },
];

const ACTIVE_LINE = 200;

export default function ClubSettingsNav() {
    const [activeId, setActiveId] = useState(SECTIONS[0].id);

    useEffect(() => {
        function sync() {
            let current = SECTIONS[0].id;
            for (const section of SECTIONS) {
                const node = document.getElementById(section.id);
                if (node && node.getBoundingClientRect().top - ACTIVE_LINE <= 0) current = section.id;
            }
            setActiveId(current);
        }
        sync();
        window.addEventListener('scroll', sync, { passive: true });
        window.addEventListener('resize', sync);
        return () => {
            window.removeEventListener('scroll', sync);
            window.removeEventListener('resize', sync);
        };
    }, []);

    function goTo(event, id) {
        event.preventDefault();
        const node = document.getElementById(id);
        if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    return (
        <nav className="set-nav" aria-label="Mục cấu hình">
            <span className="set-nav__lbl">Đi tới</span>
            {SECTIONS.map((section) => (
                <a
                    key={section.id}
                    href={`#${section.id}`}
                    className={activeId === section.id ? 'is-active' : ''}
                    aria-current={activeId === section.id ? 'true' : undefined}
                    onClick={(event) => goTo(event, section.id)}
                >{section.label}</a>
            ))}
        </nav>
    );
}
