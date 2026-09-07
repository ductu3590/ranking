// Bước 1: Thể thức — cấu hình hai trục (phạm vi · đơn vị · tính thành tích ·
// thể thức · số ván / trận đội) và xem trước sống. Thuần trình bày; nhận state +
// setter từ component điều phối.

import LivePreview from './LivePreview';

const SCOPE_OPTIONS = [
    { id: 'internal', label: 'Nội bộ CLB' },
    { id: 'friendly', label: 'Giao hữu (mời CLB)' },
    { id: 'community', label: 'Cộng đồng 🔒', locked: true },
];

const UNIT_OPTIONS = [
    { id: 'don', title: 'Cá nhân', desc: 'Đánh đơn, mỗi người một suất' },
    { id: 'doi', title: 'Cặp đôi', desc: 'Ghép cặp, hai người một suất' },
    { id: 'team', title: 'Đội (MLP)', desc: 'Đội gặp đội, nhiều ván con' },
];

const SCORING_OPTIONS = [
    { id: 'individual', title: 'Cá nhân', desc: 'Xếp hạng từng người/cặp' },
    { id: 'club', title: 'Cộng điểm về CLB', desc: 'Vô địch đồng đội kiểu tổng sắp' },
];

const FORMAT_OPTIONS = [
    { id: 'rr', title: 'Vòng tròn', desc: 'Ai cũng gặp ai, xếp theo tổng thành tích' },
    { id: 'se', title: 'Loại trực tiếp 1 nhánh', desc: 'Thua một trận là loại, nhanh gọn' },
    { id: 'de', title: 'Loại trực tiếp 2 nhánh', desc: 'Thua có nhánh vớt, cạnh tranh hơn', badge: 'engine đang xây' },
    { id: 'mix', title: 'Vòng bảng + CK', desc: 'Đấu bảng rồi chọn đội vào playoff' },
];

export default function StepConfig({
    scope, unit, userScoring, fmt, bestOf, teamSize, subGames, teamCount,
    pickScope, pickUnit, setUserScoring, setFmt, setBestOf, setTeamSize, setSubGames,
    mView, setMView, comboText, eff,
    previewLabels, preview, previewLoading, previewError,
}) {
    return (
        <>
            <div className="w3-mtabs">
                <button type="button" aria-pressed={mView === 'setup'} onClick={() => setMView('setup')}>Cấu hình</button>
                <button type="button" aria-pressed={mView === 'preview'} onClick={() => setMView('preview')}>Xem trước</button>
            </div>
            <div className="w3-work" data-view={mView}>
                <div className="w3-setup">
                    {/* Phạm vi */}
                    <div className="w3-block">
                        <p className="w3-cflbl">Phạm vi</p>
                        <div className="w3-seg">
                            {SCOPE_OPTIONS.map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    aria-pressed={scope === option.id}
                                    disabled={option.locked}
                                    title={option.locked ? 'Cần tài khoản quản trị cộng đồng' : undefined}
                                    onClick={() => pickScope(option.id)}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Đơn vị vào sân */}
                    <div className="w3-block">
                        <p className="w3-cflbl">Đơn vị vào sân — ai đấu một trận</p>
                        <div className="w3-selgrid c3">
                            {UNIT_OPTIONS.map((option) => (
                                <button key={option.id} type="button" className="w3-selcard" aria-pressed={unit === option.id} onClick={() => pickUnit(option.id)}>
                                    <span className="w3-chk">✓</span>
                                    <span className="w3-st">{option.title}</span>
                                    <span className="w3-sd">{option.desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tính thành tích — chỉ khi không nội bộ và không đội */}
                    {scope !== 'internal' && unit !== 'team' && (
                        <div className="w3-block">
                            <p className="w3-cflbl">Tính thành tích — ai được xếp hạng</p>
                            <div className="w3-selgrid c2">
                                {SCORING_OPTIONS.map((option) => (
                                    <button key={option.id} type="button" className="w3-selcard" aria-pressed={userScoring === option.id} onClick={() => setUserScoring(option.id)}>
                                        <span className="w3-chk">✓</span>
                                        <span className="w3-st">{option.title}</span>
                                        <span className="w3-sd">{option.desc}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Thể thức */}
                    <div className="w3-block">
                        <p className="w3-cflbl">Thể thức</p>
                        <div className="w3-selgrid c2">
                            {FORMAT_OPTIONS.map((option) => (
                                <button key={option.id} type="button" className="w3-selcard" aria-pressed={fmt === option.id} onClick={() => setFmt(option.id)}>
                                    <span className="w3-chk">✓</span>
                                    <span className="w3-st">
                                        {option.title}
                                        {option.badge ? <span className="w3-mini-badge">{option.badge}</span> : null}
                                    </span>
                                    <span className="w3-sd">{option.desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Số ván mỗi trận (không phải đội) */}
                    {unit !== 'team' && (
                        <div className="w3-block">
                            <p className="w3-cflbl">Số ván mỗi trận</p>
                            <div className="w3-seg">
                                {[1, 3, 5].map((value) => (
                                    <button key={value} type="button" aria-pressed={bestOf === value} onClick={() => setBestOf(value)}>
                                        {value === 1 ? '1 ván' : `${value} ván (BO${value})`}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Cấu hình trận đội (đội/MLP) */}
                    {unit === 'team' && (
                        <div className="w3-block">
                            <p className="w3-cflbl">Cấu hình trận đội</p>
                            <div className="w3-teamcfg">
                                <div className="w3-tc">
                                    <span>Số người mỗi đội</span>
                                    <div className="w3-stepcnt">
                                        <button type="button" onClick={() => setTeamSize((v) => Math.max(1, v - 1))}>−</button>
                                        <span>{teamSize} người</span>
                                        <button type="button" onClick={() => setTeamSize((v) => Math.min(10, v + 1))}>+</button>
                                    </div>
                                </div>
                                <div className="w3-tc">
                                    <span>Số ván con mỗi trận đội</span>
                                    <div className="w3-stepcnt">
                                        <button type="button" onClick={() => setSubGames((v) => Math.max(1, v - 1))}>−</button>
                                        <span>{subGames} ván</span>
                                        <button type="button" onClick={() => setSubGames((v) => Math.min(9, v + 1))}>+</button>
                                    </div>
                                </div>
                            </div>
                            <p className="w3-softnote"><span>ⓘ</span> <span>Cần khoảng {teamCount * teamSize} VĐV cho {teamCount} đội. Số ván con theo điều lệ giải.</span></p>
                        </div>
                    )}

                    <div className="w3-cross">{comboText}</div>
                    <p className="w3-softnote"><span>ⓘ</span> <span>Luật điểm và tie-break là điều lệ của giải, đặt theo từng vòng khi bốc thăm. Không cố định ở đây.</span></p>
                </div>

                {/* Xem trước sống */}
                <div className="w3-preview-pane">
                    <p className="w3-ph">Xem trước sống</p>
                    <p className="w3-ph-sub">Cập nhật theo cấu hình bên trái</p>
                    <LivePreview
                        fmt={fmt}
                        unit={unit}
                        scope={scope}
                        eff={eff}
                        bestOf={bestOf}
                        subGames={subGames}
                        labels={previewLabels}
                        preview={preview}
                        loading={previewLoading}
                        error={previewError}
                    />
                </div>
            </div>
        </>
    );
}
