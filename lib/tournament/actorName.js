'use strict';

// Actor trong phiên là OBJECT { groupId, groupCode, groupName, role, session }.
// Truyền thẳng object đó vào tham số `p_actor text` của RPC hoặc vào audit log là
// sai kiểu, và tệ hơn là ghi cả `session` vào cột audit. Luôn quy về một chuỗi
// ngắn, ổn định, không chứa dữ liệu phiên.
function actorName(actorOrCheck, fallback = 'admin') {
    const actor = actorOrCheck && typeof actorOrCheck === 'object' && 'actor' in actorOrCheck
        ? actorOrCheck.actor
        : actorOrCheck;
    if (typeof actor === 'string') return actor.trim() || fallback;
    if (!actor || typeof actor !== 'object') return fallback;
    const candidate = actor.groupCode || actor.groupName || actor.kind || actor.role;
    return (typeof candidate === 'string' && candidate.trim()) ? candidate.trim() : fallback;
}

module.exports = { actorName };
