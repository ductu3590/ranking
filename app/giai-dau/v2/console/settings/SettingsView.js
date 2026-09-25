'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  getOperationsBoard, getPublic, listCourts, listOperationLogs, listVenues, saveCourt, saveVenue, setCourtActive, updateTournament,
} from '@/lib/tournamentV2Client';
import { describeOperationLog } from '@/lib/tournament/operationLogText';
import ShareActions from '../../ShareActions';
import '../control/control.css';
import './settings.css';

// Mục "Cài đặt" cho giải setup v4 (spec Epic 2 E2 §3; Stitch OPS-08). Đọc need 'read'; mọi thao tác ghi đi route
// need 'write' / admin. Member thấy chế độ chỉ đọc. Không có thao tác sinh lịch hay chỉnh luật ván theo vòng (D8).

const VISIBILITY = {
  private: { label: 'Tắt link (riêng tư)', hint: 'Link công khai trả 404.' },
  unlisted: { label: 'Ai có link đều xem được', hint: 'Không hiện trong danh sách giải công khai.' },
  public: { label: 'Công khai', hint: 'Hiện trong danh sách giải công khai.' },
};

function Card({ icon, title, aside, children }) {
  return <section className="st-card">
    <header className="st-card-head"><h2><span aria-hidden="true">{icon}</span>{title}</h2>{aside}</header>
    {children}
  </section>;
}

