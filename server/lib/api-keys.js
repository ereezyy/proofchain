/**
 * ProofChain API Key Management
 * Simple JSON-file-based key storage with generation and validation.
 * Keys map to email/account identifiers and track tier (free/pro).
 */

import { randomUUID, createHash, timingSafeEqual } from 'crypto';
import { closeSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { basename, join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'node:perf_hooks';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEYS_FILE = resolve(process.env.API_KEYS_FILE || join(__dirname, '..', 'api-keys.json'));
const LOCK_TIMEOUT_MS = 5000;
const lockWait = new Int32Array(new SharedArrayBuffer(4));

// ── Load / Save ────────────────────────────────────────

function withKeysLock(operation) {
  try {
    // Canonicalize the parent so aliases to the same directory share a lock.
    const lockFile = join(realpathSync(dirname(KEYS_FILE)), basename(KEYS_FILE) + '.lock');
    const deadline = performance.now() + LOCK_TIMEOUT_MS;
    let descriptor;
    while (descriptor === undefined) {
      try {
        descriptor = openSync(lockFile, 'wx', 0o600);
      } catch (error) {
        if (error.code !== 'EEXIST' || performance.now() >= deadline) throw error;
        Atomics.wait(lockWait, 0, 0, 10);
      }
    }
    try {
      // The lock must cover the initial read as well as the final replacement.
      return operation();
    } finally {
      try { closeSync(descriptor); }
      finally { unlinkSync(lockFile); }
    }
  } catch {
    // Never turn a corrupt/unreadable store or a busy/orphaned lock into {}.
    const error = new Error('API key storage unavailable');
    error.code = 'API_KEY_STORE_UNAVAILABLE';
    throw error;
  }
}

function loadKeys() {
  let metadata;
  try {
    metadata = lstatSync(KEYS_FILE);
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
  // Replacing symlinks/hard links would split aliases into independent stores.
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) {
    throw new Error('Key storage must be a regular file');
  }
  const keys = JSON.parse(readFileSync(KEYS_FILE, 'utf-8'));
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)
      || Object.values(keys).some(entry => !entry || typeof entry !== 'object' || Array.isArray(entry))) {
    throw new Error('Invalid key storage');
  }
  return keys;
}

