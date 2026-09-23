'use client';

// Phat QR nhan quy cho ca nhom — PickHub tu sinh, khong bat admin sang SePay
// copy tay (anh Tu chot: dam bao QR van "di qua SePay" bang cach ghep dung tu
// group_bank_accounts.account_number — chinh so ma app/api/webhook/route.js
// dung de dinh tuyen CLB).
//
// Component nay CHI fetch qua API route, khong goi Supabase tu browser.
//
// SUA VONG 4: sau khi bo muc "QR nhan quy thanh vien" (#set-qr) trong
// ClubSettings.js, component nay chi con mount MOT LAN duy nhat, ben trong
// SepayConnect.js (man da ket noi). Van giu useId() va onClubSettingsChanged:
// useId de an toan neu sau nay lai co nhu cau mount them noi khac; con
// onClubSettingsChanged van co ich vi trang /admin co section #set-bank quan
// ly tai khoan ngan hang ngay canh — them/xoa tai khoan o do phai lam
// FundQrShare tu tai lai, khong doi F5.
//
// SUA VONG 4 (anh Tu chot): bo nut "Chia se len Zalo/Messenger" va "Sao chep
// loi nhan" — thay bang mot khoi goi y tinh ben duoi 2 nut con lai ("Tai anh
// QR" + "Sao chep anh"), huong dan sao chep anh roi ghim vao nhom Zalo CLB.
// Cau nhac "ghi HO TEN trong noi dung chuyen khoan" BAT BUOC phai con — day
// la cho DUY NHAT con nhac dieu nay sau khi bo nut sao chep loi nhan, va
// lib/transaction-parser.js gan ten nguoi nop bang cach quet chinh noi dung
// chuyen khoan do.

import { useEffect, useId, useMemo, useState } from 'react';
import { notifyClubSettingsChanged, onClubSettingsChanged } from '@/lib/clubSettingsEvents';
import fundQr from '@/lib/fundQr';
import './FundQrShare.css';

const { FUND_QR_BANKS, maskAccountNumber } = fundQr;

async function dataUrlToBlob(dataUrl) {
    const res = await fetch(dataUrl);
    return res.blob();
}

