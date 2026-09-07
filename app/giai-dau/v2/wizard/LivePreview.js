// Xem trước sống (bước 1): dựng bố cục lịch từ kết quả previewSchedule của
// engine, mobile-first. Thuần trình bày — không hook, không fetch.

import { chunkPairs } from './utils';

export default function LivePreview({ fmt, unit, scope, eff, bestOf, subGames, labels, preview, loading, error }) {
    const uw = unit === 'team' ? 'đội' : scope !== 'internal' ? 'CLB' : unit === 'don' ? 'người' : 'cặp';
    const labelFor = (id) => (id ? (labels[id - 1] || `#${id}`) : '—');
    const scopeNote = eff === 'team' ? '◈ BXH theo đội' : eff === 'club' ? '◈ BXH theo CLB' : '◈ BXH cá nhân';

    if (error) {
        return <div className="w3-state w3-state-error">{error}</div>;
    }
    if (loading && !preview) {
        return <div className="w3-state">Đang dựng xem trước lịch…</div>;
    }
    if (!preview) {
        return <div className="w3-state">Chưa có dữ liệu xem trước.</div>;
    }

    const matches = preview.matches || [];
    const n = labels.length;

    // Ghi chú MLP / cộng điểm CLB.
    const topNote = unit === 'team' ? (
        <div className="w3-mlpnote">Mỗi trận là <b style={{ fontWeight: 600 }}>trận đội {subGames} ván con</b>{subGames === 5 ? ' — MLP: đôi nữ, đôi nam, 2 mix, DreamBreaker.' : '.'}</div>
    ) : eff === 'club' ? (
        <div className="w3-mlpnote">Trận thường ({bestOf === 1 ? '1 ván' : `BO${bestOf}`}); điểm dồn về CLB.</div>
    ) : null;

    let title;
    let body;

    if (fmt === 'rr') {
        title = `Vòng tròn · ${n} ${uw} · ${matches.length} trận`;
        body = (
            <>
                {topNote}
                {matches.slice(0, 6).map((m, i) => (
                    <div key={i} className="w3-match">
                        <span className="w3-r">{i + 1}</span>
                        {labelFor(m.a)} <span className="w3-vs">vs</span> {labelFor(m.b)}
                    </div>
                ))}
                {matches.length > 6 ? <div className="w3-match" style={{ color: 'var(--w3-muted)' }}>+{matches.length - 6} trận…</div> : null}
            </>
        );
    } else if (fmt === 'se' || fmt === 'de') {
        title = `${fmt === 'de' ? 'Loại trực tiếp 2 nhánh' : 'Loại trực tiếp 1 nhánh'} · ${n} ${uw}`;
        const round1 = matches.filter((m) => Number(m.round) === 1);
        const seeds = round1.length ? round1 : chunkPairs(labels.map((_, i) => i + 1)).map(([a, b]) => ({ a, b: b || null }));
        body = (
            <>
                {topNote}
                <div className="w3-bracket">
                    <div className="w3-col">
                        <div className="w3-clbl">Nhánh thắng · V1</div>
                        {seeds.map((m, i) => (
                            <div key={i} className="w3-slot">{labelFor(m.a)}<br />{m.b ? labelFor(m.b) : '(bye)'}</div>
                        ))}
                    </div>
                    <div className="w3-col">
                        <div className="w3-clbl">Bán kết</div>
                        <div className="w3-slot">—</div>
                        {seeds.length > 2 ? <div className="w3-slot">—</div> : null}
                    </div>
                    <div className="w3-col">
                        <div className="w3-clbl">Chung kết</div>
                        <div className="w3-slot">—</div>
                    </div>
                </div>
                {fmt === 'de' ? (
                    <div className="w3-lower">
                        <div className="w3-clbl">Nhánh thua</div>
                        <div className="w3-bracket">
                            <div className="w3-col">
                                <div className="w3-slot">Thua V1</div>
                                <div className="w3-slot">Thua V1</div>
                            </div>
                            <div className="w3-col"><div className="w3-slot">—</div></div>
                        </div>
                    </div>
                ) : null}
            </>
        );
    } else {
        title = `Vòng bảng + CK · ${n} ${uw} · 2 bảng`;
        const groupA = labels.filter((_, i) => i % 2 === 0);
        const groupB = labels.filter((_, i) => i % 2 === 1);
        body = (
            <>
                {topNote}
                <div className="w3-bracket">
                    <div className="w3-col">
                        <div className="w3-clbl">Bảng A</div>
                        {groupA.map((name, i) => <div key={i} className="w3-slot">{name}</div>)}
                    </div>
                    <div className="w3-col">
                        <div className="w3-clbl">Bảng B</div>
                        {groupB.map((name, i) => <div key={i} className="w3-slot">{name}</div>)}
                    </div>
                    <div className="w3-col">
                        <div className="w3-clbl">Playoff</div>
                        <div className="w3-slot">Nhất A vs Nhì B</div>
                        <div className="w3-slot">Nhất B vs Nhì A</div>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <p className="w3-prev-title">{title}</p>
            <div>{body}</div>
            <div className="w3-prules">
                <span>◷ Luật theo điều lệ, đặt từng vòng</span>
                <span>{scopeNote}</span>
            </div>
        </>
    );
}
