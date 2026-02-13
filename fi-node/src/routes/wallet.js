import express from 'express';
import { 
  createWallet, 
  getWallet,
  getWalletPublic,
  getAllWallets, 
  getWalletBalance,
  creditFromAllocation,
  verifyWalletOwnership,
  generateWalletProof,
  registerIoTDevice,
  getWalletDevices,
  revokeDevice,
  // New imports for sub-wallets and compliance
  createSubWallet,
  getSubWallet,
  getSubWalletsByMainWallet,
  allocateToSubWallet,
  returnFromSubWallet,
  revokeSubWallet,
  createSubWalletPayment,
  getComplianceStatus,
  checkTransactionCompliance,
  getWalletNullifiers,
  getWalletSerialNumbers,
  issueSerialNumbers,
  getSecureElementLogs,
  getMonotonicCounter,
  setWalletOfflineMode,
  setSubWalletOfflineMode,
  // IoT sync functions
  createIoTOfflineTransaction,
  getPendingIoTTransactions,
  syncIoTToWallet,
  syncAllSubWalletsToWallet,
  getWalletIoTTransactions,
  getSyncStatus,
  getTransactionsPendingSyncToFI,
  markIoTTransactionsSyncedToFI,
  // IoT transaction history
  getSubWalletTransactions
} from '../database.js';

const router = express.Router();

