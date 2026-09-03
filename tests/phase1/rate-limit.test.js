const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { consumeRateLimit, getClientIdentifier } = require('../../lib/rateLimit');

const first = consumeRateLimit('phase1-test', { limit: 2, windowMs: 60_000, now: 1_000 });
const second = consumeRateLimit('phase1-test', { limit: 2, windowMs: 60_000, now: 1_001 });
const blocked = consumeRateLimit('phase1-test', { limit: 2, windowMs: 60_000, now: 1_002 });
assert.strictEqual(first.allowed, true);
assert.strictEqual(second.allowed, true);
assert.strictEqual(blocked.allowed, false);
assert.strictEqual(blocked.retryAfterSeconds, 60);
assert.strictEqual(consumeRateLimit('phase1-test', { limit: 2, windowMs: 60_000, now: 61_000 }).allowed, true);

const request = {
  headers: new Map([
    ['x-forwarded-for', ' 203.0.113.10, 198.51.100.2 '],
  ]),
};
request.headers.get = request.headers.get.bind(request.headers);
assert.strictEqual(getClientIdentifier(request), '203.0.113.10');

const root = path.resolve(__dirname, '../..');
const joinRoute = fs.readFileSync(path.join(root, 'app/api/groups/join/route.js'), 'utf8');
const createRoute = fs.readFileSync(path.join(root, 'app/api/groups/route.js'), 'utf8');
for (const [name, source] of [['join', joinRoute], ['create', createRoute]]) {
  assert.match(source, /consumeRateLimit/, `${name} route phải gọi rate limiter`);
  assert.match(source, /rateLimitResponse/, `${name} route phải trả response rate-limit chuẩn`);
}
assert.match(fs.readFileSync(path.join(root, 'lib/rateLimit.js'), 'utf8'), /status:\s*429/,
  'rate-limit response phải dùng HTTP 429');

console.log('phase 1 rate limit behavior ok');
