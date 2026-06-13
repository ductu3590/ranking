const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

function assert(condition, message) {
    if (!condition) {
        console.error(`FAIL: ${message}`);
        process.exit(1);
    }
}

assert(
    fs.existsSync(path.join(root, 'lib/debugGuard.js')),
    'Debug guard helper should exist.'
);

const guard = read('lib/debugGuard.js');

assert(
    guard.includes("process.env.NODE_ENV === 'production'") &&
    guard.includes('404'),
    'Debug guard should block production traffic with a 404 response.'
);

const debugDir = path.join(root, 'app/api/debug');
const routes = fs
    .readdirSync(debugDir)
    .filter((dir) => fs.existsSync(path.join(debugDir, dir, 'route.js')));

assert(routes.length > 0, 'There should be debug routes to guard.');

for (const route of routes) {
    const source = read(`app/api/debug/${route}/route.js`);
    assert(
        source.includes("export const dynamic = 'force-dynamic'"),
        `Debug route ${route} should opt out of static prerender so build never executes it.`
    );
    assert(
        source.includes('debugGuard') && source.includes('@/lib/debugGuard'),
        `Debug route ${route} should call the shared debug guard before touching data.`
    );
}

console.log('debug routes guard ok');
