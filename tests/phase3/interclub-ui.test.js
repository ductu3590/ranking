const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const assert = (condition, message) => { if (!condition) { console.error(`FAIL: ${message}`); process.exit(1); } };

assert(exists('app/api/tournament-v2/clubs/route.js'), 'có API tournament clubs');
assert(read('lib/tournamentV2Client.js').includes('listTournamentClubs'), 'client có listTournamentClubs');
assert(read('lib/tournamentV2Client.js').includes('inviteTournamentClub'), 'client có inviteTournamentClub');

function readJavaScriptTree(directory) {
    const fullDirectory = path.join(root, directory);
    return fs.readdirSync(fullDirectory, { withFileTypes: true }).flatMap((entry) => {
        const relativePath = path.join(directory, entry.name);
        if (entry.isDirectory()) return readJavaScriptTree(relativePath);
        return entry.name.endsWith('.js') ? [fs.readFileSync(path.join(root, relativePath), 'utf8')] : [];
    }).join('\n');
}

// Workspace setup thay wizard cũ; contract phải quét toàn bộ component setup đệ quy.
const wizard = readJavaScriptTree('app/giai-dau/v2/setup');
assert(wizard.includes('Giao hữu'), 'wizard có phạm vi giao hữu (mời CLB)');
assert(wizard.includes('inviteTournamentClub'), 'wizard mời CLB khác');
assert(wizard.includes('CLB được mời'), 'wizard có nhánh đăng ký giao hữu (CLB được mời)');
console.log('phase3 interclub ui contract ok');