// Create a new wallet (with Secure Element keypair)
router.post('/create', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Wallet name is required' });
    }
    const wallet = await createWallet(name);
    console.log(`✅ Created new wallet: ${wallet.name} (${wallet.id})`);
    console.log(`   🔐 Public Key: ${wallet.public_key}`);
    
    // Return wallet without private key for security
    const { private_key, ...publicWallet } = wallet;
    res.json({ success: true, wallet: publicWallet });
  } catch (error) {
    console.error('Error creating wallet:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all wallets (public info only)
router.get('/list', async (req, res) => {
  try {
    const wallets = await getAllWallets();
    res.json({ success: true, wallets });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific wallet (public info)
router.get('/:id', async (req, res) => {
  try {
    const wallet = await getWalletPublic(req.params.id);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    res.json({ success: true, wallet });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get wallet balance
router.get('/:id/balance', async (req, res) => {
  try {
    const wallet = await getWalletPublic(req.params.id);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    res.json({ 
      success: true, 
      balance: wallet.balance,
      offlineBalance: wallet.offline_balance || 0,
      availableBalance: wallet.balance - (wallet.offline_balance || 0)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Credit wallet from FI funds
router.post('/:id/credit', async (req, res) => {
  try {
    const { amount, description } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }
    
    const transaction = await creditFromAllocation(req.params.id, amount, description);
    console.log(`💰 Credited ₹${amount} to wallet ${req.params.id}`);
    res.json({ success: true, transaction });
  } catch (error) {
    console.error('Error crediting wallet:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== ZKP Authentication Endpoints ==========

// Verify wallet ownership with ZKP proof
router.post('/:id/verify', async (req, res) => {
  try {
    const { proof } = req.body;
    if (!proof) {
      return res.status(400).json({ error: 'Proof is required' });
    }
    
    const result = await verifyWalletOwnership(req.params.id, proof);
    console.log(`🔐 Wallet verification for ${req.params.id}: ${result.valid ? 'SUCCESS' : 'FAILED'}`);
    res.json({ success: result.valid, verified: result.valid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate ownership proof for wallet
router.post('/:id/proof', async (req, res) => {
  try {
    const proof = await generateWalletProof(req.params.id);
    console.log(`🔐 Generated ZKP proof for wallet ${req.params.id}`);
    res.json({ success: true, proof });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== IoT Device Management ==========

// Register an IoT device to wallet
router.post('/:id/device/register', async (req, res) => {
  try {
    const { deviceType, deviceName } = req.body;
    if (!deviceType) {
      return res.status(400).json({ error: 'Device type is required' });
    }
    
    const validTypes = ['smartwatch', 'smart_ring', 'pos', 'transport_card', 'mobile'];
    if (!validTypes.includes(deviceType)) {
      return res.status(400).json({ error: `Invalid device type. Must be one of: ${validTypes.join(', ')}` });
    }
    
    const device = await registerIoTDevice(req.params.id, deviceType, deviceName || `${deviceType}-${Date.now()}`);
    console.log(`📱 Registered IoT device: ${device.device_type} (${device.id}) to wallet ${req.params.id}`);
    res.json({ success: true, device });
  } catch (error) {
    console.error('Error registering device:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all devices for a wallet
router.get('/:id/devices', async (req, res) => {
  try {
    const devices = await getWalletDevices(req.params.id);
    res.json({ success: true, devices });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Revoke an IoT device
router.delete('/:id/device/:deviceId', async (req, res) => {
  try {
    const result = await revokeDevice(req.params.deviceId);
    console.log(`🚫 Revoked device ${req.params.deviceId}`);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== SUB-WALLET OPERATIONS (Paper Section III-B) ==========

// Create sub-wallet for IoT device
router.post('/:id/subwallet/create', async (req, res) => {
  try {
    const { deviceId, allocatedBalance, spendingLimit } = req.body;
    if (!deviceId || !allocatedBalance) {
      return res.status(400).json({ error: 'deviceId and allocatedBalance are required' });
    }
    
    const subWallet = await createSubWallet(req.params.id, deviceId, allocatedBalance, spendingLimit);
    console.log(`📱 Created sub-wallet ${subWallet.id} for device ${deviceId}`);
    res.json({ success: true, subWallet });
  } catch (error) {
    console.error('Error creating sub-wallet:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all sub-wallets for main wallet
router.get('/:id/subwallets', async (req, res) => {
  try {
    const subWallets = await getSubWalletsByMainWallet(req.params.id);
    res.json({ success: true, subWallets });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get transaction history for all IoT devices under a main wallet
router.get('/:id/iot-transactions', async (req, res) => {
  try {
    const subWallets = await getSubWalletsByMainWallet(req.params.id);
    
    const deviceHistories = [];
    let totalTransactions = 0;
    let totalOutgoing = 0;
    let totalIncoming = 0;
    
    for (const subWallet of subWallets) {
      try {
        const history = await getSubWalletTransactions(subWallet.id);
        deviceHistories.push({
          device: history.subWallet,
          transactions: history.transactions,
          summary: history.summary
        });
        totalTransactions += history.summary.total_transactions;
        totalOutgoing += history.summary.total_outgoing;
        totalIncoming += history.summary.total_incoming;
      } catch (err) {
        // Skip if sub-wallet has issues
      }
    }
    
    res.json({ 
      success: true, 
      walletId: req.params.id,
      devices: deviceHistories,
      overallSummary: {
        total_devices: subWallets.length,
        total_transactions: totalTransactions,
        total_outgoing: totalOutgoing,
        total_incoming: totalIncoming,
        net_flow: totalIncoming - totalOutgoing
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Allocate funds to sub-wallet
router.post('/:id/subwallet/:subId/allocate', async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }
    
    const subWallet = await allocateToSubWallet(req.params.subId, amount);
    console.log(`💰 Allocated ₹${amount} to sub-wallet ${req.params.subId}`);
    res.json({ success: true, subWallet });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Return funds from sub-wallet to main wallet
router.post('/:id/subwallet/:subId/return', async (req, res) => {
  try {
    const { amount } = req.body;
    const result = await returnFromSubWallet(req.params.subId, amount);
    console.log(`💰 Returned ₹${result.returnedAmount} from sub-wallet ${req.params.subId}`);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Revoke sub-wallet - returns all balance to main wallet and deactivates
router.post('/:id/subwallet/:subId/revoke', async (req, res) => {
  try {
    const result = await revokeSubWallet(req.params.subId);
    console.log(`🚫 Revoked sub-wallet ${req.params.subId} - ₹${result.returnedAmount} returned to main wallet`);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Toggle wallet offline mode
router.post('/:id/offline-mode', async (req, res) => {
  try {
    const { offline } = req.body;
    const result = await setWalletOfflineMode(req.params.id, offline);
    console.log(`${offline ? '📴' : '📶'} Wallet ${req.params.id} is now ${offline ? 'OFFLINE' : 'ONLINE'}`);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Toggle sub-wallet offline mode
router.post('/:id/subwallet/:subId/offline-mode', async (req, res) => {
  try {
    const { offline } = req.body;
    const result = await setSubWalletOfflineMode(req.params.subId, offline);
    console.log(`${offline ? '📴' : '📶'} Sub-wallet ${req.params.subId} is now ${offline ? 'OFFLINE' : 'ONLINE'}`);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create payment from sub-wallet
router.post('/subwallet/:subId/pay', async (req, res) => {
  try {
    const { authToken, toWallet, amount, description } = req.body;
    if (!authToken || !toWallet || !amount) {
      return res.status(400).json({ error: 'authToken, toWallet, and amount are required' });
    }
    
    const transaction = await createSubWalletPayment(req.params.subId, authToken, toWallet, amount, description);
    console.log(`💸 Sub-wallet payment: ₹${amount} from ${req.params.subId} to ${toWallet}`);
    res.json({ success: true, transaction });
  } catch (error) {
    console.error('Error in sub-wallet payment:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== COMPLIANCE ENDPOINTS (Paper Section III-C) ==========

// Get compliance status for wallet
router.get('/:id/compliance', async (req, res) => {
  try {
    const status = await getComplianceStatus(req.params.id);
    if (!status) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    res.json({ success: true, compliance: status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check if transaction would be compliant
router.post('/:id/compliance/check', async (req, res) => {
  try {
    const { amount, isOffline } = req.body;
    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }
    
    const result = await checkTransactionCompliance(req.params.id, amount, isOffline || false);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== NULLIFIER & SERIAL NUMBER ENDPOINTS ==========

// Get nullifiers for wallet
router.get('/:id/nullifiers', async (req, res) => {
  try {
    const nullifiers = await getWalletNullifiers(req.params.id);
    res.json({ success: true, nullifiers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get serial numbers for wallet
router.get('/:id/serial-numbers', async (req, res) => {
  try {
    const serialNumbers = await getWalletSerialNumbers(req.params.id);
    res.json({ success: true, serialNumbers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Issue serial numbers for wallet balance
router.post('/:id/serial-numbers/issue', async (req, res) => {
  try {
    const wallet = await getWalletPublic(req.params.id);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    
    const result = await issueSerialNumbers(req.params.id, wallet.balance);
    console.log(`🔢 Issued ${result.serialNumbers.length} serial numbers for wallet ${req.params.id}`);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== SECURE ELEMENT ENDPOINTS ==========

// Get secure element logs
router.get('/:id/secure-element/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const logs = await getSecureElementLogs(req.params.id, limit);
    const counter = await getMonotonicCounter(req.params.id);
    res.json({ success: true, monotonicCounter: counter, logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// IOT OFFLINE TRANSACTION & SYNC ENDPOINTS
// ============================================

// Create IoT offline transaction from sub-wallet
router.post('/subwallet/:subId/offline-transaction', async (req, res) => {
  try {
    const { subId } = req.params;
    const { toWallet, amount, description, toFi, zkpProof } = req.body;
    
    if (!toWallet || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid toWallet and amount are required' });
    }
    
    const transaction = await createIoTOfflineTransaction(subId, toWallet, amount, description, toFi, zkpProof);
    console.log(`📱 IoT Offline TX: ${subId} → ${toWallet} : ₹${amount}`);
    
    res.json({ success: true, transaction });
  } catch (error) {
    console.error('Error creating IoT offline transaction:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get pending IoT transactions for a sub-wallet
router.get('/subwallet/:subId/pending-transactions', async (req, res) => {
  try {
    const transactions = await getPendingIoTTransactions(req.params.subId);
    res.json({ success: true, transactions, count: transactions.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get complete transaction history for a sub-wallet/IoT device
router.get('/subwallet/:subId/transactions', async (req, res) => {
  try {
    const history = await getSubWalletTransactions(req.params.subId);
    res.json({ success: true, ...history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sync sub-wallet transactions to main wallet
router.post('/subwallet/:subId/sync', async (req, res) => {
  try {
    const result = await syncIoTToWallet(req.params.subId);
    console.log(`🔄 Sub-wallet ${req.params.subId} synced: ${result.synced} transactions`);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error syncing sub-wallet:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sync all sub-wallets to main wallet
router.post('/:id/sync-subwallets', async (req, res) => {
  try {
    const result = await syncAllSubWalletsToWallet(req.params.id);
    console.log(`🔄 Wallet ${req.params.id} sub-wallets synced: ${result.totalSynced} transactions`);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error syncing sub-wallets to wallet:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all IoT transactions for a wallet
router.get('/:id/iot-transactions', async (req, res) => {
  try {
    const transactions = await getWalletIoTTransactions(req.params.id);
    res.json({ success: true, transactions, count: transactions.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get sync status summary
router.get('/sync/status', async (req, res) => {
  try {
    const status = await getSyncStatus();
    res.json({ success: true, ...status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get transactions pending sync to FI
router.get('/sync/pending-fi', async (req, res) => {
  try {
    const pending = await getTransactionsPendingSyncToFI();
    res.json({ success: true, ...pending });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// WALLET VALIDATION ENDPOINTS
// ============================================

// Check if a wallet or sub-wallet exists locally
router.get('/exists/:walletId', async (req, res) => {
  try {
    const { walletId } = req.params;
    
    // Check if it's a main wallet
    const wallet = await getWallet(walletId);
    if (wallet) {
      return res.json({ 
        exists: true, 
        wallet_type: 'wallet',
        wallet_id: wallet.id,
        wallet_name: wallet.name
      });
    }
    
    // Check if it's a sub-wallet
    const subWallet = await getSubWallet(walletId);
    if (subWallet) {
      const mainWallet = await getWallet(subWallet.main_wallet_id);
      return res.json({ 
        exists: true, 
        wallet_type: 'sub_wallet',
        wallet_id: subWallet.id,
        wallet_name: mainWallet ? `${mainWallet.name} - ${subWallet.device_type}` : subWallet.id,
        main_wallet_id: subWallet.main_wallet_id,
        device_type: subWallet.device_type
      });
    }
    
    res.json({ exists: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
