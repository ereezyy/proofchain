import app from './app.js';

const PORT = process.env.PORT || 3456;

app.listen(PORT, () => {
  console.log(`ProofChain API running on http://localhost:${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  Public (rate-limited, 100 req/day):`);
  console.log(`    GET /api/health`);
  console.log(`    GET /api/ping`);
  console.log(`    GET /api/agent/:wallet`);
  console.log(`    GET /api/audit/:wallet`);
  console.log(`    GET /api/audit/:wallet/timeline`);
  console.log(`    GET /api/compliance/:wallet/report?framework=eu-ai-act|soc2|gdpr|all`);
  console.log(`    GET /api/compliance/:wallet/report/pdf?framework=all`);
  console.log(`    GET /api/agents`);
  console.log(`  Protected (API key required):`);
  console.log(`    POST /api/agents/register`);
  console.log(`    DELETE /api/agents/:wallet`);
  console.log(`  Pro (API key required, unlimited):`);
  console.log(`    GET /api/pro/health`);
  console.log(`    GET /api/pro/agent/:wallet`);
  console.log(`    GET /api/pro/audit/:wallet`);
  console.log(`    GET /api/pro/audit/:wallet/timeline`);
  console.log(`    GET /api/pro/compliance/:wallet/report`);
  console.log(`    POST /api/pro/reports/schedule`);
  console.log(`  Key management (separate X-Admin-Key required):`);
  console.log(`    POST /api/pro/keys/generate`);
  console.log(`    GET /api/pro/keys`);
  console.log(`    DELETE /api/pro/keys/revoke/:key`);
});
