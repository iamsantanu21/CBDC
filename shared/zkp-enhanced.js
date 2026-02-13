/**
 * Enhanced Zero-Knowledge Proof (ZKP) Module
 * 
 * Based on IEEE Paper: "Zero-Knowledge Proof (ZKP) Authentication for 
 * Offline CBDC Payment System Using IoT Devices"
 * 
 * Features:
 * - Bulletproofs-style range proofs (simulated for lightweight IoT)
 * - Pedersen Commitments for value hiding
 * - AML/CFT compliance proofs
 * - Double-spending prevention with nullifiers
 * - Serial number management for CBDC tokens
 */

import crypto from 'crypto';

// ============ CRYPTOGRAPHIC PRIMITIVES ============

// Simulated curve parameters (in production: secp256k1 or BLS12-381)
const CURVE_ORDER = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
const GENERATOR_G = 'G_POINT_CBDC_BASE';
const GENERATOR_H = 'H_POINT_CBDC_HIDING';

/**
 * Generate secure random scalar in field
 */
function randomScalar() {
  const bytes = crypto.randomBytes(32);
  return BigInt('0x' + bytes.toString('hex')) % CURVE_ORDER;
}

/**
 * Pedersen Commitment: C = v*G + r*H
 * Hiding: commitment reveals nothing about v
 * Binding: cannot open to different value
 */
export function pedersenCommit(value, blindingFactor = null) {
  const v = BigInt(value);
  const r = blindingFactor ? BigInt('0x' + blindingFactor) : randomScalar();
  
  // Simulated commitment (in production: actual EC point multiplication)
  const commitment = crypto.createHash('sha256')
    .update(`PEDERSEN||${v.toString(16)}||${r.toString(16)}||${GENERATOR_G}||${GENERATOR_H}`)
    .digest('hex');
  
  return {
    commitment,
    blindingFactor: r.toString(16).padStart(64, '0'),
    value: value // Only stored locally, never revealed
  };
}

/**
 * Verify Pedersen Commitment opening
 */
export function verifyPedersenCommit(commitment, value, blindingFactor) {
  const recomputed = pedersenCommit(value, blindingFactor);
  return recomputed.commitment === commitment;
}

// ============ SERIAL NUMBER & NULLIFIER SYSTEM ============

/**
 * Generate CBDC Token Serial Number
 * Each unit of CBDC has a unique serial number
 */
export function generateSerialNumber(issuerId, batchId, sequence) {
  const timestamp = Date.now();
  const serial = crypto.createHash('sha256')
    .update(`CBDC_SERIAL||${issuerId}||${batchId}||${sequence}||${timestamp}`)
    .digest('hex');
  
  return {
    serialNumber: `SN-${serial.substring(0, 32)}`,
    issuerId,
    batchId,
    sequence,
    issuedAt: timestamp
  };
}

/**
 * Generate Nullifier for spent token
 * Nullifier = Hash(serialNumber || spenderPrivateKey || nonce)
 * Once revealed, token cannot be spent again
 */
export function generateNullifier(serialNumber, spenderPrivateKey, nonce = null) {
  const n = nonce || crypto.randomBytes(16).toString('hex');
  
  const nullifier = crypto.createHash('sha256')
    .update(`NULLIFIER||${serialNumber}||${spenderPrivateKey}||${n}`)
    .digest('hex');
  
  return {
    nullifier: `NUL-${nullifier}`,
    serialNumber,
    nonce: n,
    createdAt: Date.now()
  };
}

/**
 * Verify nullifier is correctly formed (without revealing private key)
 */
export function verifyNullifierStructure(nullifier) {
  return nullifier.startsWith('NUL-') && nullifier.length === 68;
}

// ============ AML/CFT COMPLIANCE PROOFS ============

/**
 * Compliance Parameters (from paper Section III-C)
 */
export const COMPLIANCE_LIMITS = {
  SINGLE_TX_LIMIT: 50000,        // Max single transaction (₹)
  DAILY_LIMIT: 200000,           // Max daily spending (₹)
  MONTHLY_LIMIT: 1000000,        // Max monthly spending (₹)
  OFFLINE_LIMIT: 10000,          // Max offline transaction (₹)
  OFFLINE_DAILY_COUNT: 10,       // Max offline transactions per day
  IOT_DEVICE_LIMIT: 5000,        // Max per IoT device transaction (₹)
  SUB_WALLET_LIMIT: 25000        // Max sub-wallet balance (₹)
};

/**
 * Generate AML/CFT Compliance Proof
 * Proves compliance without revealing actual spending history
 */
