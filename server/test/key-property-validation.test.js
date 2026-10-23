import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'proofchain-key-property-test-'));
const previous = process.env.API_KEYS_FILE;
process.env.API_KEYS_FILE = join(directory, 'keys.json');
const api = await import('../lib/api-keys.js');
after(() => {
  if (previous === undefined) delete process.env.API_KEYS_FILE;
  else process.env.API_KEYS_FILE = previous;
  rmSync(directory, { recursive: true, force: true });
});

test('only stored own properties authenticate or revoke; inherited names cannot mutate shared objects', () => {
  const { key } = api.generateApiKey('synthetic@example.invalid', 'pro');
  const beforeFile = readFileSync(process.env.API_KEYS_FILE);
  const names = Object.getOwnPropertyNames(Object.prototype);
  // Include the constructor and inherited functions: each was previously mutated.
  const targets = [Object.prototype, ...names.map(name => Object.prototype[name])
    .filter(value => typeof value === 'function')];
  const snapshots = targets.map(target => Object.getOwnPropertyDescriptors(target));
  try {
    for (const name of [...names, 'prototype', 'nonexistent']) {
      assert.deepEqual(api.validateApiKey(name), { valid: false, error: 'Invalid API key' }, name);
      assert.equal(api.revokeApiKey(name), false, name);
      assert.deepEqual(readFileSync(process.env.API_KEYS_FILE), beforeFile, name);
    }
    targets.forEach((target, index) => {
      assert.deepEqual(Object.getOwnPropertyDescriptors(target), snapshots[index]);
    });
    assert.deepEqual(api.validateApiKey(key), {
      valid: true, email: 'synthetic@example.invalid', tier: 'pro'
    });
    assert.equal(api.revokeApiKey(key), true);
    assert.equal(api.validateApiKey(key).valid, false);
  } finally {
    // Keep a deliberately vulnerable test run from polluting this process.
    targets.forEach((target, index) => {
      for (const name of Reflect.ownKeys(target)) {
        if (!Object.hasOwn(snapshots[index], name)) delete target[name];
      }
      Object.defineProperties(target, snapshots[index]);
    });
  }
});
