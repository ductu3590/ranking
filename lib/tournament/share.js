// lib/tournament/share.js
// Phase 3 Task 6b — chia sẻ giải qua kênh Zalo bằng cách thủ công:
// link có Open Graph, ảnh PNG xuất từ máy người dùng và text để BTC tự dán.
// PickHub KHÔNG tích hợp Zalo OA/ZNS; hệ thống không gửi tin thay người dùng.
//
// Module thuần: chỉ nhận public projection (buildPublicSnapshot), không I/O,
// không import React/Next/Supabase. Mọi dữ liệu ra ngoài đều đã đi qua
// allowlist của publicSnapshot nên không thể chứa ghi chú nội bộ/liên hệ.

const SHARE_VERSION = 'v1';
const SHARE_TEXT_VERSION = 'v1';
const SHARE_IMAGE_KINDS = ['card', 'draw', 'schedule_court', 'schedule_club', 'standings', 'results', 'honors'];
const SHARE_TEXT_TEMPLATES = ['schedule', 'result', 'call_to_court'];
const SHAREABLE_VISIBILITY = ['public', 'unlisted'];

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;
const PORTRAIT_WIDTH = 1080;
const PORTRAIT_MIN_HEIGHT = 1350;

const THEME = Object.freeze({
  background: '#0b1f17',
  panel: '#12352a',
  row: '#0f2a20',
  text: '#ffffff',
  muted: '#9fd8bf',
  accent: '#34d399',
  line: '#1d4c3b',
});

const FONT_FAMILY = "system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const TOURNAMENT_STATUS_LABELS = Object.freeze({
  draft: 'Nháp',
  registration_open: 'Đang mở đăng ký',
  registration_closed: 'Đã đóng đăng ký',
  scheduled: 'Đã có lịch',
  active: 'Đang diễn ra',
  live: 'Đang diễn ra',
  completed: 'Đã hoàn thành',
  archived: 'Lưu trữ',
});

const MATCH_STATUS_LABELS = Object.freeze({
  pending: 'Chưa đấu',
  assigned: 'Đã xếp sân',
  ready: 'Sẵn sàng',
  scheduled: 'Chưa đấu',
  live: 'Đang đấu',
  submitted: 'Chờ duyệt',
  done: 'Đã xong',
  finalized: 'Đã xong',
});

const TIEBREAK_LABELS = Object.freeze({
  match_points: 'Điểm BXH',
  wins: 'Số trận thắng',
  head_to_head: 'Đối đầu',
  game_diff: 'Hiệu số ván',
  game_ratio: 'Tỷ lệ ván',
  diff: 'Hiệu số điểm',
  point_diff: 'Hiệu số điểm',
  point_ratio: 'Tỷ lệ điểm',
  points_for: 'Điểm ghi',
  points_against: 'Điểm thủng',
  seed: 'Hạt giống',
  draw_lot: 'Bốc thăm',
});

const UPCOMING_STATUSES = new Set(['pending', 'assigned', 'ready', 'scheduled', 'live']);
const FINISHED_STATUSES = new Set(['done', 'finalized']);

class ShareError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'ShareError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ShareError(code, message);
}

// --- Định dạng ---------------------------------------------------------------

function pad2(value) {
  return String(value).padStart(2, '0');
}

