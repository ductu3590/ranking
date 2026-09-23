'use strict';
const STATES = Object.freeze(['local_only', 'server_draft', 'roster_ready', 'pairing_ready', 'draw_drafted', 'finalized']);
const INVALIDATION = Object.freeze({ participant: ['pairing', 'draw'], pairing: ['draw'], format: ['draw'], draw: ['preview_fixtures'] });
function transition(draft, state) { if (!STATES.includes(state)) throw new Error('INVALID_SETUP_STATE'); if (draft.state === 'finalized' && state !== 'finalized') throw new Error('FINALIZED_SETUP_IMMUTABLE'); return { ...draft, state }; }
function invalidate(draft, kind, reason) { const next = { ...draft, invalidation: { ...(draft.invalidation || {}) } }; (INVALIDATION[kind] || []).forEach((key) => { next.invalidation[key] = true; }); next.invalidation.reasonCodes = [...new Set([...(next.invalidation.reasonCodes || []), reason || `${kind.toUpperCase()}_CHANGED`])]; return next; }
module.exports = { STATES, INVALIDATION, transition, invalidate };
