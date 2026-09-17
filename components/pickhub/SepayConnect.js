'use client';

// Auto Quy — ket noi SePay.
//
// Nam trang thai, tach han man GIOI THIEU (thuyet phuc, khong o nhap nao) khoi
// man THIET LAP (vao viec). Tron hai thu lam hong ca hai.
//
// Xac minh bang chuc nang "Gui thu" cua SePay: khong ai phai chuyen tien that.
// Payload "Gui thu" la payload MAU nen khong dung de tu phat hien so tai khoan
// — admin xac nhan so tai khoan o buoc 1, ho biet so nay.

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { notifyClubSettingsChanged } from '@/lib/clubSettingsEvents';
import './SepayConnect.css';

const AFFILIATE_URL = 'https://my.sepay.vn/register?gcid=1008';
const PROMO_URL = 'https://sepay.vn/khuyen-mai';
const PRICING_URL = 'https://sepay.vn/bang-gia.html';
const FREE_QUOTA = 50;

const BENEFITS = [
    ['Tiền vào là tự lên sổ.', 'Không phải gõ tay dòng nào.'],
    ['Tự gán đúng tên người nộp.', 'PickHub đọc nội dung chuyển khoản và khớp với danh sách thành viên.'],
    ['Thủ quỹ hết phải đối chiếu.', 'Không cần mở app ngân hàng dò từng khoản nữa.'],
    ['Cả CLB tự xem được.', 'Ai đã nộp, ai chưa, quỹ còn bao nhiêu — công khai, không ai phải hỏi.'],
    ['Miễn phí.', `Gói miễn phí của SePay được ${FREE_QUOTA} giao dịch mỗi tháng.`],
];

const PREP_STEPS = [
    ['🏦', 'Tài khoản ngân hàng riêng của quỹ',
        'Một tài khoản mới, đứng tên thủ quỹ, chỉ dùng cho quỹ CLB. Mở ngay trên app ngân hàng, khoảng 5 phút, miễn phí.'],
    ['📱', 'Tài khoản SePay',
        'SePay là dịch vụ báo cho PickHub biết khi có tiền vào tài khoản. Đăng ký bằng số điện thoại.'],
    ['🎁', 'Gói dịch vụ',
        `Đăng ký xong là mặc định gói miễn phí — ${FREE_QUOTA} giao dịch mỗi tháng, liên kết được mọi ngân hàng SePay hỗ trợ. Không phải làm gì thêm, trừ khi muốn xem có khuyến mãi tốt hơn.`],
    ['🔌', 'Liên kết tài khoản ngân hàng vào SePay',
        'Trong SePay vào menu Ngân hàng → Kết nối mới, chọn ngân hàng của quỹ rồi làm theo hướng dẫn. Chưa làm bước này thì SePay không thấy tiền vào, và ô Tài khoản khi tạo webhook sẽ trống.'],
    ['🔗', 'Kết nối SePay với PickHub',
        'Copy hai dòng chữ từ PickHub dán sang SePay, rồi bấm một nút. Có ảnh chụp màn hình từng bước.'],
];

// Chi so buoc trong PREP_STEPS de gan nut/badge — tranh so magic rai rac.
const STEP_SEPAY_SIGNUP = 1;
const STEP_CHOOSE_PLAN = 2;
const STEP_LINK_BANK = 3;
const STEP_CONNECT_PICKHUB = 4;

function formatClock(seconds) {
    const s = Math.max(0, Number(seconds) || 0);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function timeAgo(iso) {
    if (!iso) return null;
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    return `${Math.floor(hours / 24)} ngày trước`;
}

// Bon buoc cua luong thiet lap. Tach "Lien ket ngan hang" thanh mot buoc rieng
// vi no la mat xich bat buoc: chua lam thi o Tai khoan khi tao webhook se trong.
const SETUP_STEPS = ['Tài khoản quỹ', 'Liên kết ngân hàng', 'Khai báo với SePay', 'Bấm Gửi thử'];

function SetupStepper({ current }) {
    return (
        <div className="ph-stepper" aria-label="Tiến trình kết nối SePay">
            {SETUP_STEPS.map((label, i) => (
                <Fragment key={label}>
                    <span className={`ph-stepchip ${i === current ? 'is-active' : i < current ? 'is-done' : ''}`}>
                        <span className="ph-stepchip__n">{i < current ? '✓' : i + 1}</span>
                        {label}
                    </span>
                    {i < SETUP_STEPS.length - 1 && <span className={`ph-stepline ${i < current ? 'is-done' : ''}`} />}
                </Fragment>
            ))}
        </div>
    );
}

function CopyRow({ label, value, hint, id }) {
    const [copied, setCopied] = useState(false);
    async function copy() {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
        } catch { /* trinh duyet chan: admin tu boi den copy */ }
    }
    return (
        <div className="spc__field">
            <label className="spc__label" htmlFor={id}>{label}</label>
            <div className="spc__copyrow">
                <code id={id}>{value}</code>
                <button type="button" className="ph-btn ph-btn--outline" onClick={copy}>
                    {copied ? 'Đã chép ✓' : 'Sao chép'}
                </button>
            </div>
            {hint && <p className="spc__hintline">{hint}</p>}
        </div>
    );
}