export default function FundQrShare() {
    const uid = useId();
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [copiedImage, setCopiedImage] = useState(false);
    const [accounts, setAccounts] = useState([]);
    const [selectedAccountId, setSelectedAccountId] = useState(null);
    const [fundQrUrl, setFundQrUrl] = useState(null);
    const [accountMeta, setAccountMeta] = useState(null);
    const [forceSetup, setForceSetup] = useState(false);
    const [bankCode, setBankCode] = useState('');
    const [accountHolder, setAccountHolder] = useState('');

    async function load({ silent = false } = {}) {
        if (!silent) setLoading(true);
        try {
            const [accRes, qrRes] = await Promise.all([
                fetch('/api/club/bank-accounts', { cache: 'no-store' }),
                fetch('/api/club/fund-qr', { cache: 'no-store' }),
            ]);
            const accData = await accRes.json();
            const qrData = await qrRes.json();
            const activeAccounts = (accData.accounts || []).filter((a) => a.is_active);
            setAccounts(activeAccounts);
            // Giu lua chon hien tai neu con hop le (tranh nhay ve tai khoan cu
            // nhat moi lan mot thay doi cai dat KHAC o /admin phat su kien).
            setSelectedAccountId((prevId) => {
                const stillValid = activeAccounts.some((a) => String(a.id) === String(prevId));
                return stillValid ? prevId : (activeAccounts[0]?.id ?? null);
            });
            setFundQrUrl(qrData.fundQrUrl || null);
        } catch {
            setError('Không tải được dữ liệu tài khoản quỹ.');
        } finally {
            if (!silent) setLoading(false);
        }
    }

    useEffect(() => { load(); }, []);

    // Tu tai lai khi mot thay doi cai dat khac tren /admin xay ra (vd them/xoa
    // tai khoan ngan hang o section #set-bank) — khong bat admin F5.
    useEffect(() => onClubSettingsChanged(() => load({ silent: true })), []);

    const selectedAccount = useMemo(
        () => accounts.find((a) => String(a.id) === String(selectedAccountId)) || null,
        [accounts, selectedAccountId],
    );

    // Dong bo form chon ngan hang theo tai khoan dang chon — chi chay lai khi
    // DOI tai khoan (id thay doi), khong ghi de moi lan admin tu go lai.
    useEffect(() => {
        if (!selectedAccount) return;
        setBankCode(selectedAccount.bank_code || '');
        setAccountHolder(selectedAccount.account_holder || '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedAccount?.id]);

    // Chi canh bao "tai khoan da doi" khi tai khoan dang chon CHUA co bank_code
    // VA co it nhat MOT tai khoan khac da tung duoc cau hinh (bank_code khac
    // rong). Neu chi kiem "fundQrUrl ton tai + bank_code rong", MOI CLB chua
    // tung dung tinh nang nay se bi canh bao SAI (bank_code la cot moi, luon
    // NULL cho toi khi ai do generate lan dau).
    const hasOtherConfiguredAccount = accounts.some(
        (a) => String(a.id) !== String(selectedAccount?.id) && Boolean(a.bank_code),
    );
    const accountMismatch = Boolean(fundQrUrl) && Boolean(selectedAccount) && !selectedAccount.bank_code && hasOtherConfiguredAccount;

    async function handleGenerate(event) {
        event.preventDefault();
        if (!selectedAccount) return;
        if (!bankCode) { setError('Chọn ngân hàng của tài khoản quỹ.'); return; }
        setBusy(true);
        setError('');
        try {
            const res = await fetch('/api/club/fund-qr/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId: selectedAccount.id, bankCode, accountHolder }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Không tạo được mã QR.');
                return;
            }
            setFundQrUrl(data.fundQrUrl);
            setAccountMeta(data.account || null);
            setForceSetup(false);
            notifyClubSettingsChanged();
        } catch {
            setError('Không kết nối được máy chủ.');
        } finally {
            setBusy(false);
        }
    }

    async function handleCopyImage() {
        setError('');
        try {
            const blob = await dataUrlToBlob(fundQrUrl);
            await navigator.clipboard.write([new window.ClipboardItem({ [blob.type || 'image/png']: blob })]);
            setCopiedImage(true);
            window.setTimeout(() => setCopiedImage(false), 1800);
        } catch {
            setError('Trình duyệt không cho sao chép ảnh, hãy bấm Tải ảnh QR.');
        }
    }

    const canClipboardImage = typeof window !== 'undefined' && typeof window.ClipboardItem === 'function';

    if (loading) {
        return <p className="fqs__loading">Đang tải dữ liệu QR nhận quỹ…</p>;
    }

    // ---------------------------------------------------- chua co tai khoan ---
    if (accounts.length === 0) {
        return (
            <div className="fqs">
                <div className="fqs__empty">
                    <span aria-hidden="true">🏦</span>
                    <div>
                        <b>Chưa có tài khoản quỹ</b>
                        <p>Kết nối Auto Quỹ với SePay trước — PickHub cần biết đúng số tài khoản để tạo mã QR.</p>
                    </div>
                </div>
                <div className="fqs__actions">
                    <a className="ph-btn ph-btn--outline" href="#set-sepay">Đi tới Auto Quỹ</a>
                </div>
            </div>
        );
    }

    const showSetupForm = forceSetup || !fundQrUrl;

    // --------------------------------------------------------- man chon NH ---
    if (showSetupForm) {
        return (
            <div className="fqs">
                {accountMismatch && (
                    <div className="fqs__warn">
                        <span aria-hidden="true">⚠️</span>
                        <div>Tài khoản quỹ đã đổi, hãy tạo lại QR để đúng số tài khoản mới.</div>
                    </div>
                )}
                <form className="fqs__form" onSubmit={handleGenerate}>
                    {accounts.length > 1 && (
                        <div className="fqs__field">
                            <label className="fqs__label" htmlFor={`${uid}-account`}>Tài khoản quỹ</label>
                            <select
                                id={`${uid}-account`}
                                className="fqs__select"
                                value={selectedAccountId ?? ''}
                                onChange={(e) => {
                                    const acc = accounts.find((a) => String(a.id) === e.target.value);
                                    setSelectedAccountId(acc?.id ?? null);
                                }}
                            >
                                {accounts.map((a) => (
                                    <option key={a.id} value={a.id}>{maskAccountNumber(a.account_number)}{a.bank_name ? ` · ${a.bank_name}` : ''}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="fqs__field">
                        <span className="fqs__label">Số tài khoản quỹ</span>
                        <p className="fqs__accno">{selectedAccount ? maskAccountNumber(selectedAccount.account_number) : '—'}</p>
                    </div>

                    <div className="fqs__field">
                        <label className="fqs__label" htmlFor={`${uid}-bank`}>Ngân hàng của tài khoản quỹ</label>
                        <select
                            id={`${uid}-bank`}
                            className="fqs__select"
                            value={bankCode}
                            onChange={(e) => setBankCode(e.target.value)}
                            required
                        >
                            <option value="">— Chọn ngân hàng —</option>
                            {FUND_QR_BANKS.map((b) => (
                                <option key={b.code} value={b.code}>{b.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="fqs__field">
                        <label className="fqs__label" htmlFor={`${uid}-holder`}>Tên chủ tài khoản (không bắt buộc)</label>
                        <input
                            id={`${uid}-holder`}
                            className="fqs__input"
                            type="text"
                            value={accountHolder}
                            onChange={(e) => setAccountHolder(e.target.value)}
                            placeholder="VD: NGUYEN VAN A"
                        />
                    </div>

                    <p className="fqs__hintline">
                        PickHub tạo QR từ đúng tài khoản SePay đang theo dõi, nên tiền vào vẫn tự lên sổ.
                    </p>

                    {error && <p className="fqs__error">{error}</p>}
                    <div className="fqs__actions">
                        <button type="submit" className="ph-btn ph-btn--primary" disabled={busy}>
                            {busy ? 'Đang tạo…' : 'Tạo mã QR nhận quỹ'}
                        </button>
                        {fundQrUrl && (
                            <button type="button" className="ph-btn ph-btn--ghost" onClick={() => setForceSetup(false)}>
                                Quay lại QR hiện có
                            </button>
                        )}
                    </div>
                </form>
            </div>
        );
    }

    // ------------------------------------------------------------ da co QR ---
    const maskedAccount = accountMeta?.accountNumberMasked
        || (selectedAccount ? maskAccountNumber(selectedAccount.account_number) : '—');
    const bankLabel = accountMeta?.bankName || selectedAccount?.bank_name || '—';

    return (
        <div className="fqs">
            {accountMismatch && (
                <div className="fqs__warn">
                    <span aria-hidden="true">⚠️</span>
                    <div>Tài khoản quỹ đã đổi, hãy tạo lại QR để đúng số tài khoản mới.</div>
                </div>
            )}

            <div className="fqs__preview">
                <img className="fqs__img" src={fundQrUrl} alt="QR nhận quỹ CLB" />
                <div className="fqs__warnbox">
                    <span aria-hidden="true">⚠</span>
                    <span>Chỉ tiền chuyển vào tài khoản <b>{maskedAccount}</b> · <b>{bankLabel}</b> mới được ghi sổ tự động.</span>
                </div>
            </div>

            {error && <p className="fqs__error">{error}</p>}

            <div className="fqs__actions">
                <a className="ph-btn ph-btn--primary" href={fundQrUrl} download="qr-quy-clb.png">
                    Tải ảnh QR
                </a>
                {canClipboardImage && (
                    <button type="button" className="ph-btn ph-btn--outline" onClick={handleCopyImage}>
                        {copiedImage ? 'Đã chép ✓' : 'Sao chép ảnh'}
                    </button>
                )}
            </div>

            {/* Goi y cach phat QR — thay cho nut "Chia se Zalo/Messenger" va
                "Sao chep loi nhan" da bo. Cau nhac ghi HO TEN la BAT BUOC:
                lib/transaction-parser.js gan ten nguoi nop bang cach quet
                noi dung chuyen khoan, thieu ten thi roi vao "Unknown". */}
            <div className="fqs__tip">
                <span aria-hidden="true">📌</span>
                <div>
                    Sao chép ảnh QR (hoặc tải về) rồi dán vào nhóm Zalo của CLB, <b>ghim lên đầu</b> để mọi người dễ thấy.
                    <br />
                    ⚠️ Nhắc thành viên <b>ghi HỌ TÊN của mình</b> trong nội dung chuyển khoản — thiếu tên thì hệ thống không gán được ai đã nộp. Chỉ tiền chuyển đúng vào tài khoản trong QR này mới tự động lên sổ.
                </div>
            </div>

            <div className="fqs__actions fqs__actions--secondary">
                <button type="button" className="fqs__muted" onClick={() => setForceSetup(true)}>Tạo lại QR</button>
            </div>
        </div>
    );
}
