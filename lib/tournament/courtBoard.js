'use strict';

const BUSY_STATUSES = new Set(['live', 'paused']);

function computeCourtState(court, matchesOnCourt, queueLength) {
  const matches = matchesOnCourt || [];
  if (matches.some((match) => BUSY_STATUSES.has(match.status))) return { state: 'playing', label: 'Đang đấu' };
  if (matches.some((match) => match.status === 'warmup')) return { state: 'warming', label: 'Khởi động' };
  if (court && court.active === false) return { state: 'off', label: 'Ngưng dùng' };
  if (Number(queueLength) > 0) return { state: 'needs_call', label: 'Trống — cần gọi' };
  return { state: 'idle', label: 'Trống' };
}

function projectSchedule({ courts, runningByCourt, queue, matchMinutes, now }) {
  const activeCourts = (courts || []).filter((court) => court.active !== false);
  if (!activeCourts.length) return { byMatchId: {}, finishAt: null };
  const duration = Number(matchMinutes) * 60000;
  const freeAt = new Map();
  for (const court of activeCourts) {
    const running = (runningByCourt || {})[court.id];
    const start = running && running.started_at ? Date.parse(running.started_at) : NaN;
    freeAt.set(court.id, Number.isFinite(start) ? Math.max(now, start + duration) : now);
  }

  const byMatchId = {};
  let finishAt = null;
  for (const match of queue || []) {
    let courtId = null;
    let earliest = Infinity;
    for (const [candidateId, time] of freeAt.entries()) {
      if (time < earliest) {
        earliest = time;
        courtId = candidateId;
      }
    }
    const locked = match.locked_start ? Date.parse(match.locked_start) : NaN;
    const start = Number.isFinite(locked) ? Math.max(locked, now) : earliest;
    byMatchId[match.id] = start;
    freeAt.set(courtId, start + duration);
    finishAt = finishAt === null ? start + duration : Math.max(finishAt, start + duration);
  }
  return { byMatchId, finishAt };
}

function averageMatchMinutes(matches) {
  let total = 0;
  let count = 0;
  for (const match of matches || []) {
    if (match.status !== 'finalized') continue;
    const start = match.started_at ? Date.parse(match.started_at) : NaN;
    const end = match.ended_at ? Date.parse(match.ended_at) : NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
    total += (end - start) / 60000;
    count += 1;
  }
  return count ? Math.round(total / count) : null;
}

module.exports = { computeCourtState, projectSchedule, averageMatchMinutes };