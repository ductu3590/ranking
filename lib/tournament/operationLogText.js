'use strict';
// Nhật ký thao tác dạng câu đọc được (spec Epic 2 E2 §3.4). Thuần, chạy cả client.
// Đầu vào: một dòng tournament_operation_logs { action, actor, target_type, target_id, before, after, reason,
// created_at } + ngữ cảnh tên { matchTitle(id), entryName(id), courtLabel(id) }. Không bao giờ in JSON;
// action chưa biết rơi về câu chung "… thực hiện <action>".

const STATUS_WORDS = Object.freeze({
  draft: 'Nháp', registration_open: 'Đang nhận đăng ký', registration_closed: 'Đã đóng đăng ký',
  scheduled: 'Chờ diễn ra', live: 'Đang diễn ra', completed: 'Đã kết thúc', archived: 'Lưu trữ',
});

const ACTOR_WORDS = Object.freeze({ admin: 'Admin', member: 'Thành viên', scorekeeper: 'Trọng tài', platform: 'Admin hệ thống' });

function actorOf(log) {
  const raw = String(log.actor || '').trim();
  if (!raw) return 'Admin';
  return ACTOR_WORDS[raw] || raw;
}

function clock(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function gamesText(games) {
  if (!Array.isArray(games) || !games.length) return '';
  return games.map((game) => `${Number(game.score_a) || 0}–${Number(game.score_b) || 0}`).join(', ');
}

function lookup(fn, id, fallback) {
  if (id === null || id === undefined || typeof fn !== 'function') return fallback;
  const value = fn(id);
  return value || fallback;
}

// → { time, text, reason }
function describeOperationLog(log = {}, context = {}) {
  const actor = actorOf(log);
  const before = log.before && typeof log.before === 'object' ? log.before : {};
  const after = log.after && typeof log.after === 'object' ? log.after : {};
  const match = log.target_type === 'match' ? lookup(context.matchTitle, log.target_id, 'một trận') : 'một trận';
  const court = lookup(context.courtLabel, log.target_id, 'một sân');
  const entry = (id) => lookup(context.entryName, id, 'một cặp');
  let text;
  switch (log.action) {
    case 'match_called': text = `${actor} gọi ${match} vào sân`; break;
    case 'match_call_cancelled': text = `${actor} huỷ gọi sân ${match}`; break;
    case 'match_started': text = `${actor} bắt đầu ${match}`; break;
    case 'match_paused': text = `${actor} tạm dừng ${match}`; break;
    case 'match_resumed': text = `${actor} cho ${match} đấu tiếp`; break;
    case 'match_finalized': text = `${actor} chốt ${match}`; break;
    case 'match_walkover': text = after.winner_entry_id != null
      ? `${actor} xử ${entry(after.winner_entry_id)} thắng W.O. ở ${match}`
      : `${actor} xử thắng W.O. ở ${match}`; break;
    case 'match_retired': text = after.loser_entry_id != null
      ? `${actor} ghi ${entry(after.loser_entry_id)} bỏ cuộc ở ${match}`
      : `${actor} ghi bỏ cuộc ở ${match}`; break;
    case 'result_corrected': {
      const from = gamesText(before.games);
      const to = gamesText(after.games);
      text = `${actor} sửa kết quả ${match}${from && to ? `: ${from} → ${to}` : ''}`;
      const nextWinner = after.winner ?? after.winner_entry_id;
      const prevWinner = before.winner ?? before.winner_entry_id;
      if (nextWinner != null && String(nextWinner) !== String(prevWinner ?? '')) {
        text += ` (người thắng đổi sang ${entry(nextWinner)})`;
      }
      break;
    }
    case 'court_toggled': text = after.active === false ? `${actor} ngưng dùng ${court}` : `${actor} bật lại ${court}`; break;
    case 'tournament_status_changed': text = `${actor} chuyển giải từ “${STATUS_WORDS[before.status] || before.status || '?'}” sang “${STATUS_WORDS[after.status] || after.status || '?'}”`; break;
    case 'draw_locked': text = `${actor} chốt bốc thăm và sinh lịch`; break;
    case 'draw_unlocked': text = `${actor} huỷ chốt lịch, xoá lịch đã sinh`; break;
    case 'draw_rolled': text = `${actor} bốc thăm lại`; break;
    case 'draw_swapped': text = `${actor} đổi chỗ hai cặp trong bốc thăm`; break;
    default: text = `${actor} thực hiện “${String(log.action || 'thao tác').replace(/_/g, ' ')}”`;
  }
  return { time: clock(log.created_at), text: `${text}.`, reason: log.reason ? String(log.reason) : '' };
}

const KNOWN_ACTIONS = Object.freeze([
  'match_called', 'match_call_cancelled', 'match_started', 'match_paused', 'match_resumed', 'match_finalized',
  'match_walkover', 'match_retired', 'result_corrected', 'court_toggled', 'tournament_status_changed',
  'draw_locked', 'draw_unlocked', 'draw_rolled', 'draw_swapped',
]);

module.exports = { describeOperationLog, KNOWN_ACTIONS };
