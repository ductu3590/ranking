'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import OverviewTab from './tabs/OverviewTab';
import SettingsTab from './tabs/SettingsTab';
import TeamsTab from './tabs/TeamsTab';
import PairingsTab from './tabs/PairingsTab';
import MatchesTab from './tabs/MatchesTab';

const TABS = [
    { value: 'overview', label: 'Tổng quan' },
    { value: 'settings', label: 'Cài đặt' },
    { value: 'teams', label: 'Đội & VĐV' },
    { value: 'pairings', label: 'Pairings' },
    { value: 'matches', label: 'Trận đấu' },
];

export default function TournamentConsole({ tournament, tab, fetchJson, onTournamentsChanged }) {
    const router = useRouter();
    const [overview, setOverview] = useState({ teams: [], matches: [], pairings: [], stats: {} });
    const [menuOpen, setMenuOpen] = useState(false);
    const id = tournament.id;

    const loadOverview = useCallback(async () => {
        const { res, data } = await fetchJson(`/api/tournament/admin/overview?tournamentId=${id}`);
        if (res.ok) setOverview(data);
    }, [fetchJson, id]);

    useEffect(() => { loadOverview(); }, [loadOverview]);

    function go(nextTab) {
        router.push(`/admin?section=tournament&t=${id}&tab=${nextTab}`);
    }

    async function handleReset() {
        if (!confirm('⚠️ Xóa TOÀN BỘ đội/cặp/trận/cài đặt của GIẢI NÀY? (không ảnh hưởng giải khác)')) return;
        if (!confirm('Xác nhận lần cuối cho giải này?')) return;
        const { res, data } = await fetchJson('/api/tournament/admin/reset', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tournamentId: id }),
        });
        if (!res.ok) { alert('Lỗi reset: ' + (data.error || '')); return; }
        await loadOverview();
        setMenuOpen(false);
    }

    const tabProps = { tournament, fetchJson, overview, reloadOverview: loadOverview };

    return (
        <div className="tournament-console">
            <div className="console-header">
                <button type="button" className="console-back" aria-label="Quay lại"
                    onClick={() => router.push('/admin?section=tournament')}>←</button>
                <div className="console-title">{tournament.name}</div>
                <span className={`status-pill status-${tournament.status || 'draft'}`}>{tournament.status || 'draft'}</span>
                <button type="button" className="console-menu-btn" aria-label="Thêm"
                    onClick={() => setMenuOpen((v) => !v)}>⋮</button>
            </div>

            {menuOpen ? (
                <div className="console-menu">
                    <button type="button" onClick={() => router.push(`/admin?section=tournament&t=${id}&action=edit`)}>Sửa thông tin</button>
                    <button type="button" onClick={() => router.push(`/giai-dau/${id}/live`)}>Xem Live</button>
                    <button type="button" className="danger" onClick={handleReset}>Reset giải</button>
                </div>
            ) : null}

            <NextStepStrip tournament={tournament} overview={overview} onGo={go} />

            <div className="console-tabs" role="tablist">
                {TABS.map((t) => (
                    <button key={t.value} type="button"
                        className={tab === t.value ? 'active' : ''} onClick={() => go(t.value)}>
                        {t.label}
                    </button>
                ))}
            </div>

            <div className="console-tab-body">
                {tab === 'overview' && <OverviewTab {...tabProps} />}
                {tab === 'settings' && <SettingsTab {...tabProps} />}
                {tab === 'teams' && <TeamsTab {...tabProps} onTournamentsChanged={onTournamentsChanged} />}
                {tab === 'pairings' && <PairingsTab {...tabProps} />}
                {tab === 'matches' && <MatchesTab {...tabProps} />}
            </div>
        </div>
    );
}

function NextStepStrip({ overview, onGo }) {
    const teams = overview.teams || [];
    const stats = overview.stats || {};
    let step = null;
    if (teams.length === 0) step = { label: 'Chia đội / cặp', tab: 'teams' };
    else if ((stats.totalMatches || 0) === 0) step = { label: 'Sắp xếp pairings', tab: 'pairings' };
    else if ((stats.completedMatches || 0) < (stats.totalMatches || 0)) step = { label: 'Cập nhật cài đặt thi đấu', tab: 'settings' };
    if (!step) return null;
    return (
        <div className="next-step-strip">
            <div>
                <span className="next-step-label">Bước tiếp theo</span>
                <strong>{step.label}</strong>
            </div>
            <button type="button" className="btn-primary" onClick={() => onGo(step.tab)}>Đi tới</button>
        </div>
    );
}
