/**
 * HXMP audit trail reader — queries X1 memos directly from
 * getSignaturesForAddress which returns the memo inline on X1.
 *
 * Memo format: [byte_length] <content>
 * Content is either a plain marker like "HXMP-VERIFY-..." or
 * a JSON HXMP envelope.
 */

import { getSignatures } from './x1.js';

/**
 * Parse a raw memo string from the X1 RPC response.
 * Handles the [N] prefix and escaped JSON.
 */
function parseMemo(raw) {
  if (!raw) return null;

  // Strip the [N] prefix
  const stripped = raw.replace(/^\[\d+\]\s*/, '').trim();
  if (!stripped) return null;

  // Try direct JSON parse
  try {
    const obj = JSON.parse(stripped);
    if (obj.p === 'HXMP') return obj;
    return null; // Valid JSON but not HXMP
  } catch {}

  // Try unescaping
  try {
    const unescaped = stripped
      .replace(/\\\\"/g, '"')
      .replace(/\\"/g, '"');
    const obj = JSON.parse(unescaped);
    if (obj.p === 'HXMP') return obj;
  } catch {}

  return null;
}

/**
 * Check if memo is an HXMP metadata marker (non-JSON).
 */
function isHxmpMarker(raw) {
  if (!raw) return false;
  const stripped = raw.replace(/^\[\d+\]\s*/, '').trim();
  return /^HXMP-/.test(stripped);
}

/**
 * Get HXMP audit trail for a wallet.
 */
export async function getAuditTrail(wallet, options = {}) {
  const { type = null, limit = 25 } = options;

  // X1 RPC returns memo inline in getSignaturesForAddress
  const signatures = await getSignatures(wallet, { limit: 100 });

  const records = [];

  for (const sig of signatures) {
    const raw = sig.memo;
    if (!raw) continue;

    const envelope = parseMemo(raw);
    if (envelope) {
      // Filter by type
      if (type && envelope.t !== type) continue;

      records.push({
        signature: sig.signature,
        blockTime: sig.blockTime || null,
        timestamp: sig.blockTime
          ? new Date(sig.blockTime * 1000).toISOString()
          : null,
        slot: sig.slot || null,
        type: envelope.t || 'unknown',
        owner: envelope.o || envelope.owner || null,
        seq: envelope.seq || null,
        hash: envelope.h || envelope.hash || null,
        ref: envelope.ref || null,
        agentid_nft: envelope.aid || null,
        lane: envelope.lane || null,
        chunked: envelope.chunked || false,
        chunk_num: envelope.n || null,
        prev_hash: envelope.prev || null,
        session_id: envelope.sid || null,
        encrypted: !!envelope.ct,
        enc_method: envelope.enc || null,
        ts: envelope.ts || null
      });
    } else if (isHxmpMarker(raw)) {
      records.push({
        signature: sig.signature,
        blockTime: sig.blockTime || null,
        timestamp: sig.blockTime
          ? new Date(sig.blockTime * 1000).toISOString()
          : null,
        slot: sig.slot || null,
        type: 'hxmp.marker',
        marker: raw.replace(/^\[\d+\]\s*/, '').trim(),
        owner: wallet,
        encrypted: false
      });
    }
  }

  // Deduplicate by signature
  const seen = new Set();
  const unique = records.filter(r => {
    if (seen.has(r.signature)) return false;
    seen.add(r.signature);
    return true;
  });

  return {
    wallet,
    total: unique.length,
    scanned: signatures.length,
    query: { type, limit },
    records: unique.slice(0, limit)
  };
}

/**
 * Build a chronological timeline of HXMP events.
 */
export async function getAuditTimeline(wallet, options = {}) {
  const { limit = 50 } = options;
  const { records } = await getAuditTrail(wallet, { limit });

  // Sort newest first
  records.sort((a, b) => (b.blockTime || 0) - (a.blockTime || 0));

  // Group by type
  const byType = {};
  for (const r of records) {
    if (!byType[r.type]) byType[r.type] = [];
    byType[r.type].push(r);
  }

  // Build timeline events
  const events = records.map(r => ({
    time: r.timestamp,
    type: r.type,
    action: describeHxmpType(r.type),
    signature: r.signature,
    hash: r.hash,
    details: r
  }));

  return {
    wallet,
    total_events: events.length,
    record_types: Object.keys(byType),
    type_counts: Object.fromEntries(
      Object.entries(byType).map(([k, v]) => [k, v.length])
    ),
    events
  };
}

function describeHxmpType(type) {
  const map = {
    'soul.snapshot': 'Agent identity snapshot written to chain',
    'soul.latest': 'Identity pointer updated on chain',
    'manifest.snapshot': 'Memory manifest snapshot recorded',
    'manifest.latest': 'Memory manifest pointer updated',
    'identity.hashes': 'Identity verification hashes recorded',
    'hxmp.policy': 'Security policy snapshot written',
    'defi.receipt': 'DeFi transaction receipt recorded',
    'skill.snapshot': 'Agent skill snapshot written',
    'memory.bundle': 'Memory bundle committed',
    'hxmp.marker': 'HXMP system marker'
  };
  return map[type] || `HXMP record: ${type}`;
}
