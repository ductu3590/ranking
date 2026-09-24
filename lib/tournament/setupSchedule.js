'use strict';
// Ước tính lịch cho Bước 4 (spec Lát A §13). CHỈ để hiển thị: finalize không ghi giờ/sân;
// xếp sân thật thuộc màn điều hành. Thuần, chạy được cả client.

const DEFAULT_MINUTES = Object.freeze({ 1: 15, 3: 35, 5: 55 });

function parseTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function formatTime(totalMinutes) {
  const minutes = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

// Trận chọn được BO: chung kết (F) hoặc chung kết tổng của loại kép (GF); còn lại BO1 (ADR-005 D8, ADR-007 D14).
function bestOfFor(match, finalBestOf) {
  return match.matchKey === 'F' || match.matchKey === 'GF' ? Number(finalBestOf) || 1 : 1;
}

// Chia trận thành các lượt sân. Vòng bảng: tránh một cặp đá hai lượt liền nếu có trận khác
// thay được. Vòng loại: mỗi vòng bắt đầu lượt mới; tranh hạng ba trước chung kết.
function buildSlots(plan, courtCount) {
  const courts = Math.max(1, Number(courtCount) || 1);
  const slots = [];
  const queue = plan.matches.filter((match) => match.stageKind !== 'knockout');
  let previous = new Set();
  while (queue.length) {
    const slot = [];
    const busy = new Set();
    const pick = (allowRepeat) => {
      for (let index = 0; index < queue.length && slot.length < courts; index += 1) {
        const match = queue[index];
        const pairs = [match.entryAId, match.entryBId];
        if (pairs.some((id) => busy.has(id))) continue;
        if (!allowRepeat && pairs.some((id) => previous.has(id))) continue;
        slot.push(match);
        pairs.forEach((id) => busy.add(id));
        queue.splice(index, 1);
        index -= 1;
      }
    };
    pick(false);
    if (slot.length < courts) pick(true);
    slots.push(slot);
    previous = busy;
  }
  const knockout = plan.matches.filter((match) => match.stageKind === 'knockout');
  const rounds = [...new Set(knockout.map((match) => match.round))].sort((a, b) => a - b);
  for (const round of rounds) {
    const inRound = knockout.filter((match) => match.round === round)
      .sort((a, b) => (a.matchKey === 'F') - (b.matchKey === 'F') || a.order - b.order);
    for (let index = 0; index < inRound.length; index += courts) slots.push(inRound.slice(index, index + courts));
  }
  return slots;
}

function estimateSchedule(plan, { courtCount, startTime, minutesByBestOf = DEFAULT_MINUTES } = {}) {
  if (!plan || !Array.isArray(plan.matches)) return { rows: [], totalMinutes: 0, startsAt: null, endsAt: null, slots: 0 };
  const start = parseTime(startTime);
  const slots = buildSlots(plan, courtCount);
  const rows = [];
  let clock = start ?? 0;
  for (const slot of slots) {
    let longest = 0;
    slot.forEach((match, index) => {
      const bestOf = bestOfFor(match, plan.finalBestOf);
      const duration = minutesByBestOf[bestOf] || minutesByBestOf[1];
      longest = Math.max(longest, duration);
      rows.push({ matchKey: match.matchKey, court: index + 1, startsAt: start == null ? null : formatTime(clock), durationMinutes: duration, bestOf });
    });
    clock += longest;
  }
  const totalMinutes = clock - (start ?? 0);
  return {
    rows,
    slots: slots.length,
    totalMinutes,
    startsAt: start == null ? null : formatTime(start),
    endsAt: start == null ? null : formatTime(clock),
  };
}

module.exports = { estimateSchedule, DEFAULT_MINUTES };
