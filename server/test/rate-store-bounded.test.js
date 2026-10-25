import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock, after, before, beforeEach, describe, test } from 'node:test';

// Cap and storage must be fixed before the module reads them.
const directory = mkdtempSync(join(tmpdir(), 'proofchain-rate-store-'));
const previous = {
  file: process.env.API_KEYS_FILE,
  mode: process.env.NODE_ENV,
  cap: process.env.RATE_STORE_MAX,
};
process.env.API_KEYS_FILE = join(directory, 'keys.json');
process.env.NODE_ENV = 'test';
process.env.RATE_STORE_MAX = '4';

const api = await import('../lib/api-keys.js');
const { default: app } = await import('../server.js');

const WINDOW_MS = 24 * 60 * 60 * 1000;
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const SEED = 'FKwU1im523MSGnuJG6YLHEZu4rUGj3xqxHJ6ipQMBG9B';

after(() => {
  mock.timers.reset();
  if (previous.file === undefined) delete process.env.API_KEYS_FILE;
  else process.env.API_KEYS_FILE = previous.file;
  if (previous.mode === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previous.mode;
  if (previous.cap === undefined) delete process.env.RATE_STORE_MAX;
  else process.env.RATE_STORE_MAX = previous.cap;
  rmSync(directory, { recursive: true, force: true });
});

function wallet(n) {
  let x = n + 1;
  let encoded = '';
  while (x > 0) {
    encoded = ALPHABET[x % 58] + encoded;
    x = Math.floor(x / 58);
  }
  return ('A' + encoded + '1'.repeat(44)).slice(0, 44);
}

function response() {
  return {
    headers: {},
    statusCode: undefined,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    set(name, value) { this.headers[name] = value; return this; }
  };
}

function hit(walletParam, extra = {}) {
  const req = {
    params: walletParam === undefined ? {} : { wallet: walletParam },
    headers: extra.headers || {},
    socket: extra.socket,
    ip: extra.ip,
    apiKey: extra.apiKey
  };
  const res = response();
  let next = 0;
  api.rateLimiter(req, res, () => next++);
  return { res, next };
}

describe('bounded wallet rate store', { concurrency: false }, () => {
  let server;
  let base;

  before(async () => {
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    mock.timers.reset();
    if (server) {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });

  beforeEach(() => {
    mock.timers.reset();
    api.clearRateStoreForTests?.();
  });

  test('free quota still allows 100, rejects the 101st, isolates wallets, and skips pro', () => {
    const wallet = '11111111111111111111111111111111';
    const other = '11111111111111111111111111111112';
    for (let i = 1; i <= 100; i++) {
      assert.deepEqual(api.checkRateLimit(wallet), { allowed: true, remaining: 100 - i });
    }
    const blocked = api.checkRateLimit(wallet);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.equal(blocked.capacity, undefined);
    assert.ok(blocked.resetIn > 0 && blocked.resetIn <= WINDOW_MS);
    assert.deepEqual(api.checkRateLimit(other), { allowed: true, remaining: 99 });
    assert.deepEqual(api.checkRateLimit(wallet, 'pro'), { allowed: true, remaining: Infinity });
    assert.equal(api.checkRateLimit(wallet).allowed, false);

    const req = { params: { wallet: '11111111111111111111111111111113' } };
    for (let i = 0; i < 100; i++) api.checkRateLimit(req.params.wallet);
    const res = response();
    api.rateLimiter(req, res, () => assert.fail('exhausted quota next'));
    assert.equal(res.statusCode, 429);
    assert.equal(res.headers['X-RateLimit-Limit'], '100');
    assert.equal(res.headers['X-RateLimit-Remaining'], '0');
    assert.match(res.body.message, /Free tier allows 100 requests per day/);
    req.apiKey = { tier: 'pro' };
    let calls = 0;
    const proRes = response();
    api.rateLimiter(req, proRes, () => calls++);
    assert.equal(calls, 1);
    assert.equal(proRes.headers['X-RateLimit-Limit'], 'unlimited');
  });

  test('invalid wallets are rejected with 400 and do not enter the store', () => {
    const rejected = api.checkRateLimit('not-a-wallet');
    assert.equal(rejected.allowed, false);
    assert.equal(rejected.invalid, true);
    assert.equal(typeof api.isWalletAddress, 'function');
    assert.equal(api.isWalletAddress(SEED), true);
    assert.equal(api.isWalletAddress('1'.repeat(32)), true);
    assert.equal(api.isWalletAddress('1'.repeat(44)), true);
    const invalid = [
      undefined,
      null,
      '',
      'nope',
      'not-a-wallet',
      '1'.repeat(31),
      '1'.repeat(45),
      '0'.repeat(32),
      'O'.repeat(32),
      'I'.repeat(32),
      'l'.repeat(32),
      '../' + 'a'.repeat(40),
      'constructor',
      '__proto__'
    ];
    for (const value of invalid) {
      assert.equal(api.isWalletAddress(value), false, String(value));
      const direct = api.checkRateLimit(value);
      assert.equal(direct.allowed, false, String(value));
      assert.equal(direct.invalid, true, String(value));
      const asPro = api.checkRateLimit(value, 'pro');
      assert.equal(asPro.allowed, false, String(value));
      assert.equal(asPro.invalid, true, String(value));
      if (typeof value === 'string' && value.length > 0) {
        const res = response();
        let next = 0;
        api.rateLimiter({ params: { wallet: value }, headers: {}, apiKey: { tier: 'pro' } }, res, () => next++);
        assert.equal(next, 0, String(value));
        assert.equal(res.statusCode, 400, String(value));
        assert.deepEqual(res.body, { error: 'Invalid wallet address.' });
      }
    }
    assert.deepEqual(api.checkRateLimit(SEED), { allowed: true, remaining: 99 });
  });

  test('GET routes return 400 for a non-address before calling upstream', async () => {
    for (const path of [
      '/api/agent/not-a-wallet',
      '/api/audit/not-a-wallet',
      '/api/compliance/not-a-wallet/report'
    ]) {
      const res = await fetch(base + path);
      assert.equal(res.status, 400, path);
      assert.deepEqual(await res.json(), { error: 'Invalid wallet address.' });
    }
  });

  test('forwarding headers do not mint buckets for one socket when no wallet is present', () => {
    for (let i = 0; i < 100; i++) {
      const allowed = hit(undefined, {
        headers: { 'x-forwarded-for': `203.0.113.${i}`, 'x-real-ip': `198.51.100.${i}` },
        socket: { remoteAddress: '192.0.2.1' }
      });
      assert.equal(allowed.next, 1, `request ${i}`);
    }
    const blocked = hit(undefined, {
      headers: { 'x-forwarded-for': '203.0.113.250', 'x-real-ip': '198.51.100.250' },
      socket: { remoteAddress: '192.0.2.1' }
    });
    assert.equal(blocked.next, 0);
    assert.equal(blocked.res.statusCode, 429);
    assert.match(blocked.res.body.message, /Free tier allows 100 requests per day/);
  });

  test('the store caps distinct wallets, keeps active counters, and prunes after the window', () => {
    mock.timers.enable({ apis: ['Date'] });
    try {
      for (let i = 0; i < 4; i++) {
        const allowed = api.checkRateLimit(wallet(i));
        assert.equal(allowed.allowed, true, `wallet ${i}`);
        assert.equal(allowed.remaining, 99);
      }
      const overflow = api.checkRateLimit(wallet(4));
      assert.equal(overflow.allowed, false);
      assert.equal(overflow.capacity, true);
      assert.equal(overflow.remaining, 0);
      const denied = hit(wallet(4));
      assert.equal(denied.next, 0);
      assert.equal(denied.res.statusCode, 429);
      assert.match(denied.res.body.message, /tracking is full/);
      assert.equal(denied.res.headers['X-RateLimit-Remaining'], '0');
      const stillTracked = api.checkRateLimit(wallet(0));
      assert.equal(stillTracked.allowed, true);
      assert.equal(stillTracked.remaining, 98);
      for (let i = 0; i < 10; i++) {
        assert.equal(api.checkRateLimit(`bad-${i}`, 'pro').invalid, true);
      }
      mock.timers.tick(WINDOW_MS + 1);
      assert.deepEqual(api.checkRateLimit(wallet(0), 'pro'), { allowed: true, remaining: Infinity });
      assert.deepEqual(api.checkRateLimit(wallet(4)), { allowed: true, remaining: 99 });
      assert.deepEqual(api.checkRateLimit(wallet(0)), { allowed: true, remaining: 99 });
    } finally {
      mock.timers.reset();
    }

    assert.equal(typeof api.rateStoreLimit, 'function');
    const saved = process.env.RATE_STORE_MAX;
    delete process.env.RATE_STORE_MAX;
    try {
      assert.equal(api.rateStoreLimit(), 10000);
      process.env.RATE_STORE_MAX = '0';
      assert.equal(api.rateStoreLimit(), 10000);
      process.env.RATE_STORE_MAX = 'nope';
      assert.equal(api.rateStoreLimit(), 10000);
    } finally {
      process.env.RATE_STORE_MAX = saved;
    }
    assert.equal(api.rateStoreLimit(), 4);
  });
});
