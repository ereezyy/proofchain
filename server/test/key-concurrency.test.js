import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fork } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const workerFile = fileURLToPath(new URL('./helpers/key-worker.mjs', import.meta.url));

function worker(file, configuration) {
  const messages = [];
  const waiters = new Set();
  const child = fork(workerFile, [], {
    env: { ...process.env, API_KEYS_FILE: file, KEY_WORKER_CONFIGURATION: JSON.stringify(configuration) },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc']
  });
  let errorOutput = '';
  child.stderr.on('data', data => { errorOutput += data; });
  child.on('message', message => {
    messages.push(message);
    for (const waiter of waiters) waiter();
  });
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      resolve({ code, signal, errorOutput });
      for (const waiter of waiters) waiter();
    });
  });
  function waitFor(events) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => finish(new Error('Child process did not reach ' + events.join('/'))), 18000);
      function finish(error, message) {
        clearTimeout(timeout);
        waiters.delete(check);
        if (error) reject(error);
        else resolve(message);
      }
      function check() {
        const failed = messages.find(message => message.event === 'failed');
        if (failed && !events.includes('failed')) return finish(new Error(failed.message));
        const message = messages.find(message => events.includes(message.event));
        if (message) return finish(null, message);
        if (child.exitCode !== null || child.signalCode !== null) finish(new Error('Child exited before barrier: ' + errorOutput));
      }
      waiters.add(check);
      check();
    });
  }
  return { child, exited, waitFor };
}

const initialEntry = () => ({
  email: 'synthetic@example.invalid', tier: 'pro', created: new Date().toISOString(), lastUsed: null, requestCount: 0
});

async function overlap(firstOperation, secondOperation, verify) {
  const directory = mkdtempSync(join(tmpdir(), 'proofchain-concurrency-'));
  const file = join(directory, 'keys.json');
  const releaseFile = join(directory, 'release');
  const firstKey = 'pc_' + randomBytes(16).toString('hex');
  const secondKey = 'pc_' + randomBytes(16).toString('hex');
  writeFileSync(file, JSON.stringify({ [firstKey]: initialEntry(), [secondKey]: initialEntry() }));
  const children = [];
  try {
    const first = worker(file, { ...firstOperation(firstKey, secondKey), pauseAfterRead: true, releaseFile });
    children.push(first);
    await first.waitFor(['paused']);
    const second = worker(file, secondOperation(firstKey, secondKey));
    children.push(second);
    // Observe a real lock collision. On the vulnerable implementation the second
    // process instead reaches its read and completes while the first is paused.
    const event = await second.waitFor(['contended', 'read']);
    if (event.event === 'read') await second.waitFor(['done']);
    writeFileSync(releaseFile, 'continue');
    const firstResult = await first.waitFor(['done']);
    const secondResult = await second.waitFor(['done']);
    for (const process of children) assert.equal((await process.exited).code, 0);
    const stored = JSON.parse(readFileSync(file, 'utf8'));
    verify(stored, firstKey, secondKey, firstResult.result, secondResult.result);
    assert.equal(event.event, 'contended', 'concurrent mutations must acquire the same lock before reading');
  } finally {
    writeFileSync(releaseFile, 'continue');
    for (const process of children) {
      if (process.child.exitCode === null && process.child.signalCode === null) process.child.kill();
      await process.exited;
    }
    rmSync(directory, { recursive: true, force: true });
  }
}

test('revocation cannot be undone by validation in another process', { timeout: 25000 }, async () => {
  await overlap(
    key => ({ operation: 'validateApiKey', arguments: [key] }),
    key => ({ operation: 'revokeApiKey', arguments: [key] }),
    (stored, key, other, validation, revoked) => {
      assert.equal(validation.valid, true);
      assert.equal(revoked, true);
      assert.equal(Object.hasOwn(stored, key), false, 'revoked credential must stay removed');
      assert.equal(Object.hasOwn(stored, other), true);
    }
  );
});

test('concurrent usage updates preserve every increment', { timeout: 25000 }, async () => {
  await overlap(
    key => ({ operation: 'validateApiKey', arguments: [key] }),
    key => ({ operation: 'validateApiKey', arguments: [key] }),
    (stored, key) => assert.equal(stored[key].requestCount, 2)
  );
});

