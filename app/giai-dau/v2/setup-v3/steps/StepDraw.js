'use client';

import { useId, useMemo, useState } from 'react';
import { messageFor } from '@/lib/tournament/setupMessages';
import { estimateSchedule } from '@/lib/tournament/setupSchedule';
import { StudioDialog } from '../StudioChrome';

const ROUND_NAME = { QF: 'Tứ kết', SF: 'Bán kết', F: 'Chung kết', BRONZE: 'Tranh hạng ba' };

function roundName(matchKey) {
  if (matchKey === 'F' || matchKey === 'BRONZE') return ROUND_NAME[matchKey];
  const prefix = String(matchKey).replace(/\d+$/, '');
  return ROUND_NAME[prefix] ? `${ROUND_NAME[prefix]} ${String(matchKey).replace(/^\D+/, '')}` : matchKey;
}

function usePairNames(draft, roster) {
  return useMemo(() => {
    const people = new Map();
    for (const row of roster || []) people.set(`member:${row.member_id}`, row.full_name);
    for (const guest of draft.participants.guests) people.set(`guest:${guest.clientRef}`, `${guest.displayName} (khách)`);
    const pairs = new Map(draft.pairs.map((pair) => [pair.pairId, pair.participantRefs.map((ref) => people.get(ref) || '—').join(' / ')]));
    return (pairId) => pairs.get(pairId) || 'Cặp';
  }, [draft.pairs, draft.participants.guests, roster]);
}

function DrawIntro({ draft, busy, onDraw }) {
  const config = draft.format.config || {};
  return (
    <section className="pc-card pc-card--hero">
      <p className="pc-eyebrow">Bước 4</p>
      <h2 className="pc-hero-title">Bốc thăm, xem trước lịch &amp; chốt</h2>
      <p className="pc-lead">{draft.format.formatKey === 'round_robin'
        ? `Bốc thăm xác định thứ tự các lượt đấu của ${draft.pairs.length} cặp. Có thể bốc lại trước khi chốt.`
        : `Bốc thăm chia ${draft.pairs.length} cặp vào ${config.groupCount ?? 2} bảng. Có thể bốc lại trước khi chốt.`}</p>
      <div className="pc-btn-row" style={{ marginTop: '1rem' }}>
        <button type="button" className="pc-btn pc-btn--primary" disabled={busy} onClick={() => onDraw('draw')}>Bốc thăm</button>
      </div>
    </section>
  );
}

function StaleNotice({ blocker, busy, onDraw }) {
  const groupsChanged = blocker.params?.groupsChanged !== false;
  return (
    <div className="pc-notice pc-notice--warn" role="alert" style={{ flexDirection: 'column' }} data-code="DRAW_STALE">
      <p><strong>Cấu hình đã thay đổi so với lần bốc thăm.</strong> {groupsChanged ? 'Cặp hoặc cách chia bảng đã đổi nên cần bốc thăm lại.' : 'Chỉ đổi tranh hạng ba hoặc số ván: cập nhật xem trước là đủ, giữ nguyên kết quả chia bảng.'}</p>
      <div className="pc-btn-row">
        {!groupsChanged ? <button type="button" className="pc-btn pc-btn--primary" disabled={busy} onClick={() => onDraw('preview')}>Cập nhật xem trước</button> : null}
        <button type="button" className={`pc-btn ${groupsChanged ? 'pc-btn--primary' : ''}`} disabled={busy} onClick={() => onDraw('draw')}>Bốc thăm lại</button>
      </div>
    </div>
  );
}

