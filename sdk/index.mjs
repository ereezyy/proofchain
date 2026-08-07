/**
 * ProofChain SDK — ESM entry point (re-exports from CJS).
 *
 * @module @proofchain/sdk
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ProofChain = require('./index.js');

export const {
  configure,
  registerAgent,
  verifyAgent,
  logAction,
  getAuditTrail,
  generateReport,
  ProofChainError,
} = ProofChain;

export default ProofChain;
