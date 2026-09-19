'use client';

import { useMemo, useState } from 'react';
import './participants.css';

function normalizeMember(member) {
    const memberId = String(member.member_id ?? member.memberId ?? member.id ?? '');
    return {
        ...member,
        member_id: memberId,
        memberId,
        fullName: member.full_name || member.displayName || member.display_name || member.name || 'Chưa có tên',
        isActive: member.is_active !== false && member.status !== 'inactive',
        athleteId: member.athlete_id ?? member.athleteId ?? null,
        clubName: member.club_name || member.clubName || '',
        memberCode: member.member_code || member.memberCode || member.code || '',
    };
}

export default function ParticipantRosterPicker({ roster = [], selectedMemberIds = [], onChange, loading = false, error = '' }) {
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('active');
    const members = useMemo(() => roster.map(normalizeMember).filter((member) => member.memberId), [roster]);
    const selectedSet = useMemo(() => new Set(selectedMemberIds.map(String)), [selectedMemberIds]);
    const activeMemberIds = members.filter((member) => member.isActive).map((member) => member.memberId);
    const totalCount = members.length;
    const selectedCount = selectedSet.size;

    const visibleMembers = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return members.filter((member) => {
            const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? member.isActive : !member.isActive);
            const haystack = `${member.fullName} ${member.memberCode} ${member.clubName} ${member.athleteId || ''}`.toLowerCase();
            return matchesStatus && (!needle || haystack.includes(needle));
        });
    }, [members, query, statusFilter]);

    const visibleIds = visibleMembers.map((member) => member.memberId);
    const hiddenSelectedCount = selectedMemberIds.filter((id) => !visibleIds.includes(String(id))).length;
    const inactiveSelectedCount = members.filter((member) => !member.isActive && selectedSet.has(member.memberId)).length;
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));

    function emit(nextIds) {
        onChange?.(Array.from(new Set(nextIds.map(String))));
    }

    function toggleMember(memberId) {
        const next = new Set(selectedSet);
        if (next.has(memberId)) next.delete(memberId); else next.add(memberId);
        emit([...next]);
    }

    function selectActiveMembers() {
        emit([...selectedSet, ...activeMemberIds]);
    }

    function setVisibleSelected(checked) {
        const next = new Set(selectedSet);
        visibleIds.forEach((id) => { if (checked) next.add(id); else next.delete(id); });
        emit([...next]);
    }

    return (
        <section className="participants-card" aria-label="Danh sách thành viên tham gia">
            <div className="participants-head">
                <div>
                    <p className="setup-eyebrow">Bước 1</p>
                    <h2>Thông tin & người tham gia</h2>
                    <p>Chọn bằng mã thành viên để không gộp nhầm người trùng tên.</p>
                </div>
                <strong className="participants-count">Đã chọn {selectedCount}/{totalCount}</strong>
            </div>

            <button type="button" className="participants-primary" onClick={selectActiveMembers} disabled={loading || activeMemberIds.length === 0}>
                Chọn toàn bộ thành viên đang hoạt động
            </button>

            <div className="participants-toolbar">
                <label className="participants-search">
                    <span>Tìm kiếm</span>
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập tên, mã hoặc CLB" />
                </label>
                <div className="participants-filters" role="group" aria-label="Lọc trạng thái thành viên">
                    <button type="button" aria-pressed={statusFilter === 'active'} onClick={() => setStatusFilter('active')}>Đang hoạt động</button>
                    <button type="button" aria-pressed={statusFilter === 'inactive'} onClick={() => setStatusFilter('inactive')}>Ngừng hoạt động</button>
                    <button type="button" aria-pressed={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>Tất cả</button>
                </div>
            </div>

            <div className="participants-visible-action">
                <label>
                    <input type="checkbox" checked={allVisibleSelected} onChange={(event) => setVisibleSelected(event.target.checked)} />
                    <span>{allVisibleSelected ? 'Bỏ chọn kết quả đang hiển thị' : 'Chọn kết quả đang hiển thị'}</span>
                </label>
                {hiddenSelectedCount > 0 ? <span>{hiddenSelectedCount} lựa chọn đang bị ẩn bởi bộ lọc vẫn được giữ</span> : null}
            </div>

            {inactiveSelectedCount > 0 ? <div className="participants-warning">Đã chọn {inactiveSelectedCount} thành viên ngừng hoạt động</div> : null}
            {error ? <div className="participants-error">{error}</div> : null}

            <div className="participants-list">
                {loading ? <p>Đang tải danh sách thành viên...</p> : null}
                {!loading && visibleMembers.length === 0 ? <p>Không có thành viên phù hợp.</p> : null}
                {visibleMembers.map((member) => (
                    <label key={member.memberId} className="participants-row">
                        <input type="checkbox" checked={selectedSet.has(member.memberId)} onChange={() => toggleMember(member.memberId)} />
                        <span className="participants-person">
                            <strong>{member.fullName}</strong>
                            <small>
                                ID {member.memberId}
                                {member.memberCode ? ` · Mã ${member.memberCode}` : ''}
                                {member.athleteId ? ` · athlete ${member.athleteId}` : ' · chưa có athlete_id'}
                                {member.clubName ? ` · ${member.clubName}` : ''}
                            </small>
                        </span>
                        {!member.isActive ? <span className="participants-badge">Ngừng hoạt động</span> : null}
                    </label>
                ))}
            </div>
        </section>
    );
}