function Groups({ plan, pairName, onRedraw, busy }) {
  const base = useId();
  const single = plan.groups.length === 1;
  return (
    <section className="pc-card" aria-labelledby={`${base}-t`}>
      <div className="pc-card__head">
        <h3 id={`${base}-t`} className="pc-card__title"><span className="pc-section-key">1</span>{single ? 'Danh sách cặp' : 'Chia bảng'}</h3>
        <button type="button" className="pc-btn pc-btn--sm" disabled={busy} onClick={onRedraw}>Bốc lại</button>
      </div>
      <div className="pc-groups">
        {plan.groups.map((group) => (
          <div key={group.label} className="pc-group">
            <div className="pc-group__head"><span className="pc-badge pc-badge--brand">{single ? 'Vòng tròn' : `Bảng ${group.label}`}</span><span className="pc-card__hint">{group.entryIds.length} cặp</span></div>
            <ol className="pc-group__list">
              {group.entryIds.map((pairId) => <li key={pairId}>{pairName(pairId)}</li>)}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}

function Bracket({ plan }) {
  const base = useId();
  const knockout = plan.matches.filter((match) => match.stageKind === 'knockout');
  if (!knockout.length) return null;
  const rounds = [...new Set(knockout.map((match) => match.round))].sort((a, b) => a - b);
  return (
    <section className="pc-card" aria-labelledby={`${base}-t`}>
      <div className="pc-card__head">
        <h3 id={`${base}-t`} className="pc-card__title"><span className="pc-section-key">2</span>Nhánh loại trực tiếp</h3>
        <span className="pc-card__hint">Tránh hai cặp cùng bảng gặp nhau ở vòng đầu</span>
      </div>
      <div className="pc-bracket" tabIndex={0} aria-label="Sơ đồ nhánh, cuộn ngang để xem hết">
        {rounds.map((round) => (
          <div key={round} className="pc-bracket__round">
            {knockout.filter((match) => match.round === round).map((match) => (
              <div key={match.matchKey} className="pc-bracket__match" data-final={match.matchKey === 'F' || undefined}>
                <div className="pc-bracket__title">
                  <span>{roundName(match.matchKey)}</span>
                  <span className="pc-badge pc-badge--muted">BO{match.matchKey === 'F' ? plan.finalBestOf || 1 : 1}</span>
                </div>
                <div className="pc-bracket__slot">{match.slotA?.label}</div>
                <div className="pc-bracket__slot">{match.slotB?.label}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function Schedule({ plan, draft, pairName }) {
  const base = useId();
  const estimate = useMemo(() => estimateSchedule(plan, { courtCount: draft.tournament.courtCount, startTime: draft.tournament.startTime }), [plan, draft.tournament.courtCount, draft.tournament.startTime]);
  const byKey = new Map(plan.matches.map((match) => [match.matchKey, match]));
  const hours = Math.floor(estimate.totalMinutes / 60);
  const minutes = estimate.totalMinutes % 60;
  return (
    <section className="pc-card" aria-labelledby={`${base}-t`}>
      <div className="pc-card__head">
        <h3 id={`${base}-t`} className="pc-card__title"><span className="pc-section-key">{plan.counts.knockoutMatches ? 3 : 2}</span>Lịch thi đấu dự kiến ({plan.counts.total} trận)</h3>
        <span className="pc-card__hint">Giờ chỉ là ước tính; xếp sân thật ở màn điều hành</span>
      </div>
      <div className="pc-stats">
        <div><span>Cặp đấu</span><strong>{draft.pairs.length}</strong></div>
        <div><span>Tổng trận</span><strong>{plan.counts.total}</strong><small>{plan.counts.knockoutMatches ? `${plan.counts.groupMatches} vòng bảng · ${plan.counts.knockoutMatches} loại trực tiếp` : `${plan.rounds || 0} lượt đấu`}</small></div>
        <div><span>Số sân</span><strong>{draft.tournament.courtCount || '—'}</strong></div>
        <div><span>Khung giờ</span><strong>{estimate.startsAt ? `${estimate.startsAt} – ${estimate.endsAt}` : '—'}</strong><small>~{hours ? `${hours} giờ ` : ''}{minutes} phút</small></div>
      </div>
      <div className="pc-table-wrap">
        <table className="pc-table">
          <thead><tr><th scope="col">Giờ</th><th scope="col">Sân</th><th scope="col">Vòng / Bảng</th><th scope="col">Cặp đấu</th><th scope="col">Số ván</th></tr></thead>
          <tbody>
            {estimate.rows.map((row) => {
              const match = byKey.get(row.matchKey);
              const vs = match.stageKind === 'group'
                ? `${pairName(match.entryAId)} gặp ${pairName(match.entryBId)}`
                : `${match.slotA?.label} gặp ${match.slotB?.label}`;
              return (
                <tr key={row.matchKey} data-final={match.matchKey === 'F' || undefined}>
                  <td data-label="Giờ">{row.startsAt || '—'}</td>
                  <td data-label="Sân">Sân {row.court}</td>
                  <td data-label="Vòng">{match.stageKind !== 'group' ? roundName(match.matchKey) : plan.groups.length === 1 ? `Lượt ${match.round}` : `Bảng ${match.groupLabel} · lượt ${match.round}`}</td>
                  <td data-label="Cặp đấu">{vs}</td>
                  <td data-label="Số ván">BO{row.bestOf}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Criteria({ plan }) {
  const pool = plan.stages?.[0]?.config?.poolCount || 0;
  return (
    <section className="pc-card">
      <div className="pc-card__head"><h3 className="pc-card__title"><span className="pc-section-key">{plan.counts.knockoutMatches ? 4 : 3}</span>Tiêu chí xếp hạng (chỉ đọc)</h3></div>
      <p style={{ margin: '0 0 0.5rem' }}><strong>{(plan.groups || []).length > 1 ? 'Trong mỗi bảng:' : 'Bảng xếp hạng:'}</strong> theo quy chế xếp hạng của giải (mặc định: điểm trận → hiệu số điểm → đối đầu → tổng điểm ghi).</p>
      {pool ? (
        <p style={{ margin: 0 }}><strong>So giữa các bảng cho suất bù:</strong> tỉ lệ thắng → hiệu số điểm trung bình mỗi trận → điểm ghi trung bình mỗi trận → bốc thăm. Dùng số trung bình để bảng ít cặp không bị thiệt.</p>
      ) : null}
    </section>
  );
}

export default function StepDraw({ draft, roster, readiness, busy, onDraw, onFinalize, finalizing, finalizeError }) {
  const [confirm, setConfirm] = useState(null);
  const pairName = usePairNames(draft, roster);
  const plan = draft.draw.plan;
  const blockers = readiness.byStep[4].blockers;
  const stale = blockers.find((item) => item.code === 'DRAW_STALE');
  const ready = readiness.readyToFinalize;
  const warnings = readiness.byStep[4].warnings;

  if (!plan) return <DrawIntro draft={draft} busy={busy} onDraw={onDraw} />;

  return (
    <>
      {stale ? <StaleNotice blocker={stale} busy={busy} onDraw={onDraw} /> : null}
      {warnings.map((item) => (
        <div key={item.code} className="pc-notice pc-notice--warn" data-code={item.code}>
          <p>{messageFor(item.code, item.params).text}</p>
        </div>
      ))}
      <Groups plan={plan} pairName={pairName} busy={busy} onRedraw={() => setConfirm('redraw')} />
      <Bracket plan={plan} />
      <Schedule plan={plan} draft={draft} pairName={pairName} />
      <Criteria plan={plan} />

      <section className="pc-card pc-card--hero" aria-live="polite">
        <p className="pc-eyebrow">Chốt giải</p>
        <h2 className="pc-hero-title" style={{ fontSize: '1.25rem' }}>Chốt bốc thăm &amp; tạo lịch?</h2>
        <p className="pc-lead">Sau khi chốt, danh sách cặp và kết quả bốc thăm được khóa, lịch thi đấu được tạo. Giải chưa bắt đầu cho tới khi bạn mở trận ở màn điều hành.</p>
        {finalizeError ? (
          <div className="pc-notice pc-notice--error" role="alert" data-code={finalizeError.code} style={{ marginTop: '0.75rem' }}>
            <p>{finalizeError.message || messageFor(finalizeError.code).text}</p>
          </div>
        ) : null}
        <div className="pc-btn-row" style={{ marginTop: '1rem' }}>
          <button type="button" className="pc-btn pc-btn--primary" disabled={!ready || busy || finalizing} onClick={() => setConfirm('finalize')}>
            {finalizing ? 'Đang chốt…' : 'Chốt bốc thăm & tạo lịch'}
          </button>
        </div>
      </section>

      {confirm === 'redraw' ? (
        <StudioDialog
          title="Bốc thăm lại?"
          onClose={() => setConfirm(null)}
          actions={(
            <>
              <button type="button" className="pc-btn" onClick={() => setConfirm(null)}>Giữ kết quả hiện tại</button>
              <button type="button" className="pc-btn pc-btn--primary" onClick={() => { setConfirm(null); onDraw('draw'); }}>Bốc lại</button>
            </>
          )}
        >
          <p>Kết quả chia bảng hiện tại sẽ được thay bằng lần bốc mới.</p>
        </StudioDialog>
      ) : null}
      {confirm === 'finalize' ? (
        <StudioDialog
          title="Chốt giải?"
          onClose={() => setConfirm(null)}
          actions={(
            <>
              <button type="button" className="pc-btn" onClick={() => setConfirm(null)}>Xem lại</button>
              <button type="button" className="pc-btn pc-btn--primary" onClick={() => { setConfirm(null); onFinalize(); }}>Chốt &amp; tạo lịch</button>
            </>
          )}
        >
          <p>{draft.pairs.length} cặp, {plan.counts.total} trận. Sau khi chốt không sửa được danh sách cặp qua màn thiết lập.</p>
        </StudioDialog>
      ) : null}
    </>
  );
}