test('concurrent generation preserves both newly issued credentials', { timeout: 25000 }, async () => {
  await overlap(
    () => ({ operation: 'generateApiKey', arguments: ['first@example.invalid'] }),
    () => ({ operation: 'generateApiKey', arguments: ['second@example.invalid'] }),
    (stored, _key, _other, first, second) => {
      assert.equal(Object.hasOwn(stored, first.key), true);
      assert.equal(Object.hasOwn(stored, second.key), true);
      assert.equal(Object.keys(stored).length, 4);
    }
  );
});

test('concurrent generation and revocation preserve both changes', { timeout: 25000 }, async () => {
  await overlap(
    () => ({ operation: 'generateApiKey', arguments: ['new@example.invalid'] }),
    key => ({ operation: 'revokeApiKey', arguments: [key] }),
    (stored, key, other, generated) => {
      assert.equal(Object.hasOwn(stored, key), false);
      assert.equal(Object.hasOwn(stored, other), true);
      assert.equal(Object.hasOwn(stored, generated.key), true);
    }
  );
});

test('concurrent revocations cannot restore either credential', { timeout: 25000 }, async () => {
  await overlap(
    key => ({ operation: 'revokeApiKey', arguments: [key] }),
    (_key, other) => ({ operation: 'revokeApiKey', arguments: [other] }),
    stored => assert.equal(Object.keys(stored).length, 0)
  );
});

test('a validation started after revocation is denied across processes', { timeout: 25000 }, async () => {
  await overlap(
    key => ({ operation: 'revokeApiKey', arguments: [key] }),
    key => ({ operation: 'validateApiKey', arguments: [key] }),
    (stored, key, _other, revoked, validation) => {
      assert.equal(revoked, true);
      assert.equal(validation.valid, false);
      assert.equal(Object.hasOwn(stored, key), false);
    }
  );
});

test('read and commit failures preserve the last complete store and release the lock', { timeout: 25000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'proofchain-storage-failure-'));
  const file = join(directory, 'keys.json');
  const key = 'pc_' + randomBytes(16).toString('hex');
  const original = JSON.stringify({ [key]: initialEntry() });
  writeFileSync(file, original);
  try {
    for (const failure of ['failRead', 'failCommit']) {
      const process = worker(file, { operation: 'revokeApiKey', arguments: [key], [failure]: true });
      const result = await process.waitFor(['failed']);
      assert.equal(result.code, 'API_KEY_STORE_UNAVAILABLE');
      assert.equal((await process.exited).code, 1);
      assert.equal(readFileSync(file, 'utf8'), original);
      assert.equal(existsSync(file + '.lock'), false);
    }
    const process = worker(file, { operation: 'validateApiKey', arguments: [key] });
    assert.equal((await process.waitFor(['done'])).result.valid, true);
    assert.equal((await process.exited).code, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a crashed writer leaves complete JSON and an orphaned lock fails closed until offline recovery', { timeout: 25000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'proofchain-storage-crash-'));
  const file = join(directory, 'keys.json');
  const releaseFile = join(directory, 'release');
  const key = 'pc_' + randomBytes(16).toString('hex');
  const original = JSON.stringify({ [key]: initialEntry() });
  writeFileSync(file, original);
  const writer = worker(file, {
    operation: 'revokeApiKey', arguments: [key], pauseBeforeCommit: true, releaseFile
  });
  try {
    await writer.waitFor(['before-commit']);
    writer.child.kill('SIGKILL');
    await writer.exited;
    assert.equal(readFileSync(file, 'utf8'), original);
    assert.equal(existsSync(file + '.lock'), true);
    const blocked = worker(file, { operation: 'validateApiKey', arguments: [key] });
    assert.equal((await blocked.waitFor(['failed'])).code, 'API_KEY_STORE_UNAVAILABLE');
    assert.equal((await blocked.exited).code, 1);
    assert.equal(readFileSync(file, 'utf8'), original);
    assert.equal(existsSync(file + '.lock'), true, 'never steal a lock based on age');
    // All worker processes have stopped; this models the documented operator recovery.
    unlinkSync(file + '.lock');
    const recovered = worker(file, { operation: 'revokeApiKey', arguments: [key] });
    assert.equal((await recovered.waitFor(['done'])).result, true);
    assert.equal((await recovered.exited).code, 0);
    assert.equal(Object.hasOwn(JSON.parse(readFileSync(file, 'utf8')), key), false);
  } finally {
    writeFileSync(releaseFile, 'continue');
    if (writer.child.exitCode === null && writer.child.signalCode === null) writer.child.kill('SIGKILL');
    await writer.exited;
    rmSync(directory, { recursive: true, force: true });
  }
});