export function generateComplianceProof(params) {
  const {
    transactionAmount,
    dailySpent = 0,
    monthlySpent = 0,
    isOffline = false,
    offlineTxCount = 0,
    deviceType = 'mobile',
    walletPrivateKey
  } = params;

  const timestamp = Date.now();
  const nonce = crypto.randomBytes(16).toString('hex');
  
  // Compliance checks
  const checks = {
    singleTxValid: transactionAmount <= COMPLIANCE_LIMITS.SINGLE_TX_LIMIT,
    dailyValid: (dailySpent + transactionAmount) <= COMPLIANCE_LIMITS.DAILY_LIMIT,
    monthlyValid: (monthlySpent + transactionAmount) <= COMPLIANCE_LIMITS.MONTHLY_LIMIT,
    offlineValid: !isOffline || transactionAmount <= COMPLIANCE_LIMITS.OFFLINE_LIMIT,
    offlineCountValid: !isOffline || offlineTxCount < COMPLIANCE_LIMITS.OFFLINE_DAILY_COUNT,
    deviceValid: deviceType === 'mobile' || transactionAmount <= COMPLIANCE_LIMITS.IOT_DEVICE_LIMIT
  };
  
  const isCompliant = Object.values(checks).every(v => v);
  
  // Generate ZKP for compliance (Bulletproofs-style range proof simulation)
  const complianceCommitment = crypto.createHash('sha256')
    .update(`COMPLIANCE||${JSON.stringify(checks)}||${walletPrivateKey}||${nonce}`)
    .digest('hex');
  
  // Range proofs for spending limits (simulated)
  const rangeProofs = {
    txAmountInRange: generateRangeProof(transactionAmount, 0, COMPLIANCE_LIMITS.SINGLE_TX_LIMIT),
    dailyInRange: generateRangeProof(dailySpent + transactionAmount, 0, COMPLIANCE_LIMITS.DAILY_LIMIT),
    monthlyInRange: generateRangeProof(monthlySpent + transactionAmount, 0, COMPLIANCE_LIMITS.MONTHLY_LIMIT)
  };
  
  return {
    type: 'compliance_proof',
    timestamp,
    nonce,
    isCompliant,
    complianceCommitment,
    rangeProofs,
    // Verification tag (can be verified without private data)
    verificationTag: crypto.createHash('sha256')
      .update(`${complianceCommitment}||${timestamp}||${isCompliant}`)
      .digest('hex').substring(0, 24)
  };
}

/**
 * Verify AML/CFT Compliance Proof
 */
export function verifyComplianceProof(proof) {
  if (proof.type !== 'compliance_proof') return { valid: false, error: 'Invalid proof type' };
  
  // Check timestamp freshness (5 minutes)
  const age = Date.now() - proof.timestamp;
  if (age > 5 * 60 * 1000) return { valid: false, error: 'Proof expired' };
  
  // Verify tag
  const expectedTag = crypto.createHash('sha256')
    .update(`${proof.complianceCommitment}||${proof.timestamp}||${proof.isCompliant}`)
    .digest('hex').substring(0, 24);
  
  if (proof.verificationTag !== expectedTag) {
    return { valid: false, error: 'Invalid verification tag' };
  }
  
  // Verify range proofs
  const rangeProofsValid = Object.values(proof.rangeProofs).every(rp => rp.valid);
  
  return {
    valid: proof.isCompliant && rangeProofsValid,
    isCompliant: proof.isCompliant,
    rangeProofsValid
  };
}

// ============ BULLETPROOFS-STYLE RANGE PROOFS ============

/**
 * Generate Range Proof (Bulletproofs simulation)
 * Proves: value ∈ [min, max] without revealing value
 */
export function generateRangeProof(value, min, max) {
  const v = BigInt(value);
  const minVal = BigInt(min);
  const maxVal = BigInt(max);
  
  const inRange = v >= minVal && v <= maxVal;
  const nonce = crypto.randomBytes(16).toString('hex');
  
  // Simulated Bulletproof (actual implementation requires polynomial commitments)
  const commitment = pedersenCommit(value);
  
  // Inner product argument simulation
  const L_vec = crypto.randomBytes(32).toString('hex');
  const R_vec = crypto.randomBytes(32).toString('hex');
  
  const proof = crypto.createHash('sha256')
    .update(`RANGE_PROOF||${commitment.commitment}||${minVal}||${maxVal}||${L_vec}||${R_vec}||${nonce}`)
    .digest('hex');
  
  return {
    type: 'range_proof',
    commitment: commitment.commitment,
    min,
    max,
    proof,
    valid: inRange,
    // Verification data
    verificationHint: crypto.createHash('sha256')
      .update(`${commitment.commitment}||${min}||${max}`)
      .digest('hex').substring(0, 16)
  };
}