// Ngày thi đấu lưu dạng 'YYYY-MM-DD' (date, không giờ) nên format thủ công để
// không bị lệch một ngày theo timezone của máy chủ.
function formatEventDate(value) {
  if (!value) return '';
  const text = String(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return `${pad2(date.getUTCDate())}/${pad2(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

// Thời điểm xuất ảnh luôn hiển thị theo giờ Việt Nam (UTC+7) để BTC ở mọi máy
// đọc cùng một con số, không phụ thuộc timezone của trình duyệt/server.
function toVietnamParts(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  const shifted = new Date(safe.getTime() + 7 * 60 * 60 * 1000);
  return {
    day: pad2(shifted.getUTCDate()),
    month: pad2(shifted.getUTCMonth() + 1),
    year: shifted.getUTCFullYear(),
    hour: pad2(shifted.getUTCHours()),
    minute: pad2(shifted.getUTCMinutes()),
  };
}

function formatVietnamDateTime(value) {
  const p = toVietnamParts(value);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

function fileStamp(value) {
  const p = toVietnamParts(value);
  return `${p.year}${p.month}${p.day}-${p.hour}${p.minute}`;
}

function escapeXml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(value, maxChars) {
  const text = String(value == null ? '' : value).trim();
  if (!maxChars || text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1)).trim()}…`;
}

function wrapText(value, maxChars) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word.length > maxChars ? truncate(word, maxChars) : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// --- Truy cập public projection ----------------------------------------------

function getTournament(snapshot) {
  const tournament = snapshot && snapshot.tournament;
  if (!tournament || !tournament.name) fail('SHARE_SNAPSHOT_REQUIRED', 'Thiếu public projection của giải');
  return tournament;
}

function isShareableVisibility(visibility) {
  return SHAREABLE_VISIBILITY.includes(String(visibility || ''));
}

// `unlisted` vẫn chia sẻ được: đó chính là kiểu link BTC dán vào nhóm Zalo.
// Chỉ `private` (và giá trị lạ) bị chặn, khớp với filter của API công khai.
function assertShareable(snapshot) {
  const tournament = getTournament(snapshot);
  if (!isShareableVisibility(tournament.visibility)) {
    fail('SHARE_NOT_PUBLIC', 'Giải chưa công khai nên không chia sẻ được');
  }
  return tournament;
}

function listDivisions(snapshot) {
  return Array.isArray(snapshot?.divisions) ? snapshot.divisions : [];
}

function findDivision(snapshot, divisionId) {
  if (divisionId == null) return null;
  return listDivisions(snapshot).find((row) => String(row.id) === String(divisionId)) || null;
}

function listStages(snapshot, { divisionId } = {}) {
  const stages = Array.isArray(snapshot?.stages) ? snapshot.stages : [];
  if (divisionId == null) return stages;
  return stages.filter((stage) => String(stage.division_id) === String(divisionId));
}

function resolveStage(snapshot, { stageId, divisionId } = {}) {
  const stages = listStages(snapshot, { divisionId });
  if (stageId != null) {
    const found = (Array.isArray(snapshot?.stages) ? snapshot.stages : [])
      .find((stage) => String(stage.id) === String(stageId));
    if (found) return found;
  }
  return stages.length ? stages[0] : null;
}

function entrantIndex(snapshot) {
  const index = new Map();
  for (const entrant of Array.isArray(snapshot?.entrants) ? snapshot.entrants : []) {
    index.set(String(entrant.id), entrant);
  }
  return index;
}

function entrantNameOf(index, id, fallback) {
  if (id == null) return fallback || 'Chưa xác định';
  const entrant = index.get(String(id));
  return entrant ? entrant.name : `#${id}`;
}

function listMatches(snapshot, { stageId, divisionId } = {}) {
  const matches = Array.isArray(snapshot?.matches) ? snapshot.matches : [];
  return matches
    .filter((match) => (stageId == null || String(match.stage_id) === String(stageId)))
    .filter((match) => (divisionId == null || match.division_id == null
      || String(match.division_id) === String(divisionId)))
    .slice()
    .sort((a, b) => (a.round || 0) - (b.round || 0)
      || (a.match_order || 0) - (b.match_order || 0)
      || String(a.id).localeCompare(String(b.id)));
}

function gamesOf(snapshot, matchId) {
  const grouped = snapshot && snapshot.gamesByMatchId;
  const games = grouped ? grouped[String(matchId)] : null;
  return Array.isArray(games) ? games.slice().sort((a, b) => (a.game_no || 0) - (b.game_no || 0)) : [];
}

function scoreLineOf(snapshot, match) {
  const games = gamesOf(snapshot, match.id);
  if (!games.length) return '';
  return games.map((game) => `${game.score_a}-${game.score_b}`).join(', ');
}

function gameTallyOf(snapshot, match) {
  const games = gamesOf(snapshot, match.id);
  let a = 0;
  let b = 0;
  for (const game of games) {
    if (Number(game.score_a) > Number(game.score_b)) a += 1;
    else if (Number(game.score_b) > Number(game.score_a)) b += 1;
  }
  return { a, b };
}

function standingsOf(snapshot, stageId) {
  const all = snapshot && snapshot.standingsByStage;
  const entry = all ? all[String(stageId)] : null;
  const rows = entry && Array.isArray(entry.standings) ? entry.standings : [];
  return { schedule_format: entry ? entry.schedule_format : null, rows };
}

function tiebreakSummary(stage) {
  const tiebreak = stage && stage.tiebreak;
  const order = Array.isArray(tiebreak?.order) ? tiebreak.order : null;
  if (!order || !order.length) return '';
  return order.map((code) => TIEBREAK_LABELS[code] || code).join(' → ');
}

function matchLabelOf(match) {
  const parts = [];
  if (match.group_label) parts.push(`Bảng ${match.group_label}`);
  if (match.round != null) parts.push(`Vòng ${match.round}`);
  if (match.court) parts.push(match.court);
  return parts.join(' · ');
}

function courtNameOf(match) {
  return match.court ? String(match.court) : 'Chưa xếp sân';
}

// --- Link và Open Graph -------------------------------------------------------

function normalizeBaseUrl(baseUrl) {
  const text = String(baseUrl == null ? '' : baseUrl).trim();
  return text.replace(/\/+$/, '');
}

function buildShareUrl(snapshot, options = {}) {
  const tournament = assertShareable(snapshot);
  const base = normalizeBaseUrl(options.baseUrl);
  const slug = tournament.public_slug;
  if (!slug) fail('SHARE_SLUG_REQUIRED', 'Giải chưa có link công khai');
  const path = options.divisionId != null
    ? `/giai-dau/v2/${slug}/noi-dung/${options.divisionId}`
    : `/giai-dau/v2/${slug}`;
  return `${base}${path}`;
}

function buildShareImageUrl(snapshot, options = {}) {
  const tournament = getTournament(snapshot);
  const base = normalizeBaseUrl(options.baseUrl);
  const params = [
    `slug=${encodeURIComponent(tournament.public_slug || '')}`,
    `kind=${encodeURIComponent(options.kind || 'card')}`,
  ];
  if (options.divisionId != null) params.push(`division=${encodeURIComponent(options.divisionId)}`);
  if (options.stageId != null) params.push(`stage=${encodeURIComponent(options.stageId)}`);
  params.push(`format=${encodeURIComponent(options.format || 'png')}`);
  return `${base}/api/tournament-v2/public/share-image?${params.join('&')}`;
}

function normalizeOptions(options) {
  if (options == null) return {};
  if (typeof options === 'object' && !Array.isArray(options)) return options;
  // Chấp nhận buildOpenGraph(projection, divisionId) như spec thiết kế mô tả.
  return { divisionId: options };
}

function buildShareDescription(snapshot, division) {
  const tournament = getTournament(snapshot);
  const parts = [];
  const date = formatEventDate(tournament.event_date);
  if (date) parts.push(date);
  if (tournament.location) parts.push(tournament.location);
  if (division) {
    parts.push(`Nội dung ${division.name}`);
  } else {
    const count = listDivisions(snapshot).length;
    if (count) parts.push(`${count} nội dung thi đấu`);
  }
  const status = TOURNAMENT_STATUS_LABELS[tournament.status];
  if (status) parts.push(status);
  const head = parts.join(' · ');
  const tail = truncate(tournament.description || '', 120);
  return tail ? `${head} — ${tail}` : head;
}

function buildOpenGraph(snapshot, options = {}) {
  const opts = normalizeOptions(options);
  const tournament = assertShareable(snapshot);
  const division = findDivision(snapshot, opts.divisionId);
  if (opts.divisionId != null && !division) {
    fail('SHARE_DIVISION_NOT_FOUND', 'Nội dung thi đấu không thuộc giải này');
  }
  const title = division ? `${tournament.name} — ${division.name}` : tournament.name;
  const posterUrl = snapshot?.share?.poster_url || null;
  const overrideUrl = snapshot?.share?.og_image_url || null;
  const explicit = opts.imageUrl || null;
  let image;
  if (explicit) {
    image = { url: explicit, source: 'custom' };
  } else if (overrideUrl) {
    image = { url: overrideUrl, source: 'poster' };
  } else if (posterUrl) {
    image = { url: posterUrl, source: 'poster' };
  } else {
    image = {
      url: buildShareImageUrl(snapshot, {
        baseUrl: opts.baseUrl, kind: 'card', divisionId: opts.divisionId, format: 'png',
      }),
      source: 'generated',
    };
  }
  return {
    version: SHARE_VERSION,
    title,
    description: buildShareDescription(snapshot, division),
    url: buildShareUrl(snapshot, { baseUrl: opts.baseUrl, divisionId: opts.divisionId }),
    siteName: 'PickHub',
    locale: 'vi_VN',
    type: 'website',
    image: {
      ...image,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      alt: title,
    },
    // Giải unlisted chia sẻ được bằng link nhưng không nên nằm trong kết quả tìm kiếm.
    robots: { index: tournament.visibility === 'public', follow: true },
  };
}

// --- Copy text ----------------------------------------------------------------

function contextLines(snapshot, { division, stage }) {
  const tournament = getTournament(snapshot);
  const lines = [];
  const meta = [];
  const date = formatEventDate(tournament.event_date);
  if (date) meta.push(date);
  if (tournament.location) meta.push(tournament.location);
  if (meta.length) lines.push(meta.join(' · '));
  const scope = [];
  if (division) scope.push(`Nội dung: ${division.name}`);
  if (stage) scope.push(`Giai đoạn: ${stage.name}`);
  if (scope.length) lines.push(scope.join(' · '));
  return lines;
}

function buildShareText(snapshot, template, options = {}) {
  const key = String(template || '');
  if (!SHARE_TEXT_TEMPLATES.includes(key)) {
    fail('SHARE_UNKNOWN_TEMPLATE', `Không có mẫu thông báo "${key}"`);
  }
  const tournament = assertShareable(snapshot);
  const division = findDivision(snapshot, options.divisionId);
  const stage = resolveStage(snapshot, { stageId: options.stageId, divisionId: options.divisionId });
  const index = entrantIndex(snapshot);
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 12;
  const now = options.now || new Date();
  const matches = listMatches(snapshot, {
    stageId: stage ? stage.id : options.stageId,
    divisionId: options.divisionId,
  });
  const selectedIds = Array.isArray(options.matchIds) ? options.matchIds.map(String) : null;

  const lines = [];
  let title = '';
  let count = 0;

  if (key === 'schedule') {
    title = `LỊCH THI ĐẤU — ${tournament.name}`;
    lines.push(`🏓 ${title}`);
    lines.push(...contextLines(snapshot, { division, stage }));
    const upcoming = matches.filter((match) => UPCOMING_STATUSES.has(match.status)).slice(0, limit);
    count = upcoming.length;
    lines.push('');
    if (!upcoming.length) {
      lines.push('Chưa có trận nào chờ thi đấu.');
    } else {
      for (const match of upcoming) {
        const label = matchLabelOf(match);
        const teams = `${entrantNameOf(index, match.entrant_a_id, 'Đội A')} vs ${entrantNameOf(index, match.entrant_b_id, 'Đội B')}`;
        lines.push(label ? `• ${label}: ${teams}` : `• ${teams}`);
      }
    }
  } else if (key === 'result') {
    title = `KẾT QUẢ VỪA CHỐT — ${tournament.name}`;
    lines.push(`✅ ${title}`);
    lines.push(...contextLines(snapshot, { division, stage }));
    const finished = matches.filter((match) => FINISHED_STATUSES.has(match.status)).slice(-limit);
    count = finished.length;
    lines.push('');
    if (!finished.length) {
      lines.push('Chưa có kết quả nào được chốt.');
    } else {
      for (const match of finished) {
        const nameA = entrantNameOf(index, match.entrant_a_id, 'Đội A');
        const nameB = entrantNameOf(index, match.entrant_b_id, 'Đội B');
        const tally = gameTallyOf(snapshot, match);
        const detail = scoreLineOf(snapshot, match);
        const winner = match.winner_entrant_id != null
          ? entrantNameOf(index, match.winner_entrant_id, '')
          : '';
        const scoreText = `${nameA} ${tally.a}-${tally.b} ${nameB}`;
        const suffix = detail ? ` (${detail})` : '';
        lines.push(winner ? `• ${scoreText}${suffix} — thắng: ${winner}` : `• ${scoreText}${suffix}`);
      }
    }
  } else {
    title = `MỜI VÀO SÂN — ${tournament.name}`;
    lines.push(`📣 ${title}`);
    lines.push(...contextLines(snapshot, { division, stage }));
    const called = (selectedIds
      ? matches.filter((match) => selectedIds.includes(String(match.id)))
      : matches.filter((match) => UPCOMING_STATUSES.has(match.status))
    ).slice(0, selectedIds ? limit : 3);
    count = called.length;
    lines.push('');
    if (!called.length) {
      lines.push('Chưa có trận nào cần gọi vào sân.');
    } else {
      for (const match of called) {
        const teams = `${entrantNameOf(index, match.entrant_a_id, 'Đội A')} vs ${entrantNameOf(index, match.entrant_b_id, 'Đội B')}`;
        const where = courtNameOf(match);
        const round = match.round != null ? ` (Vòng ${match.round})` : '';
        lines.push(`• ${where}: ${teams}${round}`);
      }
      lines.push('');
      lines.push('Mời hai đội có mặt tại sân trong 5 phút. Xin cảm ơn!');
    }
  }

  const url = options.url || (options.baseUrl != null
    ? buildShareUrl(snapshot, { baseUrl: options.baseUrl, divisionId: options.divisionId })
    : '');
  lines.push('');
  lines.push(`Cập nhật ${formatVietnamDateTime(now)}${url ? ` · ${url}` : ''}`);

  const cleaned = lines.filter((line, position) => !(line === '' && lines[position - 1] === ''));
  return {
    version: SHARE_TEXT_VERSION,
    template: key,
    title,
    lines: cleaned,
    text: cleaned.join('\n').trim(),
    meta: {
      count,
      generatedAt: new Date(now).toISOString(),
      stage_id: stage ? stage.id : null,
      division_id: division ? division.id : null,
    },
  };
}

// --- Model của ảnh chia sẻ -----------------------------------------------------

function pushSection(blocks, title) {
  if (title) blocks.push({ type: 'section', title });
}

function buildDrawBlocks(snapshot, { stage, index }) {
  const blocks = [];
  const matches = stage ? listMatches(snapshot, { stageId: stage.id }) : [];
  const groups = new Map();
  for (const match of matches) {
    const label = match.group_label || 'Bảng đấu';
    if (!groups.has(label)) groups.set(label, new Map());
    const bucket = groups.get(label);
    for (const id of [match.entrant_a_id, match.entrant_b_id]) {
      if (id == null) continue;
      bucket.set(String(id), entrantNameOf(index, id, ''));
    }
  }
  if (!groups.size) {
    const entrants = Array.isArray(snapshot.entrants) ? snapshot.entrants : [];
    if (!entrants.length) {
      blocks.push({ type: 'text', text: 'Chưa bốc thăm.' });
      return blocks;
    }
    pushSection(blocks, 'Danh sách tham dự');
    blocks.push({
      type: 'table',
      columns: [
        { label: 'Hạt giống', width: 200, align: 'left' },
        { label: 'Đội / Cặp', width: 768, align: 'left' },
      ],
      rows: entrants.map((entrant) => [entrant.seed != null ? `#${entrant.seed}` : '—', entrant.name]),
    });
    return blocks;
  }
  const seedById = new Map(
    (Array.isArray(snapshot.entrants) ? snapshot.entrants : []).map((entrant) => [String(entrant.id), entrant.seed]),
  );
  for (const label of [...groups.keys()].sort()) {
    pushSection(blocks, label.length <= 2 ? `Bảng ${label}` : label);
    const bucket = groups.get(label);
    blocks.push({
      type: 'table',
      columns: [
        { label: 'Hạt giống', width: 200, align: 'left' },
        { label: 'Đội / Cặp', width: 768, align: 'left' },
      ],
      rows: [...bucket.entries()].map(([id, name]) => [
        seedById.get(id) != null ? `#${seedById.get(id)}` : '—',
        name,
      ]),
    });
  }
  return blocks;
}

function buildScheduleBlocks(snapshot, { stage, index, groupBy }) {
  const blocks = [];
  const matches = stage ? listMatches(snapshot, { stageId: stage.id }) : [];
  if (!matches.length) {
    blocks.push({ type: 'text', text: 'Chưa có trận nào trong lịch.' });
    return blocks;
  }
  const buckets = new Map();
  const addTo = (key, item) => {
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  };
  for (const match of matches) {
    const nameA = entrantNameOf(index, match.entrant_a_id, 'Đội A');
    const nameB = entrantNameOf(index, match.entrant_b_id, 'Đội B');
    const status = MATCH_STATUS_LABELS[match.status] || match.status || '';
    if (groupBy === 'court') {
      addTo(courtNameOf(match), {
        left: `${nameA} vs ${nameB}`,
        sub: match.round != null ? `Vòng ${match.round}` : '',
        right: status,
      });
    } else {
      // "Theo CLB": mỗi entry (đội/CLB/cặp) có lịch riêng để dán vào nhóm của CLB đó.
      for (const [own, other] of [[nameA, nameB], [nameB, nameA]]) {
        if (own === 'Đội A' || own === 'Đội B') continue;
        addTo(own, {
          left: `vs ${other}`,
          sub: [match.round != null ? `Vòng ${match.round}` : '', courtNameOf(match)].filter(Boolean).join(' · '),
          right: status,
        });
      }
    }
  }
  for (const key of [...buckets.keys()].sort((a, b) => a.localeCompare(b, 'vi'))) {
    pushSection(blocks, key);
    blocks.push({ type: 'list', items: buckets.get(key) });
  }
  return blocks;
}

function buildStandingsBlocks(snapshot, { stage, index }) {
  const blocks = [];
  if (!stage) {
    blocks.push({ type: 'text', text: 'Chưa có giai đoạn nào.' });
    return blocks;
  }
  const { rows } = standingsOf(snapshot, stage.id);
  if (!rows.length) {
    blocks.push({ type: 'text', text: 'Chưa có dữ liệu xếp hạng.' });
    return blocks;
  }
  const order = tiebreakSummary(stage);
  const byGroup = new Map();
  for (const row of rows) {
    const label = row.group_label || '';
    if (!byGroup.has(label)) byGroup.set(label, []);
    byGroup.get(label).push(row);
  }
  for (const label of [...byGroup.keys()].sort()) {
    if (label) pushSection(blocks, label.length <= 2 ? `Bảng ${label}` : label);
    blocks.push({
      type: 'table',
      columns: [
        { label: '#', width: 90, align: 'left' },
        { label: 'Đội / Cặp', width: 480, align: 'left' },
        { label: 'T-B', width: 150, align: 'center' },
        { label: 'HS', width: 130, align: 'center' },
        { label: 'Điểm', width: 118, align: 'center' },
      ],
      rows: byGroup.get(label).map((row) => [
        String(row.rank != null ? row.rank : '—'),
        entrantNameOf(index, row.entrant_id, ''),
        `${row.won != null ? row.won : 0}-${row.lost != null ? row.lost : 0}`,
        String(row.diff != null ? row.diff : 0),
        String(row.match_points != null ? row.match_points : 0),
      ]),
    });
  }
  if (order) blocks.push({ type: 'text', text: `Thứ tự tie-break: ${order}` });
  return blocks;
}

function buildResultsBlocks(snapshot, { stage, index }) {
  const blocks = [];
  const matches = stage ? listMatches(snapshot, { stageId: stage.id }) : [];
  const finished = matches.filter((match) => FINISHED_STATUSES.has(match.status));
  if (!finished.length) {
    blocks.push({ type: 'text', text: 'Chưa có kết quả nào được chốt.' });
    return blocks;
  }
  const byRound = new Map();
  for (const match of finished) {
    const label = match.round != null ? `Vòng ${match.round}` : 'Kết quả';
    if (!byRound.has(label)) byRound.set(label, []);
    const nameA = entrantNameOf(index, match.entrant_a_id, 'Đội A');
    const nameB = entrantNameOf(index, match.entrant_b_id, 'Đội B');
    const tally = gameTallyOf(snapshot, match);
    byRound.get(label).push({
      left: `${nameA} ${tally.a}-${tally.b} ${nameB}`,
      sub: scoreLineOf(snapshot, match),
      right: match.winner_entrant_id != null ? entrantNameOf(index, match.winner_entrant_id, '') : '',
    });
  }
  for (const label of byRound.keys()) {
    pushSection(blocks, label);
    blocks.push({ type: 'list', items: byRound.get(label) });
  }
  return blocks;
}

function buildHonorsBlocks(snapshot, { index }) {
  const blocks = [];
  const divisions = listDivisions(snapshot);
  const medals = ['Nhất', 'Nhì', 'Ba'];
  const targets = divisions.length ? divisions : [null];
  let hasAny = false;
  for (const division of targets) {
    const stages = listStages(snapshot, { divisionId: division ? division.id : undefined });
    const last = stages.length ? stages[stages.length - 1] : null;
    if (!last) continue;
    const { rows } = standingsOf(snapshot, last.id);
    const podium = rows
      .filter((row) => row.rank != null && row.rank <= 3)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 3);
    if (!podium.length) continue;
    hasAny = true;
    pushSection(blocks, division ? division.name : last.name);
    blocks.push({
      type: 'list',
      items: podium.map((row, position) => ({
        left: entrantNameOf(index, row.entrant_id, ''),
        sub: '',
        right: medals[position] || `Hạng ${row.rank}`,
      })),
    });
  }
  if (!hasAny) blocks.push({ type: 'text', text: 'Giải chưa có kết quả chung cuộc.' });
  return blocks;
}

