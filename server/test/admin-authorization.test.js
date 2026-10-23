import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

const directory = mkdtempSync(join(tmpdir(), 'proofchain-admin-test-'));
const previous = { file: process.env.API_KEYS_FILE, admin: process.env.PROOFCHAIN_ADMIN_KEY, mode: process.env.NODE_ENV };
process.env.API_KEYS_FILE = join(directory, 'keys.json');
const adminSecret = randomBytes(32).toString('hex');
process.env.PROOFCHAIN_ADMIN_KEY = adminSecret;
process.env.NODE_ENV = 'test';
const api = await import('../lib/api-keys.js');
const { default: app } = await import('../server.js');
const free = api.generateApiKey('free@example.invalid');
const pro = api.generateApiKey('pro@example.invalid', 'pro');
const victim = api.generateApiKey('other-user@example.invalid', 'pro');
let server;
let base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  for (const [name, value] of [['API_KEYS_FILE', previous.file], ['PROOFCHAIN_ADMIN_KEY', previous.admin], ['NODE_ENV', previous.mode]]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  rmSync(directory, { recursive: true, force: true });
});

const operations = [
  ['GET', '/api/pro/keys'],
  ['POST', '/api/pro/keys/generate', { email: 'new-user@example.invalid' }],
  ['DELETE', `/api/pro/keys/revoke/${victim.key}`]
];
async function request(method, path, headers = {}, body) {
  return fetch(base + path, {
    method, headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}
const storedKeys = () => Object.keys(JSON.parse(readFileSync(process.env.API_KEYS_FILE, 'utf8'))).sort();

test('anonymous, invalid, free and Pro API credentials cannot list/create/revoke keys', async () => {
  const original = storedKeys();
  for (const key of [undefined, 'invalid', free.key, pro.key]) {
    const headers = key ? { 'x-api-key': key } : {};
    for (const [method, path, body] of operations) {
      const res = await request(method, path, headers, body);
      assert.equal(res.status, 401, `${method} ${path.split('/').slice(0, 5).join('/')}`);
      assert.deepEqual(await res.json(), { error: 'Admin credential required' });
      assert.deepEqual(storedKeys(), original);
    }
  }
  assert.equal(api.validateApiKey(victim.key).valid, true);
});

test('ordinary keys or incorrect values in the admin header cannot grant admin access', async () => {
  const original = storedKeys();
  for (const value of ['wrong', randomBytes(32).toString('hex'), free.key, pro.key]) {
    for (const [method, path, body] of operations) {
      const res = await request(method, path, { 'x-admin-key': value }, body);
      assert.equal(res.status, 403);
      assert.deepEqual(await res.json(), { error: 'Invalid admin credential' });
      assert.deepEqual(storedKeys(), original);
    }
  }
});

test('query parameters and API-key headers cannot substitute for the admin header', async () => {
  for (const [method, path, body] of operations) {
    const res = await request(method, path + '?admin_key=' + adminSecret + '&api_key=' + adminSecret,
      { 'x-api-key': adminSecret }, body);
    assert.equal(res.status, 401);
    await res.arrayBuffer();
  }
});

test('key management fails closed when admin secret is missing, empty or too short', async () => {
  const original = storedKeys();
  try {
    for (const value of [undefined, '', 'short']) {
      if (value === undefined) delete process.env.PROOFCHAIN_ADMIN_KEY;
      else process.env.PROOFCHAIN_ADMIN_KEY = value;
      for (const [method, path, body] of operations) {
        const res = await request(method, path, { 'x-admin-key': adminSecret }, body);
        assert.equal(res.status, 503);
        assert.deepEqual(await res.json(), { error: 'API key management is disabled' });
        assert.deepEqual(storedKeys(), original);
      }
    }
  } finally { process.env.PROOFCHAIN_ADMIN_KEY = adminSecret; }
});

test('independent admin credential can list, generate and revoke keys without a customer key', async () => {
  const headers = { 'x-admin-key': adminSecret };
  let res = await request('GET', '/api/pro/keys', headers);
  assert.equal(res.status, 200);
  const listed = await res.json();
  assert.ok(listed.keys.some(entry => entry.email === 'other-user@example.invalid'));
  assert.ok(!JSON.stringify(listed).includes(victim.key));
  res = await request('POST', '/api/pro/keys/generate', headers, {});
  assert.equal(res.status, 400);
  await res.arrayBuffer();
  res = await request('POST', '/api/pro/keys/generate', headers, { email: 'admin-created@example.invalid' });
  assert.equal(res.status, 201);
  const created = await res.json();
  assert.deepEqual(api.validateApiKey(created.key), {
    valid: true, email: 'admin-created@example.invalid', tier: 'pro'
  });
  res = await request('DELETE', `/api/pro/keys/revoke/${victim.key}`, headers);
  assert.equal(res.status, 200);
  await res.arrayBuffer();
  assert.equal(api.validateApiKey(victim.key).valid, false);
  res = await request('DELETE', `/api/pro/keys/revoke/${victim.key}`, headers);
  assert.equal(res.status, 404);
  await res.arrayBuffer();
  // Rotation takes effect; old operator credentials immediately lose authority.
  process.env.PROOFCHAIN_ADMIN_KEY = randomBytes(32).toString('hex');
  try {
    res = await request('GET', '/api/pro/keys', headers);
    assert.equal(res.status, 403);
    await res.arrayBuffer();
  } finally { process.env.PROOFCHAIN_ADMIN_KEY = adminSecret; }
});

test('ordinary Pro access still works; admin credential alone does not authenticate as a customer', async () => {
  const body = { wallet: 'synthetic-wallet', framework: 'soc2' };
  let res = await request('POST', '/api/pro/reports/schedule', { 'x-api-key': pro.key }, body);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, 'scheduled');
  res = await request('POST', '/api/pro/reports/schedule', { 'x-admin-key': adminSecret }, body);
  assert.equal(res.status, 401);
  await res.arrayBuffer();
});

test('inherited-property credentials cannot authenticate, expose key holders or mutate shared objects', async () => {
  const targets = [Object.prototype, Object, Object.prototype.toString, Object.prototype.hasOwnProperty];
  const snapshots = targets.map(target => Object.getOwnPropertyDescriptors(target));
  const beforeFile = readFileSync(process.env.API_KEYS_FILE);
  const customerData = ['free@example.invalid', 'pro@example.invalid', 'other-user@example.invalid'];
  try {
    for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
      for (const query of [false, true]) {
        const suffix = query ? '?api_key=' + encodeURIComponent(key) : '';
        const headers = query ? {} : { 'x-api-key': key };
        let res = await request('POST', '/api/pro/reports/schedule' + suffix, headers,
          { wallet: 'synthetic-wallet', framework: 'soc2' });
        assert.equal(res.status, 403);
        await res.arrayBuffer();
        for (const [method, path, body] of operations) {
          res = await request(method, path + suffix, headers, body);
          assert.equal(res.status, 401);
          const text = await res.text();
          assert.ok(customerData.every(email => !text.includes(email)));
        }
      }
      assert.deepEqual(readFileSync(process.env.API_KEYS_FILE), beforeFile);
      targets.forEach((target, index) => {
        assert.deepEqual(Object.getOwnPropertyDescriptors(target), snapshots[index]);
      });
    }
  } finally {
    targets.forEach((target, index) => {
      for (const name of Reflect.ownKeys(target)) {
        if (!Object.hasOwn(snapshots[index], name)) delete target[name];
      }
      Object.defineProperties(target, snapshots[index]);
    });
  }
});