/**
 * Verify Range Proof
 */
export function verifyRangeProof(rangeProof) {
  if (rangeProof.type !== 'range_proof') return false;
  
  const expectedHint = crypto.createHash('sha256')
    .update(`${rangeProof.commitment}||${rangeProof.min}||${rangeProof.max}`)
    .digest('hex').substring(0, 16);
  
  return rangeProof.verificationHint === expectedHint && rangeProof.valid;
}

// ============ SECURE ELEMENT SIMULATION ============

/**
 * Secure Element (SE) with Monotonic Counter
 * From paper: "tamper-resistant hardware for key storage and monotonic counters"
 */
export class SecureElement {
  constructor(walletId) {
    this.walletId = walletId;
    this.monotonicCounter = 0;
    this.transactionLog = [];
    this.privateKey = crypto.randomBytes(32).toString('hex');
    this.publicKey = crypto.createHash('sha256').update(this.privateKey).digest('hex');
    this.createdAt = Date.now();
  }
  
  /**
   * Increment monotonic counter (cannot be decremented)
   */
  incrementCounter() {
    this.monotonicCounter++;
    return this.monotonicCounter;
  }
  
  /**
   * Get current counter value
   */
  getCounter() {
    return this.monotonicCounter;
  }
  
  /**
   * Add transaction to secure log
   */
  logTransaction(txData) {
    const entry = {
      sequence: this.incrementCounter(),
      txHash: crypto.createHash('sha256').update(JSON.stringify(txData)).digest('hex'),
      timestamp: Date.now(),
      signature: this.sign(JSON.stringify(txData))
    };
    this.transactionLog.push(entry);
    return entry;
  }
  
  /**
   * Sign data with SE private key
   */
  sign(data) {
    return crypto.createHash('sha256')
      .update(`${data}||${this.privateKey}||${this.monotonicCounter}`)
      .digest('hex');
  }
  
  /**
   * Export SE state (for persistence)
   */
  export() {
    return {
      walletId: this.walletId,
      monotonicCounter: this.monotonicCounter,
      publicKey: this.publicKey,
      transactionLogCount: this.transactionLog.length,
      createdAt: this.createdAt
    };
  }
}

// ============ SUB-WALLET SYSTEM ============

/**
 * Sub-Wallet for IoT Devices
 * From paper: "Main wallet allocates partial balance to IoT sub-wallets"
 */
export function createSubWallet(mainWalletId, deviceId, deviceType, allocatedBalance, spendingLimit) {
  const subWalletId = `sub-${crypto.randomBytes(4).toString('hex')}`;
  const secureElement = new SecureElement(subWalletId);
  
  // Enforce sub-wallet limits
  const effectiveLimit = Math.min(spendingLimit, COMPLIANCE_LIMITS.SUB_WALLET_LIMIT);
  const effectiveBalance = Math.min(allocatedBalance, effectiveLimit);
  
  return {
    id: subWalletId,
    mainWalletId,
    deviceId,
    deviceType,
    balance: effectiveBalance,
    spendingLimit: effectiveLimit,
    dailySpent: 0,
    dailyLimit: COMPLIANCE_LIMITS.IOT_DEVICE_LIMIT,
    secureElement: secureElement.export(),
    status: 'active',
    createdAt: Date.now()
  };
}

/**
 * Allocate funds from main wallet to sub-wallet
 */
export function allocateToSubWallet(mainWalletBalance, subWallet, amount) {
  if (amount > mainWalletBalance) {
    return { success: false, error: 'Insufficient main wallet balance' };
  }
  if (amount + subWallet.balance > subWallet.spendingLimit) {
    return { success: false, error: 'Would exceed sub-wallet spending limit' };
  }
  
  return {
    success: true,
    newSubWalletBalance: subWallet.balance + amount,
    newMainWalletBalance: mainWalletBalance - amount,
    allocatedAmount: amount
  };
}

// ============ OFFLINE TRANSACTION PROOF (ENHANCED) ============

/**
 * Generate Enhanced Offline Transaction Proof
 * Includes: ownership, balance, compliance, nullifier
 */
