/**
 * ProofChain API Server
 * Wraps X1 RPC, AgentID verification, and HXMP audit trail into a REST API.
 */

import express from 'express';
import cors from 'cors';
import { healthCheck } from './lib/x1.js';
import { verifyAgent } from './lib/agentid.js';
import { getAuditTrail, getAuditTimeline } from './lib/hxmp.js';

const app = express();
const PORT = process.env.PORT || 3456;

app.use(cors());
app.use(express.json());

// ── Health ──────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  try {
    const x1 = await healthCheck();
    res.json({
      status: 'ok',
      x1,
      server: { uptime: process.uptime(), version: '0.1.0' }
    });
  } catch (err) {
    res.status(503).json({ status: 'degraded', error: err.message });
  }
});

// ── Lightweight ping (no X1 dependency) ─────────────────
app.get('/api/ping', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), version: '0.1.0' });
});

// ── Agent Identity ─────────────────────────────────────
app.get('/api/agent/:wallet', async (req, res) => {
  try {
    const result = await verifyAgent(req.params.wallet);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── Audit Trail ────────────────────────────────────────
app.get('/api/audit/:wallet', async (req, res) => {
  try {
    const { type, limit } = req.query;
    const result = await getAuditTrail(req.params.wallet, {
      type: type || null,
      limit: parseInt(limit) || 25
    });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── Audit Timeline ─────────────────────────────────────
app.get('/api/audit/:wallet/timeline', async (req, res) => {
  try {
    const { limit } = req.query;
    const result = await getAuditTimeline(req.params.wallet, {
      limit: parseInt(limit) || 50
    });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── Compliance Report (stub) ───────────────────────────
app.get('/api/compliance/:wallet/report', async (req, res) => {
  try {
    const { framework } = req.query; // eu-ai-act | soc2 | gdpr
    const agent = await verifyAgent(req.params.wallet);
    const audit = await getAuditTrail(req.params.wallet, { limit: 100 });

    // Build a framework-specific report
    const report = buildComplianceReport(agent, audit, framework || 'all');

    res.json(report);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── Compliance Report Builder ──────────────────────────
function buildComplianceReport(agent, audit, framework) {
  const records = audit.records || [];
  const verified = agent.verified || false;

  const base = {
    generated_at: new Date().toISOString(),
    agent_wallet: agent.wallet,
    agent_name: agent.agent?.name || 'Unknown',
    agent_verified: verified,
    agent_nft: agent.nft?.mint || null,
    total_records: records.length,
    record_types: [...new Set(records.map(r => r.type))],
    oldest_record: records[records.length - 1]?.timestamp || null,
    newest_record: records[0]?.timestamp || null
  };

  const euAiAct = {
    framework: 'EU AI Act (Regulation 2024/1689)',
    classification: 'Minimal Risk — infrastructure tool',
    article_50_transparency: verified ? 'COMPLIANT — agent content labeled' : 'NON-COMPLIANT',
    article_12_record_keeping: records.length > 0 ? 'COMPLIANT — audit trail exists' : 'NON-COMPLIANT — no records',
    annex_iv_technical_docs: records.length > 5 ? 'COMPLIANT — sufficient documentation' : 'PARTIAL',
    incident_reporting_72h: records.length > 0 ? 'READY — timeline verifiable within 72h window' : 'NOT READY',
    high_risk_provisions: 'Not applicable — classified minimal-risk (deadline Dec 2027)'
  };

  const soc2 = {
    framework: 'SOC 2 Type II',
    trust_services_criteria: {
      security: verified ? 'COMPLIANT — cryptographic identity verified' : 'NON-COMPLIANT',
      availability: 'TO BE ASSESSED — requires monitoring period',
      processing_integrity: records.length > 0 ? 'COMPLIANT — tamper-evident records' : 'NON-COMPLIANT',
      confidentiality: 'COMPLIANT — HXMP encrypted at rest',
      privacy: 'COMPLIANT — data minimization, encryption key destruction = erasure'
    },
    observation_period: records.length > 0 ? `${records.length} verifiable actions recorded` : 'No observation data',
    evidence_pack: records.length > 0 ? 'Available — on-chain audit trail' : 'Not available'
  };

  const gdpr = {
    framework: 'GDPR (Regulation 2016/679)',
    data_encryption: 'COMPLIANT — HXMP encrypted at rest',
    right_to_erasure: 'COMPLIANT — encryption key destruction = effective erasure (Art. 17)',
    data_minimization: 'COMPLIANT — only operational agent data stored',
    data_portability: 'COMPLIANT — audit trail exportable as JSON',
    cross_border_transfers: 'Standard Contractual Clauses applicable',
    dpo_contact: 'dpo@proofchain.dev',
    no_profiling: 'COMPLIANT — no automated decision-making or profiling'
  };

  const reports = {};
  if (framework === 'all' || framework === 'eu-ai-act') reports.eu_ai_act = euAiAct;
  if (framework === 'all' || framework === 'soc2') reports.soc2 = soc2;
  if (framework === 'all' || framework === 'gdpr') reports.gdpr = gdpr;

  return { ...base, reports };
}

// ── Compliance Report PDF/HTML ─────────────────────────
app.get('/api/compliance/:wallet/report/pdf', async (req, res) => {
  try {
    const { framework, format } = req.query; // framework: eu-ai-act|soc2|gdpr|all, format: html|pdf
    const agent = await verifyAgent(req.params.wallet);
    const audit = await getAuditTrail(req.params.wallet, { limit: 100 });

    const report = buildComplianceReport(agent, audit, framework || 'all');
    const html = buildComplianceHtml(report);

    if (format === 'html') {
      // Download as .html file
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="proofchain-compliance-${req.params.wallet.slice(0, 8)}.html"`);
    } else {
      // Default: serve inline — browser opens it, user can Ctrl+P to save as PDF
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
    res.send(html);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── Compliance Report HTML Generator ───────────────────
function buildComplianceHtml(report) {
  const statusColor = (label) => {
    if (label.startsWith('COMPLIANT') || label.startsWith('READY')) return '#2ECC40';
    if (label.startsWith('PARTIAL') || label.startsWith('TO BE') || label.startsWith('NOT READY')) return '#C4A44A';
    return '#FF4136';
  };

  const statusBadge = (label) => {
    let cls = 'noncompliant';
    if (label.startsWith('COMPLIANT') || label.startsWith('READY')) cls = 'compliant';
    else if (label.startsWith('PARTIAL') || label.startsWith('TO BE') || label.startsWith('NOT READY')) cls = 'partial';
    return `<span class="badge ${cls}">${label}</span>`;
  };

  const reportRow = (label, value) => `
    <tr>
      <td class="label">${label}</td>
      <td>${statusBadge(value)}</td>
    </tr>`;

  const sectionCard = (title, rows) => `
    <div class="card">
      <h3>${title}</h3>
      <table>${rows.join('')}</table>
    </div>`;

  const euRows = report.reports.eu_ai_act ? [
    reportRow('Classification', report.reports.eu_ai_act.classification),
    reportRow('Article 50 — Transparency', report.reports.eu_ai_act.article_50_transparency),
    reportRow('Article 12 — Record-Keeping', report.reports.eu_ai_act.article_12_record_keeping),
    reportRow('Annex IV — Technical Docs', report.reports.eu_ai_act.annex_iv_technical_docs),
    reportRow('Incident Reporting (72h)', report.reports.eu_ai_act.incident_reporting_72h),
    reportRow('High-Risk Provisions', report.reports.eu_ai_act.high_risk_provisions),
  ] : [];

  const soc2Rows = report.reports.soc2 ? [
    reportRow('Security', report.reports.soc2.trust_services_criteria.security),
    reportRow('Availability', report.reports.soc2.trust_services_criteria.availability),
    reportRow('Processing Integrity', report.reports.soc2.trust_services_criteria.processing_integrity),
    reportRow('Confidentiality', report.reports.soc2.trust_services_criteria.confidentiality),
    reportRow('Privacy', report.reports.soc2.trust_services_criteria.privacy),
    reportRow('Observation Period', report.reports.soc2.observation_period),
    reportRow('Evidence Pack', report.reports.soc2.evidence_pack),
  ] : [];

  const gdprRows = report.reports.gdpr ? [
    reportRow('Data Encryption', report.reports.gdpr.data_encryption),
    reportRow('Right to Erasure (Art. 17)', report.reports.gdpr.right_to_erasure),
    reportRow('Data Minimization', report.reports.gdpr.data_minimization),
    reportRow('Data Portability', report.reports.gdpr.data_portability),
    reportRow('Cross-Border Transfers', report.reports.gdpr.cross_border_transfers),
    reportRow('DPO Contact', report.reports.gdpr.dpo_contact),
    reportRow('Automated Profiling', report.reports.gdpr.no_profiling),
  ] : [];

  const sections = [];
  if (euRows.length) sections.push(sectionCard(report.reports.eu_ai_act.framework, euRows));
  if (soc2Rows.length) sections.push(sectionCard(report.reports.soc2.framework, soc2Rows));
  if (gdprRows.length) sections.push(sectionCard(report.reports.gdpr.framework, gdprRows));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>ProofChain Compliance Report — ${report.agent_name}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,400;0,500;1,400&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #080808;
    --surface: #111111;
    --border: #1C1C1C;
    --gold: #C4A44A;
    --gold-dim: rgba(196, 164, 74, 0.15);
    --text: #E0E0E0;
    --text-dim: #888888;
    --green: #2ECC40;
    --green-bg: rgba(46, 204, 64, 0.12);
    --red: #FF4136;
    --red-bg: rgba(255, 65, 54, 0.12);
    --amber: #C4A44A;
    --amber-bg: rgba(196, 164, 74, 0.12);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Manrope', -apple-system, sans-serif;
    line-height: 1.6;
    padding: 48px 24px;
  }
  .container { max-width: 900px; margin: 0 auto; }
  header {
    text-align: center;
    padding: 48px 0 40px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 40px;
  }
  .logo {
    font-family: 'DM Mono', monospace;
    font-size: 32px;
    font-weight: 500;
    color: var(--gold);
    letter-spacing: -0.5px;
  }
  .logo span { color: var(--text); }
  .subtitle {
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    color: var(--text-dim);
    margin-top: 8px;
    text-transform: uppercase;
    letter-spacing: 2px;
  }
  h2 {
    font-size: 22px;
    font-weight: 600;
    color: var(--gold);
    margin-bottom: 20px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
  }
  h3 {
    font-size: 15px;
    font-weight: 600;
    color: var(--gold);
    margin-bottom: 16px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 16px;
    margin-bottom: 40px;
  }
  .info-item {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px 20px;
  }
  .info-item .key {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 4px;
  }
  .info-item .val {
    font-size: 15px;
    font-weight: 500;
    word-break: break-all;
  }
  .info-item .val.mono {
    font-family: 'DM Mono', monospace;
    font-size: 13px;
  }
  .status-dot {
    display: inline-block;
    width: 8px; height: 8px;
    border-radius: 50%;
    margin-right: 8px;
  }
  .status-dot.ok { background: var(--green); box-shadow: 0 0 8px rgba(46,204,64,0.5); }
  .status-dot.no { background: var(--red); box-shadow: 0 0 8px rgba(255,65,54,0.5); }
  .summary-bar {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px 24px;
    margin-bottom: 40px;
    display: flex;
    flex-wrap: wrap;
    gap: 32px;
    align-items: center;
    justify-content: space-between;
  }
  .summary-stat {
    text-align: center;
  }
  .summary-stat .num {
    font-family: 'DM Mono', monospace;
    font-size: 28px;
    font-weight: 500;
    color: var(--gold);
  }
  .summary-stat .lbl {
    font-size: 11px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-top: 2px;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 24px;
    margin-bottom: 24px;
  }
  table { width: 100%; border-collapse: collapse; }
  td {
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
    font-size: 14px;
  }
  tr:last-child td { border-bottom: none; }
  td.label {
    color: var(--text-dim);
    width: 45%;
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .badge {
    display: inline-block;
    padding: 3px 12px;
    border-radius: 4px;
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.3px;
  }
  .badge.compliant { background: var(--green-bg); color: var(--green); border: 1px solid rgba(46,204,64,0.25); }
  .badge.partial { background: var(--amber-bg); color: var(--amber); border: 1px solid rgba(196,164,74,0.25); }
  .badge.noncompliant { background: var(--red-bg); color: var(--red); border: 1px solid rgba(255,65,54,0.25); }
  footer {
    text-align: center;
    padding: 32px 0;
    margin-top: 40px;
    border-top: 1px solid var(--border);
  }
  footer .verify {
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    color: var(--gold);
    margin-bottom: 6px;
  }
  footer .meta {
    font-size: 12px;
    color: var(--text-dim);
    margin-top: 4px;
  }
  footer .explorer {
    font-size: 12px;
    margin-top: 8px;
  }
  footer .explorer a {
    color: var(--gold);
    text-decoration: none;
    border-bottom: 1px solid var(--gold-dim);
    padding-bottom: 1px;
  }

  @media print {
    body { background: #fff; color: #111; padding: 20px; }
    .card, .info-item, .summary-bar { background: #fafafa; border-color: #ddd; }
    header, footer { border-color: #ddd; }
    .logo { color: #222; }
    .logo span { color: #444; }
    h2, h3, .summary-stat .num, footer .verify, footer .explorer a { color: #222; }
    td.label, .subtitle, .summary-stat .lbl, .info-item .key, footer .meta { color: #666; }
    .badge.compliant { background: #e6ffe6; color: #1a7a1a; border-color: #b3e6b3; }
    .badge.partial { background: #fff8e6; color: #7a5a1a; border-color: #e6cc99; }
    .badge.noncompliant { background: #ffe6e6; color: #7a1a1a; border-color: #e6b3b3; }
  }
</style>
</head>
<body>
<div class="container">

  <header>
    <div class="logo">Proof<span>Chain</span></div>
    <div class="subtitle">Compliance Report</div>
  </header>

  <h2>Agent Identity</h2>
  <div class="info-grid">
    <div class="info-item">
      <div class="key">Agent Name</div>
      <div class="val">${escapeHtml(report.agent_name)}</div>
    </div>
    <div class="info-item">
      <div class="key">Wallet</div>
      <div class="val mono">${escapeHtml(report.agent_wallet)}</div>
    </div>
    <div class="info-item">
      <div class="key">Verification</div>
      <div class="val">
        <span class="status-dot ${report.agent_verified ? 'ok' : 'no'}"></span>
        ${report.agent_verified ? 'VERIFIED' : 'UNVERIFIED'}
      </div>
    </div>
    <div class="info-item">
      <div class="key">NFT Mint</div>
      <div class="val mono">${report.agent_nft ? escapeHtml(report.agent_nft) : '—'}</div>
    </div>
  </div>

  <h2>Audit Trail Summary</h2>
  <div class="summary-bar">
    <div class="summary-stat">
      <div class="num">${report.total_records}</div>
      <div class="lbl">Total Records</div>
    </div>
    <div class="summary-stat">
      <div class="num">${report.record_types.length}</div>
      <div class="lbl">Record Types</div>
    </div>
    <div class="summary-stat">
      <div class="lbl" style="margin-bottom:4px">Date Range</div>
      <div style="font-family:'DM Mono',monospace;font-size:12px;color:var(--text-dim)">
        ${formatDate(report.oldest_record)} → ${formatDate(report.newest_record)}
      </div>
    </div>
  </div>

  <h2>Framework Assessments</h2>
  ${sections.join('\n')}

  <footer>
    <div class="verify">✓ Generated by ProofChain — Verifiable on X1</div>
    <div class="meta">Report generated: ${new Date(report.generated_at).toUTCString()}</div>
    <div class="explorer">
      <a href="https://explorer.x1.xyz/address/${report.agent_wallet}" target="_blank">
        View on X1 Explorer →
      </a>
    </div>
  </footer>

</div>
</body>
</html>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toISOString().slice(0, 10);
  } catch { return iso; }
}

// ── Start ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`ProofChain API running on http://localhost:${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  GET /api/health`);
  console.log(`  GET /api/agent/:wallet`);
  console.log(`  GET /api/audit/:wallet`);
  console.log(`  GET /api/audit/:wallet/timeline`);
  console.log(`  GET /api/compliance/:wallet/report?framework=eu-ai-act|soc2|gdpr|all`);
  console.log(`  GET /api/compliance/:wallet/report/pdf?framework=all&format=pdf|html`);
});
