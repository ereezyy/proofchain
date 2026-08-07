/**
 * ProofChain SDK — Audit trails and compliance for AI agents.
 *
 * @module @proofchain/sdk
 * @version 0.1.0
 *
 * @example
 *   const ProofChain = require('@proofchain/sdk');
 *
 *   const agent = await ProofChain.verifyAgent('FKwU1...');
 *   console.log(agent.verified);
 */

'use strict';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Current SDK configuration.
 * @typedef {Object} ProofChainConfig
 * @property {string}  apiUrl   - Base URL of the ProofChain API.
 * @property {string}  [apiKey] - Optional bearer token for authenticated endpoints.
 * @property {number}  timeout  - Request timeout in ms (default 30_000).
 */

/** @type {ProofChainConfig} */
let _config = {
  apiUrl: process.env.PROOFCHAIN_API_URL || 'http://localhost:3456',
  apiKey: process.env.PROOFCHAIN_API_KEY || undefined,
  timeout: parseInt(process.env.PROOFCHAIN_TIMEOUT, 10) || 30_000,
};

/**
 * Override the default SDK configuration.
 *
 * @param {Partial<ProofChainConfig>} opts
 * @example
 *   ProofChain.configure({ apiUrl: 'https://proofchain.example.com', apiKey: 'sk-...' });
 */
