'use client';

import { useEffect, useState } from 'react';
import { listOperationLogs } from '@/lib/tournamentV2Client';

const ACTION_LABELS = { tournament_status_changed: 'Đổi trạng thái giải', court_toggled: 'Bật/tắt sân', match_called: 'Gọi vào sân', match_call_cancelled: 'Huỷ gọi sân', match_started: 'Bắt đầu đấu', match_paused: 'Tạm dừng', match_resumed: 'Đấu tiếp', match_finalized: 'Chốt trận', match_walkover: 'Xử thắng (không ra sân)', match_retired: 'Bỏ cuộc giữa chừng' };

export default function LogStep({ tournamentId }) {
  const [logs, setLogs] = useState([]); const [error, setError] = useState('');
  useEffect(() => { listOperationLogs(tournamentId).then(setLogs).catch((loadError) => setError(loadError.message || 'Không tải được nhật ký.')); }, [tournamentId]);
  return <section className="v2-console-block"><h2>Nhật ký thao tác</h2>{error ? <p className="v2-console-error">{error}</p> : null}<div className="v2-console-table-wrap"><table className="v2-console-table"><thead><tr><th>Lúc</th><th>Người làm</th><th>Việc</th><th>Trước → Sau</th><th>Lý do</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td>{log.created_at ? new Date(log.created_at).toLocaleString('vi-VN') : '—'}</td><td>{log.actor || '—'}</td><td>{ACTION_LABELS[log.action] || log.action}</td><td>{JSON.stringify(log.before || {})} → {JSON.stringify(log.after || {})}</td><td>{log.reason || '—'}</td></tr>)}</tbody></table></div>{!logs.length && !error ? <p className="v2-console-muted">Chưa có thao tác nào.</p> : null}</section>;
}