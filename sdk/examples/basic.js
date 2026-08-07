/**
 * ProofChain SDK — Basic usage example.
 *
 * Demonstrates the full lifecycle:
 *   1. Configure
 *   2. Verify agent
 *   3. Register agent (if needed)
 *   4. Log actions
 *   5. Fetch audit trail
 *   6. Generate compliance report
 *
 * Usage:
 *   PROOFCHAIN_API_URL=http://localhost:3456 node examples/basic.js
 */

// Swap the require/import below depending on your project setup.

// ESM:
// import ProofChain from '@proofchain/sdk';

// CJS:
const ProofChain = require('../index.js');

// ---- Config ---------------------------------------------------------------
const WALLET = process.env.PROOFCHAIN_WALLET || 'FKwU1G1qY2RqTxB4xKNJhWpJmpb3UAEnxD7zBXRbpump';

ProofChain.configure({
  apiUrl: process.env.PROOFCHAIN_API_URL || 'http://localhost:3456',
});

// ---- Helpers --------------------------------------------------------------
function log(label, data) {
  console.log(`\n[${label}]`);
  console.log(JSON.stringify(data, null, 2));
}

// ---- Main -----------------------------------------------------------------
async function main() {
  console.log('╔══════════════════════════════════╗');
  console.log('║  ProofChain SDK — Basic Example  ║');
  console.log('╚══════════════════════════════════╝');

  // --- 1. Verify agent -----------------------------------------------------
  let agent;
  try {
    agent = await ProofChain.verifyAgent(WALLET);
    log('verifyAgent', agent);
  } catch (err) {
    if (err instanceof ProofChain.ProofChainError && err.status === 404) {
      console.log('\n⚠  Agent not found. Registering...');

      // --- 2. Register agent ------------------------------------------------
      const reg = await ProofChain.registerAgent({
        name: 'ExampleBot',
        description: 'SDK example agent — demonstrates audit trail logging',
        wallet: WALLET,
      });
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

  // --- 3. Log a few actions ------------------------------------------------
  const actions = [
    {
      agent: WALLET,
      action: 'init',
      intent: 'Agent started — initialisation checkpoint',
      context: { version: '1.0.0', environment: process.env.NODE_ENV || 'development' },
      outcome: { success: true },
    },
    {
      agent: WALLET,
      action: 'trade',
      intent: 'Execute limit buy order from strategy signal',
      context: { pair: 'SOL/USDC', side: 'buy', size: 50, limitPrice: 142.30 },
      outcome: { filled: true, avgPrice: 142.27, txSig: '5KQ...abc' },
    },
    {
      agent: WALLET,
      action: 'rebalance',
      intent: 'Weekly portfolio rebalance — reduce SOL exposure by 10%',
      context: { from: 'SOL', to: 'USDC', percentage: 10 },
      outcome: { success: true, txSig: '3xP...def' },
    },
  ];

  for (const a of actions) {
    const logged = await ProofChain.logAction(a);
    log(`logAction: ${a.action}`, logged);
  }

  // --- 4. Fetch audit trail ------------------------------------------------
  const trail = await ProofChain.getAuditTrail(WALLET, { limit: 10 });
  log('getAuditTrail', {
    total: trail.total,
    returned: trail.entries.length,
    latestEntry: trail.entries[0]?.action || '(empty)',
  });

  // --- 5. Generate compliance report ---------------------------------------
  const report = await ProofChain.generateReport(WALLET, { framework: 'eu_ai_act' });
  log('generateReport (EU AI Act)', report.reports?.eu_ai_act || report);

  console.log('\n✅  Done! All SDK methods exercised successfully.');
}

main().catch((err) => {
  console.error('\n❌  Error:', err.message);
  if (err.status) console.error(`    Status: ${err.status}`);
  process.exit(1);
});
