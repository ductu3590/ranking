'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { rememberClubAccessContext } from '@/lib/clubAccessClient';
import './page.css';

const EMPTY_CREATE_FORM = {
    name: '',
    description: '',
    adminPassword: '',
    memberPassword: '',
};

const GROUP_STORAGE_KEY = 'teamfund-current-group';

export default function PickhubHomePage() {
    const router = useRouter();
    const [activeModal, setActiveModal] = useState(null);
    const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
    const [joinForm, setJoinForm] = useState({ code: '', password: '' });
    const [currentGroup, setCurrentGroup] = useState(null);
    const [hasLoadedStoredGroup, setHasLoadedStoredGroup] = useState(false);
    const [createdGroup, setCreatedGroup] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const storedGroup = window.localStorage.getItem(GROUP_STORAGE_KEY);
        if (storedGroup) {
            try {
                const rememberedGroup = JSON.parse(storedGroup);
                if (rememberedGroup?.code) {
                    setJoinForm((prev) => ({ ...prev, code: rememberedGroup.code }));
                }
            } catch {
                window.localStorage.removeItem(GROUP_STORAGE_KEY);
            }
        }

        fetch('/api/groups/session', { cache: 'no-store' })
            .then((response) => response.json())
            .then((payload) => {
                if (payload.permissions?.canViewClub && payload.session) {
                    setCurrentGroup({
                        id: payload.session.group_id,
                        code: payload.session.group_code,
                        name: payload.session.group_name,
                        role: payload.session.role,
                    });
                }
            })
            .catch(() => {});

        const params = new URLSearchParams(window.location.search);
        const groupCode = params.get('group');
        if (groupCode) {
            setJoinForm((prev) => ({ ...prev, code: groupCode.toUpperCase() }));
            setActiveModal('join');
        }

        setHasLoadedStoredGroup(true);
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
        rememberClubAccessContext(group);
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
        ctx.fillText('Cùng xây dựng cộng đồng', canvas.width / 2, 94);
        ctx.fillText('Pickleball phát triển.', canvas.width / 2, 145);

        drawRoundedRect(ctx, 390, 220, 120, 120, 30, '#18b96f');
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 54px Arial, sans-serif';
        ctx.fillText('TF', canvas.width / 2, 297);

        ctx.fillStyle = '#20242c';
        ctx.font = '900 54px Arial, sans-serif';
        ctx.fillText('Pickhub', canvas.width / 2, 390);

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
        link.download = `pickhub-${createdGroup.group.code}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    return (
        <div className="ph-land">
            <header className="ph-land__nav">
                <div className="ph-land__navinner">
                    <a className="ph-land__brand" href="/" aria-label="PickHub - trang chủ">
                        <span className="ph-land__brandmark" aria-hidden="true"><PaddleIcon /></span>
                        <span className="ph-land__brandtext">
                            <span className="ph-land__wordmark">PickHub</span>
                            <span className="ph-land__brandtag">Cộng đồng Pickleball</span>
                        </span>
                    </a>

                    {hasLoadedStoredGroup && currentGroup ? (
                        <a className="ph-land__navcta" href={currentGroup.role === 'admin' ? '/admin' : '/quy'}>
                            <span className="ph-land__navdot" aria-hidden="true" />
                            <span className="ph-land__navclub">{currentGroup.name}</span>
                            <span className="ph-land__navcode">{currentGroup.code}</span>
                        </a>
                    ) : null}
                </div>
            </header>

            <main className="ph-land__main">
                <section className="ph-land__hero">
                    <span className="ph-land__glow ph-land__glow--a" aria-hidden="true" />
                    <span className="ph-land__glow ph-land__glow--b" aria-hidden="true" />
                    <div className="ph-land__herorow">
                        <div className="ph-land__heromain">
                            <span className="ph-land__heroicon" aria-hidden="true"><PeopleWalletIcon /></span>
                            <div className="ph-land__herotext">
                                <h1>Pickhub</h1>
                                <p>Cùng xây dựng cộng đồng Pickleball phát triển.</p>
                            </div>
                        </div>
                        <span className="ph-land__herochip">
                            <CheckIcon />
                            Hệ thống hoạt động ổn định
                        </span>
                    </div>
                </section>

                {hasLoadedStoredGroup && currentGroup && (
                    <section className="ph-land__block" aria-labelledby="ph-land-continue">
                        <h2 className="ph-land__blocktitle" id="ph-land-continue">
                            <UsersIcon />
                            Tiếp tục
                        </h2>

                        <a
                            className="ph-land__row ph-land__row--continue"
                            href={currentGroup.role === 'admin' ? '/admin' : '/quy'}
                            aria-label="Vào CLB của bạn"
                        >
                            <span className="ph-land__rowmain">
                                <span className="ph-land__tile ph-land__tile--gold" aria-hidden="true">
                                    <CourtIcon />
                                </span>
                                <span className="ph-land__rowtext">
                                    <strong>Vào CLB của bạn</strong>
                                    <span className="ph-land__rowsub">{currentGroup.name}</span>
                                    <span className="ph-land__rowmeta">
                                        <span className="ph-land__pill">
                                            {currentGroup.role === 'admin' ? 'Quản trị viên' : 'Thành viên'}
                                        </span>
                                        {currentGroup.code ? <span className="ph-land__code">#{currentGroup.code}</span> : null}
                                    </span>
                                </span>
                            </span>
                            <span className="ph-land__arrow" aria-hidden="true"><ChevronIcon /></span>
                        </a>
                    </section>
                )}

                {hasLoadedStoredGroup && (
                    <section className="ph-land__block" aria-labelledby="ph-land-start">
                        <h2 className="ph-land__blocktitle" id="ph-land-start">
                            <BoltIcon />
                            Bắt đầu
                        </h2>

                        <div className="ph-land__rows">
                            <button type="button" className="ph-land__row" onClick={() => setActiveModal('create')}>
                                <span className="ph-land__rowmain">
                                    <span className="ph-land__tile ph-land__tile--indigo" aria-hidden="true">
                                        <PlusIcon />
                                    </span>
                                    <span className="ph-land__rowtext">
                                        <strong>Tạo CLB mới</strong>
                                        <span className="ph-land__rowsub">Tạo CLB và quản lý quỹ minh bạch, sắp cặp đấu tự động</span>
                                    </span>
                                </span>
                                <span className="ph-land__arrow" aria-hidden="true"><ChevronIcon /></span>
                            </button>

                            <button type="button" className="ph-land__row" onClick={() => setActiveModal('join')}>
                                <span className="ph-land__rowmain">
                                    <span className="ph-land__tile ph-land__tile--cyan" aria-hidden="true">
                                        <KeyIcon />
                                    </span>
                                    <span className="ph-land__rowtext">
                                        <strong>Tham gia CLB</strong>
                                        <span className="ph-land__rowsub">Nhập mã CLB và mật khẩu để vào CLB</span>
                                    </span>
                                </span>
                                <span className="ph-land__arrow" aria-hidden="true"><ChevronIcon /></span>
                            </button>

                            <a className="ph-land__row" href="/dk">
                                <span className="ph-land__rowmain">
                                    <span className="ph-land__tile ph-land__tile--lime" aria-hidden="true">
                                        <TrophyIcon />
                                    </span>
                                    <span className="ph-land__rowtext">
                                        <strong>
                                            Khám phá giải đấu Pickleball
                                            <span className="ph-land__new">Mới</span>
                                        </strong>
                                        <span className="ph-land__rowsub">Xem giải đang mở đăng ký, ghép cặp và theo dõi kết quả trực tiếp</span>
                                    </span>
                                </span>
                                <span className="ph-land__arrow" aria-hidden="true"><ChevronIcon /></span>
                            </a>
                        </div>
                    </section>
                )}

                <section className="ph-land__features" aria-labelledby="ph-land-features">
                    <div className="ph-land__featurehead">
                        <h2 id="ph-land-features">Giải pháp toàn diện cho CLB Pickleball phong trào</h2>
                        <p>Chuẩn hoá quản lý — tối ưu thời gian trên sân thi đấu</p>
                    </div>

                    <div className="ph-land__featuregrid">
                        <article className="ph-land__feature">
                            <span className="ph-land__featureicon ph-land__featureicon--indigo" aria-hidden="true"><CoinIcon /></span>
                            <h3>Quản lý quỹ tự động với SePay</h3>
                            <p>Biến động số dư về thẳng ứng dụng qua mã QR, thu chi công khai và đối soát tức thì.</p>
                        </article>

                        <article className="ph-land__feature">
                            <span className="ph-land__featureicon ph-land__featureicon--gold" aria-hidden="true"><MedalIcon /></span>
                            <h3>BXH đóng góp minh bạch</h3>
                            <p>Vinh danh thành viên tích cực, bảng đóng góp cập nhật tự động theo từng kỳ quỹ.</p>
                        </article>

                        <article className="ph-land__feature">
                            <span className="ph-land__featureicon ph-land__featureicon--cyan" aria-hidden="true"><ShieldIcon /></span>
                            <h3>Bảo mật &amp; riêng tư</h3>
                            <p>Mỗi CLB một không gian riêng, phân quyền quản trị viên và thành viên bằng mã CLB kèm mật khẩu.</p>
                        </article>
                    </div>

                    <div className="ph-land__highlights">
                        <div className="ph-land__highlight">
                            <strong>Miễn phí</strong>
                            <span>Cho CLB phong trào</span>
                        </div>
                        <span className="ph-land__hairline" aria-hidden="true" />
                        <div className="ph-land__highlight">
                            <strong>Tự động</strong>
                            <span>Đối soát quỹ qua SePay</span>
                        </div>
                        <span className="ph-land__hairline" aria-hidden="true" />
                        <div className="ph-land__highlight">
                            <strong>Trực tiếp</strong>
                            <span>Tỉ số &amp; BXH cập nhật ngay</span>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="ph-land__footer">
                <p>
                    © {new Date().getFullYear()} <strong>PickHub Vietnam</strong>. Đồng hành xây dựng cộng đồng Pickleball
                    năng động và phát triển bền vững.
                </p>
            </footer>

            {activeModal === 'create' && (
                <Modal title="Tạo CLB mới" onClose={closeModal}>
                    {createdGroup ? (
                        <div className="teamfund-success">
                            <p className="teamfund-code-label">Mã CLB</p>
                            <strong className="teamfund-code">{createdGroup.group.code}</strong>
                            <img src={createdGroup.qrCodeDataUrl} alt={`QR tham gia CLB ${createdGroup.group.code}`} />
                            <p>Gửi mã CLB hoặc QR này cho thành viên.</p>
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
                                Tên CLB
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
                                    placeholder="CLB quản lý quỹ và thành viên"
                                    rows="3"
                                />
                            </label>
                            <label>
                                Mật khẩu quản trị
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
                                    {loading ? 'Đang tạo...' : 'Tạo CLB'}
                                </button>
                            </div>
                        </form>
                    )}
                </Modal>
            )}

            {activeModal === 'join' && (
                <Modal title="Tham gia CLB" onClose={closeModal}>
                    <form className="teamfund-form" onSubmit={handleJoinGroup}>
                        <FormError message={error} />
                        <label>
                            Mã CLB
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
                                {loading ? 'Đang vào...' : 'Vào CLB'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
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

function PaddleIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="6" y="2" width="12" height="14" rx="5" fill="currentColor" fillOpacity=".28" />
            <rect x="6" y="2" width="12" height="14" rx="5" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 16v6M10 22h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="15.4" cy="6.2" r="1.3" fill="currentColor" />
            <circle cx="9.6" cy="8.6" r="1.1" fill="currentColor" />
            <circle cx="13" cy="11.2" r="1.1" fill="currentColor" />
        </svg>
    );
}

function PeopleWalletIcon() {
    return (
        <svg viewBox="0 0 48 48" fill="none">
            <rect x="7" y="13" width="34" height="27" rx="7" fill="white" opacity=".96" />
            <path d="M14 26h20M14 32h12" stroke="#6F48C9" strokeWidth="3" strokeLinecap="round" />
            <circle cx="17" cy="16" r="4" fill="white" />
            <circle cx="24" cy="15" r="5" fill="white" />
            <circle cx="31" cy="16" r="4" fill="white" />
            <path d="M14 22c1.6-3.3 5.1-5.4 10-5.4s8.4 2.1 10 5.4" stroke="#6F48C9" strokeWidth="3" strokeLinecap="round" />
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

function BoltIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M13 10V3L4 14h7v7l9-11h-7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function CourtIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="2" />
            <path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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

function TrophyIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M12 14v4M8 21h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

function ChevronIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" clipRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.707-9.293a1 1 0 0 0-1.414-1.414L9 10.586 7.707 9.293a1 1 0 0 0-1.414 1.414l2 2a1 1 0 0 0 1.414 0l4-4Z" />
        </svg>
    );
}

function CoinIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
            <path d="M14.6 9.2c-.5-.6-1.5-1-2.6-1-1.7 0-3 .9-3 2s1.3 2 3 2 3 .9 3 2-1.3 2-3 2c-1.1 0-2.1-.4-2.6-1M12 6.5v11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

function MedalIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="15" r="6" stroke="currentColor" strokeWidth="2" />
            <path d="M9 9.5 6.5 3h11L15 9.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M12 13v4M10.5 15h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

function ShieldIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 3 4 6v6c0 4.4 3.3 8.2 8 9 4.7-.8 8-4.6 8-9V6l-8-3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
