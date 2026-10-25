import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { mock, after, before, beforeEach, describe, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Storage and proxy policy must be fixed before the server module loads.
const directory = mkdtempSync(join(tmpdir(), 'proofchain-ip-limit-'));
const previous = {
  file: process.env.API_KEYS_FILE,
  mode: process.env.NODE_ENV,
  trust: process.env.TRUST_PROXY,
  cap: process.env.ISSUE_HITS_MAX,
};
process.env.API_KEYS_FILE = join(directory, 'keys.json');
process.env.NODE_ENV = 'test';
process.env.ISSUE_HITS_MAX = '3';
delete process.env.TRUST_PROXY;

const serverHref = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'server.js')).href;
const api = await import('../lib/api-keys.js');
const serverMod = await import('../server.js');
const app = serverMod.default;
const WINDOW_MS = 24 * 60 * 60 * 1000;

after(() => {
  mock.timers.reset();
  if (previous.file === undefined) delete process.env.API_KEYS_FILE;
  else process.env.API_KEYS_FILE = previous.file;
  if (previous.mode === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previous.mode;
  if (previous.trust === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = previous.trust;
  if (previous.cap === undefined) delete process.env.ISSUE_HITS_MAX;
  else process.env.ISSUE_HITS_MAX = previous.cap;
  rmSync(directory, { recursive: true, force: true });
});

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

function hit({ ip, remoteAddress = '192.0.2.10', headers = {}, apiKey, wallet } = {}) {
  const req = {
    params: wallet === undefined ? {} : { wallet },
    headers: {
      'x-forwarded-for': '203.0.113.50',
      'x-real-ip': '203.0.113.51',
      ...headers
    },
    socket: { remoteAddress }
  };
  if (ip !== undefined) req.ip = ip;
  if (apiKey !== undefined) req.apiKey = apiKey;
  const res = response();
  let next = 0;
  api.rateLimiter(req, res, () => next++);
  return { res, next };
}

describe('client IP rate limit', { concurrency: false }, () => {
  let server;
  let base;

  before(async () => {
    app.get('/__client_ip', (req, res) => {
      res.json({ ip: req.ip, socket: req.socket.remoteAddress });
    });
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
    api.clearIssueHitsForTests?.();
  });

  test('TRUST_PROXY is off unless configured', () => {
    assert.equal(typeof serverMod.resolveTrustProxy, 'function');
    assert.equal(serverMod.resolveTrustProxy(undefined), false);
    assert.equal(serverMod.resolveTrustProxy(''), false);
    assert.equal(serverMod.resolveTrustProxy('false'), false);
    assert.equal(serverMod.resolveTrustProxy('0'), false);
    assert.equal(serverMod.resolveTrustProxy('off'), false);
    assert.equal(serverMod.resolveTrustProxy('true'), true);
    assert.equal(serverMod.resolveTrustProxy('on'), true);
    assert.equal(serverMod.resolveTrustProxy('1'), 1);
    assert.equal(serverMod.resolveTrustProxy('2'), 2);
    assert.equal(serverMod.resolveTrustProxy('loopback'), 'loopback');
    assert.equal(serverMod.resolveTrustProxy('LOOPBACK'), 'loopback');
    assert.equal(app.get('trust proxy'), false);
    assert.equal(typeof api.issueHitsLimit, 'function');
    const saved = process.env.ISSUE_HITS_MAX;
    delete process.env.ISSUE_HITS_MAX;
    try {
      assert.equal(api.issueHitsLimit(), 4096);
      process.env.ISSUE_HITS_MAX = '0';
      assert.equal(api.issueHitsLimit(), 4096);
      process.env.ISSUE_HITS_MAX = 'nope';
      assert.equal(api.issueHitsLimit(), 4096);
      process.env.ISSUE_HITS_MAX = '3';
      assert.equal(api.issueHitsLimit(), 3);
    } finally {
      process.env.ISSUE_HITS_MAX = saved;
    }
  });

  test('an unset TRUST_PROXY ignores X-Forwarded-For and X-Real-IP', async () => {
    const res = await fetch(base + '/__client_ip', {
      headers: { 'x-forwarded-for': '203.0.113.50', 'x-real-ip': '203.0.113.51' }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.socket, '127.0.0.1');
    assert.equal(body.ip, '127.0.0.1');
  });

  test('TRUST_PROXY=loopback uses X-Forwarded-For from loopback and ignores X-Real-IP', () => {
    const child = `
      import assert from 'node:assert/strict';
      import { once } from 'node:events';
      const { default: app, resolveTrustProxy } = await import(process.env.SERVER_HREF);
      assert.equal(resolveTrustProxy(), 'loopback');
      assert.equal(app.get('trust proxy'), 'loopback');
      app.get('/__client_ip', (req, res) => {
        res.json({ ip: req.ip, socket: req.socket.remoteAddress });
      });
      const server = app.listen(0, '127.0.0.1');
      await once(server, 'listening');
      try {
        const res = await fetch('http://127.0.0.1:' + server.address().port + '/__client_ip', {
          headers: { 'x-forwarded-for': '203.0.113.50', 'x-real-ip': '203.0.113.51' }
        });
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.socket, '127.0.0.1');
        assert.equal(body.ip, '203.0.113.50');
      } finally {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      }
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', child], {
      encoding: 'utf8',
      timeout: 20000,
      env: {
        PATH: process.env.PATH || '',
        NODE_ENV: 'test',
        TRUST_PROXY: 'loopback',
        API_KEYS_FILE: join(directory, 'child-keys.json'),
        SERVER_HREF: serverHref
      }
    });
    assert.equal(result.status, 0, `${result.stderr || ''}\n${result.stdout || ''}`);
  });

  test('distinct sockets stay isolated when they present the same forwarding headers', () => {
    for (let i = 0; i < 100; i++) {
      const hitA = hit({
        remoteAddress: '192.0.2.1',
        headers: { 'x-forwarded-for': `198.51.100.${i % 20}`, 'x-real-ip': `203.0.113.${i % 20}` }
      });
      assert.equal(hitA.next, 1, `socket A request ${i}`);
    }
    const other = hit({
      remoteAddress: '192.0.2.2',
      headers: { 'x-forwarded-for': '198.51.100.1', 'x-real-ip': '203.0.113.1' }
    });
    assert.equal(other.next, 1);
    assert.equal(other.res.headers['X-RateLimit-Remaining'], '99');
    const blocked = hit({
      remoteAddress: '192.0.2.1',
      headers: { 'x-forwarded-for': '203.0.113.250', 'x-real-ip': '198.51.100.250' }
    });
    assert.equal(blocked.next, 0);
    assert.equal(blocked.res.statusCode, 429);
    assert.equal(blocked.res.headers['X-RateLimit-Remaining'], '0');
    assert.match(blocked.res.body.message, /Free tier allows 100 requests per day/);
  });

  test('rotating forwarding headers do not split a bucket for one resolved client IP', () => {
    for (let i = 0; i < 100; i++) {
      const allowed = hit({
        ip: '192.0.2.10',
        remoteAddress: '192.0.2.10',
        headers: { 'x-forwarded-for': `203.0.113.${i}`, 'x-real-ip': `198.51.100.${i}` }
      });
      assert.equal(allowed.next, 1, `request ${i}`);
    }
    const blocked = hit({
      ip: '192.0.2.10',
      remoteAddress: '192.0.2.10',
      headers: { 'x-forwarded-for': '203.0.113.250', 'x-real-ip': '198.51.100.250' }
    });
    assert.equal(blocked.next, 0);
    assert.equal(blocked.res.statusCode, 429);
    assert.equal(blocked.res.headers['X-RateLimit-Limit'], '100');
    assert.ok(Number(blocked.res.headers['Retry-After']) > 0);
  });

  test('pro clients do not consume an IP bucket', () => {
    for (let i = 0; i < 5; i++) {
      const pro = hit({ ip: '192.0.2.20', apiKey: { tier: 'pro' } });
      assert.equal(pro.next, 1);
      assert.equal(pro.res.headers['X-RateLimit-Limit'], 'unlimited');
    }
    const free = hit({ ip: '192.0.2.20' });
    assert.equal(free.next, 1);
    assert.equal(free.res.headers['X-RateLimit-Remaining'], '99');
  });

  test('wallet quotas ignore forwarding headers', () => {
    const wallet = '11111111111111111111111111111111';
    for (let i = 0; i < 100; i++) {
      const allowed = hit({
        wallet,
        ip: `203.0.113.${i}`,
        headers: { 'x-forwarded-for': `198.51.100.${i}`, 'x-real-ip': `192.0.2.${i}` }
      });
      assert.equal(allowed.next, 1, `wallet request ${i}`);
    }
    const blocked = hit({
      wallet,
      ip: '198.51.100.20',
      headers: { 'x-forwarded-for': '203.0.113.77', 'x-real-ip': '203.0.113.78' }
    });
    assert.equal(blocked.next, 0);
    assert.equal(blocked.res.statusCode, 429);
    const other = hit({ wallet: '11111111111111111111111111111112', ip: '203.0.113.77' });
    assert.equal(other.next, 1);
    assert.equal(other.res.headers['X-RateLimit-Remaining'], '99');
  });

  test('IP buckets are capped and expired entries are pruned', () => {
    mock.timers.enable({ apis: ['Date'] });
    try {
      for (let i = 1; i <= 3; i++) {
        const allowed = hit({ ip: `198.51.100.${i}`, remoteAddress: '127.0.0.1' });
        assert.equal(allowed.next, 1, `new ip ${i}`);
      }
      const overflow = hit({ ip: '198.51.100.99', remoteAddress: '127.0.0.1' });
      assert.equal(overflow.next, 0);
      assert.equal(overflow.res.statusCode, 429);
      assert.match(overflow.res.body.message, /tracking is full/);
      const stillTracked = hit({ ip: '198.51.100.1', remoteAddress: '127.0.0.1' });
      assert.equal(stillTracked.next, 1);
      assert.equal(stillTracked.res.headers['X-RateLimit-Remaining'], '98');
      mock.timers.tick(WINDOW_MS + 1);
      const freed = hit({ ip: '198.51.100.99', remoteAddress: '127.0.0.1' });
      assert.equal(freed.next, 1);
      assert.equal(freed.res.headers['X-RateLimit-Remaining'], '99');
      const reset = hit({ ip: '198.51.100.1', remoteAddress: '127.0.0.1' });
      assert.equal(reset.next, 1);
      assert.equal(reset.res.headers['X-RateLimit-Remaining'], '99');
    } finally {
      mock.timers.reset();
    }
  });
});