export default function SepayConnect() {
    const [data, setData] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    // 'intro' = man gioi thieu, 'setup' = da bam bat dau ket noi
    const [screen, setScreen] = useState('intro');
    const [accountNumber, setAccountNumber] = useState('');
    const [tick, setTick] = useState(0);
    const pollRef = useRef(null);

    const prevStatusRef = useRef(null);
    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/club/sepay/verify', { cache: 'no-store' });
            if (!res.ok) return null;
            const payload = await res.json();
            setData(payload);
            // Poll vua phat hien ket noi thanh cong: bao de badge o tieu de va
            // thanh "Thiet lap CLB" doi ngay, khong cho admin F5.
            const nextStatus = payload?.verify?.status;
            if (prevStatusRef.current && prevStatusRef.current !== nextStatus && nextStatus === 'connected') {
                notifyClubSettingsChanged();
            }
            prevStatusRef.current = nextStatus;
            return payload;
        } catch {
            return null;
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const status = data?.verify?.status || 'idle';

    // Poll khi dang cho tin hieu; dung ngay khi co ket qua.
    useEffect(() => {
        if (status !== 'waiting') {
            if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
            return undefined;
        }
        pollRef.current = window.setInterval(() => { setTick((t) => t + 1); load(); }, 3000);
        return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
    }, [status, load]);

    async function call(method, body) {
        setBusy(true);
        setError('');
        try {
            const res = await fetch('/api/club/sepay/verify', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: body ? JSON.stringify(body) : undefined,
            });
            const payload = await res.json();
            if (!res.ok) { setError(payload.error || 'Không thực hiện được, thử lại giúp em.'); return null; }
            setData(payload);
            notifyClubSettingsChanged();
            return payload;
        } catch {
            setError('Không kết nối được máy chủ.');
            return null;
        } finally {
            setBusy(false);
        }
    }

    // Sang buoc khai bao: sinh khoa bao mat nhung CHUA mo cua so kiem tra —
    // admin con phai tao webhook ben SePay, mo cua so tu bay gio thi 10 phut
    // het truoc khi ho lam xong.
    async function goToDeclare() {
        const payload = await call('POST', { startVerify: false });
        if (payload) setScreen('declare');
    }

    async function saveAccountAndStart() {
        const value = accountNumber.trim();
        if (!value) { setError('Nhập số tài khoản ngân hàng của quỹ CLB.'); return; }
        setBusy(true);
        setError('');
        try {
            const res = await fetch('/api/club/bank-accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountNumber: value }),
            });
            const payload = await res.json();
            if (!res.ok) {
                setError(res.status === 409
                    ? 'Số tài khoản này đã được một CLB khác đăng ký. Mỗi số tài khoản chỉ thuộc về một CLB. Nếu đây đúng là tài khoản của CLB bạn, vui lòng liên hệ hỗ trợ.'
                    : (payload.error || 'Không lưu được số tài khoản.'));
                return;
            }
            setAccountNumber('');
        } catch {
            setError('Không kết nối được máy chủ.');
            return;
        } finally {
            setBusy(false);
        }
        setScreen('linkbank');
    }

    if (!data) return <p className="spc__loading">Đang tải trạng thái kết nối…</p>;

    const { webhook, bankAccounts, connection, verify } = data;
    const hasAccount = (bankAccounts || []).length > 0;

    // ---------------------------------------------------------- da ket noi ---
    if (status === 'connected') {
        const account = bankAccounts[0];
        const quotaPercent = Math.min(100, Math.round((connection.monthlyCount / FREE_QUOTA) * 100));
        const nearLimit = connection.monthlyCount >= FREE_QUOTA * 0.8;
        const lastAgo = timeAgo(connection.lastTransactionAt);
        const staleDays = connection.lastTransactionAt
            ? Math.floor((Date.now() - new Date(connection.lastTransactionAt).getTime()) / 86400000)
            : null;
        const stale = staleDays !== null && staleDays >= 14;

        return (
            <div className="spc">
                <div className="spc__ok">
                    <span className="spc__ok-emo" aria-hidden="true">✅</span>
                    <div>
                        <b>Đã kết nối!</b>
                        <span>
                            Tài khoản {account?.accountNumberMasked || '—'}
                            {account?.bankName ? ` · ${account.bankName}` : ''}
                            {verify.lastSignalAt ? ` · nhận tín hiệu thử ${timeAgo(verify.lastSignalAt)}` : ''}
                        </span>
                    </div>
                </div>

                <div className="spc__grid2">
                    <div className={`spc__stat ${nearLimit ? 'is-warn' : ''}`}>
                        <span className="spc__stat-lab">Hạn mức gói miễn phí tháng này</span>
                        <span className="spc__stat-val">{connection.monthlyCount} / {FREE_QUOTA} giao dịch</span>
                        <div className={`spc__quota ${nearLimit ? 'is-warn' : ''}`}><i style={{ width: `${quotaPercent}%` }} /></div>
                        <span className="spc__stat-sub">
                            {nearLimit
                                ? <>Sắp chạm hạn mức. Ba cách: <b>gộp kỳ thu</b> (thu theo quý thay vì theo tháng), xem <a href={PROMO_URL} target="_blank" rel="noreferrer">khuyến mãi đang chạy ↗</a>, hoặc <a href={PRICING_URL} target="_blank" rel="noreferrer">nâng gói ↗</a>.</>
                                : <>Gói miễn phí vẫn đủ cho CLB bạn. Vượt {FREE_QUOTA} thì SePay vẫn chạy, chỉ phát sinh phí theo giao dịch.</>}
                        </span>
                    </div>

                    <div className={`spc__stat ${stale ? 'is-bad' : ''}`}>
                        <span className="spc__stat-lab">Sức khoẻ kết nối</span>
                        <span className="spc__stat-val">{lastAgo || 'Chưa có giao dịch'}</span>
                        <span className="spc__stat-sub">
                            {stale
                                ? <>⚠ Đã {staleDays} ngày không nhận giao dịch nào. Khai báo bên SePay có thể đã bị xoá, hoặc khoá bảo mật đã bị đổi.</>
                                : lastAgo
                                    ? <>✅ Giao dịch gần nhất nhận được từ SePay — kết nối đang chạy tốt.</>
                                    : <>Chưa có giao dịch nào đi qua. Khi có người chuyển tiền vào quỹ, nó sẽ hiện ở đây.</>}
                        </span>
                    </div>
                </div>

                {error && <p className="spc__error">{error}</p>}
                <div className="spc__actions">
                    <button type="button" className="ph-btn ph-btn--outline" disabled={busy} onClick={() => call('POST', {})}>
                        Kiểm tra lại kết nối
                    </button>
                </div>
            </div>
        );
    }

    // ------------------------------------------------- dang cho / het gio ---
    if (status === 'waiting' || status === 'expired') {
        const expired = status === 'expired';
        return (
            <div className="spc">
                <SetupStepper current={3} />

                {expired ? (
                    <div className="spc__errbox">
                        <span aria-hidden="true">⏰</span>
                        <div>
                            <b>Chưa nhận được tín hiệu nào từ SePay.</b>
                            {verify.error?.message}
                        </div>
                    </div>
                ) : (
                    <>
                        <CopyRow
                            id="spc-url"
                            label="Địa chỉ nhận giao dịch của CLB bạn"
                            value={webhook.url}
                            hint={<>Dán vào ô <b>URL</b> khi thêm webhook trong SePay.</>}
                        />
                        <CopyRow
                            id="spc-secret"
                            label="Khoá bảo mật (PickHub đã sinh sẵn cho bạn)"
                            value={webhook.secret || webhook.secretMasked}
                            hint={<>⚠ Khoá này chỉ hiện trong lúc thiết lập. Dán vào ô <b>Secret</b> và chọn kiểu xác thực <b>HMAC-SHA256</b> trong SePay.</>}
                        />

                        <ol className="spc__guide">
                            <li>Mở <b>my.sepay.vn</b> → menu <b>Tích hợp WebHooks</b> → nút <b>Thêm webhook</b>.</li>
                            <li>Dán <b>Địa chỉ nhận giao dịch</b> ở trên vào ô <b>URL</b>.</li>
                            <li>Ở mục <b>Kiểu xác thực</b>, chọn <b>HMAC-SHA256</b> rồi dán <b>Khoá bảo mật</b> vào ô <b>Secret</b>.</li>
                            <li>
                                Ở mục <b>Tài khoản</b>, chọn đúng tài khoản quỹ{bankAccounts[0] ? <> (<b>{bankAccounts[0].accountNumberMasked}</b>)</> : null} —
                                <u> đừng để &ldquo;Tất cả tài khoản&rdquo;</u>. Ở mục <b>Giao dịch</b> chọn <b>Có tiền vào</b>. Bấm <b>Lưu</b>.
                            </li>
                            <li>Quay lại danh sách webhook, mở menu <b>⋮</b> ở dòng vừa tạo rồi bấm <b>Gửi thử</b>.</li>
                        </ol>

                        <div className="spc__wait">
                            <span className="spc__wait-cap">Việc cuối cùng</span>
                            <p className="spc__wait-title">Bấm &ldquo;Gửi thử&rdquo; trong SePay</p>
                            <p className="spc__wait-note">
                                Tín hiệu này <b>miễn phí</b> và <b>không tạo giao dịch nào</b> trong sổ quỹ.
                            </p>
                            <a className="ph-btn ph-btn--primary" href="https://my.sepay.vn" target="_blank" rel="noreferrer">
                                Mở SePay ở tab mới ↗
                            </a>
                            <div className="spc__countdown">
                                <span>Cửa sổ kiểm tra còn</span>
                                <span className="spc__clock">{formatClock(verify.secondsRemaining - tick * 3)}</span>
                                <span className="spc__countdown-note">· hết giờ thì bấm kiểm tra lại, không mất gì</span>
                            </div>
                        </div>

                        {verify.hint && (
                            <div className="spc__hintbox">
                                <span aria-hidden="true">💡</span>
                                <div>{verify.hint}</div>
                            </div>
                        )}
                    </>
                )}

                {error && <p className="spc__error">{error}</p>}
                <div className="spc__actions">
                    {expired
                        ? <button type="button" className="ph-btn ph-btn--primary" disabled={busy} onClick={() => call('POST', {})}>Kiểm tra lại</button>
                        : <button type="button" className="ph-btn ph-btn--outline" disabled>⏳ Đang chờ tín hiệu…</button>}
                    <button type="button" className="ph-btn ph-btn--ghost" disabled={busy} onClick={() => call('DELETE')}>
                        {expired ? 'Đóng' : 'Huỷ'}
                    </button>
                </div>
            </div>
        );
    }

    // -------------------------------------------- buoc 2: lien ket ngan hang ---
    if (screen === 'linkbank') {
        return (
            <div className="spc">
                <SetupStepper current={1} />

                <div className="spc__prereq">
                    <span aria-hidden="true">🔌</span>
                    <div>
                        <b>Liên kết tài khoản ngân hàng của quỹ vào SePay</b>
                        Chưa làm bước này thì SePay không nhìn thấy tiền vào tài khoản, và ô <b>Tài khoản</b> khi
                        tạo webhook ở bước sau sẽ trống.
                    </div>
                </div>

                <ol className="spc__guide">
                    <li>Mở <b>my.sepay.vn</b> → menu <b>Ngân hàng</b>.</li>
                    <li>Bấm <b>Kết nối mới</b>, chọn ngân hàng của tài khoản quỹ{bankAccounts[0] ? <> (<b>{bankAccounts[0].accountNumberMasked}</b>)</> : null}.</li>
                    <li>Làm theo hướng dẫn của SePay để xác thực tài khoản.</li>
                    <li>Xong thì tài khoản hiện trong danh sách với nhãn <b>Đã kết nối</b>.</li>
                </ol>

                <div className="spc__shot">
                    [ Ảnh: màn hình Ngân hàng của SePay, khoanh đỏ nút &ldquo;Kết nối mới&rdquo; ]
                    <br />public/images/sepay/00-ket-noi-ngan-hang.png
                </div>

                <p className="spc__note">
                    Gói miễn phí liên kết được mọi ngân hàng nằm trong danh sách SePay hỗ trợ.
                </p>

                {error && <p className="spc__error">{error}</p>}
                <div className="spc__actions">
                    <a className="ph-btn ph-btn--outline" href="https://my.sepay.vn/bank-account" target="_blank" rel="noreferrer">
                        Mở mục Ngân hàng ↗
                    </a>
                    <button type="button" className="ph-btn ph-btn--primary" disabled={busy} onClick={goToDeclare}>
                        Tôi đã liên kết xong →
                    </button>
                    <button type="button" className="ph-btn ph-btn--ghost" onClick={() => setScreen('setup')}>Quay lại</button>
                </div>
            </div>
        );
    }

    // ------------------------------------------- buoc 3: khai bao voi SePay ---
    if (screen === 'declare') {
        return (
            <div className="spc">
                <SetupStepper current={2} />

                <CopyRow
                    id="spc-url"
                    label="Địa chỉ nhận giao dịch của CLB bạn"
                    value={webhook.url}
                    hint={<>Dán vào ô <b>URL</b> khi thêm webhook trong SePay.</>}
                />
                <CopyRow
                    id="spc-secret"
                    label="Khoá bảo mật (PickHub đã sinh sẵn cho bạn)"
                    value={webhook.secret || webhook.secretMasked}
                    hint={<>⚠ Khoá này chỉ hiện trong lúc thiết lập. Dán vào ô <b>Secret</b> và chọn kiểu xác thực <b>HMAC-SHA256</b> trong SePay.</>}
                />

                <ol className="spc__guide">
                    <li>Mở <b>my.sepay.vn</b> → menu <b>Tích hợp WebHooks</b> → nút <b>Thêm webhook</b>.</li>
                    <li>Dán <b>Địa chỉ nhận giao dịch</b> ở trên vào ô <b>URL</b>.</li>
                    <li>Ở mục <b>Kiểu xác thực</b>, chọn <b>HMAC-SHA256</b> rồi dán <b>Khoá bảo mật</b> vào ô <b>Secret</b>.</li>
                    <li>
                        Ở mục <b>Tài khoản</b>, chọn đúng tài khoản quỹ{bankAccounts[0] ? <> (<b>{bankAccounts[0].accountNumberMasked}</b>)</> : null} —
                        <u> đừng để &ldquo;Tất cả tài khoản&rdquo;</u>. Ở mục <b>Giao dịch</b> chọn <b>Có tiền vào</b>. Bấm <b>Lưu</b>.
                    </li>
                </ol>

                <p className="spc__note">
                    Bấm nút bên dưới khi đã lưu webhook. PickHub sẽ mở cửa sổ chờ 10 phút để nhận tín hiệu thử.
                </p>

                {error && <p className="spc__error">{error}</p>}
                <div className="spc__actions">
                    <button type="button" className="ph-btn ph-btn--primary" disabled={busy} onClick={() => call('POST', { startVerify: true })}>
                        Tôi đã khai báo xong →
                    </button>
                    <button type="button" className="ph-btn ph-btn--ghost" onClick={() => setScreen('linkbank')}>Quay lại</button>
                </div>
            </div>
        );
    }

    // ------------------------------------------------------- man thiet lap ---
    if (screen === 'setup') {
        return (
            <div className="spc">
                <SetupStepper current={0} />

                {hasAccount ? (
                    <div className="spc__field">
                        <span className="spc__label">Số tài khoản ngân hàng của quỹ CLB</span>
                        <p className="spc__saved">✅ Đã lưu: <b>{bankAccounts[0].accountNumberMasked}</b></p>
                        <p className="spc__hintline">Đây phải đúng là tài khoản bạn sẽ liên kết với SePay.</p>
                    </div>
                ) : (
                    <div className="spc__field">
                        <label className="spc__label" htmlFor="spc-acc">Số tài khoản ngân hàng của quỹ CLB</label>
                        <input
                            id="spc-acc"
                            className="spc__input"
                            type="text"
                            inputMode="numeric"
                            value={accountNumber}
                            onChange={(e) => setAccountNumber(e.target.value)}
                            placeholder="Nhập số tài khoản"
                        />
                        <p className="spc__hintline">Copy từ app ngân hàng cho chắc. Số này chỉ dùng để PickHub biết tiền vào là của CLB bạn.</p>
                    </div>
                )}

                <div className="spc__free">
                    <h3>Chưa có tài khoản SePay?</h3>
                    <ul className="spc__benefits">
                        <li><span className="spc__check" aria-hidden="true">✓</span><span>Gói miễn phí: <b>{FREE_QUOTA} giao dịch mỗi tháng</b>.</span></li>
                        <li><span className="spc__check" aria-hidden="true">✓</span><span>Tiền vào quỹ <b>tự động lên sổ</b>, không phải gõ tay.</span></li>
                        <li><span className="spc__check" aria-hidden="true">✓</span><span>Vượt {FREE_QUOTA} vẫn chạy bình thường, chỉ phát sinh phí theo giao dịch.</span></li>
                    </ul>
                    <p className="spc__freenote">SePay hay đổi chính sách và có đợt khuyến mãi — ngó qua trước khi đăng ký.</p>
                    <div className="spc__freeactions">
                        <a className="ph-btn ph-btn--primary" href={AFFILIATE_URL} target="_blank" rel="noreferrer">Đăng ký SePay miễn phí ↗</a>
                        <a className="ph-btn ph-btn--outline" href={PROMO_URL} target="_blank" rel="noreferrer">🎁 Xem khuyến mãi ↗</a>
                        <a className="spc__muted" href={PRICING_URL} target="_blank" rel="noreferrer">Xem bảng giá</a>
                    </div>
                </div>

                {error && <p className="spc__error">{error}</p>}
                <div className="spc__actions">
                    <button
                        type="button"
                        className="ph-btn ph-btn--primary"
                        disabled={busy}
                        onClick={hasAccount ? () => setScreen('linkbank') : saveAccountAndStart}
                    >
                        Tiếp tục →
                    </button>
                    <button type="button" className="ph-btn ph-btn--ghost" onClick={() => setScreen('intro')}>Quay lại</button>
                </div>
            </div>
        );
    }

    // --------------------------------------------------- man gioi thieu ---
    return (
        <div className="spc">
            <div className="spc__pitch">
                <h2>Để PickHub tự ghi sổ quỹ giúp bạn</h2>
                <ul className="spc__benefits">
                    {BENEFITS.map(([strong, rest]) => (
                        <li key={strong}>
                            <span className="spc__check" aria-hidden="true">✓</span>
                            <span><b>{strong}</b> {rest}</span>
                        </li>
                    ))}
                </ul>
                <div className="spc__pills">
                    <span className="spc__pill">⏱️ Khoảng 10 phút</span>
                    <span className="spc__pill">🙂 Không cần biết kỹ thuật</span>
                    <span className="spc__pill">↩️ Sai thì làm lại được</span>
                </div>
            </div>

            <ol className="spc__prep">
                {PREP_STEPS.map(([icon, title, desc], index) => (
                    <li key={title} className="spc__prepitem">
                        <span className="spc__prepfig" aria-hidden="true">{icon}<i>{index + 1}</i></span>
                        <div className="spc__prepbody">
                            <h3>{title}</h3>
                            <p>{desc}</p>
                        </div>
                        <div className="spc__prepside">
                            {index === 0 && <span className="ph-badge ph-badge--muted">Làm ở app ngân hàng</span>}
                            {index === STEP_SEPAY_SIGNUP && <a className="ph-btn ph-btn--primary ph-btn--sm" href={AFFILIATE_URL} target="_blank" rel="noreferrer">Đăng ký SePay ↗</a>}
                            {index === STEP_CHOOSE_PLAN && <a className="ph-btn ph-btn--outline ph-btn--sm" href={PROMO_URL} target="_blank" rel="noreferrer">Xem khuyến mãi ↗</a>}
                            {index === STEP_LINK_BANK && <a className="ph-btn ph-btn--outline ph-btn--sm" href="https://my.sepay.vn/bank-account" target="_blank" rel="noreferrer">Mở mục Ngân hàng ↗</a>}
                            {index === STEP_CONNECT_PICKHUB && <span className="ph-badge">PickHub lo phần này</span>}
                        </div>
                    </li>
                ))}
            </ol>

            {error && <p className="spc__error">{error}</p>}
            <div className="spc__actions">
                <button type="button" className="ph-btn ph-btn--primary" onClick={() => setScreen('setup')}>
                    Bạn đã có tài khoản ngân hàng? Bắt đầu kết nối →
                </button>
            </div>
            <p className="spc__note">Chưa có cũng không sao — đóng lại lúc nào cũng được, PickHub nhớ bạn đang làm tới đâu.</p>
        </div>
    );
}
