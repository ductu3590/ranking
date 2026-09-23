'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { stats, recorder, settled, duplicateRuns, row, deriveReport } = require('../../../scripts/qa/perf-after-unified-setup');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const request = (url = '/api/example') => ({ url: () => `http://localhost${url}`, method: () => 'GET', failure: () => ({ errorText: 'aborted' }) });
const response = (req, body) => ({ request: () => req, status: () => 200, headers: () => ({ 'content-length': '1', 'content-encoding': 'gzip' }), body });

(async () => {
    assert.equal(stats([NaN, Infinity]), null);
    assert.deepEqual(stats([4, 1, 3, 2, NaN]), { n: 4, min: 1, median: 3, p95: 4, max: 4 });
    assert.equal(stats(Array.from({ length: 20 }, (_, index) => index + 1)).p95, 19);
    const page = new EventEmitter();
    const rec = recorder(page, { baseUrl: 'http://localhost', timeoutMs: 100 });
    const outside = request();
    page.emit('request', outside);
    rec.start('one');
    page.emit('response', response(outside, async () => Buffer.from('ignored')));
    const req = request();
    page.emit('request', req);
    let release;
    page.emit('response', response(req, () => new Promise((resolve) => { release = resolve; })));
    const stopping = rec.stop();
    rec.start('two');
    release(Buffer.from('decoded'));
    const first = await stopping;
    assert.equal(first.requests.length, 1);
    assert.equal(first.requests[0].bytes, 7);
    assert.equal(first.requests[0].contentLength, 1);
    assert.equal(first.drainTimedOut, false);
    const second = await rec.stop();
    assert.equal(second.requests.length, 0);

    rec.start('headers-late');
    const late = request(); page.emit('request', late);
    const lateStop = rec.stop();
    page.emit('response', response(late, async () => Buffer.alloc(0)));
    assert.equal((await lateStop).requests[0].bytes, 0);
    rec.start('failed');
    const failed = request(); page.emit('request', failed); page.emit('requestfailed', failed);
    assert.equal((await rec.stop()).requests[0].bodyState, 'request-failed');
    rec.start('unavailable');
    const unavailable = request(); page.emit('request', unavailable);
    page.emit('response', response(unavailable, async () => { throw new Error('no body'); }));
    assert.equal((await rec.stop()).requests[0].bodyState, 'unavailable');

    const bounded = recorder(new EventEmitter(), { baseUrl: 'http://localhost', timeoutMs: 10 });
    bounded.start('empty'); assert.equal((await bounded.stop()).drainTimedOut, false);
    const hangingPage = new EventEmitter();
    const hanging = recorder(hangingPage, { baseUrl: 'http://localhost', timeoutMs: 10 });
    hanging.start('hang'); const hang = request(); hangingPage.emit('request', hang);
    let resolveHang;
    hangingPage.emit('response', response(hang, () => new Promise((resolve) => { resolveHang = resolve; })));
    const timedOut = await hanging.stop();
    assert.equal(timedOut.drainTimedOut, true);
    const frozen = JSON.stringify(timedOut);
    resolveHang(Buffer.from('late')); await delay(1);
    assert.equal(JSON.stringify(timedOut), frozen);

    const noisy = new EventEmitter();
    const interval = setInterval(() => noisy.emit('request'), 1);
    try { await assert.rejects(settled(noisy, 50, 15), /did not settle/); }
    finally { clearInterval(interval); }
    assert.equal(noisy.listenerCount('request'), 0);
    assert.equal(noisy.listenerCount('response'), 0);
    await settled(noisy, 1, 100);

    const phase = (count) => ({ requests: Array.from({ length: count }, () => ({ method: 'GET', url: '/roster', bytes: null })) });
    const repeats = duplicateRuns([[phase(1)], [phase(1)]], /roster/g);
    assert.equal(repeats.total, 2); assert.equal(repeats.excessRequests, 0);
    assert.equal(duplicateRuns([[phase(2)], [phase(1)]], /roster/).excessRequests, 1);
    const aggregate = row('sample', [{ ms: 1, phase: phase(1) }, { ms: 2, phase: phase(2) }]);
    assert.equal(aggregate.requestCount, 1.5);
    assert.deepEqual(aggregate.unknownBytes, [1, 2]);
    const names = ['open_draft', 'save_draft', 'preview_schedule', 'finalize'];
    const source = { meta: { runs: 2 }, rows: [], mutations: {}, phases: Array.from({ length: 12 }, (_, index) => ({ ...phase(index < 4 ? 99 : 1), name: names[index % 4] })) };
    const derived = deriveReport(source);
    assert.equal(derived.duplicates.roster.total, 2);
    assert.equal(derived.duplicates.roster.excessRequests, 0);
    assert.equal(derived.meta.newMeasurement, false);
    assert.throws(() => deriveReport({ ...source, phases: source.phases.slice(1) }), /boundaries/);
    console.log('PASS recorder/statistics: ownership, draining, failures, timeout, quiet bound, per-run repeats, warmup exclusion, derivation');
})().catch((error) => { console.error(error); process.exitCode = 1; });