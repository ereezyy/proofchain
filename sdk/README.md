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
const result = await ProofChain.verifyAgent('FKwU1im523MSGnuJG6YLHEZu4rUGj3xqxHJ6ipQMBG9B');
console.log(result.verified); // true
```

---

## API Reference

All functions return Promises. Every call hits the ProofChain REST API (`PROOFCHAIN_API_URL`, default `https://proofchain.us/api`).

| Function | Description |
|---|---|
| `configure(opts)` | Set `apiUrl`, `apiKey`, `timeout` |
| `registerAgent(params)` | Register a wallet in the ProofChain registry (requires API key) |
| `verifyAgent(wallet)` | Check if a wallet is a registered agent |
| `logAction(params)` | Build a tamper-evident HXMP envelope (client-side) |
| `getAuditTrail(wallet, opts)` | Fetch paginated audit entries |
| `getTimeline(wallet, opts)` | Chronological timeline of actions |
| `generateReport(wallet, opts)` | Generate compliance report (JSON) |
| `generateReportHtml(wallet, opts)` | Downloadable HTML report |
| `ping()` / `health()` | Health checks |

---

### `configure(opts)`

Override defaults at runtime.

```js
ProofChain.configure({
  apiUrl: 'https://proofchain.us/api',
  apiKey: 'pc-abc123',
  timeout: 15_000,  // request timeout in ms
});
```

**Environment variables** (no code changes needed):

| Variable | Default |
|---|---|
| `PROOFCHAIN_API_URL` | `https://proofchain.us/api` |
| `PROOFCHAIN_API_KEY` | *(none)* |
| `PROOFCHAIN_TIMEOUT` | `30000` |

---

### `registerAgent(params)`

Register a wallet in the ProofChain registry. **Requires an API key** — set it via `configure` or the `PROOFCHAIN_API_KEY` env var.

```js
ProofChain.configure({ apiKey: 'pc-abc123' });
const reg = await ProofChain.registerAgent({
  wallet: 'FKwU1im523MSGnuJG6YLHEZu4rUGj3xqxHJ6ipQMBG9B',
});
// => { added: true, agent: { name, ... } }
```

---

### `verifyAgent(wallet)`

Check whether a wallet is registered as a ProofChain agent.

```js
const result = await ProofChain.verifyAgent('FKwU1...');
// => { verified: true, agent: { name, description, ... }, nft: { mint, ... } }
```

---

### `logAction(params)`

Build a canonical HXMP envelope for an agent action. **ProofChain is read-only** — it does not write to chain. You sign the envelope with your agent key and submit it as an X1 memo transaction.

```js
const { envelope, hash } = await ProofChain.logAction({
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
// => { envelope: { p:'HXMP', t:'swap', h:'<sha256>', ... }, hash: '<sha256>', signature_hint: '...' }
```

| Param | Required | Notes |
|---|---|---|
| `agent` | ✅ | Agent wallet / ID |
| `action` | ✅ | Action name (`swap`, `mint`, `transfer`, ...) |
| `intent` | ✅ | Why the agent did it (human-readable) |
| `context` | — | Arbitrary key-value context (chain, amounts, addresses) |
| `outcome` | — | What happened (tx sigs, success/failure, returned data) |
| `prevHash` | — | Previous record hash for tamper-evident chaining |

---

### `getAuditTrail(wallet, opts)`

Fetch the paginated audit trail for a wallet.

```js
const trail = await ProofChain.getAuditTrail('FKwU1...', {
  type: 'swap',   // filter by action type
  limit: 10,      // entries per page
});
// => { wallet, total: 100, records: [{ signature, type, hash, ... }, ...] }
```

---

### `generateReport(wallet, opts)`

Generate a compliance report against standard regulatory frameworks.

```js
const report = await ProofChain.generateReport('FKwU1...', {
  framework: 'all',  // or: 'eu-ai-act', 'soc2', 'gdpr'
});

console.log(report.reports.eu_ai_act.article_50_transparency); // "EVIDENCE PRESENT — agent identity verified on-chain"
```

Supported frameworks:
- `eu-ai-act` — EU AI Act (Article 50 transparency, Article 12 record-keeping, Annex IV)
- `soc2` — SOC 2 Type II Trust Services Criteria
- `gdpr` — GDPR data protection (Art. 17 erasure, minimization)
- `all` — every framework (default)

> Reports are **evidence-based summaries**, not formal compliance certifications. Use them as a starting point for auditor workflows.

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

---

## Requirements

- Node.js ≥ 18 (native `fetch`)
- A running [ProofChain node](https://proofchain.us) (default: `https://proofchain.us/api`)

---

## License

MIT
