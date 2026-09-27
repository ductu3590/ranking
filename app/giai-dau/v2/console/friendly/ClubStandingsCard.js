'use client';

import ClubChip from './ClubChip';
import './friendly-standings.css';

// Bảng xếp hạng tổng CLB của giải giao hữu (D40, D53; Stitch FRD-07/08). Chỉ hiển thị — dữ liệu do caller nạp:
// bàn điều hành từ getFriendlyStandings({ tournamentId }), trang công khai từ khối `friendly.clubStandings`.
// 2 CLB → khối đối đầu; ≥ 3 CLB → bảng hạng. Không gọi API, không tự tính.

function signed(value) {
  const number = Number(value) || 0;
  return number > 0 ? `+${number}` : String(number);
}

function HeadToHead({ headToHead, rows }) {
  const byId = new Map(rows.map((row) => [String(row.tournamentClubId), row]));
  const left = byId.get(String(headToHead.left?.tournamentClubId)) || {};
  const right = byId.get(String(headToHead.right?.tournamentClubId)) || {};
  const [leftWins, rightWins] = Array.isArray(headToHead.wins) ? headToHead.wins : [0, 0];
  const played = Number(left.played ?? right.played ?? 0);
  return (
    <div className="fr-h2h">
      <div className="fr-h2h__row">
        <div className="fr-h2h__side">
          <ClubChip name={headToHead.left?.name} color={headToHead.left?.color} />
          <small>{left.isHost ? 'Chủ nhà' : 'CLB khách'}</small>
        </div>
        <div className="fr-h2h__score" aria-label={`Tỉ số trận thắng ${leftWins} – ${rightWins}`}>
          <b style={{ color: headToHead.left?.color || undefined }}>{leftWins}</b>
          <span aria-hidden="true">–</span>
          <b style={{ color: headToHead.right?.color || undefined }}>{rightWins}</b>
        </div>
        <div className="fr-h2h__side fr-h2h__side--right">
          <ClubChip name={headToHead.right?.name} color={headToHead.right?.color} />
          <small>{right.isHost ? 'Chủ nhà' : 'CLB khách'}</small>
        </div>
      </div>
      <p className="fr-h2h__meta">Hiệu số điểm {signed(left.diff)} · {played} trận liên CLB đã đấu</p>
    </div>
  );
}

function StandingsTable({ rows }) {
  return (
    <div className="fr-standings-wrap">
      <table className="fr-standings">
        <thead>
          <tr><th scope="col">Hạng</th><th scope="col">CLB</th><th scope="col">Trận</th><th scope="col">T–B</th><th scope="col">HS</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.tournamentClubId}>
              <td><span className="fr-rank">{row.rank}</span></td>
              <td><ClubChip name={row.name} color={row.color} /></td>
              <td>{row.played}</td>
              <td>{row.won}–{row.lost}</td>
              <td className={Number(row.diff) > 0 ? 'fr-up' : Number(row.diff) < 0 ? 'fr-down' : undefined}>{signed(row.diff)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ClubStandingsCard({ standings, loading = false, error = '', onRetry }) {
  const rows = Array.isArray(standings?.rows) ? standings.rows : [];
  const twoClubs = Boolean(standings?.headToHead) && rows.length === 2;
  return (
    <section className="fr-standings-card" aria-labelledby="fr-standings-title">
      <header className="fr-standings-card__head">
        <h2 id="fr-standings-title"><i aria-hidden="true" />{twoClubs ? 'Đối đầu CLB' : 'Xếp hạng CLB'}</h2>
        <span className="fr-standings-card__tag">Liên CLB</span>
      </header>
      {loading && !standings ? <p className="fr-muted">Đang tải xếp hạng CLB…</p> : null}
      {error ? (
        <p className="fr-muted" role="alert">{error} {onRetry ? <button type="button" className="fr-link" onClick={onRetry}>Thử lại</button> : null}</p>
      ) : null}
      {!loading && !error && rows.length < 2 ? <p className="fr-muted">Chưa có trận liên CLB nào được chốt.</p> : null}
      {twoClubs ? <HeadToHead headToHead={standings.headToHead} rows={rows} /> : null}
      {!twoClubs && rows.length >= 2 ? <StandingsTable rows={rows} /> : null}
      <p className="fr-note">Chỉ tính trận giữa hai CLB khác nhau. Không tính vào xếp hạng CLB.</p>
    </section>
  );
}
