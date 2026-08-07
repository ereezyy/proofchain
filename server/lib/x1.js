/**
 * X1 RPC wrapper — read-only queries against X1 mainnet.
 */
import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://rpc.mainnet.x1.xyz';
const connection = new Connection(RPC_URL, { commitment: 'confirmed' });

export async function healthCheck() {
  const start = Date.now();
  try {
    const slot = await connection.getSlot();
    const version = await connection.getVersion();
    return {
      rpc: RPC_URL,
      status: 'ok',
      slot,
      version: version?.['solana-core'] || 'unknown',
      latency_ms: Date.now() - start
    };
  } catch (err) {
    return {
      rpc: RPC_URL,
      status: 'unreachable',
      error: err.message,
      latency_ms: Date.now() - start
    };
  }
}

export async function getSignatures(walletAddress, options = {}) {
  const { limit = 25, before, until } = options;
  const pubkey = new PublicKey(walletAddress);

  const sigs = await connection.getSignaturesForAddress(pubkey, {
    limit,
    before,
    until
  }, 'confirmed');

  return sigs;
}

export async function getTransactions(signatures) {
  if (!signatures.length) return [];

  // Batch in groups of 5 to avoid rate limits
  const results = [];
  for (let i = 0; i < signatures.length; i += 5) {
    const batch = signatures.slice(i, i + 5);
    const txs = await Promise.allSettled(
      batch.map(sig => connection.getTransaction(sig, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      }))
    );
    for (const tx of txs) {
      if (tx.status === 'fulfilled' && tx.value) {
        results.push(tx.value);
      }
    }
    // Pace requests
    if (i + 5 < signatures.length) {
      await sleep(300);
    }
  }
  return results;
}

export async function getBalance(walletAddress) {
  const pubkey = new PublicKey(walletAddress);
  const balance = await connection.getBalance(pubkey);
  return {
    lamports: balance,
    xnt: balance / 1_000_000_000
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export { connection, RPC_URL };
