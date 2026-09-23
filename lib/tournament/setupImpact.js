'use strict';
function assessSetupImpact(before = {}, after = {}) { const changed = []; if (JSON.stringify(before.pairs) !== JSON.stringify(after.pairs)) changed.push('pairing'); if (JSON.stringify(before.format) !== JSON.stringify(after.format)) changed.push('format'); if (JSON.stringify(before.draw) !== JSON.stringify(after.draw)) changed.push('draw'); return { changed, drawStale: changed.includes('pairing') || changed.includes('format'), structureLocked: Boolean(before.matches && before.matches.some((m) => m.score || m.startedAt)) }; }
module.exports = { assessSetupImpact };