function buildCardBlocks(snapshot, { host }) {
  const blocks = [];
  if (host && (host.name || host.logo_url)) {
    blocks.push({
      type: 'host',
      name: host.name || '',
      logo_url: host.logo_url || '',
    });
  }
  const divisions = listDivisions(snapshot);
  if (divisions.length) {
    blocks.push({
      type: 'text',
      text: `Nội dung: ${divisions.map((division) => division.name).join(' · ')}`,
    });
  }
  return blocks;
}

function buildShareImageModel(snapshot, kind, options = {}) {
  const key = String(kind || '');
  if (!SHARE_IMAGE_KINDS.includes(key)) {
    fail('SHARE_UNKNOWN_KIND', `Không có loại ảnh "${key}"`);
  }
  const tournament = assertShareable(snapshot);
  const division = findDivision(snapshot, options.divisionId);
  const stage = resolveStage(snapshot, { stageId: options.stageId, divisionId: options.divisionId });
  const index = entrantIndex(snapshot);
  const now = options.now || new Date();

  const headings = {
    card: '',
    draw: 'KẾT QUẢ BỐC THĂM',
    schedule_court: 'LỊCH THI ĐẤU THEO SÂN',
    schedule_club: 'LỊCH THI ĐẤU THEO CLB',
    standings: 'BẢNG XẾP HẠNG',
    results: 'KẾT QUẢ THI ĐẤU',
    honors: 'BẢNG VÀNG',
  };

  let blocks;
  if (key === 'card') blocks = buildCardBlocks(snapshot, { host: options.host });
  else if (key === 'draw') blocks = buildDrawBlocks(snapshot, { stage, index });
  else if (key === 'schedule_court') blocks = buildScheduleBlocks(snapshot, { stage, index, groupBy: 'court' });
  else if (key === 'schedule_club') blocks = buildScheduleBlocks(snapshot, { stage, index, groupBy: 'club' });
  else if (key === 'standings') blocks = buildStandingsBlocks(snapshot, { stage, index });
  else if (key === 'results') blocks = buildResultsBlocks(snapshot, { stage, index });
  else blocks = buildHonorsBlocks(snapshot, { index });

  const subtitleParts = [];
  const date = formatEventDate(tournament.event_date);
  if (date) subtitleParts.push(date);
  if (tournament.location) subtitleParts.push(tournament.location);
  if (key !== 'card') {
    if (division) subtitleParts.push(division.name);
    if (stage && key !== 'honors') subtitleParts.push(stage.name);
  }

  return {
    version: SHARE_VERSION,
    kind: key,
    width: key === 'card' ? CARD_WIDTH : PORTRAIT_WIDTH,
    minHeight: key === 'card' ? CARD_HEIGHT : PORTRAIT_MIN_HEIGHT,
    fixedHeight: key === 'card' ? CARD_HEIGHT : null,
    theme: THEME,
    heading: headings[key],
    title: tournament.name,
    subtitle: subtitleParts.join(' · '),
    badge: TOURNAMENT_STATUS_LABELS[tournament.status] || '',
    blocks,
    watermark: {
      tournament: tournament.name,
      exportedAt: formatVietnamDateTime(now),
      text: `${tournament.name} · Xuất lúc ${formatVietnamDateTime(now)} · PickHub`,
    },
    filename: `${tournament.public_slug || 'giai-dau'}-${key}-${fileStamp(now)}.png`,
  };
}