export function generateEnhancedOfflineProof(params) {
  const {
    transaction,
    senderPrivateKey,
    senderPublicKey,
    senderBalance,
    serialNumber,
    dailySpent = 0,
    monthlySpent = 0,
    offlineTxCount = 0,
    deviceType = 'mobile'
  } = params;
  
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(16).toString('hex');
  
  // 1. Ownership proof
  const ownershipProof = generateOwnershipProof(senderPrivateKey, senderPublicKey);
  
  // 2. Balance proof (Pedersen commitment)
  const balanceCommitment = pedersenCommit(senderBalance);
  const balanceProof = generateRangeProof(senderBalance, transaction.amount, Number.MAX_SAFE_INTEGER);
  
  // 3. Compliance proof
  const complianceProof = generateComplianceProof({
    transactionAmount: transaction.amount,
    dailySpent,
    monthlySpent,
    isOffline: true,
    offlineTxCount,
    deviceType,
    walletPrivateKey: senderPrivateKey
  });
  
  // 4. Nullifier for spent funds
  const nullifier = generateNullifier(serialNumber, senderPrivateKey, nonce);
  
  // 5. Transaction hash
  const txHash = crypto.createHash('sha256')
    .update(JSON.stringify({
      from: transaction.fromWallet,
      to: transaction.toWallet,
      amount: transaction.amount,
      timestamp: transaction.timestamp
    }))
    .digest('hex');
  
  // 6. Double-spend prevention token
  const doubleSpendToken = crypto.createHash('sha256')
    .update(`${transaction.fromWallet}||${serialNumber}||${nullifier.nullifier}||${timestamp}`)
    .digest('hex');
  
  // Combined signature
  const combinedSignature = crypto.createHash('sha256')
    .update(`${txHash}||${ownershipProof.proof}||${complianceProof.complianceCommitment}||${nullifier.nullifier}||${senderPrivateKey}`)
    .digest('hex');
  
  return {
    type: 'enhanced_offline_proof',
    version: '2.0',
    txHash,
    timestamp,
    nonce,
    ownershipProof,
    balanceCommitment: balanceCommitment.commitment,
    balanceProof,
    complianceProof,
    nullifier: nullifier.nullifier,
    doubleSpendToken,
    combinedSignature,
    // Public verification data
    senderPublicKey,
    verificationTag: crypto.createHash('sha256')
      .update(`${txHash}||${senderPublicKey}||${nullifier.nullifier}||${timestamp}`)
      .digest('hex').substring(0, 24)
  };
}

/**
 * Verify Enhanced Offline Transaction Proof
 */
export function verifyEnhancedOfflineProof(proof, transaction, expectedSenderPublicKey) {
  const errors = [];
  
  // Type check
  if (proof.type !== 'enhanced_offline_proof') {
    errors.push('Invalid proof type');
    return { valid: false, errors };
  }
  
  // Version check
  if (proof.version !== '2.0') {
    errors.push('Unsupported proof version');
  }
  
  // Sender verification
  if (proof.senderPublicKey !== expectedSenderPublicKey) {
    errors.push('Sender public key mismatch');
  }
  
  // Timestamp check (24 hours for offline)
  const age = Date.now() - proof.timestamp;
  if (age > 24 * 60 * 60 * 1000) {
    errors.push('Proof too old (>24 hours)');
  }
  
  // Verify transaction hash
  const expectedTxHash = crypto.createHash('sha256')
    .update(JSON.stringify({
      from: transaction.fromWallet,
      to: transaction.toWallet,
      amount: transaction.amount,
      timestamp: transaction.timestamp
    }))
    .digest('hex');
  
  if (proof.txHash !== expectedTxHash) {
    errors.push('Transaction hash mismatch');
  }
  
  // Verify ownership proof
  if (!verifyOwnershipProof(proof.ownershipProof, expectedSenderPublicKey)) {
    errors.push('Invalid ownership proof');
  }
  
  // Verify compliance proof
  const complianceResult = verifyComplianceProof(proof.complianceProof);
  if (!complianceResult.valid) {
    errors.push(`Compliance verification failed: ${complianceResult.error || 'Unknown'}`);
  }
  
  // Verify range proof for balance
  if (!verifyRangeProof(proof.balanceProof)) {
    errors.push('Balance range proof invalid');
  }
  
  // Verify nullifier structure
  if (!verifyNullifierStructure(proof.nullifier)) {
    errors.push('Invalid nullifier format');
  }
  
  // Verify verification tag
  const expectedTag = crypto.createHash('sha256')
    .update(`${proof.txHash}||${proof.senderPublicKey}||${proof.nullifier}||${proof.timestamp}`)
    .digest('hex').substring(0, 24);
  
  if (proof.verificationTag !== expectedTag) {
    errors.push('Verification tag mismatch');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    nullifier: proof.nullifier,
    doubleSpendToken: proof.doubleSpendToken,
    isCompliant: proof.complianceProof.isCompliant
  };
}

