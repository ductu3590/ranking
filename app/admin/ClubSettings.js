'use client';

import { useEffect, useState } from 'react';
import ClubSettingsNav from '@/components/pickhub/ClubSettingsNav';
import SepayConnect from '@/components/pickhub/SepayConnect';
import PhToast, { useToast } from '@/components/pickhub/PhToast';
import { notifyClubSettingsChanged, onClubSettingsChanged } from '@/lib/clubSettingsEvents';
import './club-settings.css';

export default function ClubSettings() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    // Ket qua thao tac hien bang toast noi giua-duoi man hinh. Truoc day la mot
    // banner o DAU trang: bam Luu o cuoi trang thi khong ai thay thong bao.
    const { toast, showToast, hideToast } = useToast();
    const [group, setGroup] = useState(null);
    const [qr, setQr] = useState({ joinUrl: '', qrCodeDataUrl: '' });
    const [form, setForm] = useState({ name: '', description: '', shameBadgesEnabled: true });
    const [logoUrl, setLogoUrl] = useState(null);
    const [fundQrUrl, setFundQrUrl] = useState(null);
    const [passwordForm, setPasswordForm] = useState({ next: '', confirm: '' });
    const [changingPassword, setChangingPassword] = useState(false);
    const [memberPasswordForm, setMemberPasswordForm] = useState({ next: '', confirm: '' });
    const [changingMemberPassword, setChangingMemberPassword] = useState(false);
    const [bankAccounts, setBankAccounts] = useState([]);
    const [bankForm, setBankForm] = useState({ accountNumber: '' });

    useEffect(() => {
        loadSettings();
        loadBankAccounts();
    }, []);

    // Phan SePay nam trong component rieng; khi no ket noi xong thi badge o tieu
    // de va danh sach tai khoan o day phai doi theo, khong bat admin F5.
    // loadSettings/loadBankAccounts khong phat su kien nen khong co vong lap.
    useEffect(() => onClubSettingsChanged(() => {
        loadSettings({ silent: true });
        loadBankAccounts();
    }), []);

    // silent=true: tai lai ngam khi co su kien cai dat doi. KHONG bat loading,
    // vi bat loading se thay ca cay con bang mot div "Dang tai" -> SepayConnect
    // bi unmount va mat sach state (dang o buoc nao cua wizard).
    async function loadSettings({ silent = false } = {}) {
        if (!silent) setLoading(true);
        const res = await fetch('/api/club/settings');
        const data = await res.json();
        if (res.ok) {
            setGroup(data.group);
            setQr({ joinUrl: data.joinUrl, qrCodeDataUrl: data.qrCodeDataUrl });
            setForm({
                name: data.group.name || '',
                description: data.group.description || '',
                shameBadgesEnabled: data.group.shame_badges_enabled !== false,
            });
            setLogoUrl(data.group.logo_url || null);
            setFundQrUrl(data.group.fund_qr_url || null);
        } else {
            showToast(data.error || 'Không tải được cài đặt.', 'error');
        }
        if (!silent) setLoading(false);
    }

    async function handleSave(event) {
        event.preventDefault();
        setSaving(true);
                showToast('');
        const payload = {
            name: form.name,
            description: form.description,
            logoUrl,
            shameBadgesEnabled: form.shameBadgesEnabled,
        };
        const res = await fetch('/api/club/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok) {
            setGroup(data.group);
            window.dispatchEvent(new Event('branding-updated'));
            notifyClubSettingsChanged();
            showToast('Đã lưu thay đổi.');
        } else {
            showToast(data.error || 'Không lưu được.', 'error');
        }
        setSaving(false);
    }

    async function handleChangeMemberPassword(event) {
        event.preventDefault();
                showToast('');
        if (memberPasswordForm.next.length < 4) {
            showToast('Mật khẩu thành viên cần ít nhất 4 ký tự.', 'error');
            return;
        }
        if (memberPasswordForm.next !== memberPasswordForm.confirm) {
            showToast('Hai lần nhập mật khẩu thành viên không khớp.', 'error');
            return;
        }
        setChangingMemberPassword(true);
        const res = await fetch('/api/club/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memberPassword: memberPasswordForm.next }),
        });
        const data = await res.json();
        setChangingMemberPassword(false);
        if (res.ok) {
            setMemberPasswordForm({ next: '', confirm: '' });
            showToast('Đã đặt mật khẩu thành viên mới. Hãy gửi lại mã CLB và mật khẩu cho cả nhóm.');
        } else {
            showToast(data.error || 'Không đặt được mật khẩu thành viên.', 'error');
        }
    }

    function handlePickFundQr(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const MAX = 640;
                const scale = Math.min(1, MAX / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                // PNG chu khong WebP: QR nen mat du lieu bi ro canh, may quet doc loi.
                const dataUrl = canvas.toDataURL('image/png');
                if (dataUrl.length > 280000) {
                    showToast('Ảnh QR quá lớn, hãy chọn ảnh nhỏ hơn 200KB.', 'error');
                    return;
                }
                                setFundQrUrl(dataUrl);
                showToast('Đã chọn ảnh QR, bấm "Lưu QR" để áp dụng.');
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    }

    async function handleSaveFundQr(nextValue) {
                showToast('');
        const res = await fetch('/api/club/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fundQrUrl: nextValue }),
        });
        const data = await res.json();
        if (res.ok) {
            setGroup(data.group);
            setFundQrUrl(data.group.fund_qr_url || null);
            notifyClubSettingsChanged();
            showToast(nextValue ? 'Đã lưu ảnh QR nhận quỹ.' : 'Đã xoá ảnh QR nhận quỹ.');
        } else {
            showToast(data.error || 'Không lưu được ảnh QR.', 'error');
        }
    }

    async function loadBankAccounts() {
        const res = await fetch('/api/club/bank-accounts');
        const data = await res.json();
        if (res.ok) setBankAccounts(data.accounts || []);
    }

    async function handleAddBank(event) {
        event.preventDefault();
        if (!bankForm.accountNumber.trim()) return;
                showToast('');
        const res = await fetch('/api/club/bank-accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountNumber: bankForm.accountNumber }),
        });
        const data = await res.json();
        if (res.ok) {
            setBankAccounts((prev) => [...prev, data.account]);
            setBankForm({ accountNumber: '' });
            notifyClubSettingsChanged();
            showToast('Đã thêm tài khoản ngân hàng.');
        } else {
            showToast(data.error || 'Không thêm được tài khoản.', 'error');
        }
    }

    async function handleDeleteBank(id) {
        if (!confirm('Xóa tài khoản ngân hàng này khỏi thu quỹ tự động?')) return;
        const res = await fetch(`/api/club/bank-accounts?id=${id}`, { method: 'DELETE' });
        if (res.ok) {
            setBankAccounts((prev) => prev.filter((a) => a.id !== id));
            notifyClubSettingsChanged();
            showToast('Đã xoá tài khoản ngân hàng.');
        }
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
                    showToast('Logo quá lớn sau khi nén, hãy chọn ảnh đơn giản hơn.', 'error');
                    return;
                }
                                setLogoUrl(dataUrl);
                showToast('Đã chọn logo, bấm "Lưu thay đổi" để áp dụng.');
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    }

    async function handleChangePassword(event) {
        event.preventDefault();
                showToast('');
        if (passwordForm.next.length < 6) {
            showToast('Mật khẩu đăng nhập cần ít nhất 6 ký tự.', 'error');
            return;
        }
        if (passwordForm.next !== passwordForm.confirm) {
            showToast('Mật khẩu xác nhận không khớp.', 'error');
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
            showToast(data.error || 'Không đổi được mật khẩu.', 'error');
        } else {
            setPasswordForm({ next: '', confirm: '' });
            showToast('Đã đổi mật khẩu đăng nhập admin.');
        }
        setChangingPassword(false);
    }

    if (loading) {
        return <div className="club-settings-loading">Đang tải cài đặt...</div>;
    }
    if (!group) {
        return <div className="club-settings-error">Không tải được cài đặt CLB. Vui lòng tải lại trang.</div>;
    }

    return (
        <div className="club-settings">
            <PhToast toast={toast} onClose={hideToast} />
            <ClubSettingsNav />


            <div className="club-settings__grid">
                <div className="club-settings__left">
                    <section className="set-group" id="set-brand">
                        <SettingsCardHeading title="Nhận diện thương hiệu" description="Tên hiển thị, phần giới thiệu và logo câu lạc bộ" badge="Cơ bản" />
                        <form className="club-settings-form" onSubmit={handleSave}>
                            <label>Tên CLB<input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required /></label>
                            <label>Mô tả<textarea rows="3" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></label>
                            <label>Huy hiệu &quot;Trắng tay&quot; trên BXH<select value={form.shameBadgesEnabled ? 'on' : 'off'} onChange={(e) => setForm((p) => ({ ...p, shameBadgesEnabled: e.target.value === 'on' }))}><option value="on">Bật — nêu tên người chưa đóng nhiều kỳ liền</option><option value="off">Tắt — không nêu tên ai</option></select><small>Giúp nhắc thành viên hoàn thành quỹ đúng kỳ hạn.</small></label>
                            <div className="club-settings-logo"><span>Logo CLB</span><div className="club-settings-logo-row">{logoUrl ? <img className="club-settings-logo-preview" src={logoUrl} alt="Logo CLB" /> : <span className="club-settings-logo-empty">Chưa có logo</span>}<div className="club-settings-logo-actions"><label className="club-settings-logo-pick">Chọn ảnh<input type="file" accept="image/*" onChange={handleLogoFile} hidden /></label>{logoUrl && <button type="button" className="club-settings-logo-remove" onClick={() => { setLogoUrl(null); showToast('Đã bỏ logo, bấm "Lưu thay đổi" để áp dụng.'); }}>Xóa logo</button>}</div></div></div>
                            <div className="club-settings-card__action"><button type="submit" className="club-settings-save" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu thay đổi nhận diện'}</button></div>
                        </form>
                    </section>
                </div>
                <div className="club-settings__right">
                    <section className="set-group" id="set-code"><SettingsCardHeading title="Mã CLB & QR tham gia" description="Mã định danh duy nhất cho toàn bộ thành viên" badge="Đang kích hoạt" /><div className="club-settings-code"><label>Mã CLB<input value={group.code} readOnly tabIndex={-1} /></label>{qr.qrCodeDataUrl && <img src={qr.qrCodeDataUrl} alt={`QR tham gia ${group.code}`} />}<p className="set-note">Mã CLB là định danh cố định. Chỉ superadmin đổi trực tiếp trong Supabase; việc đổi mã sẽ đăng xuất các phiên đang truy cập.</p></div></section>
                    <section className="set-group" id="set-qr"><SettingsCardHeading title="QR nhận quỹ thành viên" description="Hiển thị ở trang Tổng quan quỹ để thành viên quét nộp" /><div className="set-qr-row">{fundQrUrl ? <img className="set-qr-preview" src={fundQrUrl} alt="QR nhận quỹ CLB" /> : <span className="set-qr-empty">Chưa có ảnh QR</span>}<div className="set-qr-side"><label>Ảnh QR (PNG/JPG, tối đa 200KB)<input type="file" accept="image/png,image/jpeg" onChange={handlePickFundQr} /></label><div className="set-qr-actions"><button type="button" className="ph-btn ph-btn--primary ph-btn--sm" onClick={() => handleSaveFundQr(fundQrUrl)} disabled={!fundQrUrl}>Lưu QR</button><button type="button" className="ph-btn ph-btn--danger ph-btn--sm" onClick={() => handleSaveFundQr(null)} disabled={!group.fund_qr_url}>Xoá QR</button></div><small>Sau khi tải lên, QR sẽ tự động hiện ở giao diện nộp quỹ tháng của CLB.</small></div></div></section>
                </div>
            </div>
            <section className="set-group club-settings__security"><SettingsCardHeading title="Mật khẩu & phân quyền" description="Bảo mật tài khoản quản trị và mã vào cho thành viên" badge="Bảo mật CLB" /><div className="club-settings__password-grid"><form className="club-settings-account" id="set-pw-admin" onSubmit={handleChangePassword}><h3>1. Mật khẩu quản trị viên</h3><p>Đổi mật khẩu đăng nhập tài khoản quản trị của bạn.</p><label>Mật khẩu mới<input type="password" value={passwordForm.next} onChange={(e) => setPasswordForm((p) => ({ ...p, next: e.target.value }))} minLength="6" placeholder="••••••" /></label><label>Xác nhận mật khẩu<input type="password" value={passwordForm.confirm} onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))} minLength="6" placeholder="••••••" /></label><button type="submit" className="club-settings-save" disabled={changingPassword}>{changingPassword ? 'Đang đổi...' : 'Đổi mật khẩu quản trị'}</button></form><form className="club-settings-account" id="set-pw-member" onSubmit={handleChangeMemberPassword}><h3>2. Mật khẩu thành viên chung</h3><p>Mật khẩu dùng chung khi thành viên truy cập qua mã CLB.</p><label>Mật khẩu mới<input type="password" value={memberPasswordForm.next} onChange={(e) => setMemberPasswordForm((p) => ({ ...p, next: e.target.value }))} minLength="4" placeholder="••••" /></label><label>Xác nhận mật khẩu<input type="password" value={memberPasswordForm.confirm} onChange={(e) => setMemberPasswordForm((p) => ({ ...p, confirm: e.target.value }))} minLength="4" placeholder="••••" /></label><button type="submit" className="club-settings-save" disabled={changingMemberPassword}>{changingMemberPassword ? 'Đang đổi...' : 'Đổi mật khẩu thành viên'}</button></form></div></section>
            <div className="club-settings__automation">
                <section className="set-group" id="set-sepay"><SettingsCardHeading title="Auto Quỹ — tiền vào tự động lên sổ" description="Ai chuyển tiền vào quỹ là PickHub ghi sổ và gán đúng tên" badge={group.hasSepayWebhookSecret ? 'Đã bật khoá bảo mật' : 'Chưa kết nối'} /><SepayConnect /></section>
                <section className="set-group" id="set-bank"><SettingsCardHeading title="Tài khoản ngân hàng" description="Định tuyến biến động số dư cho thu quỹ tự động" /><p className="set-note set-note--warn">Đây không phải thông tin hiển thị thành viên quét. Webhook SePay tra đúng số tài khoản này để biết tiền vào thuộc CLB nào; nhập sai thì quỹ không cập nhật tự động.</p><div className="club-settings-bank"><span className="club-settings-bank-title">Tài khoản đang liên kết</span>{bankAccounts.length > 0 ? <ul className="club-settings-bank-list">{bankAccounts.map((a) => <li key={a.id}><span><strong className="bank-acc-number">{a.account_number}</strong>{a.bank_name && <small className="bank-acc-name">{a.bank_name}</small>}</span><button type="button" className="bank-acc-del" onClick={() => handleDeleteBank(a.id)}>Xóa</button></li>)}</ul> : <p className="club-settings-bank-empty">Chưa có tài khoản nào, thu quỹ tự động đang tắt.</p>}<form className="club-settings-bank-form" onSubmit={handleAddBank}><label>Thêm tài khoản thu quỹ mới<input value={bankForm.accountNumber} onChange={(e) => setBankForm((p) => ({ ...p, accountNumber: e.target.value }))} placeholder="Số tài khoản" /></label><button type="submit">Thêm tài khoản</button></form></div></section>
            </div>
        </div>
    );
}

function SettingsCardHeading({ title, description, badge }) {
    return <header className="club-settings-card__heading"><div><h2>{title}</h2><p>{description}</p></div>{badge && <span>{badge}</span>}</header>;
}
