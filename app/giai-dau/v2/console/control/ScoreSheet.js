'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listMatches, saveGames } from '@/lib/tournamentV2Client';
import { validateGameScore } from '@/lib/tournament/rules/scoring';
import { registerLeaveGuard } from '../leaveGuard';

// Sheet nhập tỉ số một trận (spec Epic 2, Lát E1 §6.1, §6.5; thiết kế canonical/operations/03-score-entry).
// Luật trận chỉ đọc (D8/D14). Chốt đủ ván thắng → server tiến cấp. Trận đã chốt: chỉ xem.

const ERROR_TEXT = {
  INVALID_SCORE: 'tỉ số không hợp lệ (hai bên không được bằng nhau)',
  SCORE_CAP_EXCEEDED: 'vượt điểm trần',
  POINTS_TO_NOT_REACHED: 'bên thắng chưa đạt điểm tới',
  WIN_BY_NOT_MET: 'phải thắng cách',
};

function ruleText(rule) {
  if (!rule) return '';
  const cap = rule.cap ? ` · trần ${rule.cap}` : '';
  return `BO${rule.bestOf} · tới ${rule.pointsTo} · cách ${rule.winBy}${cap}`;
}

function emptyRow() { return { a: '', b: '' }; }

function rowsFromGames(games) {
  const rows = (games || [])
    .filter((game) => game.kind !== 'dreambreaker')
    .sort((left, right) => (Number(left.game_no) || 0) - (Number(right.game_no) || 0))
    .map((game) => ({ a: String(game.score_a ?? ''), b: String(game.score_b ?? '') }));
  return rows.length ? rows : [emptyRow()];
}

function sameRows(left, right) {
  const clean = (rows) => rows.filter((row) => row.a !== '' || row.b !== '').map((row) => `${row.a}-${row.b}`).join('|');
  return clean(left) === clean(right);
}

// Đánh giá form: từng ván hợp lệ?, số ván thắng mỗi bên, đã đủ thắng chưa.
function evaluate(rows, rule) {
  const needed = Math.floor((rule?.bestOf || 1) / 2) + 1;
  const scoring = { points_to: rule?.pointsTo, win_by: rule?.winBy, cap: rule?.cap };
  let winsA = 0;
  let winsB = 0;
  let decidedAt = -1;
  const checks = rows.map((row, index) => {
    if (row.a === '' && row.b === '') return { state: 'empty' };
    if (decidedAt >= 0) return { state: 'extra' };
    const game = { score_a: Number(row.a), score_b: Number(row.b) };
    const verdict = validateGameScore(game, scoring, index);
    if (!verdict.ok) return { state: 'invalid', code: verdict.code };
    if (game.score_a > game.score_b) winsA += 1; else winsB += 1;
    if (winsA >= needed || winsB >= needed) decidedAt = index;
    return { state: 'ok', winner: game.score_a > game.score_b ? 'a' : 'b' };
  });
  const filled = checks.filter((check) => check.state !== 'empty');
  const invalid = checks.some((check) => check.state === 'invalid' || check.state === 'extra');
  return { checks, winsA, winsB, needed, complete: decidedAt >= 0 && !invalid, invalid, hasValid: filled.length > 0 && !invalid };
}

function nameOf(side) { return side?.name || side?.source || 'Chờ xác định'; }

