/**
 * ProofChain SDK — Basic usage example.
 *
 * Demonstrates the full lifecycle:
 *   1. Configure
 *   2. Verify agent
 *   3. Register agent (if needed)
 *   4. Build an HXMP action envelope (client-side)
 *   5. Fetch audit trail
 *   6. Generate compliance report
 *
 * Usage:
 *   node examples/basic.js
 */

const ProofChain = require('../index.js');

// ---- Config ---------------------------------------------------------------
const WALLET = process.env.PROOFCHAIN_WALLET || 'FKwU1im523MSGnuJG6YLHEZu4rUGj3xqxHJ6ipQMBG9B';

ProofChain.configure({
  apiUrl: process.env.PROOFCHAIN_API_URL || 'https://proofchain.us/api',
});

// ---- Helpers --------------------------------------------------------------
function log(label, data) {
  console.log(`\n[${label}]`);
  console.log(JSON.stringify(data, null, 2));
}

// ---- Main -----------------------------------------------------------------
async function main() {
  console.log('═'.repeat(40));
  console.log('  ProofChain SDK — Basic Example');
  console.log('═'.repeat(40));

  // --- 1. Health check -----------------------------------------------------
  const pong = await ProofChain.ping();
  log('ping', pong);

  // --- 2. Verify agent -----------------------------------------------------
  let agent;
  try {
    agent = await ProofChain.verifyAgent(WALLET);
    log('verifyAgent', agent);
  } catch (err) {
    if (err instanceof ProofChain.ProofChainError && err.status === 404) {
      console.log('\n⚠  Agent not found. Registering...');
      const reg = await ProofChain.registerAgent({ wallet: WALLET });
      log('registerAgent', reg);
      agent = { verified: true };
    } else {
      throw err;
    }
  }

  if (!agent.verified) {
    console.error('Agent verification failed.');
    process.exit(1);
  }

  // --- 3. Build an HXMP action envelope (client-side, no chain write) -----
  const { envelope, hash } = await ProofChain.logAction({
    agent: WALLET,
    action: 'trade',
    intent: 'Execute limit buy order from strategy signal',
    context: { pair: 'SOL/USDC', side: 'buy', size: 50, limitPrice: 142.30 },
    outcome: { filled: true, avgPrice: 142.27, txSig: '5KQ...abc' },
  });
  log('logAction envelope', { hash, envelope });
  console.log('\n→ Submit `envelope` as a signed X1 memo to anchor it on-chain.');

  // --- 4. Fetch audit trail ------------------------------------------------
  const trail = await ProofChain.getAuditTrail(WALLET, { limit: 10 });
  log('getAuditTrail', {
    total: trail.total,
    returned: trail.records.length,
    latestType: trail.records[0]?.type || '(empty)',
  });

  // --- 5. Generate compliance report ---------------------------------------
  const report = await ProofChain.generateReport(WALLET, { framework: 'eu-ai-act' });
  log('generateReport (EU AI Act)', report.reports?.eu_ai_act || report);

  console.log('\n✅  Done! All SDK methods exercised successfully.');
}

main().catch((err) => {
  console.error('\n❌  Error:', err.message);
  if (err.status) console.error(`    Status: ${err.status}`);
  process.exit(1);
});
