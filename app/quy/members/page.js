'use client';

import { useEffect, useMemo, useState } from 'react';
import RoleActionBar from '@/components/pickhub/RoleActionBar';
import './members.css';

export default function MembersPage({ embedded = false }) {
    const [sessionView, setSessionView] = useState({ session: null, permissions: {} });
    const [members, setMembers] = useState([]);
    const [state, setState] = useState({ kind: 'loading', message: 'Đang tải roster…' });
    const [filterStatus, setFilterStatus] = useState('all');
    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState({ displayName: '', alias: '' });
    const [mutationMessage, setMutationMessage] = useState('');

    async function loadRoster() {
        setState({ kind: 'loading', message: 'Đang tải roster athlete/membership…' });
        try {
            const sessionResponse = await fetch('/api/groups/session', { cache: 'no-store' });
            const nextSessionView = await sessionResponse.json();
            setSessionView(nextSessionView);
            if (!nextSessionView.permissions?.canViewClub) {
                setState({ kind: 'forbidden', message: 'Phiên CLB không hợp lệ hoặc đã hết hạn.' });
                return;
            }
            const response = await fetch('/api/identity/roster', { cache: 'no-store' });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Không thể tải roster.');
            setMembers(payload.roster || []);
            setState({ kind: 'ready', message: '' });
        } catch (error) {
            setState({ kind: 'error', message: error.message || 'Không thể tải roster.' });
        }
    }

    useEffect(() => { loadRoster(); }, []);

    const filtered = useMemo(() => members.filter((member) => filterStatus === 'all' || member.status === filterStatus), [members, filterStatus]);
    const activeCount = members.filter((member) => member.status === 'active').length;
    const endedCount = members.length - activeCount;

    async function mutate(url, options, successMessage) {
        setMutationMessage('Đang lưu thay đổi…');
        const response = await fetch(url, options);
        const payload = await response.json();
        if (!response.ok) {
            setMutationMessage(payload.error || 'Không thể lưu thay đổi.');
            return false;
        }
        setMutationMessage(successMessage);
        await loadRoster();
        return true;
    }

    async function createAthlete(event) {
        event.preventDefault();
        const saved = await mutate('/api/identity/roster', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(createForm),
        }, 'Đã tạo athlete và membership chưa liên kết.');
        if (saved) { setShowCreate(false); setCreateForm({ displayName: '', alias: '' }); }
    }

    async function updateAlias(member) {
        const alias = window.prompt('Biệt danh mới trong CLB', member.alias || member.athlete?.displayName || '');
        if (!alias?.trim()) return;
        await mutate('/api/identity/roster', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ membershipId: member.id, alias: alias.trim(), expectedVersion: member.version }),
        }, 'Đã cập nhật biệt danh.');
    }

    async function updatePhr(member) {
        const skillLevel = Number(window.prompt('Nhập PHR từ 1,0 đến 5,0', '3.0')?.replace(',', '.'));
        if (!Number.isFinite(skillLevel)) return;
        await mutate('/api/identity/assessments', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ membershipId: member.id, skillLevel, source: 'club_admin' }),
        }, 'Đã ghi thêm mốc PHR.');
    }

    async function endMembership(member) {
        if (!window.confirm(`Kết thúc membership của ${member.alias || member.athlete?.displayName}?`)) return;
        await mutate('/api/identity/roster', {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ membershipId: member.id, expectedVersion: member.version }),
        }, 'Đã kết thúc membership.');
    }

    return (
        <div className={`members-page ${embedded ? 'is-embedded' : ''}`}>
            <div className="members-main">
                <header className="members-header">
                    <div><span className="members-kicker">Athlete / membership</span><h1 className="members-title">Thành viên CLB</h1><p className="members-subtitle">Roster hiển thị rõ VĐV, biệt danh trong CLB và trạng thái sinh hoạt.</p></div>
                    <RoleActionBar permissions={sessionView.permissions} actions={[
                        { id: 'add-athlete', label: '+ Thêm VĐV', permission: 'canManageRoster', onClick: () => setShowCreate(true) },
                        { id: 'settings', label: 'Cấu hình CLB', permission: 'canManageSettings', href: '/admin?section=settings' },
                    ]} />
                </header>

                {state.kind === 'ready' && <div className="members-filter" aria-label="Lọc trạng thái membership">{[
                    { key: 'all', label: `Tất cả (${members.length})` },
                    { key: 'active', label: `Đang sinh hoạt (${activeCount})` },
                    { key: 'ended', label: `Đã kết thúc (${endedCount})` },
                ].map((filter) => <button type="button" key={filter.key} className={`filter-btn ${filterStatus === filter.key ? 'active' : ''}`} aria-pressed={filterStatus === filter.key} onClick={() => setFilterStatus(filter.key)}>{filter.label}</button>)}</div>}

                {mutationMessage && <p className="members-mutation-status" role="status">{mutationMessage}</p>}

                {state.kind === 'loading' ? <RosterState kind="loading" title="Đang tải danh sách" message={state.message} />
                    : state.kind === 'forbidden' ? <RosterState kind="forbidden" title="Không có quyền truy cập" message={state.message} />
                    : state.kind === 'error' ? <RosterState kind="error" title="Chưa tải được roster" message={state.message} onRetry={loadRoster} />
                    : <div className="members-table-wrap">
                        <table className="members-table"><thead><tr><th>VĐV</th><th>Biệt danh</th><th>Membership</th><th>Trạng thái</th>{sessionView.permissions?.canManageRoster && <th>Quản lý</th>}</tr></thead>
                            <tbody>{filtered.map((member) => <tr key={member.id} className={member.status !== 'active' ? 'inactive-row' : ''}>
                                <td><div className="member-name-wrap"><span className="member-avatar" aria-hidden="true">{(member.athlete?.displayName || member.alias || '?').slice(0, 1)}</span><span><strong className="member-fullname">{member.athlete?.displayName || 'VĐV chưa đặt tên'}</strong><small>Athlete #{member.athleteId} · {member.athlete?.status || 'unclaimed'}</small></span></div></td>
                                <td><strong>{member.alias || 'Chưa đặt'}</strong></td>
                                <td><span>#{member.id}</span><small>Từ {member.effectiveFrom || 'chưa rõ'}</small></td>
                                <td><span className={`status-badge status-${member.status === 'active' ? 'active' : 'inactive'}`}>{member.status === 'active' ? 'Đang sinh hoạt' : 'Đã kết thúc'}</span></td>
                                {sessionView.permissions?.canManageRoster && <td><div className="roster-row-actions"><button type="button" onClick={() => updateAlias(member)}>Biệt danh</button><button type="button" onClick={() => updatePhr(member)}>Cập nhật PHR</button>{member.status === 'active' && <button type="button" className="is-danger" onClick={() => endMembership(member)}>Kết thúc</button>}</div></td>}
                            </tr>)}</tbody>
                        </table>
                        {filtered.length === 0 && <RosterState kind="empty" title="Chưa có membership" message="Không có thành viên phù hợp bộ lọc." />}
                    </div>}
            </div>

            {showCreate && <div className="roster-modal-backdrop" role="presentation" onClick={() => setShowCreate(false)}><section className="roster-modal" role="dialog" aria-modal="true" aria-label="Thêm VĐV chưa liên kết" onClick={(event) => event.stopPropagation()}><h2>Thêm VĐV vào roster</h2><p>Tạo athlete chưa liên kết và membership trong CLB hiện tại.</p><form onSubmit={createAthlete}><label>Họ và tên<input required value={createForm.displayName} onChange={(event) => setCreateForm((value) => ({ ...value, displayName: event.target.value }))} /></label><label>Biệt danh trong CLB<input value={createForm.alias} onChange={(event) => setCreateForm((value) => ({ ...value, alias: event.target.value }))} /></label><div><button type="button" onClick={() => setShowCreate(false)}>Hủy</button><button type="submit">Tạo membership</button></div></form></section></div>}
        </div>
    );
}

function RosterState({ kind, title, message, onRetry }) {
    return <section className={`roster-state is-${kind}`} role={kind === 'error' || kind === 'forbidden' ? 'alert' : 'status'}><span aria-hidden="true">{kind === 'loading' ? '◌' : kind === 'empty' ? '○' : '!'}</span><h2>{title}</h2><p>{message}</p>{kind === 'forbidden' && <a href="/">Nhập lại Mã CLB + mật khẩu</a>}{onRetry && <button type="button" onClick={onRetry}>Thử lại</button>}</section>;
}
