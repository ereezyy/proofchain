# ProofChain White-Label Integration Guide

## Overview

ProofChain provides cryptographically verifiable, on-chain evidence for AI agent compliance. This guide describes how existing GRC platforms (Vanta, Drata, Secureframe, OneTrust) can integrate ProofChain as a crypto-verification module — adding blockchain-backed audit evidence to their existing compliance dashboards.

## Why White-Label ProofChain

| Feature | Standard GRC | + ProofChain |
|---|---|---|
| Evidence type | Screenshots, PDFs, logs | Cryptographically signed, on-chain records |
| Tamper resistance | Audit log (mutable) | Blockchain-immutable |
| Verification | Trust the vendor | Verify on-chain independently |
| EU AI Act Art. 12 | Manual documentation | Automated IEEC (Intent-to-Execution Evidence Chain) |
| Agent identity | Internal ID | Soulbound NFT, DID-compatible |

## Integration Architecture

```
┌─────────────────────────────────────────────────────┐
│  Vanta / Drata / Secureframe                        │
│  ┌───────────────────────────────────────────────┐  │
│  │  Existing Dashboard                            │  │
│  │  ┌─────────┐  ┌──────────┐  ┌─────────────┐  │  │
│  │  │ Evidence │  │ Policies │  │ Tests       │  │  │
│  │  └─────────┘  └──────────┘  └─────────────┘  │  │
│  │         │                                      │  │
│  │         ▼                                      │  │
│  │  ┌──────────────────────────────────────┐     │  │
│  │  │  ProofChain Module (NEW)              │     │  │
│  │  │  ┌──────────┐  ┌──────────────────┐  │     │  │
│  │  │  │ On-Chain │  │ Verifiable       │  │     │  │
│  │  │  │ Evidence │  │ Audit Trail      │  │     │  │
│  │  │  └──────────┘  └──────────────────┘  │     │  │
│  │  └──────────────────────────────────────┘     │  │
│  └───────────────────────────────────────────────┘  │
│                          │                          │
└──────────────────────────┼──────────────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │  ProofChain API │
                  │  localhost:3456 │
                  │  ┌────────────┐ │
                  │  │ X1 Chain   │ │
                  │  │ (immutable)│ │
                  │  └────────────┘ │
                  └─────────────────┘
```

## Integration Methods

### Method 1: API Integration (Recommended)

Add a "ProofChain Verified" badge to your evidence dashboard by calling the ProofChain API.

```javascript
// In your GRC platform's evidence module
async function getOnChainEvidence(wallet) {
  const response = await fetch(`http://localhost:3456/api/audit/${wallet}?limit=50`);
  const data = await response.json();

  // Each record is cryptographically verifiable on X1
  return data.records.map(record => ({
    ...record,
    verified: true,
    explorer_url: `https://explorer.x1.xyz/tx/${record.signature}`,
    proof_type: 'blockchain-immutable'
  }));
}
```

### Method 2: Embedded Dashboard

Embed the ProofChain audit trail viewer directly:

```html
<!-- In your GRC platform's evidence page -->
<iframe
  src="http://localhost:3456/dashboard/index.html"
  width="100%"
  height="600"
  style="border: 1px solid #262220; border-radius: 4px;"
  title="ProofChain Audit Trail"
></iframe>
```

### Method 3: Webhook Integration

ProofChain can push audit events to your platform:

```javascript
// Configure in ProofChain
POST /api/webhooks/configure
{
  "endpoint": "https://your-platform.com/api/proofchain/events",
  "events": ["agent.action", "soul.snapshot", "compliance.report"],
  "secret": "your-webhook-secret"
}
```

## Compliance Framework Mapping

### SOC 2 Trust Services Criteria

| TSC | ProofChain Evidence |
|---|---|
| **Security** | AgentID v2 soulbound NFT — cryptographic identity verification |
| **Availability** | X1 chain uptime monitoring via watchdog cron (every 15m) |
| **Processing Integrity** | HXMP tamper-evident audit trail — every action, verifiable |
| **Confidentiality** | HXMP encrypted at rest, encryption key destruction = erasure |
| **Privacy** | Data minimization, no PII in audit records, DSAR-ready |

### EU AI Act Annex IV

| Requirement | ProofChain Coverage |
|---|---|
| System description | AgentID metadata + registration timestamp |
| Design specs | HXMP protocol specification |
| Development process | Git commit history + on-chain deployment receipts |
| Testing | Audit trail verification (hash matching) |
| Risk management | Compliance report generator |
| Post-market monitoring | Daily compliance cron + 15m watchdog |

## Pricing Model for White-Label Partners

| Tier | Monthly | Agents | Audit Records |
|---|---|---|---|
| Starter | $500 | 10 | 10,000 |
| Growth | $2,000 | 50 | 100,000 |
| Enterprise | Custom | Unlimited | Unlimited |

Revenue share: 30% to ProofChain, 70% to partner.

## Getting Started

1. **Request API access:** `dpo@proofchain.dev`
2. **Integration test environment:** `http://localhost:3456` (currently private beta)
3. **Documentation:** `/api/health`, `/api/agent/:wallet`, `/api/audit/:wallet`, `/api/compliance/:wallet/report`
4. **Support:** Same channel as sales inquiries

## Live Verification

Verify the ProofChain agent identity on-chain at any time:

```
https://agentid-app.vercel.app/api/verify?wallet=FKwU1im523MSGnuJG6YLHEZu4rUGj3xqxHJ6ipQMBG9B
```

Response: `{"verified":true,"agent":{"name":"Aster",...},"nft":{"mint":"6LZa...","soulbound":true}}`

---

*This integration guide is generated by ProofChain — verifiable on X1.*
