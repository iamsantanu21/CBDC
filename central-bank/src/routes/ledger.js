import express from 'express';
import { 
  getLedger, 
  getLedgerFiltered,
  getIoTTransactionStats,
  syncTransactions, 
  getSystemStats, 
  routeCrossFITransaction, 
  getFI, 
  getFIByName, 
  getPendingCrossFIForTarget,
  // New imports for enhanced features
  registerNullifier,
  checkNullifierGlobal,
  getNullifiersByFI,
  syncNullifiers,
  logComplianceAudit,
  updateFIComplianceStatus,
  getFIComplianceStatus,
  getComplianceAudits,
  resetDailyCompliance,
  resetMonthlyCompliance,
  getComplianceSummary
} from '../database.js';
import * as zkpEnhanced from '../../../shared/zkp-enhanced.js';

const router = express.Router();

// Get all ledger entries
router.get('/', async (req, res) => {
  try {
    const ledger = await getLedger();
    res.json({ success: true, ledger });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get filtered ledger entries
router.get('/filter', async (req, res) => {
  try {
    const { fi_id, is_iot, transaction_type, wallet_id, device_id, from_date, to_date, limit } = req.query;
    
    const filters = {};
    if (fi_id) filters.fi_id = fi_id;
    if (is_iot !== undefined) filters.is_iot_transaction = is_iot === 'true';
    if (transaction_type) filters.transaction_type = transaction_type;
    if (wallet_id) filters.wallet_id = wallet_id;
    if (device_id) filters.device_id = device_id;
    if (from_date) filters.from_date = from_date;
    if (to_date) filters.to_date = to_date;
    if (limit) filters.limit = parseInt(limit);
    
    const ledger = await getLedgerFiltered(filters);
    res.json({ success: true, ledger, count: ledger.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get IoT transactions only
router.get('/iot', async (req, res) => {
  try {
    const { fi_id, device_id, limit } = req.query;
    
    const filters = { is_iot_transaction: true };
    if (fi_id) filters.fi_id = fi_id;
    if (device_id) filters.device_id = device_id;
    if (limit) filters.limit = parseInt(limit);
    
    const transactions = await getLedgerFiltered(filters);
    res.json({ success: true, transactions, count: transactions.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get IoT transaction statistics
router.get('/iot/stats', async (req, res) => {
  try {
    const stats = await getIoTTransactionStats();
    res.json({ success: true, ...stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sync transactions from FI
router.post('/sync', async (req, res) => {
  try {
    const { fiId, transactions } = req.body;
    if (!fiId || !transactions) {
      return res.status(400).json({ error: 'FI ID and transactions are required' });
    }
    
    const results = await syncTransactions(fiId, transactions);
    console.log(`📥 Synced ${transactions.length} transactions from FI ${fiId}`);
    res.json({ success: true, synced: results.length, results });
  } catch (error) {
    console.error('Error syncing transactions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route cross-FI transaction
router.post('/cross-fi', async (req, res) => {
  try {
    const { sourceFiId, sourceFiName, targetFiId, targetFiName, fromWallet, toWallet, toSubWallet, amount, description, zkpProof, recipientType } = req.body;
    
    if ((!sourceFiId && !sourceFiName) || (!targetFiId && !targetFiName)) {
      return res.status(400).json({ error: 'Source and target FI (ID or name) are required' });
    }
    if (!fromWallet || !amount) {
      return res.status(400).json({ error: 'fromWallet and amount are required' });
    }
    // Validate recipient based on type
    if (recipientType === 'subwallet') {
      if (!toWallet || !toSubWallet) {
        return res.status(400).json({ error: 'toWallet and toSubWallet are required for sub-wallet transfers' });
      }
    } else {
      if (!toWallet) {
        return res.status(400).json({ error: 'toWallet is required' });
      }
    }
    
    // Resolve source FI ID from name if needed
    let resolvedSourceFiId = sourceFiId;
    if (!sourceFiId && sourceFiName) {
      const sourceFI = await getFIByName(sourceFiName);
      if (!sourceFI) {
        return res.status(404).json({ error: `Source FI "${sourceFiName}" not found` });
      }
      resolvedSourceFiId = sourceFI.id;
    }
    
    // Resolve target FI ID from name if needed
    let resolvedTargetFiId = targetFiId;
    if (!targetFiId && targetFiName) {
      const targetFI = await getFIByName(targetFiName);
      if (!targetFI) {
        return res.status(404).json({ error: `Target FI "${targetFiName}" not found` });
      }
      resolvedTargetFiId = targetFI.id;
    }
    
    const result = await routeCrossFITransaction(
      resolvedSourceFiId, 
      resolvedTargetFiId, 
      fromWallet, 
      toWallet, 
      amount, 
      description,
      zkpProof
    );
    
    const isSubWalletTransfer = recipientType === 'subwallet';
    console.log(`🔄 Cross-FI Transaction Routed: ${result.sourceFi.name} → ${result.targetFi.name}`);
    console.log(`   💸 ${fromWallet} → ${toWallet}${isSubWalletTransfer ? '/' + toSubWallet : ''} : ₹${amount}`);
    
    // Attempt to notify target FI
    if (result.targetFi.endpoint) {
      try {
        // Choose endpoint based on recipient type
        const endpoint = isSubWalletTransfer 
          ? `${result.targetFi.endpoint}/api/transaction/receive-cross-fi-subwallet`
          : `${result.targetFi.endpoint}/api/transaction/receive-cross-fi`;
        
        const payload = {
          transactionId: result.transactionId,
          sourceFi: result.sourceFi,
          fromWallet: result.fromWallet,
          toWallet: result.toWallet,
          amount: result.amount,
          description: result.description,
          zkpProof: result.zkpProof
        };
        
        // Add sub-wallet ID for sub-wallet transfers
        if (isSubWalletTransfer) {
          payload.toSubWallet = toSubWallet;
        }
        
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        console.log(`   ✅ Target FI notified${isSubWalletTransfer ? ' (sub-wallet)' : ''}`);
      } catch (e) {
        console.log(`   ⚠️ Could not notify target FI: ${e.message}`);
      }
    }
    
    res.json({ success: true, routing: result });
  } catch (error) {
    console.error('Error routing cross-FI transaction:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get pending cross-FI transactions for a specific FI
router.get('/cross-fi/pending/:fiId', async (req, res) => {
  try {
    const pending = await getPendingCrossFIForTarget(req.params.fiId);
    res.json({ success: true, pendingTransactions: pending });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get system statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await getSystemStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// NULLIFIER REGISTRY ENDPOINTS
// ============================================

// Check if a nullifier has been used (double-spend prevention)
router.get('/nullifier/check/:nullifier', async (req, res) => {
  try {
    const existing = await checkNullifierGlobal(req.params.nullifier);
    res.json({ 
      exists: !!existing, 
      nullifier: req.params.nullifier,
      details: existing 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Register a new nullifier
router.post('/nullifier/register', async (req, res) => {
  try {
    const { nullifier, fiId, transactionId, serialNumber, amount } = req.body;
    
    if (!nullifier || !fiId || !transactionId || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const result = await registerNullifier(nullifier, fiId, transactionId, serialNumber, amount);
    res.status(201).json({ success: true, nullifier: result });
  } catch (error) {
    console.error('Error registering nullifier:', error);
    if (error.message.includes('Double-spend')) {
      return res.status(409).json({ error: error.message, doubleSpend: true });
    }
    res.status(500).json({ error: error.message });
  }
});

// Sync nullifiers from FI (bulk registration)
router.post('/nullifier/sync', async (req, res) => {
  try {
    const { fiId, nullifiers } = req.body;
    
    if (!fiId || !nullifiers || !Array.isArray(nullifiers)) {
      return res.status(400).json({ error: 'FI ID and nullifiers array are required' });
    }
    
    const result = await syncNullifiers(fiId, nullifiers);
    console.log(`🔒 Synced ${result.registered} nullifiers from FI ${fiId}`);
    
    res.json({ 
      success: true, 
      registered: result.registered, 
      errors: result.errors 
    });
  } catch (error) {
    console.error('Error syncing nullifiers:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get nullifiers by FI
router.get('/nullifier/fi/:fiId', async (req, res) => {
  try {
    const nullifiers = await getNullifiersByFI(req.params.fiId);
    res.json({ success: true, nullifiers, count: nullifiers.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// COMPLIANCE ENDPOINTS
// ============================================

// Get compliance summary
router.get('/compliance/summary', async (req, res) => {
  try {
    const summary = await getComplianceSummary();
    res.json({ success: true, summary });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get compliance limits (from paper)
router.get('/compliance/limits', (req, res) => {
  res.json({ 
    success: true,
    limits: zkpEnhanced.COMPLIANCE_LIMITS,
    description: {
      SINGLE_TX_LIMIT: 'Maximum amount per single transaction (₹50,000)',
      DAILY_LIMIT: 'Maximum total amount per day (₹2,00,000)',
      MONTHLY_LIMIT: 'Maximum total amount per month (₹10,00,000)',
      OFFLINE_LIMIT: 'Maximum amount per offline transaction (₹10,000)',
      OFFLINE_DAILY_COUNT: 'Maximum number of offline transactions per day (10)',
      IOT_DEVICE_LIMIT: 'Maximum amount for IoT device transactions (₹5,000)',
      SUB_WALLET_LIMIT: 'Maximum balance for sub-wallets (₹25,000)'
    }
  });
});

// Log compliance audit from FI
router.post('/compliance/audit', async (req, res) => {
  try {
    const { fiId, walletId, auditType, amount, dailyTotal, monthlyTotal, limitType, exceeded, details } = req.body;
    
    if (!fiId || !walletId || !auditType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const result = await logComplianceAudit(
      fiId, walletId, auditType, amount, dailyTotal, monthlyTotal, limitType, exceeded, details
    );
    
    // Update FI compliance status
    await updateFIComplianceStatus(fiId, amount || 0, false, exceeded);
    
    res.status(201).json({ success: true, audit: result });
  } catch (error) {
    console.error('Error logging compliance audit:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get compliance audits
router.get('/compliance/audits', async (req, res) => {
  try {
    const { fiId, limitType, exceededOnly } = req.query;
    const audits = await getComplianceAudits(fiId, limitType, exceededOnly === 'true');
    res.json({ success: true, audits, count: audits.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get FI compliance status
router.get('/compliance/fi/:fiId', async (req, res) => {
  try {
    const status = await getFIComplianceStatus(req.params.fiId);
    if (!status) {
      return res.status(404).json({ error: 'No compliance status found for this FI' });
    }
    res.json({ success: true, status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset daily compliance (admin endpoint)
router.post('/compliance/reset/daily', async (req, res) => {
  try {
    const result = await resetDailyCompliance();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset monthly compliance (admin endpoint)
router.post('/compliance/reset/monthly', async (req, res) => {
  try {
    const result = await resetMonthlyCompliance();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ZKP VERIFICATION ENDPOINTS
// ============================================

// Verify any ZKP proof
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

export default router;
