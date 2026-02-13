import express from 'express';
import { 
  registerFI, 
  getFI, 
  getAllFIs, 
  updateFI, 
  allocateFunds, 
  getAllocations,
  cleanupDuplicateFIs 
} from '../database.js';

const router = express.Router();

// Register a new Financial Institution (or return existing if endpoint matches)
router.post('/register', async (req, res) => {
  try {
    const { name, endpoint } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'FI name is required' });
    }
    const fi = await registerFI(name, endpoint);
    console.log(`✅ Registered new FI: ${fi.name} (${fi.id})`);
    res.json({ success: true, fi });
  } catch (error) {
    console.error('Error registering FI:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cleanup duplicate FIs (admin endpoint)
router.post('/cleanup', async (req, res) => {
  try {
    const result = await cleanupDuplicateFIs();
    console.log(`🧹 Cleaned up ${result.removed} duplicate FIs`);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get money supply summary (queries FIs for live wallet data)
router.get('/money-supply', async (req, res) => {
  try {
    const fis = await getAllFIs();
    const totalAllocatedToFIs = fis.reduce((sum, fi) => sum + (fi.allocated_funds || 0), 0);
    
    // Query each FI for live balance data
    const fiBreakdownPromises = fis.map(async (fi) => {
      let fiData = {
        inWallets: 0,
        inSubWallets: 0,
        totalInUserHands: 0,
        walletCount: 0,
        availableToCredit: 0
      };
      
      // Try to fetch live data from FI endpoint
      if (fi.endpoint) {
        try {
          const response = await fetch(`${fi.endpoint}/api/stats`);
          if (response.ok) {
            const data = await response.json();
            fiData = {
              inWallets: data.stats?.inWallets || data.stats?.totalBalance || 0,
              inSubWallets: data.stats?.inSubWallets || 0,
              totalInUserHands: data.stats?.totalInUserHands || data.stats?.totalBalance || 0,
              walletCount: data.stats?.totalWallets || 0,
              availableToCredit: data.stats?.availableToCredit || 0
            };
          }
        } catch (err) {
          console.log(`Could not reach FI ${fi.name}: ${err.message}`);
        }
      }
      
      return {
        id: fi.id,
        name: fi.name,
        allocated: fi.allocated_funds || 0,
        availableToCredit: fiData.availableToCredit,
        inWallets: fiData.inWallets,
        inSubWallets: fiData.inSubWallets,
        totalInUserHands: fiData.totalInUserHands,
        walletCount: fiData.walletCount
      };
    });
    
    const fiBreakdown = await Promise.all(fiBreakdownPromises);
    
    // Calculate totals from live FI data
    const totalInWallets = fiBreakdown.reduce((sum, fi) => sum + (fi.inWallets || 0), 0);
    const totalInSubWallets = fiBreakdown.reduce((sum, fi) => sum + (fi.inSubWallets || 0), 0);
    const totalInUserHands = fiBreakdown.reduce((sum, fi) => sum + (fi.totalInUserHands || 0), 0);
    const totalAvailableInFIs = fiBreakdown.reduce((sum, fi) => sum + (fi.availableToCredit || 0), 0);
    const totalWalletCount = fiBreakdown.reduce((sum, fi) => sum + (fi.walletCount || 0), 0);
    
    const isBalanced = Math.abs(totalAllocatedToFIs - (totalAvailableInFIs + totalInUserHands)) < 0.01;
    
    res.json({ 
      success: true,
      moneySupply: {
        totalCreated: totalAllocatedToFIs, // Money issued by Central Bank
        breakdown: {
          inFIs: totalAvailableInFIs,       // Available in FIs (not yet given to wallets)
          inWallets: totalInWallets,         // In wallet main balances
          inSubWallets: totalInSubWallets,   // In IoT sub-wallets
          totalInUserHands: totalInUserHands // Total with end users
        },
        totalWallets: totalWalletCount,
        fiBreakdown,
        isBalanced
      },
      note: isBalanced ? 'Money supply balanced' : 
        'Warning: Money supply imbalance detected'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all Financial Institutions
router.get('/list', async (req, res) => {
  try {
    const fis = await getAllFIs();
    res.json({ success: true, fis });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific FI by ID
router.get('/:id', async (req, res) => {
  try {
    const fi = await getFI(req.params.id);
    if (!fi) {
      return res.status(404).json({ error: 'Financial Institution not found' });
    }
    res.json({ success: true, fi });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update FI
router.put('/:id', async (req, res) => {
  try {
    const { name, status, endpoint } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (status) updates.status = status;
    if (endpoint) updates.endpoint = endpoint;
    
    const fi = await updateFI(req.params.id, updates);
    res.json({ success: true, fi });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Allocate funds to FI
router.post('/allocate', async (req, res) => {
  try {
    const { fiId, amount, description } = req.body;
    if (!fiId || !amount) {
      return res.status(400).json({ error: 'FI ID and amount are required' });
    }
    if (amount <= 0) {
      return res.status(400).json({ error: 'Amount must be positive' });
    }
    
    const result = await allocateFunds(fiId, amount, description);
    console.log(`💰 Allocated ₹${amount} to ${result.fi.name}`);
    
    // Notify the FI about the allocation so it can track its balance
    if (result.fi.endpoint) {
      try {
        const notifyResponse = await fetch(`${result.fi.endpoint}/api/receive-allocation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            allocationId: result.allocationId,
            amount: amount,
            description: description || 'Allocation from Central Bank'
          })
        });
        
        if (notifyResponse.ok) {
          console.log(`   ✅ FI ${result.fi.name} notified and acknowledged`);
        } else {
          console.log(`   ⚠️  FI acknowledged but with issues: ${notifyResponse.status}`);
        }
      } catch (notifyError) {
        console.log(`   ⚠️  Could not notify FI: ${notifyError.message}`);
        // Continue anyway - the allocation is recorded in Central Bank
      }
    }
    
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error allocating funds:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get allocations
router.get('/allocations/all', async (req, res) => {
  try {
    const { fiId } = req.query;
    const allocations = await getAllocations(fiId);
    res.json({ success: true, allocations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
