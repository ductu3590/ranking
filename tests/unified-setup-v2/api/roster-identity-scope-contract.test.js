'use strict';

const { read, assert } = require('../_harness');

const route = read('app/api/tournament-v2/athletes/route.js');

assert.match(route, /from\('club_members'\)[\s\S]*\.eq\('group_id', scope\.groupId\)/, 'roster starts from group-scoped club members');
assert.match(route, /from\('athletes'\)[\s\S]*\.in\('legacy_club_member_id', memberIds\)/, 'global identities resolve only through the scoped member IDs');
assert.doesNotMatch(route, /\.from\('athletes'\)[\s\S]{0,240}\.eq\('group_id'/, 'global athletes table is not queried through a nonexistent group_id');

console.log('roster identity scope contract ok');