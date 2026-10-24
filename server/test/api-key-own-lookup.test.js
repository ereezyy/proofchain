import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Set storage before importing: tests must never touch real API keys.
const directory = mkdtempSync(join(tmpdir(), 'proofchain-own-lookup-'));
const previousFile = process.env.API_KEYS_FILE;
process.env.API_KEYS_FILE = join(directory, 'keys.json');
const api = await import('../lib/api-keys.js');

const INHERITED_NAMES = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'prototype', 'valueOf'];

function response() {
  return {
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    set(name, value) { this.headers[name] = value; return this; }
  };
}

function clearInheritedWrites() {
  delete Object.prototype.lastUsed;
  delete Object.prototype.requestCount;
  for (const name of INHERITED_NAMES) {
    const value = Object.prototype[name];
    if (value && (typeof value === 'function' || typeof value === 'object')) {
      delete value.lastUsed;
      delete value.requestCount;
    }
  }
}

after(() => {
  clearInheritedWrites();
  if (previousFile === undefined) delete process.env.API_KEYS_FILE;
  else process.env.API_KEYS_FILE = previousFile;
  rmSync(directory, { recursive: true, force: true });
});

for (const name of INHERITED_NAMES) {
  test(`validateApiKey rejects inherited name ${name}`, () => {
    assert.equal(api.validateApiKey(name).valid, false);
  });

  test(`requireApiKey rejects inherited name ${name} without calling next`, () => {
    let nextCalled = false;
    const res = response();
    api.requireApiKey({ headers: { 'x-api-key': name }, query: {} }, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.ok(
      res.statusCode === 401 || res.statusCode === 403,
      `expected 401 or 403, got ${res.statusCode}`
    );
  });
}

test('inherited-name attempts do not pollute Object.prototype', () => {
  for (const name of INHERITED_NAMES) {
    api.validateApiKey(name);
    api.requireApiKey({ headers: { 'x-api-key': name }, query: {} }, response(), () => {});
  }
  assert.equal(Object.hasOwn(Object.prototype, 'lastUsed'), false);
  assert.equal(Object.hasOwn(Object.prototype, 'requestCount'), false);
  assert.equal(({}).lastUsed, undefined);
});

test('a real generated key still validates', () => {
  const { key } = api.generateApiKey('owner@example.invalid', 'pro');
  assert.match(key, /^pc_[a-f0-9]{32}$/);
  assert.deepEqual(api.validateApiKey(key), {
    valid: true,
    email: 'owner@example.invalid',
    tier: 'pro'
  });
});