function configure(opts) {
  if (opts.apiUrl != null) _config.apiUrl = opts.apiUrl.replace(/\/+$/, '');
  if (opts.apiKey !== undefined) _config.apiKey = opts.apiKey;
  if (opts.timeout != null) _config.timeout = opts.timeout;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Thin wrapper around fetch with timeout + error normalisation.
 *
 * @param {string} path   - URL path (e.g. "/api/v2/agents/verify/FKwU1").
 * @param {RequestInit} [init]
 * @returns {Promise<any>} Parsed JSON body.
 */
async function _request(path, init = {}) {
  const url = `${_config.apiUrl}${path}`;

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...init.headers,
  };

  if (_config.apiKey) {
    headers['Authorization'] = `Bearer ${_config.apiKey}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), _config.timeout);

  /** @type {Response} */
  let res;
  try {
    res = await fetch(url, { ...init, headers, signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new ProofChainError(`Request timed out after ${_config.timeout}ms: ${url}`);
    }
    throw new ProofChainError(`Network error: ${err.message}`, { cause: err });
  } finally {
    clearTimeout(timer);
  }

  // Best-effort JSON parse; fall back to text for non-JSON bodies.
  let body;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const msg =
      (body && (body.error || body.message)) || `HTTP ${res.status} ${res.statusText}`;
    throw new ProofChainError(msg, { status: res.status, body });
  }

  return body;
}

// ---------------------------------------------------------------------------
// Custom error
// ---------------------------------------------------------------------------

class ProofChainError extends Error {
  /**
   * @param {string} message
   * @param {Object} [extra]
   * @param {number} [extra.status]  - HTTP status code.
   * @param {*}      [extra.body]    - Raw response body.
   * @param {Error}  [extra.cause]   - Underlying error.
   */
  constructor(message, extra = {}) {
    super(message);
    this.name = 'ProofChainError';
    this.status = extra.status;
    this.body = extra.body;
    if (extra.cause) this.cause = extra.cause;
  }
}

// ---------------------------------------------------------------------------
// 1. REGISTER AGENT — AgentID v2
// ---------------------------------------------------------------------------

/**
 * Register a new agent identity on ProofChain.
 *
 * @param {Object}   params
 * @param {string}   params.name        - Human-readable agent name.
 * @param {string}   params.description - Short description of the agent's purpose.
 * @param {string}   params.wallet      - Public-key / wallet address (Solana).
 * @returns {Promise<{ agentId: string, wallet: string, tx: string, createdAt: string }>}
 *
 * @example
 *   const reg = await ProofChain.registerAgent({
 *     name: 'TraderBot',
 *     description: 'Autonomous DeFi trading agent',
 *     wallet: 'FKwU1...',
 *   });
 */
async function registerAgent({ name, description, wallet }) {
  return _request('/api/v2/agents/register', {
    method: 'POST',
    body: JSON.stringify({ name, description, wallet }),
  });
}

// ---------------------------------------------------------------------------
// 2. VERIFY AGENT — AgentID v2
// ---------------------------------------------------------------------------

/**
 * Verify that a wallet is registered as a ProofChain agent.
 *
 * @param {string} wallet - Public-key / wallet address to verify.
 * @returns {Promise<{ verified: boolean, agent?: Object, registeredAt?: string }>}
 *
 * @example
 *   const result = await ProofChain.verifyAgent('FKwU1...');
 *   console.log(result.verified); // true
 */
async function verifyAgent(wallet) {
  return _request(`/api/v2/agents/verify/${encodeURIComponent(wallet)}`);
}

// ---------------------------------------------------------------------------
// 3. LOG ACTION — HXMP memo write
// ---------------------------------------------------------------------------

/**
 * Log an action to the agent's audit trail via HXMP memo.
 *
 * @param {Object}  params
 * @param {string}  params.agent   - Agent wallet / ID performing the action.
 * @param {string}  params.action  - Name of the action (e.g. "trade", "mint", "transfer").
 * @param {string}  params.intent  - High-level intent / goal behind the action.
 * @param {Object}  [params.context]  - Free-form context object (chain, amounts, etc.).
 * @param {Object}  [params.outcome]  - Result / outcome of the action.
 * @returns {Promise<{ id: string, tx: string, timestamp: string }>}
 *
 * @example
 *   await ProofChain.logAction({
 *     agent: 'FKwU1...',
 *     action: 'swap',
 *     intent: 'Rebalance portfolio after market drop',
 *     context: { tokenIn: 'SOL', tokenOut: 'USDC', amount: 100 },
 *     outcome: { txSig: '5K...', success: true },
 *   });
 */
async function logAction({ agent, action, intent, context, outcome }) {
  return _request('/api/v1/hxmp/memo', {
    method: 'POST',
    body: JSON.stringify({ agent, action, intent, context, outcome }),
  });
}

// ---------------------------------------------------------------------------
// 4. GET AUDIT TRAIL
// ---------------------------------------------------------------------------

/**
 * Fetch the audit trail for a given wallet.
 *
 * @param {string} wallet    - Agent wallet / ID.
 * @param {Object} [opts]
 * @param {string} [opts.type]   - Action type filter (e.g. "trade", "mint").
 * @param {number} [opts.limit]  - Max entries to return (server default if omitted).
 * @param {number} [opts.offset] - Pagination offset (default 0).
 * @returns {Promise<{ total: number, entries: Array<Object> }>}
 *
 * @example
 *   const trail = await ProofChain.getAuditTrail('FKwU1...', { limit: 10 });
 *   console.log(trail.total); // 100
 */
async function getAuditTrail(wallet, { type, limit, offset } = {}) {
  const params = new URLSearchParams();
  if (type != null) params.set('type', type);
  if (limit != null) params.set('limit', limit);
  if (offset != null) params.set('offset', offset);
  const qs = params.toString();
  return _request(`/api/v1/audit/${encodeURIComponent(wallet)}${qs ? '?' + qs : ''}`);
}

// ---------------------------------------------------------------------------
// 5. GENERATE COMPLIANCE REPORT
// ---------------------------------------------------------------------------

/**
 * Generate a compliance report against specified regulatory frameworks.
 *
 * @param {string} wallet          - Agent wallet / ID.
 * @param {Object} [opts]
 * @param {string} [opts.framework] - Framework name ("eu_ai_act", "iso_42001", "nist_ai_rmf",
 *                                    "gdpr", "soc2", "all"). Default: "all".
 * @returns {Promise<{ reports: Object, generatedAt: string }>}
 *
 * @example
 *   const report = await ProofChain.generateReport('FKwU1...', { framework: 'all' });
 *   console.log(report.reports.eu_ai_act.article_50_transparency); // "COMPLIANT"
 */
async function generateReport(wallet, { framework } = {}) {
  const params = new URLSearchParams();
  if (framework != null) params.set('framework', framework);
  const qs = params.toString();
  return _request(
    `/api/v1/compliance/report/${encodeURIComponent(wallet)}${qs ? '?' + qs : ''}`,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const ProofChain = {
  configure,
  registerAgent,
  verifyAgent,
  logAction,
  getAuditTrail,
  generateReport,
  ProofChainError,
};

module.exports = ProofChain;
