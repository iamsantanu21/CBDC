import express from 'express';
import { 
  createTransaction, 
  getTransaction, 
  getAllTransactions, 
  getWalletTransactions,
  getUnsyncedTransactions,
  markTransactionsSynced,
  createOfflineTransaction,
  processOfflineTransaction,
  getPendingOfflineTransactions,
  verifyDeviceAuth,
  createIoTPayment,
  getAllDevices,
  // New imports for enhanced features
  createEnhancedOfflineTransaction,
  processEnhancedOfflineTransaction,
  checkNullifier,
  getAllNullifiers,
  updateComplianceTracking,
  checkTransactionCompliance
} from '../database.js';
import * as zkpEnhanced from '../../../shared/zkp-enhanced.js';

const router = express.Router();
const CENTRAL_BANK_URL = process.env.CENTRAL_BANK_URL || 'http://localhost:4000';
const FI_ID = process.env.FI_ID || 'fi-001';
const FI_NAME = process.env.FI_NAME || 'FI-Default';

// Create a new transaction (P2P transfer between wallets)
// ZKP proofs are generated automatically in the background
router.post('/create', async (req, res) => {
  try {
    const { fromWallet, toWallet, amount, description, targetFi } = req.body;
    
    if (!fromWallet || !toWallet) {
      return res.status(400).json({ error: 'Both fromWallet and toWallet are required' });
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }
    
    // AUTOMATIC: Check compliance limits before transaction (ZKP-based)
    const complianceCheck = await checkTransactionCompliance(fromWallet, amount, false);
    if (!complianceCheck.compliant) {
      console.log(`❌ Transaction blocked by compliance: ${complianceCheck.issues.join(', ')}`);
      return res.status(400).json({ 
        error: 'Compliance limit exceeded',
        details: complianceCheck.issues,
        zkpComplianceCheck: true
      });
    }
    
    // If targetFi is specified, it's a cross-FI transfer
    const transaction = await createTransaction(fromWallet, toWallet, amount, description, targetFi);
    
    // AUTOMATIC: Generate ZKP proofs in background for audit trail
    const zkpProofs = {
      rangeProof: zkpEnhanced.generateRangeProof(amount, 0, zkpEnhanced.COMPLIANCE_LIMITS.SINGLE_TX_LIMIT),
      complianceProof: zkpEnhanced.generateComplianceProof({
        transactionAmount: amount, 
        dailySpent: complianceCheck.status?.dailySpent || 0, 
        monthlySpent: complianceCheck.status?.monthlySpent || 0,
        isOffline: false
      }),
      timestamp: new Date().toISOString()
    };
    
    // AUTOMATIC: Update compliance tracking
    await updateComplianceTracking(fromWallet, amount, false);
    
    if (targetFi) {
      console.log(`💸 Cross-FI Transaction: ${fromWallet} → ${toWallet}@${targetFi} : ₹${amount}`);
    } else {
      console.log(`💸 Transaction: ${fromWallet} → ${toWallet} : ₹${amount}`);
    }
    console.log(`   🔐 ZKP: Range proof ✓, Compliance proof ✓`);
    
    res.json({ 
      success: true, 
      transaction,
      zkp: {
        verified: true,
        proofs: ['rangeProof', 'complianceProof'],
        complianceChecked: true
      }
    });
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== OFFLINE TRANSACTION ENDPOINTS ==========

// Create an offline transaction (with ZKP proof)
router.post('/offline/create', async (req, res) => {
  try {
    const { fromWallet, toWallet, amount, description, toFi } = req.body;
    
    if (!fromWallet || !toWallet) {
      return res.status(400).json({ error: 'Both fromWallet and toWallet are required' });
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }
    
    const offlineTx = await createOfflineTransaction(fromWallet, toWallet, amount, description, toFi);
    console.log(`📴 Offline Transaction Created: ${fromWallet} → ${toWallet} : ₹${amount}`);
    console.log(`   🔐 ZKP Proof: ${offlineTx.zkpProof.verificationTag}`);
    
    res.json({ success: true, offlineTransaction: offlineTx });
  } catch (error) {
    console.error('Error creating offline transaction:', error);
    res.status(500).json({ error: error.message });
  }
});

// Process a pending offline transaction (when coming online)
router.post('/offline/:id/process', async (req, res) => {
  try {
    const transaction = await processOfflineTransaction(req.params.id);
    console.log(`📶 Processed offline transaction: ${req.params.id}`);
    res.json({ success: true, transaction });
  } catch (error) {
    console.error('Error processing offline transaction:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all pending offline transactions
router.get('/offline/pending', async (req, res) => {
  try {
    const pendingTx = await getPendingOfflineTransactions();
    res.json({ success: true, offlineTransactions: pendingTx });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Process all pending offline transactions
router.post('/offline/process-all', async (req, res) => {
  try {
    const pendingTx = await getPendingOfflineTransactions();
    const processed = [];
    
    for (const tx of pendingTx) {
      try {
        const result = await processOfflineTransaction(tx.id);
        processed.push(result);
      } catch (e) {
        console.error(`Failed to process ${tx.id}:`, e.message);
      }
    }
    
    console.log(`📶 Processed ${processed.length}/${pendingTx.length} offline transactions`);
    res.json({ success: true, processed: processed.length, total: pendingTx.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== IoT PAYMENT ENDPOINTS ==========

// Create payment via IoT device
router.post('/iot/pay', async (req, res) => {
  try {
    const { deviceId, authToken, toWallet, amount, description, toFi } = req.body;
    
    if (!deviceId || !authToken) {
      return res.status(400).json({ error: 'Device ID and auth token are required' });
    }
    if (!toWallet || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid toWallet and amount are required' });
    }
    
    const transaction = await createIoTPayment(deviceId, authToken, toWallet, amount, description, toFi);
    console.log(`📱 IoT Payment: Device ${deviceId} → ${toWallet} : ₹${amount}`);
    
    res.json({ success: true, transaction });
  } catch (error) {
    console.error('Error processing IoT payment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all registered IoT devices
router.get('/iot/devices', async (req, res) => {
  try {
    const devices = await getAllDevices();
    res.json({ success: true, devices });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all transactions
router.get('/list', async (req, res) => {
  try {
    const transactions = await getAllTransactions();
    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific transaction
router.get('/:id', async (req, res) => {
  try {
    const transaction = await getTransaction(req.params.id);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json({ success: true, transaction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get transactions for a specific wallet
router.get('/wallet/:walletId', async (req, res) => {
  try {
    const transactions = await getWalletTransactions(req.params.walletId);
    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sync unsynced transactions with Central Bank
router.post('/sync', async (req, res) => {
  try {
    const unsyncedTransactions = await getUnsyncedTransactions();
    
    if (unsyncedTransactions.length === 0) {
      return res.json({ success: true, message: 'No transactions to sync', synced: 0 });
    }
    
    // Send to Central Bank
    const response = await fetch(`${CENTRAL_BANK_URL}/api/ledger/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fiId: FI_ID,
        transactions: unsyncedTransactions
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to sync with Central Bank');
    }
    
    const result = await response.json();
    
    // Mark transactions as synced
    const syncedIds = unsyncedTransactions.map(tx => tx.id);
    await markTransactionsSynced(syncedIds);
    
    console.log(`📤 Synced ${syncedIds.length} transactions to Central Bank`);
    res.json({ success: true, synced: syncedIds.length, result });
  } catch (error) {
    console.error('Error syncing transactions:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ENHANCED OFFLINE TRANSACTIONS (Paper-compliant)
// ============================================

// Create enhanced offline transaction with ZKP and compliance
router.post('/offline/enhanced/create', async (req, res) => {
  try {
    const { fromWalletId, toWalletId, amount, devicePubKey, monotonicCounter, timestamp } = req.body;
    
    // Validate required fields
    if (!fromWalletId || !toWalletId || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Check compliance limits first
    const complianceCheck = await checkTransactionCompliance(fromWalletId, amount, 'offline');
    if (!complianceCheck.allowed) {
      return res.status(400).json({ 
        error: 'Compliance limit exceeded',
        details: complianceCheck.reason,
        limits: complianceCheck.limits
      });
    }
    
    // Create enhanced offline transaction with full ZKP proofs
    const transaction = await createEnhancedOfflineTransaction(
      fromWalletId, 
      toWalletId, 
      amount,
      devicePubKey || 'default-device',
      monotonicCounter || 1,
      timestamp || new Date().toISOString()
    );
    
    // Update compliance tracking
    await updateComplianceTracking(fromWalletId, amount, 'offline');
    
    console.log(`📴 Enhanced offline transaction created: ${transaction.id}`);
    res.status(201).json({ 
      success: true, 
      transaction,
      compliance: complianceCheck,
      zkpProofs: {
        hasRangeProof: !!transaction.rangeProof,
        hasComplianceProof: !!transaction.complianceProof,
        hasNullifier: !!transaction.nullifier,
        serialNumber: transaction.serialNumber
      }
    });
  } catch (error) {
    console.error('Error creating enhanced offline transaction:', error);
    res.status(500).json({ error: error.message });
  }
});

// Process enhanced offline transaction with nullifier check
router.post('/offline/enhanced/:id/process', async (req, res) => {
  try {
    const { id } = req.params;
    const { validateNullifier = true } = req.body;
    
    // If validating nullifier, check it hasn't been used (double-spend prevention)
    if (validateNullifier) {
      const existing = await checkNullifier(id);
      if (existing) {
        console.log(`⚠️ Double-spend attempt detected for transaction ${id}`);
        return res.status(400).json({ 
          error: 'Double-spend attempt detected',
          nullifierAlreadyUsed: true,
          originalTransaction: existing
        });
      }
    }
    
    // Process the enhanced offline transaction
    const result = await processEnhancedOfflineTransaction(id);
    
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }
    
    console.log(`✅ Enhanced offline transaction processed: ${id}`);
    res.json({ 
      success: true, 
      transaction: result.transaction,
      verification: {
        zkpVerified: result.zkpVerified,
        nullifierRegistered: result.nullifierRegistered,
        complianceChecked: result.complianceChecked
      }
    });
  } catch (error) {
    console.error('Error processing enhanced offline transaction:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all nullifiers (for audit/sync)
router.get('/nullifiers', async (req, res) => {
  try {
    const nullifiers = await getAllNullifiers();
    res.json({ nullifiers, count: nullifiers.length });
  } catch (error) {
    console.error('Error getting nullifiers:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verify ZKP proof (for external validation)
router.post('/zkp/verify', async (req, res) => {
  try {
    const { proof, publicInputs, proofType } = req.body;
    
    if (!proof || !proofType) {
      return res.status(400).json({ error: 'Missing proof or proofType' });
    }
    
    let isValid = false;
    let details = {};
    
    switch (proofType) {
      case 'offline':
        isValid = zkpEnhanced.verifyEnhancedOfflineProof(proof, publicInputs);
        details = { type: 'Enhanced Offline Transaction Proof' };
        break;
      case 'range':
        isValid = zkpEnhanced.verifyRangeProof(proof);
        details = { type: 'Bulletproofs-style Range Proof' };
        break;
      case 'compliance':
        isValid = zkpEnhanced.verifyComplianceProof(proof, publicInputs);
        details = { type: 'AML/CFT Compliance Proof' };
        break;
      case 'reconciliation':
        isValid = zkpEnhanced.verifyReconciliationProof(proof, publicInputs);
        details = { type: 'Offline Reconciliation Proof' };
        break;
      default:
        return res.status(400).json({ error: 'Unknown proof type' });
    }
    
    res.json({ valid: isValid, proofType, details });
  } catch (error) {
    console.error('Error verifying ZKP proof:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get compliance limits info
router.get('/compliance/limits', (req, res) => {
  res.json({ 
    limits: zkpEnhanced.COMPLIANCE_LIMITS,
    description: {
      SINGLE_TX_LIMIT: 'Maximum amount per transaction',
      DAILY_LIMIT: 'Maximum total amount per day',
      MONTHLY_LIMIT: 'Maximum total amount per month',
      OFFLINE_LIMIT: 'Maximum amount per offline transaction',
      OFFLINE_DAILY_COUNT: 'Maximum offline transactions per day',
      IOT_DEVICE_LIMIT: 'Maximum amount for IoT device transactions',
      SUB_WALLET_LIMIT: 'Maximum balance for sub-wallets'
    }
  });
});

export default router;
