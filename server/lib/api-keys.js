/**
 * ProofChain API Key Management
 * Simple JSON-file-based key storage with generation and validation.
 * Keys map to email/account identifiers and track tier (free/pro).
 */

import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEYS_FILE = process.env.API_KEYS_FILE || join(__dirname, '..', 'api-keys.json');

// ── Load / Save ────────────────────────────────────────

function loadKeys() {
  try {
    if (!existsSync(KEYS_FILE)) return {};
    return JSON.parse(readFileSync(KEYS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveKeys(keys) {
  writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2), 'utf-8');
}

// ── Key Generation ─────────────────────────────────────

/**
 * Generate a new API key for a user.
 * @param {string} email - User's email
 * @param {'free'|'pro'} tier
 * @returns {{ key: string, created: string }}
 */
export function generateApiKey(email, tier = 'free') {
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
}

/**
 * Revoke an API key.
 * @param {string} key
 * @returns {boolean} true if key existed and was removed
 */
export function revokeApiKey(key) {
  const keys = loadKeys();
  if (!keys[key]) return false;
  delete keys[key];
  saveKeys(keys);
  return true;
}

/**
 * Get all keys (admin). Returns sanitized list without full keys.
 */
export function listApiKeys() {
  const keys = loadKeys();
  return Object.entries(keys).map(([key, data]) => ({
    keyPrefix: key.slice(0, 10) + '...',
    email: data.email,
    tier: data.tier,
    created: data.created,
    lastUsed: data.lastUsed,
    requestCount: data.requestCount
  }));
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

  const keys = loadKeys();
  const entry = keys[key];

  if (!entry) {
    return { valid: false, error: 'Invalid API key' };
  }

  // Update usage
  entry.lastUsed = new Date().toISOString();
  entry.requestCount = (entry.requestCount || 0) + 1;
  saveKeys(keys);

  return {
    valid: true,
    email: entry.email,
    tier: entry.tier
  };
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
