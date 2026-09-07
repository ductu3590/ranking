// Bước 3: Đăng ký — rẽ theo phạm vi.
//  - Nội bộ: nhập tay + thêm nhanh từ roster CLB THẬT; ghép cặp/chia đội.
//  - Giao hữu: mời CLB PickHub THẬT (chọn từ danh sách) hoặc CLB ngoài (nhập tên).
//  - Cộng đồng: thiết lập link mở (mặt công khai thuộc spec tournament-open-registration).
// PHR chỉ hiển thị cảnh báo, KHÔNG chặn sang bước hay tạo giải (điểm PHR gắn khi
// VĐV vào giải, không có ở bước tạo).

import { useState } from 'react';

const CLUB_STATUS_LABELS = {
    invited: 'Đã mời',
    roster_submitted: 'Đã nộp danh sách',
    approved: 'Đã duyệt',
    pending: 'Chờ duyệt',
};

export default function StepRegister(props) {
    const {
        scope, unit, players, pairs, sel, playerInput, setPlayerInput,
        addPlayers, removePlayer, randomPairs, tapMember,
        roster, addRosterMember,
        teamCount, changeTeamCount, randomTeams, teams,
        inviteClubs, pickhubClubs, addPickhubClub, addExternalClub, reviewInviteClub, regClubs,
        friendlyDeadline, setFriendlyDeadline, communityDeadline, setCommunityDeadline,
        communityWho, setCommunityWho, slug, busy, onToast,
    } = props;

    const [pickhubSel, setPickhubSel] = useState('');
    const [externalInput, setExternalInput] = useState('');

    const note = {
        internal: 'Hình thức A · Tự nhập — BTC nắm danh sách, nhập trực tiếp.',
        friendly: 'Hình thức A · Tự nhập — mời đích danh CLB, họ nộp danh sách trước hạn.',
        community: 'Hình thức B · Mở đăng ký — mở link có hạn cho CLB/VĐV tự đăng ký. Đây là thiết lập; mặt công khai thuộc spec khác.',
    }[scope];

    // Thành viên CLB (đang hoạt động) chưa được thêm vào danh sách chơi.
    const rosterToAdd = (roster || []).filter((member) => member.is_active && !players.includes(member.full_name));
    // CLB PickHub chưa được mời (loại các CLB đã có club_id trong danh sách mời).
    const invitedClubIds = new Set(inviteClubs.filter((c) => c.club_id != null).map((c) => String(c.club_id)));
    const pickhubToAdd = (pickhubClubs || []).filter((club) => !invitedClubIds.has(String(club.id)));

    function submitExternal() {
        const name = externalInput.trim();
        if (!name) return;
        addExternalClub(name);
        setExternalInput('');
    }

    return (
        <>
            <div className="w3-banner-info">{note}</div>

            {/* A. Nội bộ, đơn/đôi */}
            {scope === 'internal' && unit !== 'team' && (
                <div>
                    <p className="w3-cflbl" style={{ textTransform: 'none' }}>Người chơi <span className="w3-count">· {players.length}</span></p>
                    <div className="w3-chips">
                        {players.map((name, index) => (
                            <span key={`${name}-${index}`} className="w3-chip">
                                {name}
                                <button type="button" aria-label={`Bỏ ${name}`} onClick={() => removePlayer(index)}>×</button>
                            </span>
                        ))}
                    </div>
                    <div className="w3-addrow">
                        <input
                            className="v2-input"
                            value={playerInput}
                            onChange={(e) => setPlayerInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPlayers(); } }}
                            placeholder="Nhập tên rồi Enter"
                        />
                        <button type="button" className="w3-btn" onClick={addPlayers}>Thêm</button>
                    </div>
                    <div className="w3-roster">
                        {(roster || []).length === 0 ? (
                            <span>Chưa có thành viên CLB nào — nhập tay ở trên.</span>
                        ) : rosterToAdd.length === 0 ? (
                            <span>Đã thêm hết thành viên CLB đang hoạt động.</span>
                        ) : (
                            <>
                                <span>Thêm nhanh từ thành viên CLB:</span>{' '}
                                {rosterToAdd.map((member) => (
                                    <button key={member.member_id} type="button" className="w3-pill" onClick={() => addRosterMember(member.full_name)}>
                                        + {member.full_name}
                                    </button>
                                ))}
                            </>
                        )}
                    </div>
                    <p className="w3-softnote"><span>ⓘ</span> <span>Điểm PHR được gắn khi VĐV vào giải — đây chỉ là cảnh báo, không chặn tạo giải.</span></p>

                    {unit === 'doi' && (
                        <div>
                            <div className="w3-subhead">
                                <h3>Ghép cặp</h3>
                                <span className="w3-count" style={{ fontSize: '0.76rem' }}>· {Math.ceil(players.length / 2)} cặp</span>
                                <button type="button" className="w3-pill" onClick={randomPairs}>⚁ Ghép ngẫu nhiên</button>
                            </div>
                            <div className="w3-pairs">
                                {pairs.map((pr, pi) => {
                                    const miss = !pr[1];
                                    return (
                                        <div key={pi} className={`w3-pair ${miss ? 'is-warn' : ''}`}>
                                            <span className="w3-pn">Cặp {pi + 1}</span>
                                            <button type="button" className={`w3-mem ${sel && sel.p === pi && sel.k === 0 ? 'is-sel' : ''}`} onClick={() => tapMember(pi, 0)}>{pr[0]}</button>
                                            <span className="w3-plus">+</span>
                                            {miss ? (
                                                <span className="w3-mem is-empty">chọn người…</span>
                                            ) : (
                                                <button type="button" className={`w3-mem ${sel && sel.p === pi && sel.k === 1 ? 'is-sel' : ''}`} onClick={() => tapMember(pi, 1)}>{pr[1]}</button>
                                            )}
                                            {miss ? <span className="w3-tag w3-tag-warn">thiếu 1</span> : <span className="w3-tag">PHR: chưa gắn</span>}
                                        </div>
                                    );
                                })}
                            </div>
                            <p className="w3-hint" style={{ marginTop: 10 }}>Chạm hai người để đổi chỗ. Ghép ngẫu nhiên bấm lại tùy ý.</p>
                        </div>
                    )}
                </div>
            )}

            {/* A. Nội bộ, đội */}
            {scope === 'internal' && unit === 'team' && (
                <div>
                    <p className="w3-hint" style={{ marginTop: 0 }}>Chia thành viên CLB thành nhiều đội đấu với nhau.</p>
                    <div className="w3-subhead">
                        <h3>Các đội</h3>
                        <div className="w3-stepcnt">
                            <button type="button" onClick={() => changeTeamCount(-1)}>−</button>
                            <span>{teamCount} đội</span>
                            <button type="button" onClick={() => changeTeamCount(1)}>+</button>
                        </div>
                        <button type="button" className="w3-pill" style={{ marginLeft: 8 }} onClick={randomTeams}>⚁ Chia ngẫu nhiên</button>
                    </div>
                    <div className="w3-teams">
                        {teams.map((members, i) => (
                            <div key={i} className="w3-team">
                                <h4>Đội {i + 1} · {members.length}</h4>
                                {members.map((name, j) => <div key={j} className="w3-m">{name}</div>)}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* A. Giao hữu, mời CLB */}
            {scope === 'friendly' && (
                <div>
                    <div className="w3-block" style={{ marginTop: 0 }}>
                        <div className="v2-field">
                            <label htmlFor="w3-friendly-deadline">Hạn nộp danh sách</label>
                            <input id="w3-friendly-deadline" type="date" style={{ maxWidth: 220 }} value={friendlyDeadline} onChange={(e) => setFriendlyDeadline(e.target.value)} />
                        </div>
                    </div>
                    <div className="w3-subhead">
                        <h3>CLB được mời</h3>
                        <span className="w3-count" style={{ fontSize: '0.76rem' }}>· {inviteClubs.length}</span>
                    </div>
                    <div className="w3-addrow">
                        <select className="v2-input" aria-label="Chọn CLB PickHub để mời" value={pickhubSel} onChange={(e) => setPickhubSel(e.target.value)}>
                            <option value="">— Chọn CLB PickHub —</option>
                            {pickhubToAdd.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
                        </select>
                        <button
                            type="button"
                            className="w3-btn"
                            disabled={!pickhubSel}
                            onClick={() => {
                                const club = (pickhubClubs || []).find((x) => String(x.id) === String(pickhubSel));
                                if (club) { addPickhubClub(club); setPickhubSel(''); }
                            }}
                        >
                            Mời
                        </button>
                    </div>
                    <div className="w3-addrow">
                        <input
                            className="v2-input"
                            value={externalInput}
                            onChange={(e) => setExternalInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitExternal(); } }}
                            placeholder="Tên CLB ngoài hệ thống"
                        />
                        <button type="button" className="w3-btn" onClick={submitExternal}>Mời CLB ngoài</button>
                    </div>
                    {pickhubToAdd.length === 0 && (pickhubClubs || []).length === 0 ? (
                        <p className="w3-hint">Chưa có CLB PickHub nào khác trong hệ thống — mời CLB ngoài bằng tên.</p>
                    ) : null}
                    <div className="w3-clubs">
                        {inviteClubs.map((club, index) => (
                            <ClubRow key={index} club={club} busy={busy}>
                                {club.status === 'roster_submitted' ? (
                                    <div className="w3-club-act">
                                        <button type="button" className="w3-sbtn">Xem</button>
                                        <button type="button" className="w3-sbtn" onClick={() => reviewInviteClub(club, 'approve', index)} disabled={busy}>Duyệt</button>
                                        <button type="button" className="w3-sbtn" onClick={() => reviewInviteClub(club, 'request_changes', index)} disabled={busy}>Yêu cầu sửa</button>
                                    </div>
                                ) : (
                                    <div className="w3-club-act">
                                        <button type="button" className="w3-sbtn">Nhập hộ</button>
                                        <button type="button" className="w3-sbtn">Huỷ mời</button>
                                    </div>
                                )}
                            </ClubRow>
                        ))}
                    </div>
                    <p className="w3-hint" style={{ marginTop: 10 }}>Mời đích danh. Mỗi CLB tự nộp danh sách trước hạn; BTC duyệt rồi bốc thăm.</p>
                </div>
            )}

            {/* B. Cộng đồng, mở link đăng ký */}
            {scope === 'community' && (
                <div>
                    <div className="w3-reglink">
                        <div className="w3-reglink-title">Link đăng ký mở</div>
                        <div className="w3-reglink-sub">Chia sẻ link này để CLB/VĐV tự đăng ký</div>
                        <div className="w3-reglink-u">
                            <code>pickhub.vn/dk/{slug}</code>
                            <button type="button" className="w3-sbtn" onClick={() => { navigator.clipboard?.writeText(`pickhub.vn/dk/${slug}`); onToast('✓ Đã sao chép link'); }}>Sao chép</button>
                        </div>
                    </div>
                    <div className="w3-two" style={{ marginTop: 14 }}>
                        <div className="v2-field">
                            <label htmlFor="w3-community-deadline">Hạn đăng ký</label>
                            <input id="w3-community-deadline" type="date" value={communityDeadline} onChange={(e) => setCommunityDeadline(e.target.value)} />
                        </div>
                        <div className="v2-field">
                            <label htmlFor="w3-community-who">Ai được đăng ký</label>
                            <select id="w3-community-who" value={communityWho} onChange={(e) => setCommunityWho(e.target.value)}>
                                <option value="club">CLB đăng ký theo đoàn</option>
                                <option value="athlete">VĐV tự do đăng ký</option>
                                <option value="both">Cả hai</option>
                            </select>
                        </div>
                    </div>
                    <div className="w3-subhead">
                        <h3>CLB đã đăng ký</h3>
                        <span className="w3-count" style={{ fontSize: '0.76rem' }}>· chờ duyệt</span>
                    </div>
                    <div className="w3-clubs">
                        {regClubs.map((club, index) => (
                            <ClubRow key={index} club={club} busy={busy}>
                                {club.status === 'pending' ? (
                                    <div className="w3-club-act">
                                        <button type="button" className="w3-sbtn">Duyệt</button>
                                        <button type="button" className="w3-sbtn">Chờ</button>
                                        <button type="button" className="w3-sbtn">Từ chối</button>
                                    </div>
                                ) : null}
                            </ClubRow>
                        ))}
                    </div>
                    <p className="w3-hint" style={{ marginTop: 10 }}>Đăng ký tự do có hạn. BTC duyệt từng CLB/VĐV, có thể giới hạn tổng PHR hoặc để Open.</p>
                </div>
            )}
        </>
    );
}

function ClubRow({ club, children }) {
    const tag = club.status === 'approved' ? 'w3-tag-ok' : '';
    const meta = `${club.ext ? 'CLB ngoài hệ thống' : 'CLB PickHub'} · ${club.n ? `${club.n} VĐV` : 'chưa nộp'}`;
    return (
        <div className="w3-club">
            <div className="w3-club-top">
                <span className="w3-club-name">{club.name}</span>
                <span className={`w3-tag ${tag}`}>{CLUB_STATUS_LABELS[club.status] || club.status}</span>
            </div>
            <p className="w3-club-meta">{meta}</p>
            {children}
        </div>
    );
}
