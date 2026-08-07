# ProofChain SDK

> Audit trails and compliance for AI agents — dead simple.

**`@proofchain/sdk`** wraps the ProofChain API into a clean, importable Node.js module. No bloat, no heavy dependencies — just `fetch` and a handful of functions that give your agents verifiable identity, immutable audit trails, and regulatory compliance reports.

---

## Quick Start

```bash
npm install @proofchain/sdk
```

```js
// ESM
import ProofChain from '@proofchain/sdk';

// CJS
const ProofChain = require('@proofchain/sdk');
```

### Verify an agent in 3 lines

```js
const result = await ProofChain.verifyAgent('FKwU1G1qY2RqTxB4xKNJhWpJmpb3UAEnxD7zBXRbpump');
console.log(result.verified); // true
```

---

## API Reference

All functions return Promises. Every call hits the ProofChain REST API (`PROOFCHAIN_API_URL`, default `http://localhost:3456`).

| Function | Description |
|---|---|
| `configure(opts)` | Set `apiUrl`, `apiKey`, `timeout` |
| `registerAgent(params)` | Register a new agent identity (AgentID v2) |
| `verifyAgent(wallet)` | Check if a wallet is a registered agent |
| `logAction(params)` | Write an action to the HXMP audit trail |
| `getAuditTrail(wallet, opts)` | Fetch paginated audit entries |
| `generateReport(wallet, opts)` | Generate compliance report |

---

### `configure(opts)`

Override defaults at runtime.

```js
ProofChain.configure({
  apiUrl: 'https://proofchain.example.com',
  apiKey: 'sk-abc123',
  timeout: 15_000,  // request timeout in ms
});
```

**Environment variables** (no code changes needed):

| Variable | Default |
|---|---|
| `PROOFCHAIN_API_URL` | `http://localhost:3456` |
| `PROOFCHAIN_API_KEY` | *(none)* |
| `PROOFCHAIN_TIMEOUT` | `30000` |

---

### `registerAgent(params)`

Register a new agent identity. Returns the on-chain transaction details.

```js
const reg = await ProofChain.registerAgent({
  name: 'TraderBot',
  description: 'Autonomous DeFi trading agent on Solana',
  wallet: 'FKwU1G1qY2RqTxB4xKNJhWpJmpb3UAEnxD7zBXRbpump',
});
// => { agentId: '...', wallet: '...', tx: '...', createdAt: '...' }
```

---

### `verifyAgent(wallet)`

Check whether a wallet is registered as a ProofChain agent.

```js
const result = await ProofChain.verifyAgent('FKwU1...');
// => { verified: true, agent: { name, description, ... }, registeredAt: '...' }
```

---

### `logAction(params)`

Log an action to the agent's immutable HXMP audit trail.

```js
await ProofChain.logAction({
  agent: 'FKwU1...',
  action: 'swap',
  intent: 'Rebalance portfolio after 5% market drop',
  context: {
    chain: 'solana',
    tokenIn: 'SOL',
    tokenOut: 'USDC',
    amount: 100,
  },
  outcome: { txSig: '5K...', success: true },
});
// => { id: '...', tx: '...', timestamp: '2026-08-06T...' }
```

| Param | Required | Notes |
|---|---|---|
| `agent` | ✅ | Agent wallet / ID |
| `action` | ✅ | Action name (`swap`, `mint`, `transfer`, ...) |
| `intent` | ✅ | Why the agent did it (human-readable) |
| `context` | — | Arbitrary key-value context (chain, amounts, addresses) |
| `outcome` | — | What happened (tx sigs, success/failure, returned data) |

---

### `getAuditTrail(wallet, opts)`

Fetch the paginated audit trail for a wallet.

```js
const trail = await ProofChain.getAuditTrail('FKwU1...', {
  type: 'swap',   // filter by action type
  limit: 10,      // entries per page
  offset: 0,      // pagination offset
});
// => { total: 100, entries: [{ id, action, intent, ... }, ...] }
```

---

### `generateReport(wallet, opts)`

Generate a compliance report against standard regulatory frameworks.

```js
const report = await ProofChain.generateReport('FKwU1...', {
  framework: 'all',  // or: 'eu_ai_act', 'iso_42001', 'nist_ai_rmf', 'gdpr', 'soc2'
});

console.log(report.reports.eu_ai_act.article_50_transparency); // "COMPLIANT"
console.log(report.reports.iso_42001.a_7_accountability);      // "NON_COMPLIANT"
```

Supported frameworks:
- `eu_ai_act` — EU AI Act (Article 50 transparency, risk classification)
- `iso_42001` — ISO/IEC 42001 AI management system
- `nist_ai_rmf` — NIST AI Risk Management Framework
- `gdpr` — GDPR data protection
- `soc2` — SOC 2 security & availability
- `all` — every framework (default)

---

## Error Handling

All API errors throw `ProofChainError` — a custom error class with status code and body attached.

```js
import { ProofChainError } from '@proofchain/sdk';

try {
  await ProofChain.verifyAgent('bad-wallet');
} catch (err) {
  if (err instanceof ProofChainError) {
    console.error(`ProofChain API error [${err.status}]: ${err.message}`);
  } else {
    console.error('Unexpected:', err);
  }
}
```

---

## Full Example

See [`examples/basic.js`](examples/basic.js) for a complete walkthrough.

```js
import ProofChain from '@proofchain/sdk';

const WALLET = 'FKwU1G1qY2RqTxB4xKNJhWpJmpb3UAEnxD7zBXRbpump';

// 1. Verify the agent exists
const verified = await ProofChain.verifyAgent(WALLET);
console.log('Verified:', verified.verified);

// 2. Log an action
await ProofChain.logAction({
  agent: WALLET,
  action: 'trade',
  intent: 'Execute limit order from strategy signal',
  context: { pair: 'SOL/USDC', side: 'buy', size: 50 },
  outcome: { filled: true, price: 142.3 },
});

// 3. Pull the audit trail
const trail = await ProofChain.getAuditTrail(WALLET, { limit: 5 });
console.log(`Total entries: ${trail.total}`);

// 4. Generate compliance report
const report = await ProofChain.generateReport(WALLET, { framework: 'all' });
console.log('EU AI Act:', report.reports.eu_ai_act.article_50_transparency);
```

---

## Requirements

- Node.js ≥ 18 (native `fetch`)
- A running [ProofChain node](https://github.com/proofchain) (default: `http://localhost:3456`)

---

## License

MIT
