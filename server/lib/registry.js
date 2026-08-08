/**
 * ProofChain Agent Registry
 * Local store of known agent wallets. Agents are verified against AgentID API.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { verifyAgent } from './agentid.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_FILE = process.env.REGISTRY_FILE || join(__dirname, '..', 'registry.json');

// Seed data — known agents
const SEED = [
  'FKwU1im523MSGnuJG6YLHEZu4rUGj3xqxHJ6ipQMBG9B' // Aster
];

function loadRegistry() {
  try {
    if (!existsSync(REGISTRY_FILE)) {
      // Seed with defaults on first run
      const seed = { wallets: SEED, updated: new Date().toISOString() };
      saveRegistry(seed);
      return seed;
    }
    return JSON.parse(readFileSync(REGISTRY_FILE, 'utf-8'));
  } catch {
    return { wallets: [], updated: null };
  }
}

function saveRegistry(data) {
  writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * List all registered agents with their verified data.
 * @returns {Promise<{agents: Array, total: number, updated: string}>}
 */
export async function listAgents() {
  const registry = loadRegistry();
  const wallets = registry.wallets || [];

  // Verify all agents in parallel
  const results = await Promise.allSettled(
    wallets.map(w => verifyAgent(w))
  );

  const agents = results
    .filter(r => r.status === 'fulfilled' && r.value.verified)
    .map(r => r.value);

  return {
    agents,
    total: agents.length,
    registered_wallets: wallets.length,
    updated: registry.updated
  };
}

/**
 * Add a wallet to the registry after verifying it.
 * @param {string} wallet
 * @returns {Promise<{added: boolean, agent?: object, error?: string}>}
 */
export async function registerAgent(wallet) {
  // Validate Solana address (base58, 32-44 chars)
  if (!wallet || typeof wallet !== 'string' || wallet.length < 32 || wallet.length > 44) {
    return { added: false, error: 'Invalid wallet address.' };
  }

  // Verify the agent exists on AgentID
  let agent;
  try {
    agent = await verifyAgent(wallet);
  } catch (err) {
    return { added: false, error: `AgentID verification failed: ${err.message}` };
  }

  if (!agent.verified) {
    return {
      added: false,
      error: 'Agent is not verified on AgentID. Register your agent first at https://agentid-app.vercel.app',
      agent
    };
  }

  const registry = loadRegistry();
  const wallets = new Set(registry.wallets || []);

  if (wallets.has(wallet)) {
    return { added: false, error: 'Agent already in registry.', agent };
  }

  wallets.add(wallet);
  registry.wallets = [...wallets];
  registry.updated = new Date().toISOString();
  saveRegistry(registry);

  return { added: true, agent };
}

/**
 * Remove a wallet from the registry.
 * @param {string} wallet
 * @returns {{removed: boolean}}
 */
export function removeAgent(wallet) {
  const registry = loadRegistry();
  const wallets = registry.wallets || [];
  const idx = wallets.indexOf(wallet);

  if (idx === -1) return { removed: false };

  wallets.splice(idx, 1);
  registry.wallets = wallets;
  registry.updated = new Date().toISOString();
  saveRegistry(registry);

  return { removed: true };
}
