'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { listTournaments, listStages } from '@/lib/tournamentV2Client';
import { getCurrentGroupClient } from '@/lib/groupClient';
import OverviewTab from './tabs/OverviewTab';
import ResultsTab from './tabs/ResultsTab';
import StandingsTab from './tabs/StandingsTab';
import BracketTab from './tabs/BracketTab';
import TeamsTab from './tabs/TeamsTab';
import SettingsTab from './tabs/SettingsTab';
import './console.css';

const TABS = [
    { key: 'overview', label: 'Tổng quan' },
    { key: 'results', label: 'Kết quả' },
    { key: 'standings', label: 'Bảng xếp hạng' },
    { key: 'bracket', label: 'Sơ đồ' },
    { key: 'teams', label: 'Đội' },
    { key: 'settings', label: 'Cài đặt' },
];

const VALID_TABS = TABS.map((t) => t.key);

export default function TournamentConsoleV2({ tournamentId }) {
    const searchParams = useSearchParams();
    const router = useRouter();

    const tabParam = searchParams.get('tab');
    const activeTab = VALID_TABS.includes(tabParam) ? tabParam : 'overview';

    const [tournament, setTournament] = useState(null);
    const [stages, setStages] = useState([]);
    const [activeStageId, setActiveStageId] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [list, stageList] = await Promise.all([
                listTournaments(),
                listStages(tournamentId),
            ]);
            const t = (Array.isArray(list) ? list : []).find(
                (x) => String(x.id) === String(tournamentId),
            );
            setTournament(t || null);
            const sList = Array.isArray(stageList) ? stageList : [];
            setStages(sList);
            setActiveStageId((prev) => {
                if (prev && sList.some((s) => String(s.id) === String(prev))) return prev;
                return sList.length ? sList[0].id : null;
            });
        } catch (err) {
            setError(err.message || 'Không tải được dữ liệu giải.');
        } finally {
            setLoading(false);
        }
    }, [tournamentId]);

    useEffect(() => {
        const group = getCurrentGroupClient();
        setIsAdmin(group.role === 'admin');
        load();
    }, [load]);

    function selectTab(key) {
        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', key);
        router.push(`/giai-dau/v2?${params.toString()}`);
    }

    const activeStage = stages.find((s) => String(s.id) === String(activeStageId)) || null;

    if (loading) {
        return (
            <div className="v2-state v2-loading">
                <span className="v2-spinner" aria-hidden="true" />
                <p>Đang tải dữ liệu giải...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="v2-state v2-error">
                <p>{error}</p>
                <button type="button" className="v2-btn-secondary" onClick={load}>
                    Thử lại
                </button>
            </div>
        );
    }

    const tabProps = {
        tournamentId,
        tournament,
        stageId: activeStageId,
        stage: activeStage,
        stages,
        isAdmin,
        reload: load,
    };

    return (
        <div className="v2-console">
            <header className="v2-console-head">
                <h1 className="v2-console-title">{tournament ? tournament.name : 'Giải đấu'}</h1>
            </header>

            <nav className="v2-tabbar" aria-label="Mục console">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        className={`v2-tab ${activeTab === t.key ? 'active' : ''}`}
                        onClick={() => selectTab(t.key)}
                    >
                        {t.label}
                    </button>
                ))}
            </nav>

            {stages.length > 1 ? (
                <div className="v2-stage-picker" role="tablist" aria-label="Giai đoạn">
                    {stages.map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            className={`v2-stage-seg ${String(activeStageId) === String(s.id) ? 'active' : ''}`}
                            onClick={() => setActiveStageId(s.id)}
                        >
                            {s.name}
                        </button>
                    ))}
                </div>
            ) : null}

            <div className="v2-tab-panel">
                {activeTab === 'overview' ? <OverviewTab {...tabProps} /> : null}
                {activeTab === 'results' ? <ResultsTab {...tabProps} /> : null}
                {activeTab === 'standings' ? <StandingsTab {...tabProps} /> : null}
                {activeTab === 'bracket' ? <BracketTab {...tabProps} /> : null}
                {activeTab === 'teams' ? <TeamsTab {...tabProps} /> : null}
                {activeTab === 'settings' ? <SettingsTab {...tabProps} /> : null}
            </div>
        </div>
    );
}
