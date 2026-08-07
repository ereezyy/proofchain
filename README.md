# ProofChain — Your agents have no alibi.

**Verifiable AI Agent Compliance** — cryptographic identity, on-chain audit trail, and real-time compliance reporting for autonomous AI agents.

## What is ProofChain?

ProofChain is an open-source compliance infrastructure layer for AI agents. It combines three technologies to create a tamper-evident, cryptographically verifiable record of everything an agent does:

- **AgentID v2** — decentralized identity verification for AI agents, anchored on-chain via NFTs
- **HXMP** — Hypermedia Transfer Protocol for agent-to-agent messaging, with full memo logging on the X1 blockchain
- **X1 Chain** — high-performance Solana-compatible L1 where every agent action leaves a permanent, queryable record

Together, these form an **immutable audit trail** that can generate compliance reports for frameworks like the EU AI Act, SOC 2, and GDPR — all from raw on-chain data.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  ProofChain API                      │
│               (Express — port 3456)                  │
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
proofchain start    # Start the API
proofchain status   # Health check
proofchain logs     # View logs
proofchain stop     # Stop the API
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Server and X1 RPC health check |
| `GET` | `/api/agent/:wallet` | Verify agent identity via AgentID v2 |
| `GET` | `/api/audit/:wallet` | Get HXMP audit trail (supports `?type=` and `?limit=`) |
| `GET` | `/api/audit/:wallet/timeline` | Chronological timeline of agent actions |
| `GET` | `/api/compliance/:wallet/report` | Compliance report (JSON) — `?framework=eu-ai-act\|soc2\|gdpr` |
| `GET` | `/api/compliance/:wallet/report/pdf` | Downloadable compliance report (HTML/PDF) |

### Examples

```bash
# Health check
curl http://localhost:3456/api/health

# Verify an agent's identity
curl http://localhost:3456/api/agent/FKwU1im523MSGnuJG6YLHEZu4rUGj3xqxHJ6ipQMBG9B

# Get audit trail
curl http://localhost:3456/api/audit/FKwU1im523MSGnuJG6YLHEZu4rUGj3xqxHJ6ipQMBG9B?limit=10

# EU AI Act compliance report
curl http://localhost:3456/api/compliance/FKwU1im523MSGnuJG6YLHEZu4rUGj3xqxHJ6ipQMBG9B/report?framework=eu-ai-act
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

## Project Structure

```
proofchain/
├── Landing Page.html        # Public landing page
├── proofchain.bat           # Windows batch management script
├── dashboard/
│   ├── index.html           # Dashboard UI
│   └── register.html        # Agent registration page
├── server/
│   ├── server.js            # Express API server
│   ├── package.json         # Dependencies
│   └── lib/
│       ├── agentid.js       # AgentID v2 identity verification
│       ├── hxmp.js          # HXMP audit trail parser
│       └── x1.js            # X1 RPC read-only wrapper
├── sdk/
│   └── examples/            # Coming soon
└── README.md
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
