# <img src="assets/logo.png" alt="ProofChain" height="40" style="vertical-align: middle;"> ProofChain — Your agents have no alibi.

**Verifiable AI Agent Compliance** — cryptographic identity, on-chain audit trail, and real-time compliance reporting for autonomous AI agents.

**Live:** [proofchain.us](https://proofchain.us) | **API:** `https://proofchain.us/api` | ![status](https://img.shields.io/badge/API-live-5A8A5A)

**Key pages:** [Agent Accountability](https://proofchain.us/accountability.html) · [AgentID — Who's Who](https://proofchain.us/agentid.html) · [AI Audit Trail](https://proofchain.us/audit-trail.html) · [Live Registry](https://proofchain.us/dashboard/registry.html)

## What is ProofChain?

ProofChain is a compliance infrastructure layer for AI agents. It combines three technologies to create a tamper-evident, cryptographically verifiable record of everything an agent does:

- **AgentID v2** — decentralized identity verification for AI agents, anchored on-chain via NFTs
- **HXMP** — Hypermedia Transfer Protocol for agent-to-agent messaging, with full memo logging on the X1 blockchain
- **X1 Chain** — high-performance Solana-compatible L1 where every agent action leaves a permanent, queryable record

Together, these form an **immutable audit trail** that can generate compliance reports for frameworks like the EU AI Act, SOC 2, and GDPR — all from raw on-chain data.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  ProofChain API                      │
│            (Express + PM2 — port 3456)               │
├───────────────┬──────────────┬──────────────────────┤
│   AgentID v2  │     HXMP     │       X1 RPC         │
│   Identity    │  Audit Trail │   Chain Queries      │
│ Verification  │   Parser     │   (Read-Only)        │
├───────────────┴──────────────┴──────────────────────┤
│                X1 Mainnet (L1)                       │
│         rpc.mainnet.x1.xyz — Solana-compatible       │
└─────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm
- PM2 (production)

### Install and Run

```bash
cd server
npm install
npm start        # Runs on http://localhost:3456
# or
npm run dev      # With file watcher
```

Alternatively, use the included batch script:

```bash
proofchain.bat start     # Start the API
proofchain.bat status    # Health check
proofchain.bat logs      # View logs
proofchain.bat stop      # Stop the API
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/ping` | Lightweight health check (no chain dependency) |
| `GET` | `/api/health` | Full health check with X1 RPC status |
| `GET` | `/api/agent/:wallet` | Verify agent identity via AgentID v2 |
| `GET` | `/api/agents` | List all registered agents in the ProofChain registry |
| `POST` | `/api/agents/register` | Register an agent wallet (requires API key) |
| `DELETE` | `/api/agents/:wallet` | Remove an agent from the registry (requires API key) |
| `GET` | `/api/audit/:wallet` | Get HXMP audit trail (supports `?type=` and `?limit=`) |
| `GET` | `/api/audit/:wallet/timeline` | Chronological timeline of agent actions |
| `GET` | `/api/compliance/:wallet/report` | Compliance report (JSON) — `?framework=eu-ai-act\|soc2\|gdpr` |
| `GET` | `/api/compliance/:wallet/report/pdf` | Downloadable compliance report (HTML/PDF) |

### Examples

```bash
# Health check (lightweight)
curl https://proofchain.us/api/ping

# Full health with X1 status
curl https://proofchain.us/api/health

# Verify an agent's identity
curl https://proofchain.us/api/agent/FKwU1im523MSGnuJG6YLHEZu4rUGj3xqxHJ6ipQMBG9B

# Get audit trail
curl https://proofchain.us/api/audit/FKwU1im523MSGnuJG6YLHEZu4rUGj3xqxHJ6ipQMBG9B?limit=10

# EU AI Act compliance report
curl https://proofchain.us/api/compliance/FKwU1im523MSGnuJG6YLHEZu4rUGj3xqxHJ6ipQMBG9B/report?framework=eu-ai-act

# List all registered agents
curl https://proofchain.us/api/agents

# Register a new agent (requires API key)
curl -X POST https://proofchain.us/api/agents/register \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"wallet":"YOUR_WALLET_ADDRESS"}'
```

## Verification

All identities are verified through the AgentID v2 verification endpoint:

**[https://agentid-app.vercel.app/api/verify?wallet=FKwU1im523MSGnuJG6YLHEZu4rUGj3xqxHJ6ipQMBG9B](https://agentid-app.vercel.app/api/verify?wallet=FKwU1im523MSGnuJG6YLHEZu4rUGj3xqxHJ6ipQMBG9B)**

## Compliance Frameworks

ProofChain generates structured compliance reports for:

| Framework | Status |
|-----------|--------|
| EU AI Act (Regulation 2024/1689) | Minimal Risk classification |
| SOC 2 Type II | Trust Services Criteria |
| GDPR (Regulation 2016/679) | Art. 17 Right to Erasure, data minimization |

Reports are available as JSON for programmatic consumption or as styled HTML for auditor review.

> **Note:** Current reports are evidence-based summaries derived from on-chain audit records and AgentID verification. They are a starting point for compliance workflows, not a substitute for a formal audit by a qualified assessor.

## Production Deployment

`npm start` runs `node server.js`, which listens on `PORT` (default **3456**). Production usually supervises that process with PM2 and reverse-proxies `/api/` to it. Pages under `dashboard/` are static files; the API process does not serve them.

## SDK

### Python

Copy `sdk/proofchain.py` into your project, or run it from this repo. `pip install proofchain` is a different project.

```python
from proofchain import ping, agent, audit, compliance

# Health check
print(ping())  # {'status': 'ok', 'uptime': 690, 'version': '0.1.0'}

# Verify an agent
result = agent("FKwU1im...")
print(result["agent"]["name"])  # "Aster"

# Get audit trail
trail = audit("FKwU1im...", limit=10)

# Compliance report
report = compliance("FKwU1im...", framework="eu-ai-act")
```

Or use the CLI:

```bash
python sdk/proofchain.py ping
python sdk/proofchain.py agent FKwU1im523MSGnuJG6YLHEZu4rUGj3xqxHJ6ipQMBG9B
python sdk/proofchain.py compliance FKwU1im523MSGnuJG6YLHEZu4rUGj3xqxHJ6ipQMBG9B
```

## Project Structure

```
proofchain/
├── Landing Page.html
├── accountability.html
├── agentid.html
├── audit-trail.html
├── eu-ai-act.html
├── identity.html
├── pricing.html
├── proofchain.bat           # Windows batch management script
├── README.md
├── dashboard/
│   ├── index.html           # Dashboard UI (auto-detects localhost vs prod)
│   ├── register.html        # Agent registration page
│   └── registry.html
├── docs/
├── server/
│   ├── server.js            # Express API (PORT, default 3456)
│   ├── package.json
│   ├── registry.json
│   ├── ADMIN.md
│   ├── test/
│   └── lib/
│       ├── agentid.js       # AgentID v2 identity verification
│       ├── api-keys.js
│       ├── hxmp.js          # HXMP audit trail parser
│       ├── registry.js
│       └── x1.js            # X1 RPC read-only wrapper
├── sdk/
│   ├── index.js
│   ├── index.mjs
│   ├── proofchain.py
│   ├── README.md
│   └── examples/
│       └── basic.js
└── assets/
    └── logo.png
```

## Design

Dark theme with gold accents. No AI slop — just clean, information-dense layouts. The compliance report HTML generator produces auditor-friendly, print-optimized documents.

## Disclaimer

ProofChain is a **read-only compliance tool**. It queries the X1 blockchain and the AgentID verification API — it does not write transactions, hold keys, or modify chain state. Your agents' secrets remain yours.

## License

MIT License

Copyright (c) 2025 ProofChain

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
