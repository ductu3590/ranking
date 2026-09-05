'use client';

// Hành động chia sẻ cho kênh Zalo: copy link (có card Open Graph), xuất ảnh PNG
// và copy thông báo soạn sẵn. PickHub không gửi tin thay BTC — mọi thứ chỉ được
// đưa vào clipboard/tải về để BTC tự dán vào nhóm.
//
// Toàn bộ ảnh và text dựng từ snapshot công khai đang hiển thị trên trang, nên
// không thể chứa ghi chú nội bộ, liên hệ hay trạng thái xét duyệt.

import { useMemo, useState } from 'react';
import {
    buildShareText,
    buildShareUrl,
    renderShareImage,
    isShareableVisibility,
    SHARE_TEXT_VERSION,
} from '@/lib/tournament/share';
import { downloadShareImage, copyPlainText } from './shareCanvas';
import './share.css';

const IMAGE_KINDS = [
    { key: 'standings', label: 'Bảng xếp hạng' },
    { key: 'schedule_court', label: 'Lịch theo sân' },
    { key: 'schedule_club', label: 'Lịch theo CLB' },
    { key: 'draw', label: 'Kết quả bốc thăm' },
    { key: 'results', label: 'Kết quả trận' },
    { key: 'honors', label: 'Bảng vàng' },
    { key: 'card', label: 'Ảnh bìa giải' },
];

const TEXT_TEMPLATES = [
    { key: 'schedule', label: 'Lịch thi đấu sắp tới' },
    { key: 'result', label: 'Kết quả vừa chốt' },
    { key: 'call_to_court', label: 'Gọi trận vào sân' },
];

export default function ShareActions({ snapshot, divisionId = null, stageId = null }) {
    const [kind, setKind] = useState('standings');
    const [template, setTemplate] = useState('schedule');
    const [draft, setDraft] = useState('');
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');

    const visibility = snapshot?.tournament?.visibility;
    const shareable = isShareableVisibility(visibility);

    const shareUrl = useMemo(() => {
        if (!shareable) return '';
        try {
            const origin = typeof window !== 'undefined' ? window.location.origin : '';
            return buildShareUrl(snapshot, { baseUrl: origin, divisionId });
        } catch (error) {
            return '';
        }
    }, [snapshot, divisionId, shareable]);

    if (!snapshot || !snapshot.tournament) return null;

    if (!shareable) {
        return (
            <div className="v2share">
                <p className="v2share-hint">
                    Giải chưa công khai nên chưa chia sẻ được. Bật chế độ công khai trong phần cài đặt giải để tạo link, ảnh và thông báo.
                </p>
            </div>
        );
    }

    async function handleCopyLink() {
        setNotice('');
        try {
            await copyPlainText(shareUrl);
            setNotice('Đã sao chép link. Dán vào nhóm Zalo để hiện card giải.');
        } catch (error) {
            setNotice(error.message || 'Không sao chép được link.');
        }
    }

    async function handleExportImage() {
        setBusy(true);
        setNotice('');
        try {
            const image = renderShareImage(snapshot, kind, { divisionId, stageId });
            await downloadShareImage({
                svg: image.svg,
                width: image.width,
                height: image.height,
                filename: image.filename,
            });
            setNotice('Đã tạo ảnh PNG. Mở thư mục tải về rồi gửi vào nhóm Zalo.');
        } catch (error) {
            setNotice(error.message || 'Không xuất được ảnh.');
        } finally {
            setBusy(false);
        }
    }

    function openTextPanel(nextTemplate) {
        const key = nextTemplate || template;
        setTemplate(key);
        setNotice('');
        try {
            const built = buildShareText(snapshot, key, {
                divisionId, stageId, url: shareUrl,
            });
            setDraft(built.text);
            setOpen(true);
        } catch (error) {
            setNotice(error.message || 'Không tạo được thông báo.');
        }
    }

    async function handleCopyText() {
        try {
            await copyPlainText(draft);
            setNotice('Đã sao chép thông báo. Dán vào nhóm Zalo là xong.');
        } catch (error) {
            setNotice(error.message || 'Không sao chép được thông báo.');
        }
    }

    return (
        <div className="v2share">
            <div className="v2share-row">
                <button type="button" className="v2share-btn" onClick={handleCopyLink}>
                    Sao chép link
                </button>
                <button type="button" className="v2share-btn" onClick={() => openTextPanel()}>
                    Sao chép thông báo
                </button>
            </div>

            <div className="v2share-row">
                <select
                    className="v2share-select"
                    value={kind}
                    onChange={(event) => setKind(event.target.value)}
                    aria-label="Chọn ảnh cần xuất"
                >
                    {IMAGE_KINDS.map((item) => (
                        <option key={item.key} value={item.key}>{item.label}</option>
                    ))}
                </select>
                <button
                    type="button"
                    className="v2share-btn v2share-btn-primary"
                    onClick={handleExportImage}
                    disabled={busy}
                >
                    {busy ? 'Đang tạo ảnh...' : 'Xuất ảnh'}
                </button>
            </div>

            {open ? (
                <div className="v2share-panel">
                    <div className="v2share-row">
                        <select
                            className="v2share-select"
                            value={template}
                            onChange={(event) => openTextPanel(event.target.value)}
                            aria-label="Chọn mẫu thông báo"
                        >
                            {TEXT_TEMPLATES.map((item) => (
                                <option key={item.key} value={item.key}>{item.label}</option>
                            ))}
                        </select>
                        <span className="v2share-version">Mẫu {SHARE_TEXT_VERSION}</span>
                    </div>
                    <textarea
                        className="v2share-text"
                        value={draft}
                        rows={10}
                        onChange={(event) => setDraft(event.target.value)}
                        aria-label="Nội dung thông báo"
                    />
                    <div className="v2share-row">
                        <button type="button" className="v2share-btn v2share-btn-primary" onClick={handleCopyText}>
                            Sao chép
                        </button>
                        <button type="button" className="v2share-btn" onClick={() => setOpen(false)}>
                            Đóng
                        </button>
                    </div>
                </div>
            ) : null}

            {notice ? <p className="v2share-notice">{notice}</p> : null}
        </div>
    );
}