function saveKeys(keys) {
  const temporary = `${KEYS_FILE}.${process.pid}.${randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, JSON.stringify(keys, null, 2), 'utf-8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    // Readers see either the previous complete JSON document or the new one.
    renameSync(temporary, KEYS_FILE);
  } catch (error) {
    // Attempt both cleanup steps even if one fails; preserve the write error.
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* best effort */ }
    }
    try { unlinkSync(temporary); } catch { /* best effort */ }
    throw error;
  }
}

// ── Key Generation ─────────────────────────────────────

/**
 * Generate a new API key for a user.
 * @param {string} email - User's email
 * @param {'free'|'pro'} tier
 * @returns {{ key: string, created: string }}
 */
export function generateApiKey(email, tier = 'free') {
  return withKeysLock(() => {
    const keys = loadKeys();
    const key = `pc_${randomUUID().replace(/-/g, '')}`;

    keys[key] = {
      email,
      tier,
      created: new Date().toISOString(),
      lastUsed: null,
      requestCount: 0
    };

    saveKeys(keys);
    return { key, tier, created: keys[key].created };
  });
}

/**
 * Revoke an API key.
 * @param {string} key
 * @returns {boolean} true if key existed and was removed
 */
export function revokeApiKey(key) {
  if (typeof key !== 'string') return false;
  return withKeysLock(() => {
    const keys = loadKeys();
    if (!Object.hasOwn(keys, key) || !keys[key]) return false;
    delete keys[key];
    saveKeys(keys);
    return true;
  });
}

/**
 * Get all keys (admin). Returns sanitized list without full keys.
 */
export function listApiKeys() {
  return withKeysLock(() => {
    const keys = loadKeys();
    return Object.entries(keys).map(([key, data]) => ({
      keyPrefix: key.slice(0, 10) + '...',
      email: data.email,
      tier: data.tier,
      created: data.created,
      lastUsed: data.lastUsed,
      requestCount: data.requestCount
    }));
  });
}

// ── Validation ─────────────────────────────────────────

/**
 * Validate an API key and return its metadata.
 * @param {string} key
 * @returns {{ valid: boolean, email?: string, tier?: string, error?: string }}
 */
export function validateApiKey(key) {
  if (!key || typeof key !== 'string') {
    return { valid: false, error: 'Missing API key' };
  }

  return withKeysLock(() => {
    const keys = loadKeys();
    // JSON objects inherit names such as constructor and __proto__; those are not keys.
    const entry = Object.hasOwn(keys, key) ? keys[key] : null;

    if (!entry) {
      return { valid: false, error: 'Invalid API key' };
    }

    // Update usage while holding the same lock used by generation and revocation.
    entry.lastUsed = new Date().toISOString();
    entry.requestCount = (entry.requestCount || 0) + 1;
    saveKeys(keys);

    return {
      valid: true,
      email: entry.email,
      tier: entry.tier
    };
  });
}

// ── Rate Limiting ──────────────────────────────────────

const RATE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const FREE_LIMIT = 100;

const rateStore = new Map(); // wallet -> { count, windowStart }

/**
 * Check rate limit for a wallet (free tier only).
 * Pro tier keys bypass this check.
 */
export function checkRateLimit(wallet, tier = 'free') {
  if (tier === 'pro') return { allowed: true, remaining: Infinity };

  const now = Date.now();
  const entry = rateStore.get(wallet);

  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateStore.set(wallet, { count: 1, windowStart: now });
    return { allowed: true, remaining: FREE_LIMIT - 1 };
  }

  entry.count++;
  const remaining = Math.max(0, FREE_LIMIT - entry.count);

  if (entry.count > FREE_LIMIT) {
    return { allowed: false, remaining: 0, resetIn: RATE_WINDOW_MS - (now - entry.windowStart) };
  }

  return { allowed: true, remaining };
}

// ── Express Middleware ─────────────────────────────────

/**
 * Global key management is a separate operator capability, never a paid tier.
 * Header only: admin credentials must not appear in query strings or key storage.
 */
export function requireAdminKey(req, res, next) {
  const expected = process.env.PROOFCHAIN_ADMIN_KEY;
  // Fail closed until an independent, high-entropy operator secret is provisioned.
  if (typeof expected !== 'string' || Buffer.byteLength(expected) < 32) {
    return res.status(503).json({ error: 'API key management is disabled' });
  }
  const supplied = req.headers['x-admin-key'];
  if (typeof supplied !== 'string' || !supplied) {
    return res.status(401).json({ error: 'Admin credential required' });
  }
  // Fixed-size digests allow constant-time comparison for any supplied length.
  const digest = value => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(digest(supplied), digest(expected))) {
    return res.status(403).json({ error: 'Invalid admin credential' });
  }
  next();
}

/**
 * Express middleware: require API key in X-API-Key header.
 * Attaches `req.apiKey` metadata on success.
 */
export function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey) {
    return res.status(401).json({
      error: 'API key required',
      message: 'Provide your API key in the X-API-Key header or ?api_key= query parameter.',
      docs: 'https://proofchain.us/pricing.html'
    });
  }

  const result = validateApiKey(apiKey);

  if (!result.valid) {
    return res.status(403).json({
      error: result.error,
      message: 'The provided API key is invalid or has been revoked.',
      docs: 'https://proofchain.us/pricing.html'
    });
  }

  req.apiKey = { email: result.email, tier: result.tier };
  next();
}

/**
 * Express middleware: optional API key. Attaches metadata if present,
 * but doesn't reject requests without a key.
 */
export function optionalApiKey(req, _res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (apiKey) {
    const result = validateApiKey(apiKey);
    if (result.valid) {
      req.apiKey = { email: result.email, tier: result.tier };
    }
  }

  next();
}

/**
 * Apply rate limiting per wallet (IP for unauthenticated, wallet for auth'd).
 */
export function rateLimiter(req, res, next) {
  const wallet = req.params.wallet || req.ip || 'anonymous';
  const tier = req.apiKey?.tier || 'free';

  const limit = checkRateLimit(wallet, tier);

  // Set rate limit headers
  res.set('X-RateLimit-Limit', tier === 'pro' ? 'unlimited' : String(FREE_LIMIT));
  res.set('X-RateLimit-Remaining', String(limit.remaining));

  if (!limit.allowed) {
    res.set('Retry-After', String(Math.ceil((limit.resetIn || 0) / 1000)));
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: `Free tier allows ${FREE_LIMIT} requests per day. Upgrade to Pro for unlimited access.`,
      upgrade: 'https://proofchain.us/pricing.html'
    });
  }

  next();
}
