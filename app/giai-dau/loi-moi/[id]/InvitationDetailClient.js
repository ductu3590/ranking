'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getFriendlyInvitation, guestInvitationAction } from '@/lib/tournamentV2Client';
import { CLUB_COLORS } from '@/lib/tournament/friendlyStandings';
import ClubChip from '../../v2/console/friendly/ClubChip';
import { errorText, timeLabel, dateTimeLabel } from '../../v2/setup-v3/friendly/friendlyUi';
import { deadlineLabel, eventLabel } from '../invitationGroups';
import { LiPage, LiStatus, LiTopbar } from '../liShared';
import GuestRosterEditor from './GuestRosterEditor';

function Header({ invitation }) {
  const t = invitation.tournament || {};
  const when = eventLabel(t);
  return (
    <section className="li-card">
      <div className="li-card__head">
        <div>
          <h2 className="li-title">{t.name || 'Giải giao hữu'}</h2>
          <p className="li-muted">{invitation.hostClub?.name || 'CLB chủ nhà'} mời CLB bạn</p>
          <ClubChip name={invitation.hostClub?.name} color={CLUB_COLORS[0]} />
        </div>
        <LiStatus status={invitation.status} label={invitation.statusLabel} />
      </div>
      <ul className="li-meta">
        {when ? <li><span aria-hidden="true">📅</span>{when}</li> : null}
        {t.location ? <li><span aria-hidden="true">📍</span>{t.location}</li> : null}
        {invitation.formatLabel ? <li><span aria-hidden="true">🏆</span>Thể thức: {invitation.formatLabel}</li> : null}
        <li>
          <span aria-hidden="true">👥</span>{invitation.quota != null ? `Hạn mức ${invitation.quota} cặp` : 'Không giới hạn cặp'}
          {invitation.window?.deadline ? <span className="li-deadline">⏰ Hạn chót {deadlineLabel(invitation.window.deadline)}</span> : null}
        </li>
      </ul>
      {invitation.invitationNote ? <p className="li-quote">“{invitation.invitationNote}”</p> : null}
    </section>
  );
}

function PairList({ pairs }) {
  return (
    <ol className="li-list">
      {pairs.map((pair, index) => <li key={pair.pairId || index}><strong>Cặp {index + 1}</strong> · {pair.names.join(' + ')}</li>)}
    </ol>
  );
}

function ConfirmDialog({ tone = 'danger', title, body, confirmLabel, busy, onCancel, onConfirm, extra }) {
  return (
    <div className="li-dialog-backdrop" onKeyDown={(event) => { if (event.key === 'Escape') onCancel(); }}>
      <div className="li-dialog" role="alertdialog" aria-modal="true" aria-labelledby="li-confirm-title">
        <span className="li-icon" data-tone={tone === 'danger' ? 'warn' : 'brand'} aria-hidden="true">!</span>
        <h2 id="li-confirm-title">{title}</h2>
        <p className="li-muted">{body}</p>
        <div className="li-row">
          <button type="button" className="li-btn" disabled={busy} onClick={onCancel} autoFocus>{tone === 'danger' ? 'Quay lại' : 'Ở lại'}</button>
          <button type="button" className="li-btn li-btn--danger-solid" disabled={busy} onClick={onConfirm}>{confirmLabel}</button>
        </div>
        {extra}
      </div>
    </div>
  );
}