// --- Serialize model sang SVG ---------------------------------------------------

const PAD = 56;
const LINE = 1.28;

function svgText(value, x, y, { size = 30, weight = 400, fill = THEME.text, anchor = 'start', opacity = 1 } = {}) {
  return `<text x="${x}" y="${y}" font-family="${FONT_FAMILY}" font-size="${size}" font-weight="${weight}" fill="${fill}"`
    + `${anchor === 'start' ? '' : ` text-anchor="${anchor}"`}`
    + `${opacity === 1 ? '' : ` opacity="${opacity}"`}>${escapeXml(value)}</text>`;
}

function svgRect(x, y, width, height, { fill = THEME.panel, radius = 18, opacity = 1 } = {}) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}"`
    + `${opacity === 1 ? '' : ` opacity="${opacity}"`} />`;
}

function renderModelToSvg(model) {
  const width = model.width;
  const contentWidth = width - PAD * 2;
  const nodes = [];
  let y = PAD;

  const titleSize = model.kind === 'card' ? 58 : 50;
  const titleLines = wrapText(model.title, model.kind === 'card' ? 30 : 34).slice(0, 3);
  if (model.heading) {
    y += 34;
    nodes.push(svgText(model.heading, PAD, y, { size: 30, weight: 700, fill: THEME.accent }));
    y += 22;
  }
  for (const line of titleLines) {
    y += titleSize * LINE;
    nodes.push(svgText(line, PAD, y, { size: titleSize, weight: 700 }));
  }
  if (model.subtitle) {
    y += 46;
    nodes.push(svgText(truncate(model.subtitle, model.kind === 'card' ? 58 : 62), PAD, y, {
      size: 30, fill: THEME.muted,
    }));
  }
  if (model.badge) {
    y += 52;
    const badgeWidth = Math.min(contentWidth, 30 + model.badge.length * 18);
    nodes.push(svgRect(PAD, y - 34, badgeWidth, 50, { fill: THEME.panel, radius: 25 }));
    nodes.push(svgText(model.badge, PAD + 24, y, { size: 26, fill: THEME.accent, weight: 600 }));
    y += 16;
  }
  y += 34;

  for (const block of model.blocks || []) {
    if (block.type === 'section') {
      y += 30;
      nodes.push(svgText(truncate(block.title, 44), PAD, y, { size: 34, weight: 700, fill: THEME.accent }));
      y += 16;
    } else if (block.type === 'text') {
      for (const line of wrapText(block.text, 58)) {
        y += 40;
        nodes.push(svgText(line, PAD, y, { size: 28, fill: THEME.muted }));
      }
      y += 12;
    } else if (block.type === 'host') {
      const top = y;
      const size = 96;
      if (block.logo_url) {
        nodes.push(`<image x="${PAD}" y="${top}" width="${size}" height="${size}" href="${escapeXml(block.logo_url)}"`
          + ` xlink:href="${escapeXml(block.logo_url)}" preserveAspectRatio="xMidYMid slice" />`);
      }
      if (block.name) {
        nodes.push(svgText('Đơn vị tổ chức', PAD + (block.logo_url ? size + 24 : 0), top + 40, { size: 24, fill: THEME.muted }));
        nodes.push(svgText(truncate(block.name, 34), PAD + (block.logo_url ? size + 24 : 0), top + 80, { size: 32, weight: 600 }));
      }
      y = top + size + 20;
    } else if (block.type === 'table') {
      const columns = block.columns || [];
      const headerY = y + 34;
      let x = PAD;
      for (const column of columns) {
        nodes.push(svgText(column.label, column.align === 'center' ? x + column.width / 2 : x, headerY, {
          size: 24, fill: THEME.muted, anchor: column.align === 'center' ? 'middle' : 'start',
        }));
        x += column.width;
      }
      y = headerY + 16;
      for (const row of block.rows || []) {
        const rowTop = y;
        nodes.push(svgRect(PAD - 16, rowTop, contentWidth + 32, 58, { fill: THEME.row, radius: 14 }));
        let cellX = PAD;
        row.forEach((cell, position) => {
          const column = columns[position] || { width: contentWidth / row.length, align: 'left' };
          const maxChars = Math.max(6, Math.floor(column.width / 15));
          nodes.push(svgText(truncate(cell, maxChars), column.align === 'center' ? cellX + column.width / 2 : cellX, rowTop + 39, {
            size: 28, anchor: column.align === 'center' ? 'middle' : 'start',
            weight: position === 0 ? 700 : 400,
          }));
          cellX += column.width;
        });
        y = rowTop + 66;
      }
      y += 8;
    } else if (block.type === 'list') {
      for (const item of block.items || []) {
        const top = y;
        const height = item.sub ? 92 : 68;
        nodes.push(svgRect(PAD - 16, top, contentWidth + 32, height, { fill: THEME.row, radius: 14 }));
        nodes.push(svgText(truncate(item.left, 40), PAD, top + 42, { size: 30, weight: 600 }));
        if (item.right) {
          nodes.push(svgText(truncate(item.right, 18), width - PAD, top + 42, {
            size: 26, fill: THEME.muted, anchor: 'end',
          }));
        }
        if (item.sub) {
          nodes.push(svgText(truncate(item.sub, 52), PAD, top + 76, { size: 24, fill: THEME.muted }));
        }
        y = top + height + 10;
      }
      y += 8;
    }
  }

  y += 40;
  const height = model.fixedHeight || Math.max(model.minHeight || 0, y + 128);
  // Watermark tách thành dòng cố định, không wrap theo từ, để chuỗi ngày giờ
  // không bao giờ bị cắt làm đôi. Ảnh card đã lấy tên giải làm tiêu đề nên chỉ
  // cần dòng thời điểm xuất.
  const compact = model.kind === 'card';
  const dividerY = compact ? height - 70 : height - 118;
  nodes.push(`<line x1="${PAD}" y1="${dividerY}" x2="${width - PAD}" y2="${dividerY}" stroke="${THEME.line}" stroke-width="2" />`);
  if (!compact) {
    nodes.push(svgText(truncate(model.watermark.tournament, 56), PAD, height - 72, { size: 24, fill: THEME.muted }));
  }
  nodes.push(svgText(`Xuất lúc ${model.watermark.exportedAt} · PickHub`, PAD, height - 34, { size: 24, fill: THEME.muted }));

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<rect width="${width}" height="${height}" fill="${THEME.background}" />`
    + `<rect x="0" y="0" width="${width}" height="10" fill="${THEME.accent}" />`
    + nodes.join('')
    + '</svg>';
}

function renderShareImage(snapshot, kind, options = {}) {
  const model = buildShareImageModel(snapshot, kind, options);
  const svg = renderModelToSvg(model);
  const heightMatch = svg.match(/height="(\d+(?:\.\d+)?)"/);
  return {
    version: SHARE_VERSION,
    kind: model.kind,
    width: model.width,
    height: heightMatch ? Number(heightMatch[1]) : model.minHeight,
    contentType: 'image/svg+xml',
    svg,
    filename: model.filename,
    watermark: model.watermark,
    model,
  };
}

module.exports = {
  SHARE_VERSION,
  SHARE_TEXT_VERSION,
  SHARE_IMAGE_KINDS,
  SHARE_TEXT_TEMPLATES,
  SHAREABLE_VISIBILITY,
  ShareError,
  isShareableVisibility,
  assertShareable,
  formatEventDate,
  formatVietnamDateTime,
  escapeXml,
  buildShareUrl,
  buildShareImageUrl,
  buildOpenGraph,
  buildShareText,
  buildShareImageModel,
  renderShareImage,
  renderModelToSvg,
};
