'use client';

import { useEffect, useMemo, useState } from 'react';
import RoleActionBar from '@/components/pickhub/RoleActionBar';
import './members.css';

const LINK_STATUS_LABEL = {
    unclaimed: 'Chưa liên kết tài khoản',
    linked: 'Đã liên kết tài khoản',
    merged: 'Đã gộp hồ sơ',
    restricted: 'Hồ sơ bị hạn chế',
    deleted: 'Hồ sơ đã xoá',
};

function linkStatusLabel(status) {
    return LINK_STATUS_LABEL[status] || 'Chưa liên kết tài khoản';
}

function formatPhr(value) {
    return Number.isFinite(value) ? value.toFixed(1).replace('.', ',') : '';
}

function parseKeywords(text) {
    return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export default function MembersPage({ embedded = false }) {
    const [sessionView, setSessionView] = useState({ session: null, permissions: {} });
    const [members, setMembers] = useState([]);
    const [state, setState] = useState({ kind: 'loading', message: 'Đang tải danh sách thành viên…' });
    const [filterStatus, setFilterStatus] = useState('active');
    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState({ displayName: '', alias: '' });
    const [mutationMessage, setMutationMessage] = useState('');
    const [editing, setEditing] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);
    const [bulkRunning, setBulkRunning] = useState(false);

    const canManageRoster = Boolean(sessionView.permissions?.canManageRoster);

    async function loadRoster() {
        setState({ kind: 'loading', message: 'Đang tải danh sách thành viên…' });
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
            if (!response.ok) throw new Error(payload.error || 'Không thể tải danh sách thành viên.');
            setMembers(payload.roster || []);
            setSelectedIds([]);
            setState({ kind: 'ready', message: '' });
        } catch (error) {
            setState({ kind: 'error', message: error.message || 'Không thể tải danh sách thành viên.' });
        }
    }

    useEffect(() => { loadRoster(); }, []);

    const filtered = useMemo(
        () => members.filter((member) => (filterStatus === 'active' ? member.status === 'active' : member.status !== 'active')),
        [members, filterStatus],
    );
    const activeCount = members.filter((member) => member.status === 'active').length;
    const endedCount = members.length - activeCount;
    const showBulkColumn = canManageRoster && filterStatus === 'active';
    const allSelected = filtered.length > 0 && selectedIds.length === filtered.length;

    function changeFilter(nextStatus) {
        setFilterStatus(nextStatus);
        setSelectedIds([]);
    }

    function toggleSelected(membershipId) {
        setSelectedIds((current) => (current.includes(membershipId)
            ? current.filter((id) => id !== membershipId)
            : [...current, membershipId]));
    }

    function toggleSelectAll() {
        setSelectedIds((current) => (current.length === filtered.length ? [] : filtered.map((member) => member.id)));
    }

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
        }, 'Đã thêm thành viên mới vào CLB.');
        if (saved) { setShowCreate(false); setCreateForm({ displayName: '', alias: '' }); }
    }

    async function openEditor(member) {
        const initial = {
            displayName: member.athlete?.displayName || '',
            alias: member.alias || '',
            transferKeywords: (member.transferKeywords || []).join('\n'),
            skillLevel: '',
        };
        setEditing({ member, initial, form: initial, loadingPhr: true, saving: false, error: '' });
        try {
            const response = await fetch(`/api/identity/assessments?membershipId=${member.id}`, { cache: 'no-store' });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Không tải được PHR hiện tại.');
            const latest = (payload.assessments || [])[0];
            const skillLevel = latest ? formatPhr(Number(latest.skillLevel)) : '';
            setEditing((current) => (current && current.member.id === member.id
                ? { ...current, loadingPhr: false, initial: { ...current.initial, skillLevel }, form: { ...current.form, skillLevel } }
                : current));
        } catch {
            setEditing((current) => (current && current.member.id === member.id
                ? { ...current, loadingPhr: false, error: 'Không tải được PHR hiện tại, bạn vẫn có thể nhập mốc mới.' }
                : current));
        }
    }

    function updateEditForm(field, value) {
        setEditing((current) => (current ? { ...current, form: { ...current.form, [field]: value } } : current));
    }

    async function saveEditor(event) {
        event.preventDefault();
        if (!editing || editing.saving) return;
        const { member, initial, form } = editing;
        const displayName = form.displayName.trim();
        const alias = form.alias.trim();
        const phrInput = form.skillLevel.trim();
        if (!displayName) {
            setEditing((current) => ({ ...current, error: 'Vui lòng nhập họ và tên.' }));
            return;
        }
        let skillLevel = null;
        if (phrInput && phrInput !== initial.skillLevel) {
            skillLevel = Number(phrInput.replace(',', '.'));
            if (!Number.isFinite(skillLevel) || skillLevel < 1 || skillLevel > 5) {
                setEditing((current) => ({ ...current, error: 'PHR phải là số từ 1,0 đến 5,0.' }));
                return;
            }
        }
        const keywords = parseKeywords(form.transferKeywords);
        const nameChanged = displayName !== initial.displayName;
        const aliasChanged = alias !== initial.alias;
        const keywordsChanged = keywords.join('\n') !== parseKeywords(initial.transferKeywords).join('\n');
        if (!nameChanged && !aliasChanged && !keywordsChanged && skillLevel === null) {
            setEditing(null);
            setMutationMessage('Không có thay đổi nào cần lưu.');
            return;
        }

        setEditing((current) => ({ ...current, saving: true, error: '' }));
        setMutationMessage('Đang lưu thay đổi…');
        try {
            if (nameChanged || aliasChanged || keywordsChanged) {
                const response = await fetch('/api/identity/roster', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        membershipId: member.id,
                        alias: alias || displayName,
                        displayName: nameChanged ? displayName : null,
                        transferKeywords: keywordsChanged ? keywords : null,
                        expectedVersion: member.version,
                    }),
                });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.error || 'Không thể lưu thông tin thành viên.');
            }
            if (skillLevel !== null) {
                const response = await fetch('/api/identity/assessments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ membershipId: member.id, skillLevel, source: 'club_admin' }),
                });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.error || 'Không thể ghi mốc PHR mới.');
            }
            setEditing(null);
            setMutationMessage('Đã cập nhật thông tin thành viên.');
            await loadRoster();
        } catch (error) {
            setEditing((current) => (current ? { ...current, saving: false, error: error.message } : current));
            setMutationMessage('');
        }
    }

    async function endMembership(member) {
        if (!window.confirm(`Kết thúc sinh hoạt của ${member.alias || member.athlete?.displayName}?`)) return;
        await mutate('/api/identity/roster', {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ membershipId: member.id, expectedVersion: member.version }),
        }, 'Đã kết thúc sinh hoạt của thành viên.');
    }

    async function endSelectedMemberships() {
        const targets = filtered.filter((member) => selectedIds.includes(member.id));
        if (targets.length === 0) return;
        if (!window.confirm(`Kết thúc sinh hoạt của ${targets.length} thành viên đã chọn?`)) return;
        setBulkRunning(true);
        setMutationMessage(`Đang kết thúc ${targets.length} thành viên…`);
        let done = 0;
        let lastError = '';
        for (const member of targets) {
            try {
                const response = await fetch('/api/identity/roster', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ membershipId: member.id, expectedVersion: member.version }),
                });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.error || 'Không thể kết thúc thành viên này.');
                done += 1;
            } catch (error) {
                lastError = error.message;
            }
        }
        setBulkRunning(false);
        setMutationMessage(done === targets.length
            ? `Đã kết thúc sinh hoạt của ${done} thành viên.`
            : `Đã kết thúc ${done}/${targets.length} thành viên. ${lastError}`);
        await loadRoster();
    }

    return (
        <div className={`members-page ${embedded ? 'is-embedded' : ''}`}>
            <div className="members-main">
                <header className="members-header">
                    <div>
                        <span className="members-kicker">Quản lý CLB</span>
                        <h1 className="members-title">Thành viên CLB</h1>
                        <p className="members-subtitle">Danh sách hiển thị rõ mã thành viên, họ tên, biệt danh trong CLB và trạng thái sinh hoạt.</p>
                    </div>
                    <RoleActionBar permissions={sessionView.permissions} actions={[
                        { id: 'add-athlete', label: '+ Thêm VĐV', permission: 'canManageRoster', onClick: () => setShowCreate(true) },
                        { id: 'settings', label: 'Cấu hình CLB', permission: 'canManageSettings', href: '/admin' },
                    ]} />
                </header>

                {state.kind === 'ready' && <div className="members-filter" aria-label="Lọc trạng thái sinh hoạt">{[
                    { key: 'active', label: `Đang sinh hoạt (${activeCount})` },
                    { key: 'ended', label: `Đã kết thúc (${endedCount})` },
                ].map((filter) => <button type="button" key={filter.key} className={`filter-btn ${filterStatus === filter.key ? 'active' : ''}`} aria-pressed={filterStatus === filter.key} onClick={() => changeFilter(filter.key)}>{filter.label}</button>)}</div>}

                {mutationMessage && <p className="members-mutation-status" role="status">{mutationMessage}</p>}

                {showBulkColumn && selectedIds.length > 0 && <div className="members-bulkbar" role="group" aria-label="Thao tác nhiều thành viên">
                    <span>Đã chọn {selectedIds.length} thành viên</span>
                    <div>
                        <button type="button" onClick={() => setSelectedIds([])} disabled={bulkRunning}>Bỏ chọn</button>
                        <button type="button" className="is-danger" onClick={endSelectedMemberships} disabled={bulkRunning}>{bulkRunning ? 'Đang xử lý…' : 'Kết thúc đã chọn'}</button>
                    </div>
                </div>}

                {state.kind === 'loading' ? <RosterState kind="loading" title="Đang tải danh sách" message={state.message} />
                    : state.kind === 'forbidden' ? <RosterState kind="forbidden" title="Không có quyền truy cập" message={state.message} />
                    : state.kind === 'error' ? <RosterState kind="error" title="Chưa tải được danh sách" message={state.message} onRetry={loadRoster} />
                    : <div className="members-table-wrap">
                        <table className="members-table">
                            <thead><tr>
                                {showBulkColumn && <th className="members-pick-cell"><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Chọn tất cả thành viên đang hiển thị" /></th>}
                                <th>Mã TV</th><th>VĐV</th><th>Biệt danh</th><th>Trạng thái</th>{canManageRoster && <th>Quản lý</th>}
                            </tr></thead>
                            <tbody>{filtered.map((member) => <tr key={member.id} className={member.status !== 'active' ? 'inactive-row' : ''}>
                                {showBulkColumn && <td className="members-pick-cell"><input type="checkbox" checked={selectedIds.includes(member.id)} onChange={() => toggleSelected(member.id)} aria-label={`Chọn ${member.alias || member.athlete?.displayName || 'thành viên'}`} /></td>}
                                <td><strong className="member-code">#{member.id}</strong></td>
                                <td><div className="member-name-wrap"><span className="member-avatar" aria-hidden="true">{(member.athlete?.displayName || member.alias || '?').slice(0, 1)}</span><span><strong className="member-fullname">{member.athlete?.displayName || 'VĐV chưa đặt tên'}</strong><small>{linkStatusLabel(member.athlete?.status)}</small></span></div></td>
                                <td><strong>{member.alias || 'Chưa đặt'}</strong></td>
                                <td><span><span className={`status-badge status-${member.status === 'active' ? 'active' : 'inactive'}`}>{member.status === 'active' ? 'Đang sinh hoạt' : 'Đã kết thúc'}</span><small>Từ {member.effectiveFrom || 'chưa rõ'}</small></span></td>
                                {canManageRoster && <td><div className="roster-row-actions"><button type="button" onClick={() => openEditor(member)}>Chỉnh sửa</button>{member.status === 'active' && <button type="button" className="is-danger" onClick={() => endMembership(member)}>Kết thúc</button>}</div></td>}
                            </tr>)}</tbody>
                        </table>
                        {filtered.length === 0 && <RosterState kind="empty" title="Chưa có thành viên" message={filterStatus === 'active' ? 'Chưa có thành viên nào đang sinh hoạt.' : 'Chưa có thành viên nào đã kết thúc sinh hoạt.'} />}
                    </div>}
            </div>

            {showCreate && <div className="roster-modal-backdrop" role="presentation" onClick={() => setShowCreate(false)}><section className="roster-modal" role="dialog" aria-modal="true" aria-label="Thêm VĐV vào CLB" onClick={(event) => event.stopPropagation()}><h2>Thêm VĐV vào CLB</h2><p>Tạo hồ sơ VĐV mới và ghi nhận sinh hoạt tại CLB hiện tại.</p><form onSubmit={createAthlete}><label>Họ và tên<input required value={createForm.displayName} onChange={(event) => setCreateForm((value) => ({ ...value, displayName: event.target.value }))} /></label><label>Biệt danh trong CLB<input value={createForm.alias} onChange={(event) => setCreateForm((value) => ({ ...value, alias: event.target.value }))} /></label><div><button type="button" onClick={() => setShowCreate(false)}>Hủy</button><button type="submit">Thêm thành viên</button></div></form></section></div>}

            {editing && <div className="roster-modal-backdrop" role="presentation" onClick={() => !editing.saving && setEditing(null)}>
                <section className="roster-modal" role="dialog" aria-modal="true" aria-label="Chỉnh sửa thông tin thành viên" onClick={(event) => event.stopPropagation()}>
                    <h2>Chỉnh sửa thành viên</h2>
                    <p>Mã TV #{editing.member.id} · {editing.member.status === 'active' ? 'Đang sinh hoạt' : 'Đã kết thúc'} · Từ {editing.member.effectiveFrom || 'chưa rõ'}</p>
                    <form onSubmit={saveEditor}>
                        <label>Họ và tên<input required value={editing.form.displayName} onChange={(event) => updateEditForm('displayName', event.target.value)} /></label>
                        <label>Biệt danh trong CLB<input value={editing.form.alias} onChange={(event) => updateEditForm('alias', event.target.value)} placeholder="Để trống sẽ dùng họ và tên" /></label>
                        <label>PHR (1,0 – 5,0)<input inputMode="decimal" value={editing.form.skillLevel} onChange={(event) => updateEditForm('skillLevel', event.target.value)} placeholder={editing.loadingPhr ? 'Đang tải PHR hiện tại…' : 'Chưa có PHR'} /><small>Nhập giá trị mới sẽ ghi thêm một mốc PHR và giữ nguyên lịch sử cũ.</small></label>
                        <label>Từ khoá nhận diện chuyển khoản<textarea rows={4} value={editing.form.transferKeywords} onChange={(event) => updateEditForm('transferKeywords', event.target.value)} placeholder={'Mỗi từ khoá một dòng, VD:\nNGUYEN VAN A\nVAN A\nNV A'} /><small>Dùng để tự động khớp tên trong nội dung chuyển khoản, không phải biệt danh hiển thị. Để trống nếu không cần.</small></label>
                        {editing.error && <p className="roster-modal-error" role="alert">{editing.error}</p>}
                        <div>
                            <button type="button" onClick={() => setEditing(null)} disabled={editing.saving}>Hủy</button>
                            <button type="submit" disabled={editing.saving}>{editing.saving ? 'Đang lưu…' : 'Lưu thay đổi'}</button>
                        </div>
                    </form>
                </section>
            </div>}
        </div>
    );
}

function RosterState({ kind, title, message, onRetry }) {
    return <section className={`roster-state is-${kind}`} role={kind === 'error' || kind === 'forbidden' ? 'alert' : 'status'}><span aria-hidden="true">{kind === 'loading' ? '◌' : kind === 'empty' ? '○' : '!'}</span><h2>{title}</h2><p>{message}</p>{kind === 'forbidden' && <a href="/">Nhập lại Mã CLB + mật khẩu</a>}{onRetry && <button type="button" onClick={onRetry}>Thử lại</button>}</section>;
}
