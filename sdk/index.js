/**
 * ProofChain SDK — Audit trails and compliance for AI agents.
 *
 * @module @proofchain/sdk
 * @version 0.2.0
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
 * @property {string}  [apiKey] - Optional API key for authenticated endpoints.
 * @property {number}  timeout  - Request timeout in ms (default 30_000).
 */

/** @type {ProofChainConfig} */
let _config = {
  apiUrl: process.env.PROOFCHAIN_API_URL || 'https://proofchain.us/api',
  apiKey: process.env.PROOFCHAIN_API_KEY || undefined,
  timeout: parseInt(process.env.PROOFCHAIN_TIMEOUT, 10) || 30_000,
};

/**
 * Override the default SDK configuration.
 *
 * @param {Partial<ProofChainConfig>} opts
 * @example
 *   ProofChain.configure({ apiUrl: 'https://proofchain.us/api', apiKey: 'pc-...' });
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
 * @param {string} path   - URL path (e.g. "/agent/FKwU1").
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
    headers['X-API-Key'] = _config.apiKey;
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
// 1. REGISTER AGENT — registry + AgentID verification
// ---------------------------------------------------------------------------

/**
 * Register a new agent wallet in the ProofChain registry.
 * Requires the wallet to be verified on AgentID first.
 *
 * @param {Object}   params
 * @param {string}   params.wallet      - Public-key / wallet address (Solana).
 * @returns {Promise<{ added: boolean, agent?: Object, error?: string }>}
 *
 * @example
 *   const reg = await ProofChain.registerAgent({
 *     wallet: 'FKwU1...',
 *   });
 */
async function registerAgent({ wallet }) {
  return _request('/agents/register', {
    method: 'POST',
    body: JSON.stringify({ wallet }),
  });
}

// ---------------------------------------------------------------------------
// 2. VERIFY AGENT — AgentID v2
// ---------------------------------------------------------------------------

/**
 * Verify that a wallet is registered as a ProofChain agent.
 *
 * @param {string} wallet - Public-key / wallet address to verify.
 * @returns {Promise<{ verified: boolean, agent?: Object, nft?: Object, registeredAt?: string }>}
 *
 * @example
 *   const result = await ProofChain.verifyAgent('FKwU1...');
 *   console.log(result.verified); // true
 */
async function verifyAgent(wallet) {
  return _request(`/agent/${encodeURIComponent(wallet)}`);
}

// ---------------------------------------------------------------------------
// 3. LOG ACTION — HXMP memo write (client-side anchor)
// ---------------------------------------------------------------------------

/**
 * Build a tamper-evident HXMP envelope for an agent action.
 * The SDK does not write to chain directly (read-only tool). It returns a
 * canonical envelope + hash that your agent signs and submits as an X1 memo.
 *
 * @param {Object}  params
 * @param {string}  params.agent   - Agent wallet / ID performing the action.
 * @param {string}  params.action  - Name of the action (e.g. "trade", "mint", "transfer").
 * @param {string}  params.intent  - High-level intent / goal behind the action.
 * @param {Object}  [params.context]  - Free-form context object (chain, amounts, etc.).
 * @param {Object}  [params.outcome]  - Result / outcome of the action.
 * @param {string}  [params.prevHash] - Hash of the previous record (for chaining).
 * @returns {Promise<{ envelope: Object, hash: string, signature_hint: string }>}
 *
 * @example
 *   const { envelope, hash } = await ProofChain.logAction({
 *     agent: 'FKwU1...',
 *     action: 'swap',
 *     intent: 'Rebalance portfolio after market drop',
 *     context: { tokenIn: 'SOL', tokenOut: 'USDC', amount: 100 },
 *     outcome: { txSig: '5K...', success: true },
 *   });
 *   // Submit `envelope` as an X1 memo transaction signed by your agent key.
 */
