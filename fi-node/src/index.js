import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import walletRoutes from './routes/wallet.js';
import transactionRoutes from './routes/transaction.js';
import { getFIStats, setFIInfo, creditFromAllocation, getWalletByPublicKey, receiveAllocationFromCB, getFIBalance, creditWalletDirect } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const FI_PORT = process.env.FI_PORT || 4001;
const FI_NAME = process.env.FI_NAME || 'FI-Alpha';
const FI_ID = process.env.FI_ID || 'fi-001';
const CENTRAL_BANK_URL = process.env.CENTRAL_BANK_URL || 'http://localhost:4000';

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/wallet', walletRoutes);
app.use('/api/transaction', transactionRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    node: 'Financial Institution',
    fiId: FI_ID,
    fiName: FI_NAME,
    timestamp: new Date().toISOString()
  });
});

// FI Info endpoint
app.get('/api/info', (req, res) => {
  res.json({
    success: true,
    fi: {
      id: FI_ID,
      name: FI_NAME,
      port: FI_PORT,
      centralBank: CENTRAL_BANK_URL
    }
  });
});

// FI Stats endpoint
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await getFIStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get FI fund balance
app.get('/api/balance', async (req, res) => {
  try {
    const balance = await getFIBalance();
    res.json({ success: true, balance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Receive fund allocation from Central Bank
// This is called by Central Bank when it allocates funds to this FI
app.post('/api/receive-allocation', async (req, res) => {
  try {
    const { allocationId, amount, description } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }
    
    console.log(`💰 Receiving allocation from Central Bank: ₹${amount}`);
    
    const result = await receiveAllocationFromCB(allocationId, amount, description);
    
    console.log(`   ✅ FI funds updated: Allocated ₹${result.totalAllocated}, Available ₹${result.availableBalance}`);
    
    res.json({ 
      success: true, 
      allocation: result,
      message: `Received ₹${amount} from Central Bank`
    });
  } catch (error) {
    console.error('Error receiving allocation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Receive cross-FI transaction from Central Bank
app.post('/api/transaction/receive-cross-fi', async (req, res) => {
  try {
    const { transactionId, sourceFi, fromWallet, toWallet, amount, description, zkpProof } = req.body;
    
    console.log(`📥 Receiving Cross-FI Transaction: ${transactionId}`);
    console.log(`   From: ${sourceFi.name} (${fromWallet})`);
    console.log(`   To: ${toWallet} : ₹${amount}`);
    
    if (zkpProof) {
      console.log(`   🔐 ZKP Proof: ${zkpProof.verificationTag || 'present'}`);
    }
    
    // Credit the target wallet directly (money transferred between FIs)
    const creditDescription = `Cross-FI transfer from ${sourceFi.name} (${fromWallet})${description ? ': ' + description : ''}`;
    await creditWalletDirect(toWallet, amount, creditDescription);
    
    console.log(`   ✅ Credited to wallet ${toWallet}`);
    
    res.json({ 
      success: true, 
      message: 'Cross-FI transaction received and processed',
      transactionId,
      credited: { wallet: toWallet, amount }
    });
  } catch (error) {
    console.error('Error receiving cross-FI transaction:', error);
    res.status(500).json({ error: error.message });
  }
});

// Register with Central Bank on startup
async function registerWithCentralBank() {
  try {
    const response = await fetch(`${CENTRAL_BANK_URL}/api/fi/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: FI_NAME,
        endpoint: `http://localhost:${FI_PORT}`
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      await setFIInfo('central_bank_id', data.fi.id);
      console.log(`✅ Registered with Central Bank as: ${data.fi.id}`);
    }
  } catch (error) {
    console.log(`⚠️  Could not register with Central Bank: ${error.message}`);
    console.log('   Central Bank may not be running. Will retry later.');
  }
}

// Auto-sync transactions with Central Bank every 30 seconds
async function autoSyncWithCentralBank() {
  try {
    const response = await fetch(`http://localhost:${FI_PORT}/api/transaction/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.synced > 0) {
        console.log(`🔄 Auto-sync: ${data.synced} transactions synced to Central Bank`);
      }
    }
  } catch (error) {
    // Silent fail for auto-sync
  }
}

// Start server
app.listen(FI_PORT, async () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log(`          🏛️  FI NODE: ${FI_NAME} STARTED 🏛️`);
  console.log('═══════════════════════════════════════════════════════');
  console.log(`   FI ID: ${FI_ID}`);
  console.log(`   Port: ${FI_PORT}`);
  console.log(`   Central Bank: ${CENTRAL_BANK_URL}`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('   Wallet Endpoints:');
  console.log('   - POST /api/wallet/create             Create wallet (with ZKP keys)');
  console.log('   - GET  /api/wallet/list               List all wallets');
  console.log('   - POST /api/wallet/:id/credit         Credit wallet');
  console.log('   - POST /api/wallet/:id/verify         Verify ZKP ownership');
  console.log('   - POST /api/wallet/:id/device/register Register IoT device');
  console.log('───────────────────────────────────────────────────────');
  console.log('   Transaction Endpoints:');
  console.log('   - POST /api/transaction/create        Create P2P transaction');
  console.log('   - POST /api/transaction/offline/create Create offline tx (ZKP)');
  console.log('   - POST /api/transaction/iot/pay       IoT device payment');
  console.log('   - POST /api/transaction/sync          Sync with Central Bank');
  console.log('   - GET  /api/transaction/offline/pending Pending offline txs');
  console.log('═══════════════════════════════════════════════════════');
  
  // Register with Central Bank
  await registerWithCentralBank();
  
  // Start auto-sync every 30 seconds
  setInterval(autoSyncWithCentralBank, 30000);
  console.log('🔄 Auto-sync enabled: transactions will sync every 30 seconds');
});

export default app;
