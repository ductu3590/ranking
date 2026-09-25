'use client';

import { useState, useEffect, useCallback } from 'react';
import { getStandings, listEntrants, advanceStage } from '@/lib/tournamentV2Client';
import { StandingsView } from '../standingsRender';
import { runStageAction } from '../stageAction';
import '../bracket.css';

// Tab Bảng xếp hạng — nhánh theo schedule_format (round_robin | knockout | double_elim).
export default function StandingsTab({ tournamentId, tournament, stageId, stages, isAdmin, reload }) {
    const [data, setData] = useState(null); // { schedule_format, standings }
    const [entrantsById, setEntrantsById] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [advancing, setAdvancing] = useState(false);
    const [advanceNotice, setAdvanceNotice] = useState('');

    const stage = (stages || []).find((s) => String(s.id) === String(stageId)) || null;

    const load = useCallback(async () => {
        if (!stageId) {
            setData(null);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const [standings, entrants] = await Promise.all([
                getStandings(stageId),
                listEntrants(tournamentId),
            ]);
            setData(standings);
            const map = {};
            for (const e of entrants || []) map[String(e.id)] = e;
            setEntrantsById(map);
        } catch (err) {
            setError(err.message || 'Không tải được bảng xếp hạng.');
        } finally {
            setLoading(false);
        }
    }, [stageId, tournamentId]);

    useEffect(() => {
        load();
    }, [load]);

    if (loading) {
        return (
            <div className="v2-state v2-loading">
                <span className="v2-spinner" aria-hidden="true" />
                <p>Đang tính bảng xếp hạng...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="v2-state v2-error">
                <p>{error}</p>
                <button type="button" className="v2-btn-secondary" onClick={load}>Thử lại</button>
            </div>
        );
    }

    if (!data || !data.standings || !data.standings.length) {
        return (
            <div className="v2-state v2-empty">
                <p>Chưa có dữ liệu xếp hạng. Hãy nhập tỉ số ở tab Kết quả.</p>
            </div>
        );
    }

    // Tiến cấp vòng bảng -> play-off. Hành động này đã có sẵn RPC/route nhưng
    // trước đây không có lối vào nào trên giao diện (OverviewTab không được mount),
    // nên BTC không thể seed bán kết từ UI.
    // Chặng cuối: chốt chặng rồi chuyển giải sang "Đã kết thúc" (D35) — dùng chung với thẻ ở mục Điều hành.
    async function handleAdvance(kind) {
        if (!stageId || advancing) return;
        setAdvancing(true);
        setAdvanceNotice('');
        try {
            if (kind === 'finish' || kind === 'complete') {
                const outcome = await runStageAction({ kind, stageId, stageName: stage?.name, tournamentStatus: tournament?.status }, tournamentId);
                setAdvanceNotice(outcome?.message || 'Đã kết thúc giải.');
                if (reload) await reload();
                await load();
                return;
            }
            const res = await advanceStage(stageId);
            setAdvanceNotice(res?.final
                ? 'Đã hoàn tất giai đoạn cuối.'
                : `Đã tiến cấp ${res?.advanced ?? 0} suất sang vòng sau.`);
            if (reload) await reload();
            await load();
        } catch (advanceError) {
            setAdvanceNotice(advanceError?.message || 'Không tiến cấp được.');
        } finally {
            setAdvancing(false);
        }
    }

    // Chặng cuối (vd. giải vòng tròn một chặng): không có play-off, nút là "kết thúc giải".
    const isLastStage = !(stages || []).some((other) => stage && other.id !== stage.id
        && String(other.division_id ?? '') === String(stage.division_id ?? '')
        && Number(other.stage_order) > Number(stage.stage_order));
    const format = data.schedule_format || stage?.schedule_format;
    // Nhánh loại trực tiếp (Lát C) và loại kép (Epic 1) của setup v4 cũng cần chốt chặng cuối; stage knockout cũ giữ nguyên.
    const canAdvance = Boolean(isAdmin && stageId && (format === 'round_robin'
        || (format === 'knockout' && isLastStage && String(stage?.config?.setupPlanVersion) === '4')
        || (format === 'double_elim' && isLastStage && String(stage?.config?.setupPlanVersion) === '4')));
    const completed = stage?.status === 'completed';
    const tournamentDone = tournament?.status === 'completed' || tournament?.status === 'archived';

    return (
        <>
            {canAdvance && completed && isLastStage && tournamentDone ? (
                <p className="v2-result" style={{ marginBottom: 12 }}>Giải đã kết thúc — bảng xếp hạng dưới đây là kết quả chung cuộc.</p>
            ) : null}
            {canAdvance && completed && isLastStage && !tournamentDone ? (
                <div className="v2-settings-block" style={{ marginBottom: 12 }}>
                    <p className="v2-notice-info" style={{ marginBottom: 8 }}>Đã chốt chặng cuối nhưng giải chưa chuyển sang “Đã kết thúc”.</p>
                    <button type="button" className="v2-btn-primary" disabled={advancing} onClick={() => handleAdvance('complete')}>
                        {advancing ? 'Đang kết thúc...' : 'Kết thúc giải & chốt xếp hạng'}
                    </button>
                    {advanceNotice ? <p className="v2-notice">{advanceNotice}</p> : null}
                </div>
            ) : null}
            {canAdvance && !(completed && isLastStage) ? (
                <div className="v2-settings-block" style={{ marginBottom: 12 }}>
                    <button type="button" className="v2-btn-primary" disabled={advancing} onClick={() => handleAdvance(isLastStage ? 'finish' : 'advance')}>
                        {advancing
                            ? (isLastStage ? 'Đang kết thúc...' : 'Đang tiến cấp...')
                            : (isLastStage ? 'Kết thúc giải & chốt xếp hạng' : 'Tiến cấp vào play-off')}
                    </button>
                    {advanceNotice ? <p className="v2-notice">{advanceNotice}</p> : null}
                </div>
            ) : null}
        <StandingsView
            scheduleFormat={data.schedule_format || stage?.schedule_format}
            rows={data.standings}
            entrantsById={entrantsById}
            outlook={data.outlook}
            tiebreakCriteria={data.tiebreak_criteria}
            criteriaLabel="Tiêu chí xếp hạng"
        />
        </>
    );
}
