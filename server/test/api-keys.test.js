import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// Set storage before importing: tests must never touch real API keys.
const directory = mkdtempSync(join(tmpdir(), 'proofchain-test-'));
const previousFile = process.env.API_KEYS_FILE;
process.env.API_KEYS_FILE = join(directory, 'keys.json');
const api = await import('../lib/api-keys.js');
after(() => {
  if (previousFile === undefined) delete process.env.API_KEYS_FILE;
  else process.env.API_KEYS_FILE = previousFile;
  rmSync(directory, { recursive: true, force: true });
});

test('generated keys persist metadata and validation records usage', () => {
  const first = api.generateApiKey('test@example.invalid');
  const second = api.generateApiKey('pro@example.invalid', 'pro');
  assert.match(first.key, /^pc_[a-f0-9]{32}$/);
  assert.notEqual(first.key, second.key);
  assert.equal(first.tier, 'free');
  assert.equal(second.tier, 'pro');
  assert.ok(Number.isFinite(Date.parse(first.created)));
  assert.deepEqual(api.validateApiKey(first.key), {
    valid: true, email: 'test@example.invalid', tier: 'free'
  });
  api.validateApiKey(first.key);
  const stored = JSON.parse(readFileSync(process.env.API_KEYS_FILE, 'utf8'));
  assert.equal(stored[first.key].requestCount, 2);
  assert.ok(Number.isFinite(Date.parse(stored[first.key].lastUsed)));
  const listed = api.listApiKeys();
  assert.equal(listed.length, 2);
  assert.ok(listed.every(entry => !('key' in entry)));
  assert.ok(!JSON.stringify(listed).includes(first.key));
  assert.ok(listed.some(entry => entry.keyPrefix === first.key.slice(0, 10) + '...'));
});

test('missing, invalid and revoked keys are rejected', () => {
  for (const value of [undefined, null, '', 42]) {
    assert.equal(api.validateApiKey(value).valid, false);
  }
  assert.equal(api.validateApiKey('nonexistent-key').valid, false);
  const { key } = api.generateApiKey('revoke@example.invalid');
  assert.equal(api.revokeApiKey(key), true);
  assert.equal(api.validateApiKey(key).valid, false);
  assert.equal(api.revokeApiKey(key), false);
});

test('malformed or invalid credential files fail closed without replacing existing data', () => {
  const original = readFileSync(process.env.API_KEYS_FILE);
  try {
    for (const corrupt of ['{invalid JSON', 'null', '[]', '{"invalid":null}', '{"invalid":42}']) {
      writeFileSync(process.env.API_KEYS_FILE, corrupt);
      for (const operation of [
        () => api.generateApiKey('synthetic@example.invalid'),
        () => api.revokeApiKey('synthetic-key'),
        () => api.validateApiKey('synthetic-key'),
        () => api.listApiKeys()
      ]) {
        assert.throws(operation, { code: 'API_KEY_STORE_UNAVAILABLE', message: 'API key storage unavailable' });
        assert.equal(readFileSync(process.env.API_KEYS_FILE, 'utf8'), corrupt);
        assert.equal(existsSync(process.env.API_KEYS_FILE + '.lock'), false);
      }
    }
  } finally { writeFileSync(process.env.API_KEYS_FILE, original); }
});

function response() {
  return {
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    set(name, value) { this.headers[name] = value; return this; }
  };
}

test('required authentication rejects missing/invalid keys and attaches valid metadata', () => {
  for (const [headers, status] of [[{}, 401], [{ 'x-api-key': 'invalid' }, 403]]) {
    const res = response();
    api.requireApiKey({ headers, query: {} }, res, () => assert.fail('unauthorized next'));
    assert.equal(res.statusCode, status);
    assert.ok(res.body.error);
  }
  const { key } = api.generateApiKey('auth@example.invalid', 'pro');
  const req = { headers: { 'x-api-key': key }, query: {} };
  let calls = 0;
  api.requireApiKey(req, response(), () => calls++);
  assert.equal(calls, 1);
  assert.deepEqual(req.apiKey, { email: 'auth@example.invalid', tier: 'pro' });
});

test('optional authentication continues anonymously or attaches valid metadata', () => {
  const { key } = api.generateApiKey('optional@example.invalid');
  for (const value of [undefined, 'invalid', key]) {
    const req = { headers: { 'x-api-key': value }, query: {} };
    let calls = 0;
    api.optionalApiKey(req, response(), () => calls++);
    assert.equal(calls, 1);
    assert.deepEqual(req.apiKey, value === key
      ? { email: 'optional@example.invalid', tier: 'free' } : undefined);
  }
});

test('free quota permits 100 requests, rejects 101, and isolates wallets', () => {
  const wallet = randomUUID();
  for (let i = 1; i <= 100; i++) {
    assert.deepEqual(api.checkRateLimit(wallet), { allowed: true, remaining: 100 - i });
  }
  const blocked = api.checkRateLimit(wallet);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.resetIn > 0 && blocked.resetIn <= 86400000);
  assert.deepEqual(api.checkRateLimit(randomUUID()), { allowed: true, remaining: 99 });
  assert.deepEqual(api.checkRateLimit(wallet, 'pro'), { allowed: true, remaining: Infinity });
});

test('rate limiter returns 429 with retry and quota headers after exhaustion', () => {
  const req = { params: { wallet: randomUUID() } };
  for (let i = 0; i < 100; i++) api.checkRateLimit(req.params.wallet);
  const res = response();
  api.rateLimiter(req, res, () => assert.fail('exhausted quota next'));
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['X-RateLimit-Limit'], '100');
  assert.equal(res.headers['X-RateLimit-Remaining'], '0');
  assert.ok(Number(res.headers['Retry-After']) > 0);
  req.apiKey = { tier: 'pro' };
  let calls = 0;
  const proRes = response();
  api.rateLimiter(req, proRes, () => calls++);
  assert.equal(calls, 1);
  assert.equal(proRes.headers['X-RateLimit-Limit'], 'unlimited');
});
