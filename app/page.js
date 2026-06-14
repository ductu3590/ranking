'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import './page.css';

const EMPTY_CREATE_FORM = {
    name: '',
    description: '',
    adminPassword: '',
    memberPassword: '',
};

export default function TeamFundHomePage() {
    const router = useRouter();
    const [activeModal, setActiveModal] = useState(null);
    const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
    const [joinForm, setJoinForm] = useState({ code: '', password: '' });
    const [currentGroup, setCurrentGroup] = useState(null);
    const [createdGroup, setCreatedGroup] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const storedGroup = window.localStorage.getItem('teamfund-current-group');
        if (storedGroup) {
            try {
                setCurrentGroup(JSON.parse(storedGroup));
            } catch {
                window.localStorage.removeItem('teamfund-current-group');
            }
        }

        const params = new URLSearchParams(window.location.search);
        const groupCode = params.get('group');
        if (groupCode) {
            setJoinForm((prev) => ({ ...prev, code: groupCode.toUpperCase() }));
            setActiveModal('join');
        }
    }, []);

    function updateCreateForm(field, value) {
        setCreateForm((prev) => ({ ...prev, [field]: value }));
    }

    function updateJoinForm(field, value) {
        setJoinForm((prev) => ({ ...prev, [field]: value.toUpperCase() }));
    }

    function rememberGroup(group, role) {
        const nextGroup = { ...group, role };
        setCurrentGroup(nextGroup);
        window.localStorage.setItem('teamfund-current-group', JSON.stringify(nextGroup));
    }

    async function handleCreateGroup(event) {
        event.preventDefault();
        setLoading(true);
        setError('');
        setCreatedGroup(null);

        try {
            const response = await fetch('/api/groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(createForm),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Không thể tạo nhóm.');

            rememberGroup(data.group, data.role);
            setCreatedGroup(data);
            setCreateForm(EMPTY_CREATE_FORM);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleJoinGroup(event) {
        event.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await fetch('/api/groups/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(joinForm),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Không thể tham gia nhóm.');

            rememberGroup(data.group, data.role);
            router.push(data.redirectTo || '/quy');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    function closeModal() {
        setActiveModal(null);
        setError('');
        setCreatedGroup(null);
    }

    async function downloadGroupCardImage() {
        if (!createdGroup?.group || !createdGroup.qrCodeDataUrl) return;

        const qrImage = await loadImage(createdGroup.qrCodeDataUrl);
        const canvas = document.createElement('canvas');
        canvas.width = 900;
        canvas.height = 1200;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#f6f7fb';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const gradient = ctx.createLinearGradient(0, 0, canvas.width, 360);
        gradient.addColorStop(0, '#0aa7a5');
        gradient.addColorStop(1, '#31b86b');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, 360);

        drawRoundedRect(ctx, 92, 165, 716, 860, 44, '#ffffff');
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 42px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Quản lý quỹ nhóm', canvas.width / 2, 94);
        ctx.fillText('Đơn giản minh bạch', canvas.width / 2, 145);

        drawRoundedRect(ctx, 390, 220, 120, 120, 30, '#18b96f');
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 54px Arial, sans-serif';
        ctx.fillText('TF', canvas.width / 2, 297);

        ctx.fillStyle = '#20242c';
        ctx.font = '900 54px Arial, sans-serif';
        ctx.fillText('TeamFund', canvas.width / 2, 390);

        ctx.fillStyle = '#687081';
        ctx.font = '600 27px Arial, sans-serif';
        ctx.fillText(createdGroup.group.name, canvas.width / 2, 440);

        ctx.fillStyle = '#20242c';
        ctx.font = '800 28px Arial, sans-serif';
        ctx.fillText('MÃ NHÓM', canvas.width / 2, 515);

        ctx.fillStyle = '#0fa867';
        ctx.font = '900 76px Arial, sans-serif';
        ctx.letterSpacing = '6px';
        ctx.fillText(createdGroup.group.code, canvas.width / 2, 600);

        drawRoundedRect(ctx, 260, 655, 380, 380, 30, '#f6f7fb');
        ctx.drawImage(qrImage, 290, 685, 320, 320);

        ctx.fillStyle = '#687081';
        ctx.font = '600 24px Arial, sans-serif';
        wrapCanvasText(ctx, createdGroup.joinUrl, canvas.width / 2, 1085, 650, 30);

        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `teamfund-${createdGroup.group.code}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    return (
        <main className="teamfund-home">
            <div className="teamfund-app">
                <header className="teamfund-appbar">
                    <div className="teamfund-app-icon" aria-hidden="true">
                        <PeopleWalletIcon />
                    </div>
                    <div className="teamfund-appbar-text">
                        <h1>TeamFund</h1>
                        <p>Quản lý quỹ nhóm minh bạch, đơn giản</p>
                    </div>
                </header>

                <div className="teamfund-content">
                    {currentGroup && (
                        <section className="teamfund-block">
                            <h2 className="teamfund-section-title">
                                <UsersIcon />
                                Nhóm của tôi
                            </h2>

                            <article className="teamfund-group-card">
                                <div className="teamfund-row-main">
                                    <div className="teamfund-tile teamfund-tile-orange">
                                        <WalletIcon />
                                    </div>
                                    <div className="teamfund-item-text">
                                        <strong>{currentGroup.name}</strong>
                                        <span className="teamfund-role-pill">
                                            {currentGroup.role === 'admin' ? 'Quản trị viên' : 'Thành viên'}
                                        </span>
                                    </div>
                                </div>
                                <a
                                    className="teamfund-more"
                                    href={currentGroup.role === 'admin' ? '/admin' : '/quy'}
                                    aria-label="Vào nhóm hiện tại"
                                >
                                    <ChevronIcon />
                                </a>
                            </article>
                        </section>
                    )}

                    <section className="teamfund-block">
                        <h2 className="teamfund-section-title">Bắt đầu</h2>
                        <div className="teamfund-actions">
                            <button
                                type="button"
                                className="teamfund-action-row"
                                onClick={() => setActiveModal('create')}
                            >
                                <span className="teamfund-row-main">
                                    <span className="teamfund-tile teamfund-tile-purple">
                                        <PlusIcon />
                                    </span>
                                    <span className="teamfund-item-text">
                                        <strong>Tạo nhóm mới</strong>
                                        <span>Tạo nhóm và quản lý quỹ</span>
                                    </span>
                                </span>
                                <ChevronIcon />
                            </button>

                            <button
                                type="button"
                                className="teamfund-action-row"
                                onClick={() => setActiveModal('join')}
                            >
                                <span className="teamfund-row-main">
                                    <span className="teamfund-tile teamfund-tile-blue">
                                        <KeyIcon />
                                    </span>
                                    <span className="teamfund-item-text">
                                        <strong>Tham gia nhóm</strong>
                                        <span>Nhập mã nhóm và mật khẩu để vào</span>
                                    </span>
                                </span>
                                <ChevronIcon />
                            </button>
                        </div>
                    </section>
                </div>
            </div>

            {activeModal === 'create' && (
                <Modal title="Tạo nhóm mới" onClose={closeModal}>
                    {createdGroup ? (
                        <div className="teamfund-success">
                            <p className="teamfund-code-label">Mã nhóm</p>
                            <strong className="teamfund-code">{createdGroup.group.code}</strong>
                            <img src={createdGroup.qrCodeDataUrl} alt={`QR tham gia nhóm ${createdGroup.group.code}`} />
                            <p>Gửi mã nhóm hoặc QR này cho thành viên.</p>
                            <div className="teamfund-modal-actions teamfund-group-card-download">
                                <button type="button" className="teamfund-save-image" onClick={downloadGroupCardImage}>
                                    Lưu ảnh
                                </button>
                                <a className="teamfund-submit" href="/admin">Vào trang quản trị</a>
                            </div>
                        </div>
                    ) : (
                        <form className="teamfund-form" onSubmit={handleCreateGroup}>
                            <FormError message={error} />
                            <label>
                                Tên nhóm
                                <input
                                    value={createForm.name}
                                    onChange={(event) => updateCreateForm('name', event.target.value)}
                                    placeholder="Pickleball Team"
                                    required
                                />
                            </label>
                            <label>
                                Mô tả
                                <textarea
                                    value={createForm.description}
                                    onChange={(event) => updateCreateForm('description', event.target.value)}
                                    placeholder="Nhóm quản lý quỹ và thành viên"
                                    rows="3"
                                />
                            </label>
                            <label>
                                Mật khẩu admin
                                <input
                                    type="password"
                                    value={createForm.adminPassword}
                                    onChange={(event) => updateCreateForm('adminPassword', event.target.value)}
                                    minLength="6"
                                    required
                                />
                            </label>
                            <label>
                                Mật khẩu thành viên
                                <input
                                    type="password"
                                    value={createForm.memberPassword}
                                    onChange={(event) => updateCreateForm('memberPassword', event.target.value)}
                                    minLength="4"
                                    required
                                />
                            </label>
                            <div className="teamfund-modal-actions">
                                <button type="button" className="teamfund-cancel" onClick={closeModal}>Hủy</button>
                                <button type="submit" className="teamfund-submit" disabled={loading}>
                                    {loading ? 'Đang tạo...' : 'Tạo nhóm'}
                                </button>
                            </div>
                        </form>
                    )}
                </Modal>
            )}

            {activeModal === 'join' && (
                <Modal title="Tham gia nhóm" onClose={closeModal}>
                    <form className="teamfund-form" onSubmit={handleJoinGroup}>
                        <FormError message={error} />
                        <label>
                            Mã nhóm
                            <input
                                value={joinForm.code}
                                onChange={(event) => updateJoinForm('code', event.target.value)}
                                placeholder="AB12CD34"
                                maxLength="8"
                                required
                            />
                        </label>
                        <label>
                            Mật khẩu
                            <input
                                type="password"
                                value={joinForm.password}
                                onChange={(event) => setJoinForm((prev) => ({ ...prev, password: event.target.value }))}
                                required
                            />
                        </label>
                        <div className="teamfund-modal-actions">
                            <button type="button" className="teamfund-cancel" onClick={closeModal}>Hủy</button>
                            <button type="submit" className="teamfund-submit" disabled={loading}>
                                {loading ? 'Đang vào...' : 'Vào nhóm'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </main>
    );
}

function Modal({ title, children, onClose }) {
    return (
        <div className="teamfund-modal-backdrop" role="presentation" onClick={onClose}>
            <section
                className="teamfund-modal"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={(event) => event.stopPropagation()}
            >
                <header className="teamfund-modal-header">
                    <h2>{title}</h2>
                    <button type="button" onClick={onClose} aria-label="Đóng">×</button>
                </header>
                {children}
            </section>
        </div>
    );
}

function FormError({ message }) {
    if (!message) return null;
    return <p className="teamfund-error">{message}</p>;
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
    });
}

function drawRoundedRect(ctx, x, y, width, height, radius, fillStyle) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = String(text || '').split('');
    let line = '';
    let currentY = y;

    for (const char of words) {
        const nextLine = line + char;
        if (ctx.measureText(nextLine).width > maxWidth && line) {
            ctx.fillText(line, x, currentY);
            line = char;
            currentY += lineHeight;
        } else {
            line = nextLine;
        }
    }
    if (line) ctx.fillText(line, x, currentY);
}

function PeopleWalletIcon() {
    return (
        <svg viewBox="0 0 48 48" fill="none">
            <rect x="7" y="13" width="34" height="27" rx="7" fill="white" opacity=".96" />
            <path d="M14 26h20M14 32h12" stroke="#10a568" strokeWidth="3" strokeLinecap="round" />
            <circle cx="17" cy="16" r="4" fill="white" />
            <circle cx="24" cy="15" r="5" fill="white" />
            <circle cx="31" cy="16" r="4" fill="white" />
            <path d="M14 22c1.6-3.3 5.1-5.4 10-5.4s8.4 2.1 10 5.4" stroke="#10a568" strokeWidth="3" strokeLinecap="round" />
        </svg>
    );
}

function UsersIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.5 19c.5-3.2 2.2-5 4.5-5s4 1.8 4.5 5M11.5 19c.5-3.2 2.2-5 4.5-5s4 1.8 4.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

function WalletIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 7v10M7 12h10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M5 10.5c0-2.2 1.8-4 4-4h6c2.2 0 4 1.8 4 4v5c0 2.2-1.8 4-4 4H9c-2.2 0-4-1.8-4-4v-5Z" stroke="currentColor" strokeWidth="2" />
        </svg>
    );
}

function PlusIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
    );
}

function KeyIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 14v5M9 9a3 3 0 1 1 6 0c0 1.2-.7 2.2-1.8 2.7-.7.4-1.2 1-1.2 1.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M6 21h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
    );
}

function ChevronIcon() {
    return (
        <svg className="teamfund-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