function InfoCard({ tournament, isAdmin, onSaved }) {
  const [form, setForm] = useState({ name: '', event_date: '', location: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  useEffect(() => {
    setForm({ name: tournament?.name || '', event_date: tournament?.event_date ? String(tournament.event_date).slice(0, 10) : '', location: tournament?.location || '' });
  }, [tournament]);
  const dirty = tournament && (form.name !== (tournament.name || '') || form.event_date !== (tournament.event_date ? String(tournament.event_date).slice(0, 10) : '') || form.location !== (tournament.location || ''));
  async function save() {
    if (!form.name.trim()) { setMessage({ tone: 'error', text: 'Tên giải không được để trống.' }); return; }
    setBusy(true);
    setMessage(null);
    try {
      await updateTournament({ id: Number(tournament.id), name: form.name.trim(), event_date: form.event_date || null, location: form.location.trim() || null });
      setMessage({ tone: 'ok', text: 'Đã lưu thông tin giải.' });
      onSaved();
    } catch (error) { setMessage({ tone: 'error', text: error.message || 'Không lưu được.' }); } finally { setBusy(false); }
  }
  return <Card icon="ⓘ" title="Thông tin giải" aside={<span className="ops-muted">Cơ bản</span>}>
    <label className="st-field"><span>Tên giải đấu</span><input value={form.name} readOnly={!isAdmin} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
    <div className="st-grid-2">
      <label className="st-field"><span>Ngày thi đấu</span><input type="date" value={form.event_date} readOnly={!isAdmin} onChange={(event) => setForm((current) => ({ ...current, event_date: event.target.value }))} /></label>
      <label className="st-field"><span>Địa điểm</span><input value={form.location} readOnly={!isAdmin} placeholder="Vd: Cụm sân CLB Mỹ Đình" onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} /></label>
    </div>
    {message ? <p className={`ops-banner is-${message.tone}`} role="status">{message.text}</p> : null}
    {isAdmin ? <div className="st-actions"><button type="button" className="ops-btn is-primary" disabled={busy || !dirty} onClick={save}>{busy ? 'Đang lưu…' : '✓ Lưu thay đổi'}</button></div> : null}
  </Card>;
}

function LinkCard({ tournament, isAdmin, onSaved }) {
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const visibility = tournament?.visibility || 'private';
  const slug = tournament?.public_slug || '';
  const live = Boolean(slug) && visibility !== 'private';
  const path = slug ? `/giai-dau/v2/${slug}` : '';
  const url = typeof window !== 'undefined' && path ? `${window.location.origin}${path}` : path;

  useEffect(() => {
    let alive = true;
    if (!live || !url) { setQr(''); return undefined; }
    QRCode.toDataURL(url, { width: 220, margin: 1 }).then((data) => { if (alive) setQr(data); }).catch(() => { if (alive) setQr(''); });
    return () => { alive = false; };
  }, [live, url]);

  useEffect(() => {
    let alive = true;
    if (!sharing || !live) return undefined;
    getPublic(slug).then((data) => { if (alive) setSnapshot(data); }).catch((loadError) => { if (alive) setError(loadError.message || 'Không tải được dữ liệu chia sẻ.'); });
    return () => { alive = false; };
  }, [live, sharing, slug]);

  async function setVisibility(next) {
    setBusy(true);
    setError('');
    try {
      await updateTournament({ id: Number(tournament.id), visibility: next });
      onSaved();
    } catch (saveError) { setError(saveError.message || 'Không đổi được chế độ link.'); } finally { setBusy(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  }

  return <Card icon="🔗" title="Link công khai & chia sẻ" aside={live ? <span className="st-pill is-ok">Đang mở link</span> : <span className="st-pill">Link đang tắt</span>}>
    {live ? <div className="st-link">
      <div className="st-link-main">
        <span className="st-label">Đường dẫn trang theo dõi công khai</span>
        <div className="st-url-row"><code className="st-url">{url}</code><button type="button" className="ops-btn" onClick={copy}>{copied ? '✓ Đã sao chép' : 'Sao chép'}</button></div>
        <div className="st-actions is-left">
          <a className="ops-btn" href={path} target="_blank" rel="noreferrer">Mở trang xem</a>
          <button type="button" className="ops-btn is-soft" aria-expanded={sharing} onClick={() => setSharing((value) => !value)}>Chia sẻ Zalo · xuất ảnh kết quả</button>
        </div>
        <p className="st-note">👁 VĐV và khán giả xem Trực tiếp · Lịch · Xếp hạng · Sơ đồ.</p>
        {isAdmin ? <label className="st-field is-inline"><span>Ai xem được</span>
          <select value={visibility} disabled={busy} onChange={(event) => setVisibility(event.target.value)}>
            {Object.entries(VISIBILITY).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
          </select>
        </label> : null}
      </div>
      {qr ? <figure className="st-qr">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={qr} alt="Mã QR xem trực tiếp" /><figcaption><b>Mã QR xem trực tiếp</b><span>Quét bằng điện thoại</span></figcaption></figure> : null}
    </div> : <div className="st-link-off">
      <p>Link công khai đang tắt — VĐV chưa xem được lịch và kết quả trên điện thoại.</p>
      {isAdmin ? <button type="button" className="ops-btn is-primary" disabled={busy} onClick={() => setVisibility('unlisted')}>{busy ? 'Đang bật…' : 'Bật link công khai'}</button> : null}
    </div>}
    {error ? <p className="ops-banner is-error" role="alert">{error}</p> : null}
    {sharing && live ? (snapshot ? <div className="st-share"><ShareActions snapshot={snapshot} /></div> : <p className="ops-muted">Đang tải dữ liệu chia sẻ…</p>) : null}
  </Card>;
}

function CourtsCard({ tournament, isAdmin, onSaved }) {
  const [courts, setCourts] = useState([]);
  const [venues, setVenues] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pause, setPause] = useState(null);
  const operations = tournament?.settings?.operations || {};
  const [timing, setTiming] = useState({ match: '', warmup: '' });
  useEffect(() => { setTiming({ match: String(operations.estimated_match_minutes || 22), warmup: String(operations.warmup_minutes || 4) }); }, [operations.estimated_match_minutes, operations.warmup_minutes]);

  const load = useCallback(async () => {
    try {
      const [courtList, venueList] = await Promise.all([listCourts(tournament.id), listVenues(tournament.id)]);
      setCourts((courtList || []).slice().sort((left, right) => String(left.label).localeCompare(String(right.label), 'vi', { numeric: true })));
      setVenues(venueList || []);
    } catch (loadError) { setError(loadError.message || 'Không tải được danh sách sân.'); }
  }, [tournament.id]);
  useEffect(() => { load(); }, [load]);

  async function run(task) {
    setBusy(true);
    setError('');
    try { await task(); await load(); } catch (taskError) { setError(taskError.message || 'Thao tác không thành công.'); } finally { setBusy(false); }
  }
  const addCourt = () => run(async () => {
    let venueId = venues[0]?.id;
    if (!venueId) venueId = (await saveVenue({ tournament_id: tournament.id, name: tournament.location || 'Địa điểm thi đấu' })).venue.id;
    await saveCourt({ tournament_id: tournament.id, venue_id: venueId, label: `Sân ${String(courts.length + 1).padStart(2, '0')}` });
  });
  const toggle = (court, reason = '') => run(() => setCourtActive({ tournament_id: tournament.id, id: court.id, active: !court.active, reason }));
  async function saveTiming() {
    const match = Number(timing.match);
    const warmup = Number(timing.warmup);
    if (!Number.isInteger(match) || match < 5 || match > 120 || !Number.isInteger(warmup) || warmup < 0 || warmup > 30) {
      setError('Thời lượng trận 5–120 phút, khởi động 0–30 phút.');
      return;
    }
    await run(async () => {
      await updateTournament({ id: Number(tournament.id), settings: { ...(tournament.settings || {}), operations: { ...operations, estimated_match_minutes: match, warmup_minutes: warmup } } });
      onSaved();
    });
  }
  const timingDirty = String(operations.estimated_match_minutes || 22) !== timing.match || String(operations.warmup_minutes || 4) !== timing.warmup;

  return <Card icon="🏟" title="Sân thi đấu" aside={isAdmin ? <button type="button" className="ops-btn is-soft" disabled={busy} onClick={addCourt}>+ Thêm sân</button> : null}>
    {courts.length ? <ul className="st-courts">
      {courts.map((court, index) => <li key={court.id} className={court.active ? '' : 'is-off'}>
        <span className="st-court-no">{String(index + 1).padStart(2, '0')}</span>
        <span className="st-court-name"><b>{court.label}</b><small>{court.active ? '● Đang dùng' : 'Ngưng dùng'}{court.surface ? ` · ${court.surface}` : ''}</small></span>
        {isAdmin ? <button type="button" role="switch" aria-checked={court.active} aria-label={`${court.active ? 'Ngưng dùng' : 'Bật lại'} ${court.label}`} className="st-switch" disabled={busy}
          onClick={() => (court.active ? setPause({ court, reason: '' }) : toggle(court))}><i /></button> : null}
      </li>)}
    </ul> : <p className="ops-muted">Chưa khai báo sân nào.</p>}
    {pause ? <div className="ops-next-confirm" role="alertdialog" aria-labelledby="st-pause-title">
      <p id="st-pause-title"><b>Ngưng dùng {pause.court.label}?</b> Trận chưa gọi sẽ không được gợi ý vào sân này.</p>
      <label className="ops-field"><span>Lý do (bắt buộc)</span><input autoFocus value={pause.reason} placeholder="Vd: lưới hỏng" onChange={(event) => setPause((current) => ({ ...current, reason: event.target.value }))} /></label>
      <div className="ops-actions">
        <button type="button" className="ops-btn" onClick={() => setPause(null)}>Quay lại</button>
        <button type="button" className="ops-btn is-danger" disabled={busy || !pause.reason.trim()} onClick={async () => { const { court, reason } = pause; setPause(null); await toggle(court, reason.trim()); }}>Ngưng dùng</button>
      </div>
    </div> : null}
    <div className="st-grid-2">
      <label className="st-field"><span>Thời lượng trận ước tính (phút)</span><input inputMode="numeric" value={timing.match} readOnly={!isAdmin} onChange={(event) => setTiming((current) => ({ ...current, match: event.target.value.replace(/[^0-9]/g, '') }))} /></label>
      <label className="st-field"><span>Khởi động (phút)</span><input inputMode="numeric" value={timing.warmup} readOnly={!isAdmin} onChange={(event) => setTiming((current) => ({ ...current, warmup: event.target.value.replace(/[^0-9]/g, '') }))} /></label>
    </div>
    <p className="st-note">Dùng để tính giờ dự kiến ở mục Điều hành và đồng hồ đếm ngược khởi động.</p>
    {error ? <p className="ops-banner is-error" role="alert">{error}</p> : null}
    {isAdmin && timingDirty ? <div className="st-actions"><button type="button" className="ops-btn is-primary" disabled={busy} onClick={saveTiming}>Lưu thời lượng</button></div> : null}
  </Card>;
}

function LogCard({ tournamentId, context }) {
  const [logs, setLogs] = useState(null);
  const [all, setAll] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    listOperationLogs(tournamentId).then((rows) => setLogs(rows || [])).catch((loadError) => setError(loadError.message || 'Không tải được nhật ký.'));
  }, [tournamentId]);
  const rows = (logs || []).slice().sort((left, right) => Date.parse(right.created_at || 0) - Date.parse(left.created_at || 0));
  const shown = all ? rows : rows.slice(0, 5);
  return <Card icon="🕘" title="Nhật ký thao tác" aside={rows.length > 5 ? <button type="button" className="ops-link-plain" onClick={() => setAll((value) => !value)}>{all ? 'Thu gọn' : `Xem toàn bộ (${rows.length})`}</button> : null}>
    {error ? <p className="ops-banner is-error">{error}</p> : null}
    {logs == null && !error ? <p className="ops-muted">Đang tải nhật ký…</p> : null}
    {logs && !rows.length ? <p className="ops-muted">Chưa có thao tác nào.</p> : null}
    {shown.length ? <ol className="st-log">
      {shown.map((log) => {
        const line = describeOperationLog(log, context);
        return <li key={log.id}><time>{line.time}</time><span>{line.text}{line.reason ? <em> Lý do: {line.reason}</em> : null}</span></li>;
      })}
    </ol> : null}
  </Card>;
}

export default function SettingsView({ tournament, tournamentId, isAdmin, reload, children }) {
  const [board, setBoard] = useState(null);
  useEffect(() => { getOperationsBoard(tournamentId).then(setBoard).catch(() => setBoard(null)); }, [tournamentId]);

  const context = useMemo(() => {
    const titles = {};
    const names = {};
    for (const item of (board?.schedule || []).flatMap((group) => group.matches)) {
      titles[String(item.id)] = item.title;
      for (const side of [item.a, item.b]) if (side?.entryId != null && side.name) names[String(side.entryId)] = side.name;
    }
    const courts = Object.fromEntries((board?.courts || []).map((court) => [String(court.id), court.label]));
    return { titles, names, context: { matchTitle: (id) => titles[String(id)], entryName: (id) => names[String(id)], courtLabel: (id) => courts[String(id)] } };
  }, [board]);
  const pairs = Object.values(context.names).sort((left, right) => left.localeCompare(right, 'vi'));

  if (!tournament) return <div className="ops-state"><span className="v2-spinner" aria-hidden="true" /><p>Đang tải cài đặt…</p></div>;

  return <div className="st-page">
    <header className="st-head">
      <h1>Cài đặt</h1>
      <p className="ops-muted">Thông tin giải, link cho VĐV, sân thi đấu và nhật ký vận hành.{isAdmin ? '' : ' Bạn đang xem ở chế độ chỉ đọc.'}</p>
    </header>
    <InfoCard tournament={tournament} isAdmin={isAdmin} onSaved={reload} />
    <LinkCard tournament={tournament} isAdmin={isAdmin} onSaved={reload} />
    <CourtsCard tournament={tournament} isAdmin={isAdmin} onSaved={reload} />
    <LogCard tournamentId={tournamentId} context={context.context} />
    <Card icon="👥" title="Cặp thi đấu" aside={<span className="ops-muted">{pairs.length} cặp · chỉ xem</span>}>
      {pairs.length ? <ul className="st-pairs">{pairs.map((name) => <li key={name}>{name}</li>)}</ul> : <p className="ops-muted">Chưa có cặp nào.</p>}
      <p className="st-note">Danh sách cặp đã chốt cùng lịch thi đấu, không sửa ở đây.</p>
    </Card>
    {children}
  </div>;
}
