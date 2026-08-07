/**
 * AgentID verification — wraps the AgentID v2 API.
 */

const AGENTID_API = 'https://agentid-app.vercel.app/api';

export async function verifyAgent(wallet) {
  const url = `${AGENTID_API}/verify?wallet=${encodeURIComponent(wallet)}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`AgentID API returned ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();

  return {
    wallet,
    verified: data.verified || false,
    agent: data.agent || null,
    nft: data.nft || null,
    verify_url: url,
    timestamp: new Date().toISOString()
  };
}

export async function getAgentDocs() {
  const res = await fetch(`${AGENTID_API}/docs`);
  if (!res.ok) {
    throw new Error(`AgentID docs returned ${res.status}`);
  }
  return res.json();
}
