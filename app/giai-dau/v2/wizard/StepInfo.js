// Bước 2: Thông tin giải — tên, slug link chia sẻ (tự sinh từ tên), mô tả, poster.

import { slugify } from './utils';

export default function StepInfo({ info, setInfo }) {
    return (
        <div className="w3-formwrap">
            <div className="v2-field">
                <label htmlFor="w3-tname">Tên giải</label>
                <input
                    id="w3-tname"
                    value={info.name}
                    onChange={(e) => setInfo((c) => ({ ...c, name: e.target.value, slug: slugify(e.target.value) }))}
                    placeholder="Giải CLB mùa hè 2026"
                />
            </div>
            <div className="w3-block">
                <p className="v2-field-label" style={{ fontSize: '0.72rem', color: 'var(--w3-muted)', fontWeight: 700, margin: '0 0 6px' }}>Link chia sẻ riêng</p>
                <div className="w3-urlrow">
                    <span className="w3-pfx">pickhub.vn/giai/</span>
                    <input value={info.slug} onChange={(e) => setInfo((c) => ({ ...c, slug: e.target.value }))} aria-label="Slug link chia sẻ" />
                </div>
                <p className="w3-hint" style={{ marginTop: 8 }}>Link gọn để dán vào nhóm Zalo. Đổi được, phải là duy nhất.</p>
            </div>
            <div className="w3-block">
                <div className="v2-field">
                    <label htmlFor="w3-desc">Mô tả</label>
                    <textarea id="w3-desc" value={info.description} onChange={(e) => setInfo((c) => ({ ...c, description: e.target.value }))} placeholder="Thể lệ ngắn, giải thưởng, liên hệ BTC…" rows={3} />
                </div>
            </div>
            <div className="w3-block">
                <p className="v2-field-label" style={{ fontSize: '0.72rem', color: 'var(--w3-muted)', fontWeight: 700, margin: '0 0 6px' }}>Poster giải</p>
                <div className="w3-banner">📷 Bấm để tải poster · gợi ý 1200×630 · dùng làm ảnh khi chia sẻ Zalo</div>
            </div>
        </div>
    );
}