// ============ OWNERSHIP PROOF (FROM ORIGINAL) ============

export function generateOwnershipProof(privateKey, publicKey, challenge = null) {
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(16).toString('hex');
  const challengeValue = challenge || crypto.randomBytes(32).toString('hex');
  
  const signature = crypto.createHash('sha256')
    .update(`${privateKey}||${challengeValue}||${timestamp}||${nonce}`)
    .digest('hex');
  
  return {
    type: 'ownership',
    publicKey,
    challenge: challengeValue,
    timestamp,
    nonce,
    proof: signature,
    verificationHash: crypto.createHash('sha256')
      .update(`${publicKey}||${challengeValue}||${timestamp}`)
      .digest('hex').substring(0, 16)
  };
}

export function verifyOwnershipProof(proof, expectedPublicKey) {
  if (proof.type !== 'ownership') return false;
  if (proof.publicKey !== expectedPublicKey) return false;
  
  const age = Date.now() - proof.timestamp;
  if (age > 5 * 60 * 1000) return false;
  
  const expectedHash = crypto.createHash('sha256')
    .update(`${proof.publicKey}||${proof.challenge}||${proof.timestamp}`)
    .digest('hex').substring(0, 16);
  
  return proof.verificationHash === expectedHash;
}

// ============ RECONCILIATION PROOFS ============

/**
 * Generate Sync Proof for FI Reconciliation
 * Includes transaction merkle root and nullifier list
 */
export function generateReconciliationProof(params) {
  const {
    fiId,
    transactions,
    nullifiers,
    fiPrivateKey
  } = params;
  
  const timestamp = Date.now();
  
  // Transaction merkle root
  const txHashes = transactions.map(tx => 
    crypto.createHash('sha256').update(JSON.stringify(tx)).digest('hex').substring(0, 16)
  );
  const merkleRoot = crypto.createHash('sha256')
    .update(txHashes.join(''))
    .digest('hex');
  
  // Nullifier set hash
  const nullifierSetHash = crypto.createHash('sha256')
    .update(nullifiers.sort().join('||'))
    .digest('hex');
  
  // Combined signature
  const signature = crypto.createHash('sha256')
    .update(`${fiId}||${merkleRoot}||${nullifierSetHash}||${fiPrivateKey}||${timestamp}`)
    .digest('hex');
  
  return {
    type: 'reconciliation_proof',
    fiId,
    transactionCount: transactions.length,
    merkleRoot,
    nullifierCount: nullifiers.length,
    nullifierSetHash,
    timestamp,
    signature,
    verificationTag: crypto.createHash('sha256')
      .update(`${fiId}||${merkleRoot}||${nullifierSetHash}||${timestamp}`)
      .digest('hex').substring(0, 20)
  };
}

/**
 * Verify Reconciliation Proof
 */
export function verifyReconciliationProof(proof, expectedFiId) {
  if (proof.type !== 'reconciliation_proof') return { valid: false, error: 'Invalid proof type' };
  if (proof.fiId !== expectedFiId) return { valid: false, error: 'FI ID mismatch' };
  
  const expectedTag = crypto.createHash('sha256')
    .update(`${proof.fiId}||${proof.merkleRoot}||${proof.nullifierSetHash}||${proof.timestamp}`)
    .digest('hex').substring(0, 20);
  
  if (proof.verificationTag !== expectedTag) {
    return { valid: false, error: 'Verification tag mismatch' };
  }
  
  return {
    valid: true,
    fiId: proof.fiId,
    transactionCount: proof.transactionCount,
    nullifierCount: proof.nullifierCount
  };
}

// ============ EXPORT ALL ============

export default {
  // Cryptographic primitives
  pedersenCommit,
  verifyPedersenCommit,
  
  // Serial numbers & nullifiers
  generateSerialNumber,
  generateNullifier,
  verifyNullifierStructure,
  
  // Compliance
  COMPLIANCE_LIMITS,
  generateComplianceProof,
  verifyComplianceProof,
  
  // Range proofs
  generateRangeProof,
  verifyRangeProof,
  
  // Secure Element
  SecureElement,
  
  // Sub-wallets
  createSubWallet,
  allocateToSubWallet,
  
  // Ownership proofs
  generateOwnershipProof,
  verifyOwnershipProof,
  
  // Enhanced offline proofs
  generateEnhancedOfflineProof,
  verifyEnhancedOfflineProof,
  
  // Reconciliation
  generateReconciliationProof,
  verifyReconciliationProof
};
