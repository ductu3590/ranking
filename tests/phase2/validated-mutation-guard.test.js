const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

function assert(condition, message) {
    if (!condition) {
        console.error(`FAIL: ${message}`);
        process.exit(1);
    }
}

const mutationRoutes = [
    'app/api/club/transactions/route.js',
    'app/api/club/events/route.js',
    'app/api/club/participants/route.js',
    'app/api/club/members/route.js',
    'app/api/club/bank-accounts/route.js',
    'app/api/tournament-v2/tournaments/route.js',
    'app/api/tournament-v2/stages/route.js',
    'app/api/tournament-v2/entrants/route.js',
    'app/api/tournament-v2/games/route.js',
    'app/api/tournament-v2/advance/route.js',
    'app/api/tournament-v2/generate/route.js',
    'app/api/tournament-v2/pairs/route.js',
    'app/api/save-snapshot/route.js',
];

const groupSession = read('lib/groupSession.js');
assert(
    groupSession.includes('findClubById(unvalidated.group_id)') &&
    groupSession.includes('isSessionActive(session.session_key'),
    'validated guard should check the current club version and active DB session.'
);

for (const route of mutationRoutes) {
    const source = read(route);
    assert(
        source.includes('requireValidatedGroupAdmin'),
        `${route} should use the database-backed validated admin session guard.`
    );
    assert(
        !source.includes('requireGroupAdmin'),
        `${route} should not use the synchronous compatibility guard.`
    );
    assert(
        source.includes('await requireValidatedGroupAdmin()'),
        `${route} should await validation before mutating data.`
    );
}

for (const route of [
    'app/api/club/transactions/route.js',
    'app/api/club/events/route.js',
    'app/api/tournament-v2/tournaments/route.js',
    'app/api/tournament-v2/stages/route.js',
    'app/api/tournament-v2/entrants/route.js',
]) {
    const source = read(route);
    assert(
        source.includes('adminCheck.groupId') && source.includes("group_id"),
        `${route} should keep database writes scoped to the validated session's club.`
    );
}

console.log('validated mutation guard contracts ok');
