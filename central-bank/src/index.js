import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import fiRoutes from './routes/fi.js';
import ledgerRoutes from './routes/ledger.js';
import complianceRoutes from './routes/compliance.js';
import { getSystemStats } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const app = express();
const PORT = process.env.CB_PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/fi', fiRoutes);
app.use('/api/ledger', ledgerRoutes);
app.use('/api/compliance', complianceRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    node: 'Central Bank',
    timestamp: new Date().toISOString()
  });
});

// System stats endpoint
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await getSystemStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('          🏦 CENTRAL BANK NODE STARTED 🏦');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`   Port: ${PORT}`);
  console.log(`   Ledger DB: ${path.join(__dirname, '../data/ledger.db')}`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   Core Endpoints:');
  console.log('   - GET  /api/health             Health check');
  console.log('   - GET  /api/stats              System statistics');
  console.log('   - GET  /api/fi/list            List all FIs');
  console.log('   - POST /api/fi/register        Register new FI');
  console.log('   - POST /api/fi/allocate        Allocate funds to FI');
  console.log('───────────────────────────────────────────────────────────────');
  console.log('   Compliance Control:');
  console.log('   - GET  /api/compliance/dashboard   Dashboard summary');
  console.log('   - GET  /api/compliance/rules       Get compliance rules');
  console.log('   - POST /api/compliance/rules       Set compliance rule');
  console.log('   - GET  /api/compliance/alerts      Get all alerts');
  console.log('   - POST /api/compliance/freeze      Freeze wallet/device');
  console.log('   - POST /api/compliance/unfreeze    Unfreeze wallet/device');
  console.log('   - GET  /api/compliance/watchlist   Get watchlist');
  console.log('   - POST /api/compliance/watchlist   Add to watchlist');
  console.log('═══════════════════════════════════════════════════════════════');
});

export default app;
