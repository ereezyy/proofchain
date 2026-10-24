import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const configuration = JSON.parse(process.env.KEY_WORKER_CONFIGURATION);
const waitBuffer = new Int32Array(new SharedArrayBuffer(4));
const originalRead = fs.readFileSync;
const originalOpen = fs.openSync;
const originalRename = fs.renameSync;
let paused = false;
let reportedContention = false;

function send(message) {
  process.send?.(message);
}

fs.readFileSync = function (path, ...args) {
  if (path === process.env.API_KEYS_FILE && configuration.failRead) {
    throw Object.assign(new Error('Injected read failure'), { code: 'EACCES' });
  }
  const result = originalRead.call(this, path, ...args);
  if (path === process.env.API_KEYS_FILE) {
    send({ event: 'read' });
    if (configuration.pauseAfterRead && !paused) {
      paused = true;
      send({ event: 'paused' });
      const deadline = Date.now() + 15000;
      while (!fs.existsSync(configuration.releaseFile)) {
        if (Date.now() >= deadline) throw new Error('Test barrier timed out');
        Atomics.wait(waitBuffer, 0, 0, 10);
      }
    }
  }
  return result;
};

fs.renameSync = function (source, destination) {
  if (destination === process.env.API_KEYS_FILE) {
    if (configuration.failCommit) throw Object.assign(new Error('Injected commit failure'), { code: 'EIO' });
    if (configuration.pauseBeforeCommit) {
      send({ event: 'before-commit' });
      const deadline = Date.now() + 15000;
      while (!fs.existsSync(configuration.releaseFile)) {
        if (Date.now() >= deadline) throw new Error('Test barrier timed out');
        Atomics.wait(waitBuffer, 0, 0, 10);
      }
    }
  }
  return originalRename.call(this, source, destination);
};

fs.openSync = function (path, ...args) {
  try {
    return originalOpen.call(this, path, ...args);
  } catch (error) {
    if (path === process.env.API_KEYS_FILE + '.lock' && error.code === 'EEXIST' && !reportedContention) {
      reportedContention = true;
      send({ event: 'contended' });
    }
    throw error;
  }
};

syncBuiltinESMExports();

try {
  const api = await import('../../lib/api-keys.js');
  const result = api[configuration.operation](...configuration.arguments);
  send({ event: 'done', result });
} catch (error) {
  send({ event: 'failed', code: error.code, message: error.message });
  process.exitCode = 1;
} finally {
  process.disconnect?.();
}