// Chi tiết lời mời + đăng ký cặp của CLB khách (Stitch FRD-06, spec F3 §4.4). Mọi thao tác qua guestInvitationAction
// (mang expected_version); nút hiện theo `invitation.actions` của server, không tự suy từ trạng thái.
export default function InvitationDetailClient({ id }) {
  const router = useRouter();
  const payloadRef = useRef(null);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [conflict, setConflict] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await getFriendlyInvitation(id);
      setData(next);
      setLoadError('');
      setConflict(false);
      return next;
    } catch (error) {
      setLoadError(error?.status === 404 ? 'Không tìm thấy lời mời, hoặc lời mời không thuộc CLB bạn.' : errorText(error, 'Không tải được lời mời.'));
      return null;
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const invitation = data?.invitation || null;
  const has = (action) => Boolean(invitation?.actions?.includes(action));

  async function act(action, { roster, version } = {}) {
    setBusy(true);
    setNotice(null);
    try {
      const result = await guestInvitationAction(id, { action, expectedVersion: version ?? invitation.version, roster });
      setData((current) => ({ ...current, invitation: result.invitation }));
      return result.invitation;
    } catch (error) {
      if (error?.code === 'FRIENDLY_CLUB_VERSION_CONFLICT') setConflict(true);
      else {
        setNotice({ tone: 'error', text: errorText(error) });
        if (error?.code === 'FRIENDLY_REGISTRATION_CLOSED' || error?.code === 'FRIENDLY_TRANSITION_INVALID') load();
      }
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function save(roster) {
    const next = await act('save_roster', { roster });
    if (next) setNotice({ tone: 'ok', text: `Đã lưu nháp lúc ${timeLabel(new Date().toISOString())}.` });
    return next;
  }

  // Gửi luôn gửi BẢN ĐÃ LƯU (route bỏ qua roster của submit) → còn thay đổi thì lưu trước.
  async function submit(roster, isDirty) {
    let version = invitation.version;
    if (isDirty) {
      const saved = await act('save_roster', { roster });
      if (!saved) return;
      version = saved.version;
    }
    const next = await act('submit_roster', { version });
    if (next) setNotice({ tone: 'ok', text: 'Đã gửi danh sách. Chờ chủ nhà duyệt.' });
  }

  function leave() {
    if (dirty) setConfirm('leave');
    else router.push('/giai-dau/loi-moi');
  }

  if (loadError && !data) {
    return (
      <LiPage label="Lời mời giải">
        <LiTopbar title="Lời mời giải" />
        <section className="li-card li-card--center" role="alert">
          <p>{loadError}</p>
          <button type="button" className="li-btn li-btn--primary" onClick={load}>Thử lại</button>
        </section>
      </LiPage>
    );
  }
  if (!invitation) {
    return (
      <LiPage label="Lời mời giải">
        <LiTopbar title="Lời mời giải" />
        <section className="li-card" aria-busy="true"><div className="li-skeleton" aria-hidden="true"><i /><i /><i /></div><p className="li-muted" role="status">Đang tải lời mời…</p></section>
      </LiPage>
    );
  }

  const win = invitation.window || {};
  const closed = !win.open && !invitation.finalized;
  const memberName = new Map((data.members || []).map((member) => [`member:${member.memberId}`, member.name]));
  const draftPairs = (invitation.rosterDraft?.pairs || []).map((pair) => ({ pairId: pair.pairId, names: pair.participantRefs.map((ref) => memberName.get(ref) || 'Thành viên') }));
  const sentPairs = (invitation.rosterSubmitted?.pairs || []).map((pair) => ({ pairId: pair.pairId, names: pair.members.map((member) => member.name || 'Thành viên') }));
  const sentCount = invitation.rosterSubmitted?.pairCount ?? sentPairs.length;
  const closedReason = win.reason === 'LOCKED' ? `chủ nhà khoá lúc ${timeLabel(win.lockedAt)}` : win.reason === 'DEADLINE_PASSED' ? 'đã qua hạn chót' : 'chủ nhà đã đóng';

  return (
    <LiPage label="Lời mời giải">
      <LiTopbar title="Lời mời giải" onBack={leave} />

      {conflict ? (
        <div className="li-banner" data-tone="warn" role="alert" data-code="FRIENDLY_CLUB_VERSION_CONFLICT">
          <p><strong>Danh sách vừa được lưu ở máy khác.</strong></p>
          <button type="button" className="li-btn li-btn--sm" disabled={busy} onClick={() => { setDirty(false); load(); }}>Tải bản mới nhất</button>
        </div>
      ) : null}
      {invitation.status === 'changes_requested' && invitation.reviewNote ? (
        <div className="li-banner" data-tone="warn"><p><strong>Chủ nhà yêu cầu sửa:</strong> {invitation.reviewNote}</p></div>
      ) : null}
      {notice ? (
        <div className="li-banner" data-tone={notice.tone === 'error' ? 'error' : 'ok'} role={notice.tone === 'error' ? 'alert' : 'status'}><p>{notice.text}</p></div>
      ) : null}

      <Header invitation={invitation} />

      {closed && !['declined', 'withdrawn'].includes(invitation.status) ? (
        <div className="li-banner" data-tone="muted" data-code="FRIENDLY_REGISTRATION_CLOSED"><p>🔒 Đăng ký đã đóng ({closedReason}). Không sửa được danh sách.</p></div>
      ) : null}

      {invitation.finalized ? (
        <section className="li-card">
          <div className="li-card__head"><h2>Giải đã chốt lịch</h2><span className="li-status" data-tone="ok">Đã chốt</span></div>
          {invitation.status === 'approved' ? <p className="li-muted">CLB bạn có {sentCount} cặp trong giải. Theo dõi lịch và kết quả trên trang giải.</p> : null}
          {invitation.publicUrl ? <a className="li-btn li-btn--primary li-btn--block" href={invitation.publicUrl}>Xem trang giải ›</a> : null}
        </section>
      ) : null}

      {invitation.status === 'invited' && !invitation.finalized ? (
        <section className="li-card">
          <h2>Trả lời lời mời</h2>
          <p className="li-muted">Nhận lời để chọn thành viên và ghép cặp. Danh sách chỉ gồm thành viên CLB bạn.</p>
          <button type="button" className="li-btn li-btn--primary li-btn--block" disabled={busy || !has('accept')} onClick={() => act('accept')}>✓ Nhận lời</button>
          <button type="button" className="li-btn li-btn--danger li-btn--block" disabled={busy || !has('decline')} onClick={() => setConfirm('decline')}>✕ Từ chối</button>
        </section>
      ) : null}

      {invitation.canEdit ? (
        <GuestRosterEditor
          invitation={invitation} members={data.members || []} busy={busy} payloadRef={payloadRef}
          onSave={save} onSubmit={submit} onDirtyChange={setDirty}
        />
      ) : null}

      {!invitation.canEdit && ['accepted', 'changes_requested'].includes(invitation.status) && !invitation.finalized ? (
        <section className="li-card">
          <div className="li-card__head"><h2>Danh sách cặp đấu</h2><span className="li-status">{draftPairs.length} cặp · đã khoá sửa</span></div>
          {draftPairs.length ? <PairList pairs={draftPairs} /> : <p className="li-muted">Chưa có cặp nào.</p>}
        </section>
      ) : null}

      {invitation.status === 'roster_submitted' ? (
        <section className="li-card">
          <div className="li-card__head">
            <div><h2>Đã gửi {sentCount} cặp · chờ chủ nhà duyệt</h2>{invitation.rosterSubmitted?.submittedAt ? <p className="li-muted">Gửi lúc {dateTimeLabel(invitation.rosterSubmitted.submittedAt)}</p> : null}</div>
            <LiStatus status={invitation.status} label={invitation.statusLabel} />
          </div>
          <PairList pairs={sentPairs} />
          {has('unsubmit') ? (
            <>
              <button type="button" className="li-btn li-btn--block" disabled={busy} onClick={() => act('unsubmit')}>↻ Rút lại để sửa</button>
              <p className="li-muted" style={{ textAlign: 'center' }}>Rút lại để chỉnh rồi gửi lại. Chủ nhà sẽ chờ bản mới.</p>
            </>
          ) : null}
        </section>
      ) : null}

      {invitation.status === 'approved' && !invitation.finalized ? (
        <section className="li-card">
          <div className="li-banner" data-tone="ok"><p><strong>✓ Đã duyệt · {sentCount} cặp</strong></p></div>
          <PairList pairs={sentPairs} />
          {has('withdraw') ? <button type="button" className="li-btn li-btn--danger li-btn--block" disabled={busy} onClick={() => setConfirm('withdraw')}>Rút khỏi giải</button> : null}
        </section>
      ) : null}

      {invitation.status === 'declined' ? <section className="li-card"><p className="li-muted">CLB bạn đã từ chối lời mời này.</p></section> : null}
      {invitation.status === 'withdrawn' ? <section className="li-card"><p className="li-muted">Lời mời đã bị huỷ hoặc CLB bạn đã rút khỏi giải.</p></section> : null}

      {confirm === 'decline' ? (
        <ConfirmDialog title="Từ chối lời mời?" body={`${invitation.hostClub?.name || 'Chủ nhà'} sẽ được báo là CLB bạn không tham gia giải này.`}
          confirmLabel="Từ chối" busy={busy} onCancel={() => setConfirm(null)}
          onConfirm={async () => { await act('decline'); setConfirm(null); }} />
      ) : null}
      {confirm === 'withdraw' ? (
        <ConfirmDialog title="Rút khỏi giải?" body="Các cặp của CLB bạn sẽ bị bỏ khỏi giải. Chủ nhà sẽ nhận thông báo."
          confirmLabel="Rút khỏi giải" busy={busy} onCancel={() => setConfirm(null)}
          onConfirm={async () => { await act('withdraw'); setConfirm(null); }} />
      ) : null}
      {confirm === 'leave' ? (
        <ConfirmDialog tone="leave" title="Rời trang khi chưa lưu?" body="Các thay đổi ghép cặp chưa lưu sẽ mất."
          confirmLabel="Rời trang" busy={busy} onCancel={() => setConfirm(null)}
          onConfirm={() => { setDirty(false); setConfirm(null); router.push('/giai-dau/loi-moi'); }}
          extra={(
            <button type="button" className="li-btn li-btn--ghost" disabled={busy} onClick={async () => {
              const saved = payloadRef.current ? await save(payloadRef.current()) : null;
              setConfirm(null);
              if (saved) { setDirty(false); router.push('/giai-dau/loi-moi'); }
            }}>Lưu nháp rồi rời</button>
          )} />
      ) : null}
    </LiPage>
  );
}