export default function ScoreSheet({ match, isAdmin, onClose, onSaved }) {
  const [serverMatch, setServerMatch] = useState(null);
  const [initialRows, setInitialRows] = useState([emptyRow()]);
  const [rows, setRows] = useState([emptyRow()]);
  const [version, setVersion] = useState(match.version);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(null);
  const [overwriting, setOverwriting] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(null);
  const closingRef = useRef(false);

  const rule = match.rule;
  const status = serverMatch?.status || match.status;
  const readOnly = !isAdmin || status === 'finalized';
  const evaluation = useMemo(() => evaluate(rows, rule), [rows, rule]);
  const dirty = !readOnly && !sameRows(rows, initialRows);

  const fetchServer = useCallback(async () => {
    const data = await listMatches(match.stageId);
    const fresh = (data.matches || []).find((item) => String(item.id) === String(match.id)) || null;
    const games = data.gamesByMatchId?.[match.id] || data.gamesByMatchId?.[String(match.id)] || [];
    return { fresh, games };
  }, [match.id, match.stageId]);

  useEffect(() => {
    let alive = true;
    fetchServer().then(({ fresh, games }) => {
      if (!alive) return;
      const loaded = rowsFromGames(games);
      setServerMatch(fresh);
      setVersion(fresh?.version ?? match.version);
      setInitialRows(loaded);
      setRows(loaded);
    }).catch((loadError) => { if (alive) setError(loadError.message || 'Không tải được tỉ số của trận.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [fetchServer, match.version]);

  const finishClose = useCallback(() => {
    closingRef.current = true;
    if (typeof window !== 'undefined' && window.history.state && window.history.state.pcScoreSheet) window.history.back();
    onClose();
  }, [onClose]);

  // Nút Back của trình duyệt: mở sheet thì đẩy một mục lịch sử; Back khi còn thay đổi chưa lưu → hỏi lại.
  const pushedRef = useRef(null);
  useEffect(() => {
    // Chỉ đẩy một lần cho mỗi trận (StrictMode chạy effect hai lần ở dev).
    if (pushedRef.current === match.id) return;
    pushedRef.current = match.id;
    window.history.pushState({ ...(window.history.state || {}), pcScoreSheet: match.id }, '');
  }, [match.id]);

  useEffect(() => {
    function onPopState() {
      if (closingRef.current) return;
      if (dirty) {
        window.history.pushState({ ...(window.history.state || {}), pcScoreSheet: match.id }, '');
        setLeaveConfirm(() => finishClose);
        return;
      }
      closingRef.current = true;
      onClose();
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [dirty, finishClose, match.id, onClose]);

  // Đóng tab / tải lại trang khi còn thay đổi chưa lưu.
  useEffect(() => {
    if (!dirty) return undefined;
    function onBeforeUnload(event) { event.preventDefault(); event.returnValue = ''; return ''; }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // Đổi mục trên sidebar / tab đáy khi còn thay đổi chưa lưu.
  useEffect(() => {
    if (!dirty) return undefined;
    return registerLeaveGuard((proceed) => {
      setLeaveConfirm(() => () => { closingRef.current = true; onClose(); proceed(); });
      return true;
    });
  }, [dirty, onClose]);

  function requestClose() {
    if (dirty) { setLeaveConfirm(() => finishClose); return; }
    finishClose();
  }

  function setScore(index, side, value) {
    const clean = value.replace(/[^0-9]/g, '').slice(0, 2);
    setRows((current) => {
      const next = current.map((row, i) => (i === index ? { ...row, [side]: clean } : row));
      return next;
    });
  }

  function step(index, side, delta) {
    setRows((current) => current.map((row, i) => {
      if (i !== index) return row;
      const value = Math.max(0, (Number(row[side]) || 0) + delta);
      return { ...row, [side]: String(value) };
    }));
  }

  // Ván kế tiếp hiện khi ván trước hợp lệ và trận chưa đủ thắng; tối đa BO.
  useEffect(() => {
    if (readOnly) return;
    const last = evaluation.checks[rows.length - 1];
    if (!evaluation.complete && last && last.state === 'ok' && rows.length < (rule?.bestOf || 1)) {
      setRows((current) => [...current, emptyRow()]);
    }
  }, [evaluation, readOnly, rows.length, rule]);

  async function save(finalize) {
    setBusy(true);
    setError('');
    const games = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.a !== '' || row.b !== '')
      .map(({ row, index }) => ({ game_no: index + 1, kind: 'game', score_a: Number(row.a) || 0, score_b: Number(row.b) || 0 }));
    try {
      const result = await saveGames(match.id, games, { expectedVersion: version });
      if (finalize && !result.complete) {
        setError('Máy chủ chưa ghi nhận đủ ván thắng — kiểm tra lại tỉ số.');
        return;
      }
      closingRef.current = true;
      if (window.history.state && window.history.state.pcScoreSheet) window.history.back();
      onSaved(finalize
        ? `Đã chốt ${match.title}${match.winnerTo ? ` · cặp thắng vào ${match.winnerTo}` : ''}.`
        : `Đã lưu nháp ${match.title}.`);
    } catch (saveError) {
      if (saveError.code === 'MATCH_VERSION_CONFLICT') {
        try {
          const { fresh, games: serverGames } = await fetchServer();
          setConflict({ status: fresh?.status, version: fresh?.version, rows: rowsFromGames(serverGames) });
          setServerMatch(fresh);
        } catch (reloadError) {
          setError(reloadError.message || 'Trận vừa được cập nhật ở máy khác. Tải lại để xem.');
        }
      } else {
        setError(saveError.message || 'Không lưu được tỉ số.');
      }
    } finally {
      setBusy(false);
    }
  }

  function takeServer() {
    setRows(conflict.rows);
    setInitialRows(conflict.rows);
    setVersion(conflict.version);
    setConflict(null);
    setOverwriting(false);
  }

  function keepMine() {
    setVersion(conflict.version);
    setOverwriting(true);
    setConflict((current) => ({ ...current, kept: true }));
  }

  const winnerName = evaluation.complete ? nameOf(evaluation.winsA > evaluation.winsB ? match.a : match.b) : null;
  const canDraft = !readOnly && evaluation.hasValid && !evaluation.complete && (status === 'live' || status === 'paused');
  const canFinalize = !readOnly && evaluation.complete;
  const serverFinalized = conflict && conflict.status === 'finalized';

  return <div className="ops-sheet-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
    <section className="ops-sheet" role="dialog" aria-modal="true" aria-labelledby="ops-sheet-title">
      <span className="ops-sheet-handle" aria-hidden="true" />
      <header className="ops-sheet-head">
        <div>
          <h2 id="ops-sheet-title">{match.title}{match.court ? ` · ${match.court}` : ''}</h2>
          <p className="ops-rule-chip" title="Luật trận cố định từ lúc chốt giải"><span aria-hidden="true">🔒</span>{ruleText(rule)}</p>
        </div>
        <button type="button" className="ops-icon-btn" aria-label="Đóng" onClick={requestClose}>✕</button>
      </header>

      {conflict ? <div className={`ops-banner ${serverFinalized ? 'is-error' : 'is-warn'}`} role="alert">
        <b>{conflict.kept ? 'Bạn đang sửa đè lên tỉ số trên máy chủ (hiện bên cạnh).' : 'Trận vừa được cập nhật ở máy khác.'}</b>
        <div className="ops-compare">
          <div><span>Tỉ số của bạn</span><strong>{rows.filter((row) => row.a !== '' || row.b !== '').map((row) => `${row.a}–${row.b}`).join(', ') || 'chưa nhập'}</strong></div>
          <div><span>Trên máy chủ</span><strong>{conflict.rows.filter((row) => row.a !== '' || row.b !== '').map((row) => `${row.a}–${row.b}`).join(', ') || 'chưa có tỉ số'}{serverFinalized ? ' · đã chốt' : ''}</strong></div>
        </div>
        {serverFinalized ? <p>Trận đã được chốt ở máy khác — không sửa đè ở đây. Muốn đổi kết quả, dùng “Sửa kết quả” ở mục Trận đấu.</p> : null}
        {!conflict.kept ? <div className="ops-actions">
          <button type="button" className="ops-btn" onClick={takeServer}>Tải bản mới nhất</button>
          {!serverFinalized ? <button type="button" className="ops-btn is-primary" onClick={keepMine}>Sửa tiếp từ tỉ số của tôi</button> : null}
        </div> : null}
      </div> : null}

      <div className="ops-versus">
        <div><span>Cặp A</span><b>{nameOf(match.a)}</b></div>
        <i aria-hidden="true">vs</i>
        <div><span>Cặp B</span><b>{nameOf(match.b)}</b></div>
      </div>

      {loading ? <p className="ops-muted">Đang tải tỉ số…</p> : <div className="ops-games">
        {rows.map((row, index) => {
          const check = evaluation.checks[index] || { state: 'empty' };
          const label = `Ván ${index + 1}`;
          return <div key={index} className={`ops-game is-${check.state}`}>
            <div className="ops-game-head">
              <b>{label}</b>
              {check.state === 'ok' ? <span className="ops-chip is-ok">✓ {nameOf(check.winner === 'a' ? match.a : match.b)} thắng ván</span> : null}
            </div>
            <div className="ops-game-scores">
              {['a', 'b'].map((side) => <div key={side} className="ops-score">
                {!readOnly ? <button type="button" className="ops-step" aria-label={`Giảm điểm ${label} ${side === 'a' ? 'cặp A' : 'cặp B'}`} onClick={() => step(index, side, -1)}>−</button> : null}
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  aria-label={`Điểm ${label} ${nameOf(side === 'a' ? match.a : match.b)}`}
                  value={row[side]}
                  readOnly={readOnly}
                  onChange={(event) => setScore(index, side, event.target.value)}
                />
                {!readOnly ? <button type="button" className="ops-step" aria-label={`Tăng điểm ${label} ${side === 'a' ? 'cặp A' : 'cặp B'}`} onClick={() => step(index, side, 1)}>+</button> : null}
              </div>).reduce((acc, node, i) => (i === 0 ? [node] : [...acc, <span key="dash" className="ops-dash" aria-hidden="true">–</span>, node]), [])}
            </div>
            {check.state === 'invalid' ? <p className="ops-field-error">{label}: {ERROR_TEXT[check.code] || 'tỉ số không hợp lệ'}{check.code === 'WIN_BY_NOT_MET' ? ` ${rule?.winBy} điểm` : ''}{check.code === 'POINTS_TO_NOT_REACHED' ? ` (${rule?.pointsTo})` : ''}.</p> : null}
            {check.state === 'extra' ? <p className="ops-field-error">Đã đủ ván thắng — {label.toLowerCase()} không cần nhập.</p> : null}
          </div>;
        })}
      </div>}

      <div className={`ops-result ${evaluation.complete ? 'is-done' : ''}`}>
        {evaluation.complete
          ? <>🏆 <b>{winnerName}</b> thắng {Math.max(evaluation.winsA, evaluation.winsB)}–{Math.min(evaluation.winsA, evaluation.winsB)}{match.winnerTo ? ` · sẽ vào ${match.winnerTo}` : ''}</>
          : <>Cần thắng {evaluation.needed} ván · hiện {evaluation.winsA}–{evaluation.winsB}</>}
      </div>

      {error ? <p className="ops-banner is-error" role="alert">{error}</p> : null}
      {status === 'finalized' && !conflict ? <p className="ops-muted">Trận đã chốt. Sửa kết quả dùng “Sửa kết quả” ở mục Trận đấu.</p> : null}
      {!isAdmin ? <p className="ops-muted">Chỉ quản trị viên được nhập tỉ số.</p> : null}

      {!readOnly ? <footer className="ops-sheet-foot">
        <span className={`ops-dirty ${dirty ? 'is-on' : ''}`}>{dirty ? 'Chưa lưu thay đổi' : 'Không có thay đổi'}</span>
        {overwriting ? <span className="ops-muted">Sẽ ghi đè tỉ số trên máy chủ</span> : null}
        <button type="button" className="ops-btn" disabled={busy || !canDraft || (conflict && !conflict.kept)} onClick={() => save(false)}>Lưu nháp</button>
        <button type="button" className="ops-btn is-primary" disabled={busy || !canFinalize || (conflict && !conflict.kept)} onClick={() => save(true)}>{busy ? 'Đang lưu…' : 'Lưu & chốt trận'}</button>
      </footer> : null}

      {leaveConfirm ? <div className="ops-confirm" role="alertdialog" aria-modal="true" aria-labelledby="ops-leave-title">
        <h3 id="ops-leave-title">Bạn có tỉ số chưa lưu</h3>
        <p>Rời đi sẽ mất tỉ số vừa nhập ở {match.title}.</p>
        <div className="ops-actions">
          <button type="button" className="ops-btn is-danger" onClick={() => { const proceed = leaveConfirm; setLeaveConfirm(null); proceed(); }}>Bỏ thay đổi</button>
          <button type="button" className="ops-btn is-primary" autoFocus onClick={() => setLeaveConfirm(null)}>Ở lại</button>
        </div>
      </div> : null}
    </section>
  </div>;
}
