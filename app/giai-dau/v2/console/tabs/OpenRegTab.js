'use client';

import { useCallback, useEffect, useState } from 'react';
import { listDivisions, getRegistrationBoard, reviewOpenRegistration } from '@/lib/tournamentV2Client';

const STATUS_LABEL = {
  approved: 'Đã duyệt',
  submitted: 'Chờ duyệt',
  awaiting_partner: 'Chờ ghép cặp',
  rejected: 'Từ chối',
  withdrawn: 'Đã rút',
};

function memberNames(reg) {
  return (reg.members || []).map((m) => m.full_name).join(' & ') || '(chưa có tên)';
}

export default function OpenRegTab({ tournamentId, isAdmin }) {
  const [divisions, setDivisions] = useState([]);
  const [divisionId, setDivisionId] = useState(null);
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const list = await listDivisions(tournamentId);
        if (!active) return;
        setDivisions(list);
        if (list.length) setDivisionId((prev) => prev || list[0].id);
      } catch (err) {
        if (active) setError(err.message || 'Không tải được nội dung.');
      }
    })();
    return () => { active = false; };
  }, [tournamentId]);

  const loadBoard = useCallback(async () => {
    if (!divisionId) return;
    setLoading(true);
    setError('');
    try {
      const data = await getRegistrationBoard(divisionId);
      setBoard(data);
    } catch (err) {
      setError(err.message || 'Không tải được bảng đăng ký.');
    } finally {
      setLoading(false);
    }
  }, [divisionId]);

  useEffect(() => { loadBoard(); }, [loadBoard]);

  async function act(reg, action) {
    setBusyId(reg.id);
    setError('');
    try {
      await reviewOpenRegistration({ id: reg.id, action });
      await loadBoard();
    } catch (err) {
      setError(err.message || 'Thao tác thất bại.');
    } finally {
      setBusyId(null);
    }
  }

  function renderRow(reg, actions) {
    return (
      <div className="v2-openreg-row" key={reg.id}>
        <div className="v2-openreg-info">
          <strong>{memberNames(reg)}</strong>
          <span className="v2-openreg-sub">
            {reg.contact_phone_norm}
            {reg.self_declared_club ? ` · ${reg.self_declared_club}` : ''}
            {reg.isWaitlist ? ` · Chờ #${reg.position}` : ''}
          </span>
        </div>
        <div className="v2-openreg-actions">
          {actions.map((a) => (
            <button
              key={a.action}
              type="button"
              className={`v2-btn-small ${a.variant || ''}`}
              disabled={busyId === reg.id}
              onClick={() => act(reg, a.action)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!isAdmin) return <div className="v2-state">Chỉ BTC (admin) mới xem được bảng duyệt đăng ký.</div>;

  return (
    <div className="v2-openreg">
      <div className="v2-openreg-toolbar">
        <label>
          Nội dung:{' '}
          <select value={divisionId || ''} onChange={(e) => setDivisionId(e.target.value)}>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <button type="button" className="v2-btn-secondary" onClick={loadBoard}>Làm mới</button>
      </div>

      {error ? <div className="v2-alert v2-error">{error}</div> : null}
      {loading ? (
        <div className="v2-state">Đang tải...</div>
      ) : board ? (
        <>
          <div className="v2-openreg-summary">
            Sức chứa: {board.capacity == null ? 'Không giới hạn' : board.capacity}
            {board.free_slots != null ? ` · Còn ${board.free_slots} suất` : ''}
          </div>

          <section className="v2-openreg-group">
            <h3>Chờ duyệt ({board.counts.submitted})</h3>
            {(board.groups.submitted || []).map((reg) => renderRow(reg, [
              { action: 'admit', label: 'Duyệt', variant: 'primary' },
              { action: 'reject_open', label: 'Từ chối' },
            ]))}
          </section>

          <section className="v2-openreg-group">
            <h3>Đã duyệt ({board.counts.approved})</h3>
            {(board.groups.approved || []).map((reg) => renderRow(reg, [
              { action: 'remove', label: 'Bỏ duyệt' },
            ]))}
          </section>

          <section className="v2-openreg-group">
            <h3>Chờ ghép cặp ({board.counts.awaiting_partner})</h3>
            {(board.groups.awaiting_partner || []).map((reg) => renderRow(reg, []))}
          </section>

          <section className="v2-openreg-group">
            <h3>Từ chối ({board.counts.rejected})</h3>
            {(board.groups.rejected || []).map((reg) => renderRow(reg, [
              { action: 'restore', label: 'Khôi phục' },
            ]))}
          </section>
        </>
      ) : null}
    </div>
  );
}
