'use client';

import { useEffect, useState } from 'react';
import './club-settings.css';

export default function ClubSettings() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [group, setGroup] = useState(null);
    const [qr, setQr] = useState({ joinUrl: '', qrCodeDataUrl: '' });
    const [form, setForm] = useState({ name: '', description: '', memberPassword: '' });
    const [logoUrl, setLogoUrl] = useState(null);
    const [passwordForm, setPasswordForm] = useState({ next: '', confirm: '' });
    const [changingPassword, setChangingPassword] = useState(false);
    const [bankAccounts, setBankAccounts] = useState([]);
    const [bankForm, setBankForm] = useState({ accountNumber: '', bankName: '' });
    const [sepayForm, setSepayForm] = useState({ sepayWebhookSecret: '' });
    const [webhookUrl, setWebhookUrl] = useState('');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setWebhookUrl(`${window.location.origin}/api/webhook`);
        }
        loadSettings();
        loadBankAccounts();
    }, []);

    async function loadSettings() {
        setLoading(true);
        const res = await fetch('/api/club/settings');
        const data = await res.json();
        if (res.ok) {
            setGroup(data.group);
            setQr({ joinUrl: data.joinUrl, qrCodeDataUrl: data.qrCodeDataUrl });
            setForm({ name: data.group.name || '', description: data.group.description || '', memberPassword: '' });
            setLogoUrl(data.group.logo_url || null);
            setSepayForm({ sepayWebhookSecret: '' });
        } else {
            setError(data.error || 'Không tải được cài đặt.');
        }
        setLoading(false);
    }

    async function handleSave(event) {
        event.preventDefault();
        setSaving(true);
        setError('');
        setNotice('');
        const payload = { name: form.name, description: form.description, logoUrl };
        if (form.memberPassword) payload.memberPassword = form.memberPassword;
        const res = await fetch('/api/club/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok) {
            setGroup(data.group);
            setForm((prev) => ({ ...prev, memberPassword: '' }));
            window.dispatchEvent(new Event('branding-updated'));
            setNotice('Đã lưu thay đổi.');
        } else {
            setError(data.error || 'Không lưu được.');
        }
        setSaving(false);
    }

    async function handleRegenerate() {
        if (!confirm('Tạo lại mã nhóm? Mã và mã QR cũ sẽ NGỪNG hoạt động. Bạn cần gửi mã mới cho thành viên.')) return;
        setSaving(true);
        setError('');
        setNotice('');
        const res = await fetch('/api/club/settings/regenerate-code', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
            setGroup((prev) => ({ ...prev, code: data.code }));
            setQr({ joinUrl: data.joinUrl, qrCodeDataUrl: data.qrCodeDataUrl });
            setNotice('Đã tạo mã mới. Hãy gửi lại cho thành viên.');
        } else {
            setError(data.error || 'Không tạo lại được mã.');
        }
        setSaving(false);
    }

    async function loadBankAccounts() {
        const res = await fetch('/api/club/bank-accounts');
        const data = await res.json();
        if (res.ok) setBankAccounts(data.accounts || []);
    }

    async function handleAddBank(event) {
        event.preventDefault();
        if (!bankForm.accountNumber.trim()) return;
        setError('');
        setNotice('');
        const res = await fetch('/api/club/bank-accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountNumber: bankForm.accountNumber, bankName: bankForm.bankName }),
        });
        const data = await res.json();
        if (res.ok) {
            setBankAccounts((prev) => [...prev, data.account]);
            setBankForm({ accountNumber: '', bankName: '' });
            setNotice('Đã thêm tài khoản ngân hàng.');
        } else {
            setError(data.error || 'Không thêm được tài khoản.');
        }
    }

    async function copyWebhookUrl() {
        try {
            await navigator.clipboard.writeText(webhookUrl);
            setNotice('Đã sao chép URL webhook.');
        } catch {
            setError('Không sao chép được, hãy copy thủ công.');
        }
    }

    async function handleDeleteBank(id) {
        if (!confirm('Xóa tài khoản ngân hàng này khỏi thu quỹ tự động?')) return;
        const res = await fetch(`/api/club/bank-accounts?id=${id}`, { method: 'DELETE' });
        if (res.ok) {
            setBankAccounts((prev) => prev.filter((a) => a.id !== id));
        }
    }

    async function handleSaveSepaySecret(event) {
        event.preventDefault();
        const secret = sepayForm.sepayWebhookSecret.trim();
        if (secret.length < 16) {
            setError('Secret webhook SePay cần ít nhất 16 ký tự.');
            return;
        }
        setSaving(true);
        setError('');
        setNotice('');
        const res = await fetch('/api/club/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sepayWebhookSecret: secret }),
        });
        const data = await res.json();
        if (res.ok) {
            setGroup(data.group);
            setSepayForm({ sepayWebhookSecret: '' });
            setNotice('Đã lưu secret webhook SePay cho CLB.');
        } else {
            setError(data.error || 'Không lưu được secret webhook SePay.');
        }
        setSaving(false);
    }

    async function handleClearSepaySecret() {
        if (!confirm('Tắt xác thực HMAC-SHA256 cho webhook SePay của CLB này?')) return;
        setSaving(true);
        setError('');
        setNotice('');
        const res = await fetch('/api/club/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clearSepayWebhookSecret: true }),
        });
        const data = await res.json();
        if (res.ok) {
            setGroup(data.group);
            setSepayForm({ sepayWebhookSecret: '' });
            setNotice('Đã tắt xác thực webhook SePay cho CLB.');
        } else {
            setError(data.error || 'Không tắt được xác thực webhook SePay.');
        }
        setSaving(false);
    }

    function handleLogoFile(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const MAX = 256;
                const scale = Math.min(1, MAX / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                let dataUrl = canvas.toDataURL('image/webp', 0.8);
                if (!dataUrl.startsWith('data:image/webp')) {
                    dataUrl = canvas.toDataURL('image/png');
                }
                if (dataUrl.length > 100000) {
                    setError('Logo quá lớn sau khi nén, hãy chọn ảnh đơn giản hơn.');
                    return;
                }
                setError('');
                setLogoUrl(dataUrl);
                setNotice('Đã chọn logo, bấm "Lưu thay đổi" để áp dụng.');
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    }

    async function handleChangePassword(event) {
        event.preventDefault();
        setError('');
        setNotice('');
        if (passwordForm.next.length < 6) {
            setError('Mật khẩu đăng nhập cần ít nhất 6 ký tự.');
            return;
        }
        if (passwordForm.next !== passwordForm.confirm) {
            setError('Mật khẩu xác nhận không khớp.');
            return;
        }
        setChangingPassword(true);
        const res = await fetch('/api/club/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminPassword: passwordForm.next }),
        });
        if (!res.ok) {
            const data = await res.json();
            setError(data.error || 'Không đổi được mật khẩu.');
        } else {
            setPasswordForm({ next: '', confirm: '' });
            setNotice('Đã đổi mật khẩu đăng nhập admin.');
        }
        setChangingPassword(false);
    }

    if (loading) {
        return <div className="club-settings-loading">Đang tải cài đặt...</div>;
    }
    if (!group) {
        return <div className="club-settings-error">{error || 'Không có dữ liệu.'}</div>;
    }

    return (
        <div className="club-settings">
            {error && <p className="club-settings-msg error">{error}</p>}
            {notice && <p className="club-settings-msg ok">{notice}</p>}

            <form className="club-settings-form" onSubmit={handleSave}>
                <label>
                    Tên CLB
                    <input
                        value={form.name}
                        onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                        required
                    />
                </label>
                <label>
                    Mô tả
                    <textarea
                        rows="3"
                        value={form.description}
                        onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    />
                </label>
                <label>
                    Đổi mật khẩu thành viên (để trống nếu không đổi)
                    <input
                        type="password"
                        value={form.memberPassword}
                        onChange={(e) => setForm((p) => ({ ...p, memberPassword: e.target.value }))}
                        minLength="4"
                        placeholder="••••"
                    />
                </label>
                <div className="club-settings-logo">
                    <span className="club-settings-logo-label">Logo CLB</span>
                    <div className="club-settings-logo-row">
                        {logoUrl ? (
                            <img className="club-settings-logo-preview" src={logoUrl} alt="Logo CLB" />
                        ) : (
                            <span className="club-settings-logo-empty">Chưa có logo</span>
                        )}
                        <div className="club-settings-logo-actions">
                            <label className="club-settings-logo-pick">
                                Chọn ảnh
                                <input type="file" accept="image/*" onChange={handleLogoFile} hidden />
                            </label>
                            {logoUrl && (
                                <button
                                    type="button"
                                    className="club-settings-logo-remove"
                                    onClick={() => { setLogoUrl(null); setNotice('Đã bỏ logo, bấm "Lưu thay đổi" để áp dụng.'); }}
                                >
                                    Xóa logo
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                <button type="submit" className="club-settings-save" disabled={saving}>
                    {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
            </form>

            <div className="club-settings-code">
                <p className="club-settings-code-label">Mã nhóm</p>
                <strong className="club-settings-code-value">{group.code}</strong>
                {qr.qrCodeDataUrl && (
                    <img src={qr.qrCodeDataUrl} alt={`QR tham gia ${group.code}`} />
                )}
                <button type="button" className="club-settings-regen" onClick={handleRegenerate} disabled={saving}>
                    Tạo lại mã
                </button>
            </div>

            <form className="club-settings-account" onSubmit={handleChangePassword}>
                <p className="club-settings-account-title">Tài khoản đăng nhập</p>
                <p className="club-settings-account-hint">Đổi mật khẩu đăng nhập admin của bạn.</p>
                <label>
                    Mật khẩu mới
                    <input
                        type="password"
                        value={passwordForm.next}
                        onChange={(e) => setPasswordForm((p) => ({ ...p, next: e.target.value }))}
                        minLength="6"
                        placeholder="••••••"
                    />
                </label>
                <label>
                    Xác nhận mật khẩu
                    <input
                        type="password"
                        value={passwordForm.confirm}
                        onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))}
                        minLength="6"
                        placeholder="••••••"
                    />
                </label>
                <button type="submit" className="club-settings-save" disabled={changingPassword}>
                    {changingPassword ? 'Đang đổi...' : 'Đổi mật khẩu'}
                </button>
            </form>

            <div className="club-settings-sepay">
                <p className="club-settings-bank-title">Thu quỹ tự động qua SePay</p>
                <p className="club-settings-bank-hint">
                    Kết nối SePay để mọi chuyển khoản vào tài khoản ngân hàng của CLB tự động được ghi nhận vào quỹ.
                    Nếu không cấu hình SePay, trưởng nhóm cần tự tạo giao dịch thu/chi thủ công ở tab Quỹ.
                </p>
                <ol className="club-settings-sepay-steps">
                    <li>
                        Tạo tài khoản tại{' '}
                        <a href="https://my.sepay.vn" target="_blank" rel="noreferrer">SePay</a>{' '}
                        và liên kết tài khoản ngân hàng của CLB.
                    </li>
                    <li>
                        Trong SePay: vào <strong>Webhooks → Thêm webhook</strong>, dán URL bên dưới,
                        nếu muốn bảo mật thì chọn <strong>HMAC-SHA256</strong> và nhập cùng secret với
                        <strong> Secret webhook riêng của CLB</strong> ở bên dưới. Nếu chọn không bảo mật,
                        hãy để trống secret trong app.
                    </li>
                    <li>
                        Chọn loại giao dịch và tài khoản là <em>Tất cả</em>, bấm <strong>Gửi thử</strong> để kiểm tra.
                    </li>
                    <li>Khai đúng số tài khoản ngân hàng đó vào mục &quot;Tài khoản ngân hàng&quot; bên dưới.</li>
                </ol>
                <div className="club-settings-sepay-url">
                    <code>{webhookUrl}</code>
                    <button type="button" onClick={copyWebhookUrl}>Sao chép</button>
                </div>
                <a
                    className="club-settings-sepay-doc"
                    href="https://developer.sepay.vn/vi/sepay-webhooks/bat-dau-nhanh"
                    target="_blank"
                    rel="noreferrer"
                >
                    Xem hướng dẫn chi tiết của SePay ↗
                </a>
                <form className="club-settings-bank-form" onSubmit={handleSaveSepaySecret}>
                    <input
                        value={sepayForm.sepayWebhookSecret}
                        onChange={(e) => setSepayForm({ sepayWebhookSecret: e.target.value })}
                        placeholder={group.hasSepayWebhookSecret ? 'Đã có secret, nhập secret mới nếu muốn đổi' : 'Secret webhook riêng của CLB (tùy chọn)'}
                    />
                    <button type="submit" disabled={saving}>Lưu secret</button>
                    {group.hasSepayWebhookSecret && (
                        <button type="button" onClick={handleClearSepaySecret} disabled={saving}>
                            Tắt bảo mật
                        </button>
                    )}
                </form>
            </div>

            <div className="club-settings-bank">
                <p className="club-settings-bank-title">Tài khoản ngân hàng (thu quỹ tự động)</p>
                <p className="club-settings-bank-hint">
                    Khai số tài khoản nhận tiền của CLB. Chuyển khoản vào tài khoản này sẽ tự động ghi nhận vào quỹ CLB.
                </p>
                {bankAccounts.length > 0 ? (
                    <ul className="club-settings-bank-list">
                        {bankAccounts.map((a) => (
                            <li key={a.id}>
                                <span className="bank-acc-number">{a.account_number}</span>
                                {a.bank_name && <span className="bank-acc-name">{a.bank_name}</span>}
                                <button type="button" className="bank-acc-del" onClick={() => handleDeleteBank(a.id)}>
                                    Xóa
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="club-settings-bank-empty">Chưa có tài khoản nào, thu quỹ tự động đang tắt.</p>
                )}
                <form className="club-settings-bank-form" onSubmit={handleAddBank}>
                    <input
                        value={bankForm.accountNumber}
                        onChange={(e) => setBankForm((p) => ({ ...p, accountNumber: e.target.value }))}
                        placeholder="Số tài khoản"
                    />
                    <input
                        value={bankForm.bankName}
                        onChange={(e) => setBankForm((p) => ({ ...p, bankName: e.target.value }))}
                        placeholder="Tên ngân hàng (tùy chọn)"
                    />
                    <button type="submit">Thêm</button>
                </form>
            </div>
        </div>
    );
}
