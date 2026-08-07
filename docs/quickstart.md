# ProofChain Developer Quickstart

## 30-Second Install

```bash
npm install proofchain-sdk
```

## Verify Your First Agent

```js
import ProofChain from 'proofchain-sdk';

const pc = new ProofChain({ apiUrl: 'http://localhost:3456' });

// Verify an agent identity on X1
const agent = await pc.verifyAgent('FKwU1im523MSGnuJG6YLHEZu4rUGj3xqxHJ6ipQMBG9B');
// { verified: true, agent: { name: 'Aster' }, nft: { mint: '6LZa...', soulbound: true } }
```

## Get an Audit Trail

```js
const audit = await pc.getAuditTrail('FKwU1im523MSGnuJG6YLHEZu4rUGj3xqxHJ6ipQMBG9B', { limit: 10 });
// { total: 100, records: [{ type: 'soul.latest', seq: 21, hash: 'sha256:...' }, ...] }
```

## Generate a Compliance Report

```js
const report = await pc.generateReport('FKwU1im523MSGnuJG6YLHEZu4rUGj3xqxHJ6ipQMBG9B', { framework: 'all' });
// { reports: { eu_ai_act: { article_50_transparency: 'COMPLIANT' }, soc2: {...}, gdpr: {...} } }
```

## Self-Host

```bash
git clone https://github.com/EddyWoodss/proofchain
cd proofchain/server
npm install
node server.js
# API running on http://localhost:3456
```

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | X1 RPC health, slot, latency |
| `/api/agent/:wallet` | GET | AgentID v2 verification |
| `/api/audit/:wallet` | GET | HXMP audit records (?type=soul.snapshot&limit=25) |
| `/api/audit/:wallet/timeline` | GET | Chronological event timeline |
| `/api/compliance/:wallet/report` | GET | EU AI Act + SOC 2 + GDPR JSON (?framework=soc2) |
| `/api/compliance/:wallet/report/pdf` | GET | Downloadable HTML report (?format=html for download) |

## Architecture

```
Your Agent → ProofChain SDK → ProofChain API → X1 Blockchain
                                              → AgentID v2 (identity)
                                              → HXMP (audit trail)
```

## Live Demo Agent

```
Wallet:    FKwU1im523MSGnuJG6YLHEZu4rUGj3xqxHJ6ipQMBG9B
Agent:     Aster (AgentID v2)
NFT:       6LZaCMx2CUNH6aQ7kWcdaEBbucFrPrTKiKzkEvrtjqA3
Records:   100+ on X1 mainnet
Status:    EU AI Act COMPLIANT | SOC 2 4/5 | GDPR COMPLIANT

Verify:    https://agentid-app.vercel.app/api/verify?wallet=FKwU1im523MSGnuJG6YLHEZu4rUGj3xqxHJ6ipQMBG9B
Explorer:  https://explorer.x1.xyz/address/FKwU1im523MSGnuJG6YLHEZu4rUGj3xqxHJ6ipQMBG9B
```