async function logAction({ agent, action, intent, context, outcome, prevHash }) {
  const crypto = require('crypto');
  const ts = new Date().toISOString();
  const envelope = {
    p: 'HXMP',
    t: action,
    o: agent,
    intent: intent || null,
    ctx: context || null,
    out: outcome || null,
    ts,
    prev: prevHash || null,
    v: 1,
  };
  const canonical = JSON.stringify(envelope);
  const hash = crypto.createHash('sha256').update(canonical).digest('hex');
  envelope.h = hash;

  return {
    envelope,
    hash,
    signature_hint: 'Sign this envelope with your agent key and submit as an X1 memo transaction.',
    note: 'ProofChain is read-only. Submit the envelope yourself to anchor it on-chain.',
  };
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
 * @returns {Promise<{ wallet: string, total: number, records: Array<Object> }>}
 *
 * @example
 *   const trail = await ProofChain.getAuditTrail('FKwU1...', { limit: 10 });
 *   console.log(trail.total); // 100
 */
async function getAuditTrail(wallet, { type, limit } = {}) {
  const params = new URLSearchParams();
  if (type != null) params.set('type', type);
  if (limit != null) params.set('limit', limit);
  const qs = params.toString();
  return _request(`/audit/${encodeURIComponent(wallet)}${qs ? '?' + qs : ''}`);
}

/**
 * Fetch chronological timeline of agent actions.
 *
 * @param {string} wallet
 * @param {Object} [opts]
 * @param {number} [opts.limit]
 */
async function getTimeline(wallet, { limit } = {}) {
  const params = new URLSearchParams();
  if (limit != null) params.set('limit', limit);
  const qs = params.toString();
  return _request(`/audit/${encodeURIComponent(wallet)}/timeline${qs ? '?' + qs : ''}`);
}

// ---------------------------------------------------------------------------
// 5. GENERATE COMPLIANCE REPORT
// ---------------------------------------------------------------------------

/**
 * Generate a compliance report against specified regulatory frameworks.
 *
 * @param {string} wallet          - Agent wallet / ID.
 * @param {Object} [opts]
 * @param {string} [opts.framework] - "eu-ai-act" | "soc2" | "gdpr" | "all". Default: "all".
 * @returns {Promise<Object>}
 *
 * @example
 *   const report = await ProofChain.generateReport('FKwU1...', { framework: 'eu-ai-act' });
 *   console.log(report.reports.eu_ai_act.article_50_transparency); // "COMPLIANT"
 */
async function generateReport(wallet, { framework } = {}) {
  const params = new URLSearchParams();
  if (framework != null) params.set('framework', framework);
  const qs = params.toString();
  return _request(
    `/compliance/${encodeURIComponent(wallet)}/report${qs ? '?' + qs : ''}`,
  );
}

/**
 * Fetch the HTML/PDF compliance report (for auditor download).
 *
 * @param {string} wallet
 * @param {Object} [opts]
 * @param {string} [opts.framework]
 * @param {string} [opts.format] - "html" | "pdf"
 * @returns {Promise<string>} HTML string
 */
async function generateReportHtml(wallet, { framework, format } = {}) {
  const params = new URLSearchParams();
  if (framework != null) params.set('framework', framework);
  if (format != null) params.set('format', format);
  const qs = params.toString();
  const url = `${_config.apiUrl}/compliance/${encodeURIComponent(wallet)}/report/pdf${qs ? '?' + qs : ''}`;
  const res = await fetch(url, {
    headers: { Accept: 'text/html', ...(_config.apiKey ? { 'X-API-Key': _config.apiKey } : {}) },
  });
  if (!res.ok) throw new ProofChainError(`HTTP ${res.status}`, { status: res.status });
  return res.text();
}

// ---------------------------------------------------------------------------
// 6. HEALTH
// ---------------------------------------------------------------------------

async function ping() {
  return _request('/ping');
}

async function health() {
  return _request('/health');
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
  getTimeline,
  generateReport,
  generateReportHtml,
  ping,
  health,
  ProofChainError,
};

module.exports = ProofChain;
