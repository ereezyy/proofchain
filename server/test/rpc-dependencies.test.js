import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Connection, PublicKey } from '@solana/web3.js';

test('updated RPC transport preserves every read-only Solana method used by X1', async () => {
  const wallet = '11111111111111111111111111111111';
  const signature = '1'.repeat(64);
  const requests = [];
  let rejectRequest = false;
  const rpc = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requests.push(request);
    const results = {
      getSlot: 42,
      getVersion: { 'solana-core': '2.0.0', 'feature-set': 1 },
      getBalance: { context: { slot: 42 }, value: 1000000000 },
      getSignaturesForAddress: [{ signature, slot: 42, err: null, memo: null, blockTime: null, confirmationStatus: 'confirmed' }],
      getTransaction: {
        slot: 42, blockTime: null, meta: null, version: 'legacy',
        transaction: {
          signatures: [signature],
          message: {
            accountKeys: [wallet], instructions: [], recentBlockhash: wallet,
            header: { numRequiredSignatures: 1, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 0 }
          }
        }
      }
    };
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(rejectRequest
      ? { jsonrpc: '2.0', id: request.id, error: { code: -32602, message: 'synthetic rejection' } }
      : { jsonrpc: '2.0', id: request.id, result: results[request.method] }));
  });
  rpc.listen(0, '127.0.0.1');
  await once(rpc, 'listening');
  try {
    const connection = new Connection(`http://127.0.0.1:${rpc.address().port}`, { commitment: 'confirmed' });
    const publicKey = new PublicKey(wallet);
    assert.equal(await connection.getSlot(), 42);
    assert.equal((await connection.getVersion())['solana-core'], '2.0.0');
    assert.equal(await connection.getBalance(publicKey), 1000000000);
    assert.equal((await connection.getSignaturesForAddress(publicKey, { limit: 5 }, 'confirmed'))[0].signature, signature);
    const transaction = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
    assert.equal(transaction.slot, 42);
    assert.equal(transaction.transaction.message.accountKeys[0].toBase58(), wallet);
    assert.deepEqual(requests.map(request => request.method), [
      'getSlot', 'getVersion', 'getBalance', 'getSignaturesForAddress', 'getTransaction'
    ]);
    assert.ok(requests.every(request => request.jsonrpc === '2.0' && typeof request.id === 'string'));
    assert.equal(new Set(requests.map(request => request.id)).size, 5);
    assert.deepEqual(requests[3].params, [wallet, { limit: 5, commitment: 'confirmed' }]);
    assert.deepEqual(requests[4].params, [signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
    rejectRequest = true;
    await assert.rejects(connection.getBalance(publicKey), /synthetic rejection/);
  } finally {
    rpc.closeAllConnections();
    await new Promise((resolve, reject) => rpc.close(error => error ? reject(error) : resolve()));
  }
});
