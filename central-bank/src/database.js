import initSqlJs from 'sql.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as zkpEnhanced from '../../shared/zkp-enhanced.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '../data');
const dbPath = path.join(dataDir, 'ledger.db');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db = null;

// Initialize database
async function initDB() {
  const SQL = await initSqlJs();
  
  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  
  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS financial_institutions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      allocated_funds REAL DEFAULT 0,
      available_balance REAL DEFAULT 0,
      endpoint TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS ledger (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      fi_id TEXT NOT NULL,
      from_wallet TEXT,
      to_wallet TEXT,
      amount REAL NOT NULL,
      transaction_type TEXT NOT NULL,
      description TEXT,
      timestamp TEXT DEFAULT (datetime('now')),
      device_id TEXT,
      main_wallet_id TEXT,
      is_iot_transaction INTEGER DEFAULT 0,
      monotonic_counter INTEGER,
      nullifier TEXT
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS fund_allocations (
      id TEXT PRIMARY KEY,
      fi_id TEXT NOT NULL,
      amount REAL NOT NULL,
      allocation_type TEXT NOT NULL,
      description TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    )
  `);
  
  // ============================================
  // ENHANCED TABLES FOR PAPER COMPLIANCE
  // ============================================
  
  // Global nullifier registry (prevents double-spending across all FIs)
  db.run(`
    CREATE TABLE IF NOT EXISTS nullifier_registry (
      id TEXT PRIMARY KEY,
      nullifier TEXT UNIQUE NOT NULL,
      fi_id TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      serial_number TEXT,
      amount REAL NOT NULL,
      registered_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (fi_id) REFERENCES financial_institutions(id)
    )
  `);
  
  // Compliance audit log (AML/CFT reporting)
  db.run(`
    CREATE TABLE IF NOT EXISTS compliance_audit (
      id TEXT PRIMARY KEY,
      fi_id TEXT NOT NULL,
      wallet_id TEXT NOT NULL,
      audit_type TEXT NOT NULL,
      amount REAL,
      daily_total REAL,
      monthly_total REAL,
      limit_type TEXT,
      exceeded BOOLEAN DEFAULT 0,
      details TEXT,
      audit_date TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (fi_id) REFERENCES financial_institutions(id)
    )
  `);
  
  // FI compliance status tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS fi_compliance_status (
      id TEXT PRIMARY KEY,
      fi_id TEXT UNIQUE NOT NULL,
      total_daily_volume REAL DEFAULT 0,
      total_monthly_volume REAL DEFAULT 0,
      total_offline_transactions INTEGER DEFAULT 0,
      flagged_transactions INTEGER DEFAULT 0,
      last_audit_date TEXT,
      compliance_score REAL DEFAULT 100,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (fi_id) REFERENCES financial_institutions(id)
    )
  `);

  // ============================================
  // CENTRAL BANK COMPLIANCE CONTROL TABLES
  // ============================================
  
  // Compliance rules set by Central Bank
  db.run(`
    CREATE TABLE IF NOT EXISTS cb_compliance_rules (
      id TEXT PRIMARY KEY,
      rule_name TEXT NOT NULL,
      rule_type TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      limit_value REAL,
      daily_limit REAL,
      monthly_limit REAL,
      max_offline_amount REAL,
      max_offline_count INTEGER,
      is_active INTEGER DEFAULT 1,
      priority INTEGER DEFAULT 1,
      description TEXT,
      created_by TEXT DEFAULT 'system',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  
  // Wallet/Device watchlist and blacklist
  db.run(`
    CREATE TABLE IF NOT EXISTS cb_watchlist (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      fi_id TEXT,
      status TEXT NOT NULL,
      risk_level TEXT DEFAULT 'medium',
      reason TEXT,
      added_by TEXT DEFAULT 'system',
      added_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT,
      UNIQUE(entity_type, entity_id, fi_id)
    )
  `);
  
  // Central Bank alerts
  db.run(`
    CREATE TABLE IF NOT EXISTS cb_alerts (
      id TEXT PRIMARY KEY,
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      fi_id TEXT,
      wallet_id TEXT,
      device_id TEXT,
      transaction_id TEXT,
      amount REAL,
      message TEXT NOT NULL,
      details TEXT,
      is_read INTEGER DEFAULT 0,
      is_resolved INTEGER DEFAULT 0,
      resolved_by TEXT,
      resolved_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  
  // Alert rules (auto-trigger conditions)
  db.run(`
    CREATE TABLE IF NOT EXISTS cb_alert_rules (
      id TEXT PRIMARY KEY,
      rule_name TEXT NOT NULL,
      condition_type TEXT NOT NULL,
      threshold_value REAL,
      threshold_count INTEGER,
      time_window_minutes INTEGER DEFAULT 60,
      severity TEXT DEFAULT 'medium',
      is_active INTEGER DEFAULT 1,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  
  // Frozen accounts/wallets
  db.run(`
    CREATE TABLE IF NOT EXISTS cb_frozen_accounts (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      fi_id TEXT,
      frozen_by TEXT DEFAULT 'system',
      reason TEXT,
      frozen_at TEXT DEFAULT (datetime('now')),
      unfrozen_at TEXT,
      is_frozen INTEGER DEFAULT 1,
      UNIQUE(entity_type, entity_id, fi_id)
    )
  `);

  // Insert default compliance rules if empty
  const rulesCount = db.exec('SELECT COUNT(*) FROM cb_compliance_rules');
  if (rulesCount[0]?.values[0]?.[0] === 0) {
    // Default rules
    db.run(`INSERT INTO cb_compliance_rules (id, rule_name, rule_type, target_type, limit_value, daily_limit, monthly_limit, max_offline_amount, max_offline_count, description) VALUES 
      ('rule-wallet-default', 'Default Wallet Limits', 'transaction_limit', 'wallet', 50000, 100000, 500000, 5000, 10, 'Default limits for all wallets'),
      ('rule-iot-default', 'Default IoT Device Limits', 'transaction_limit', 'iot_device', 2000, 10000, 50000, 500, 20, 'Default limits for IoT/sub-wallets'),
      ('rule-offline-limit', 'Offline Transaction Limit', 'offline_limit', 'all', 5000, 10000, 50000, 5000, 10, 'Maximum offline transaction limits'),
      ('rule-high-value', 'High Value Alert', 'alert_trigger', 'all', 25000, NULL, NULL, NULL, NULL, 'Alert for transactions above ₹25,000')
    `);
  }
  
  // Insert default alert rules if empty
  const alertRulesCount = db.exec('SELECT COUNT(*) FROM cb_alert_rules');
  if (alertRulesCount[0]?.values[0]?.[0] === 0) {
    db.run(`INSERT INTO cb_alert_rules (id, rule_name, condition_type, threshold_value, threshold_count, time_window_minutes, severity, description) VALUES 
      ('alert-high-value', 'High Value Transaction', 'single_amount', 25000, NULL, NULL, 'high', 'Single transaction exceeds ₹25,000'),
      ('alert-rapid-tx', 'Rapid Transactions', 'transaction_count', NULL, 10, 5, 'medium', 'More than 10 transactions in 5 minutes'),
      ('alert-daily-limit', 'Daily Limit Exceeded', 'daily_total', 100000, NULL, NULL, 'high', 'Daily total exceeds ₹1,00,000'),
      ('alert-suspicious-pattern', 'Suspicious Pattern', 'round_amounts', 10000, 3, 30, 'critical', '3+ round amount transactions in 30 mins'),
      ('alert-offline-abuse', 'Offline Transaction Abuse', 'offline_count', NULL, 5, 60, 'high', 'Too many offline transactions'),
      ('alert-new-device', 'New Device Activity', 'new_device_high_value', 5000, NULL, NULL, 'medium', 'New device transacting high amounts')
    `);
  }

  saveDB();
  console.log('📦 Central Bank database initialized');
  return db;
}

// Save database to file
function saveDB() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

// Get database instance
export async function getDB() {
  if (!db) {
    await initDB();
  }
  return db;
}

// Financial Institution Operations
export async function registerFI(name, endpoint) {
  await getDB();
  
  // Check if FI with same endpoint already exists (prevent duplicates on restart)
  const existing = await getFIByEndpoint(endpoint);
  if (existing) {
    // Update the existing FI's name if it changed
    if (existing.name !== name) {
      await updateFI(existing.id, { name });
      return getFI(existing.id);
    }
    return existing;
  }
  
  const id = `fi-${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();
  
  db.run(`
    INSERT INTO financial_institutions (id, name, endpoint, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `, [id, name, endpoint, now, now]);
  
  saveDB();
  return getFI(id);
}

// Get FI by endpoint (for duplicate detection)
export async function getFIByEndpoint(endpoint) {
  await getDB();
  const result = db.exec(`SELECT * FROM financial_institutions WHERE endpoint = ?`, [endpoint]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  
  const columns = result[0].columns;
  const values = result[0].values[0];
  return Object.fromEntries(columns.map((col, i) => [col, values[i]]));
}

// Clean up duplicate FIs (keep only the latest for each endpoint)
export async function cleanupDuplicateFIs() {
  await getDB();
  
  // Get all unique endpoints with their latest FI
  const result = db.exec(`
    SELECT endpoint, MAX(created_at) as latest_date 
    FROM financial_institutions 
    GROUP BY endpoint
  `);
  
  if (result.length === 0) return { removed: 0 };
  
  // Get IDs to keep
  const keepIds = [];
  for (const row of result[0].values) {
    const [endpoint, latestDate] = row;
    const fi = db.exec(`SELECT id FROM financial_institutions WHERE endpoint = ? AND created_at = ?`, [endpoint, latestDate]);
    if (fi.length > 0 && fi[0].values.length > 0) {
      keepIds.push(fi[0].values[0][0]);
    }
  }
  
  // Delete all FIs not in keepIds
  const beforeCount = db.exec('SELECT COUNT(*) FROM financial_institutions')[0].values[0][0];
  
  if (keepIds.length > 0) {
    const placeholders = keepIds.map(() => '?').join(',');
    db.run(`DELETE FROM financial_institutions WHERE id NOT IN (${placeholders})`, keepIds);
  }
  
  const afterCount = db.exec('SELECT COUNT(*) FROM financial_institutions')[0].values[0][0];
  
  saveDB();
  return { removed: beforeCount - afterCount, remaining: afterCount };
}

export async function getFI(id) {
  await getDB();
  const result = db.exec(`SELECT * FROM financial_institutions WHERE id = ?`, [id]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  
  const columns = result[0].columns;
  const values = result[0].values[0];
  return Object.fromEntries(columns.map((col, i) => [col, values[i]]));
}

export async function getAllFIs() {
  await getDB();
  const result = db.exec(`SELECT * FROM financial_institutions ORDER BY created_at DESC`);
  if (result.length === 0) return [];
  
  const columns = result[0].columns;
  return result[0].values.map(values => 
    Object.fromEntries(columns.map((col, i) => [col, values[i]]))
  );
}

export async function updateFI(id, updates) {
  await getDB();
  const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
  const values = Object.values(updates);
  const now = new Date().toISOString();
  
  db.run(`
    UPDATE financial_institutions 
    SET ${fields}, updated_at = ? 
    WHERE id = ?
  `, [...values, now, id]);
  
  saveDB();
  return getFI(id);
}

// Fund Allocation Operations
export async function allocateFunds(fiId, amount, description = 'Fund allocation from Central Bank') {
  await getDB();
  const fi = await getFI(fiId);
  if (!fi) throw new Error('Financial Institution not found');
  
  const allocationId = `alloc-${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();
  
  // Record allocation
  db.run(`
    INSERT INTO fund_allocations (id, fi_id, amount, allocation_type, description, timestamp)
    VALUES (?, ?, ?, 'credit', ?, ?)
  `, [allocationId, fiId, amount, description, now]);
  
  // Update FI balance
  db.run(`
    UPDATE financial_institutions 
    SET allocated_funds = allocated_funds + ?,
        available_balance = available_balance + ?,
        updated_at = ?
    WHERE id = ?
  `, [amount, amount, now, fiId]);
  
  // Record in ledger
  const ledgerId = `led-${uuidv4().slice(0, 8)}`;
  db.run(`
    INSERT INTO ledger (id, transaction_id, fi_id, amount, transaction_type, description, timestamp)
    VALUES (?, ?, ?, ?, 'allocation', ?, ?)
  `, [ledgerId, allocationId, fiId, amount, description, now]);
  
  saveDB();
  
  return {
    allocationId,
    fi: await getFI(fiId),
    amount,
    description
  };
}

// Ledger Operations
export async function getLedger() {
  await getDB();
  const result = db.exec(`
    SELECT l.*, fi.name as fi_name 
    FROM ledger l 
    LEFT JOIN financial_institutions fi ON l.fi_id = fi.id 
    ORDER BY l.timestamp DESC
  `);
  
  if (result.length === 0) return [];
  
  const columns = result[0].columns;
  return result[0].values.map(values => 
    Object.fromEntries(columns.map((col, i) => [col, values[i]]))
  );
}

// Get filtered ledger entries
export async function getLedgerFiltered(filters = {}) {
  await getDB();
  
  let query = `
    SELECT l.*, fi.name as fi_name 
    FROM ledger l 
    LEFT JOIN financial_institutions fi ON l.fi_id = fi.id 
    WHERE 1=1
  `;
  const params = [];
  
  if (filters.fi_id) {
    query += ` AND l.fi_id = ?`;
    params.push(filters.fi_id);
  }
  
  if (filters.is_iot_transaction !== undefined) {
    query += ` AND l.is_iot_transaction = ?`;
    params.push(filters.is_iot_transaction ? 1 : 0);
  }
  
  if (filters.transaction_type) {
    query += ` AND l.transaction_type = ?`;
    params.push(filters.transaction_type);
  }
  
  if (filters.wallet_id) {
    query += ` AND (l.from_wallet = ? OR l.to_wallet = ? OR l.main_wallet_id = ?)`;
    params.push(filters.wallet_id, filters.wallet_id, filters.wallet_id);
  }
  
  if (filters.device_id) {
    query += ` AND l.device_id = ?`;
    params.push(filters.device_id);
  }
  
  if (filters.from_date) {
    query += ` AND l.timestamp >= ?`;
    params.push(filters.from_date);
  }
  
  if (filters.to_date) {
    query += ` AND l.timestamp <= ?`;
    params.push(filters.to_date);
  }
  
  query += ` ORDER BY l.timestamp DESC`;
  
  if (filters.limit) {
    query += ` LIMIT ?`;
    params.push(filters.limit);
  }
  
  const result = db.exec(query, params);
  
  if (result.length === 0) return [];
  
  const columns = result[0].columns;
  return result[0].values.map(values => 
    Object.fromEntries(columns.map((col, i) => [col, values[i]]))
  );
}

// Get IoT transaction stats
export async function getIoTTransactionStats() {
  await getDB();
  
  const total = db.exec(`SELECT COUNT(*) FROM ledger WHERE is_iot_transaction = 1`);
  const totalAmount = db.exec(`SELECT SUM(amount) FROM ledger WHERE is_iot_transaction = 1`);
  const byDevice = db.exec(`
    SELECT device_id, COUNT(*) as tx_count, SUM(amount) as total_amount 
    FROM ledger 
    WHERE is_iot_transaction = 1 AND device_id IS NOT NULL
    GROUP BY device_id
  `);
  const byFI = db.exec(`
    SELECT fi_id, fi.name as fi_name, COUNT(*) as tx_count, SUM(l.amount) as total_amount 
    FROM ledger l
    LEFT JOIN financial_institutions fi ON l.fi_id = fi.id
    WHERE l.is_iot_transaction = 1
    GROUP BY l.fi_id
  `);
  
  return {
    totalTransactions: total[0]?.values[0]?.[0] || 0,
    totalAmount: totalAmount[0]?.values[0]?.[0] || 0,
    byDevice: byDevice.length > 0 ? byDevice[0].values.map(v => ({
      device_id: v[0], tx_count: v[1], total_amount: v[2]
    })) : [],
    byFI: byFI.length > 0 ? byFI[0].values.map(v => ({
      fi_id: v[0], fi_name: v[1], tx_count: v[2], total_amount: v[3]
    })) : []
  };
}

export async function syncTransactions(fiId, transactions) {
  await getDB();
  const results = [];
  
  for (const tx of transactions) {
    const ledgerId = `led-${uuidv4().slice(0, 8)}`;
    const isIoT = tx.is_iot_transaction ? 1 : 0;
    
    db.run(`
      INSERT INTO ledger (id, transaction_id, fi_id, from_wallet, to_wallet, amount, transaction_type, description, timestamp, device_id, main_wallet_id, is_iot_transaction, monotonic_counter, nullifier)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      ledgerId,
      tx.id,
      fiId,
      tx.from_wallet,
      tx.to_wallet,
      tx.amount,
      tx.type || tx.transaction_type || (isIoT ? 'iot_offline' : 'transfer'),
      tx.description,
      tx.created_at || tx.timestamp,
      tx.device_id || null,
      tx.main_wallet_id || null,
      isIoT,
      tx.monotonic_counter || null,
      tx.nullifier || null
    ]);
    
    // Log IoT transactions specially
    if (isIoT) {
      console.log(`📱 IoT Transaction recorded: ${tx.from_wallet} → ${tx.to_wallet} : ₹${tx.amount} (Device: ${tx.device_id})`);
    }
    
    results.push({ ledgerId, transactionId: tx.id, isIoT });
  }
  
  saveDB();
  return results;
}

// Cross-FI Transaction Routing
export async function routeCrossFITransaction(sourceFiId, targetFiId, fromWallet, toWallet, amount, description, zkpProof = null) {
  await getDB();
  
  const sourceFI = await getFI(sourceFiId);
  if (!sourceFI) throw new Error('Source FI not found');
  
  const targetFI = await getFI(targetFiId);
  if (!targetFI) throw new Error('Target FI not found');
  
  const txId = `cross-${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();
  
  // Record in ledger as cross-FI transfer
  const ledgerId = `led-${uuidv4().slice(0, 8)}`;
  db.run(`
    INSERT INTO ledger (id, transaction_id, fi_id, from_wallet, to_wallet, amount, transaction_type, description, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, 'cross_fi_transfer', ?, ?)
  `, [ledgerId, txId, sourceFiId, fromWallet, `${toWallet}@${targetFiId}`, amount, description || `Cross-FI transfer to ${targetFI.name}`, now]);
  
  saveDB();
  
  // Return routing info - the caller should notify target FI
  return {
    transactionId: txId,
    ledgerId,
    sourceFi: { id: sourceFiId, name: sourceFI.name, endpoint: sourceFI.endpoint },
    targetFi: { id: targetFiId, name: targetFI.name, endpoint: targetFI.endpoint },
    fromWallet,
    toWallet,
    amount,
    description,
    zkpProof,
    status: 'routed',
    timestamp: now
  };
}

// Get FI by name (for cross-FI routing)
export async function getFIByName(name) {
  await getDB();
  const result = db.exec(`SELECT * FROM financial_institutions WHERE name = ?`, [name]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  
  const columns = result[0].columns;
  const values = result[0].values[0];
  return Object.fromEntries(columns.map((col, i) => [col, values[i]]));
}

// Get pending cross-FI transactions for a target FI
export async function getPendingCrossFIForTarget(targetFiId) {
  await getDB();
  const result = db.exec(`
    SELECT * FROM ledger 
    WHERE transaction_type = 'cross_fi_transfer' 
    AND to_wallet LIKE '%@' || ?
    ORDER BY timestamp DESC
  `, [targetFiId]);
  
  if (result.length === 0) return [];
  
  const columns = result[0].columns;
  return result[0].values.map(values => 
    Object.fromEntries(columns.map((col, i) => [col, values[i]]))
  );
}

export async function getAllocations(fiId = null) {
  await getDB();
  let query = 'SELECT * FROM fund_allocations';
  let params = [];
  
  if (fiId) {
    query += ' WHERE fi_id = ?';
    params = [fiId];
  }
  query += ' ORDER BY timestamp DESC';
  
  const result = db.exec(query, params);
  if (result.length === 0) return [];
  
  const columns = result[0].columns;
  return result[0].values.map(values => 
    Object.fromEntries(columns.map((col, i) => [col, values[i]]))
  );
}

export async function getSystemStats() {
  await getDB();
  
  const totalFIs = db.exec('SELECT COUNT(*) as count FROM financial_institutions');
  const totalAllocated = db.exec('SELECT SUM(allocated_funds) as total FROM financial_institutions');
  const totalTransactions = db.exec('SELECT COUNT(*) as count FROM ledger');
  const totalVolume = db.exec("SELECT SUM(amount) as total FROM ledger WHERE transaction_type = 'transfer'");
  
  return {
    totalFIs: totalFIs[0]?.values[0]?.[0] || 0,
    totalAllocated: totalAllocated[0]?.values[0]?.[0] || 0,
    totalTransactions: totalTransactions[0]?.values[0]?.[0] || 0,
    totalVolume: totalVolume[0]?.values[0]?.[0] || 0
  };
}

// ============================================
// NULLIFIER REGISTRY OPERATIONS
// ============================================

// Register a nullifier (prevents double-spending)
export async function registerNullifier(nullifier, fiId, transactionId, serialNumber, amount) {
  await getDB();
  
  // Check if nullifier already exists
  const existing = db.exec('SELECT * FROM nullifier_registry WHERE nullifier = ?', [nullifier]);
  if (existing.length > 0 && existing[0].values.length > 0) {
    const columns = existing[0].columns;
    const values = existing[0].values[0];
    const existingRecord = Object.fromEntries(columns.map((col, i) => [col, values[i]]));
    throw new Error(`Double-spend attempt detected! Nullifier already used in transaction ${existingRecord.transaction_id}`);
  }
  
  const id = `null-${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();
  
  db.run(`
    INSERT INTO nullifier_registry (id, nullifier, fi_id, transaction_id, serial_number, amount, registered_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [id, nullifier, fiId, transactionId, serialNumber, amount, now]);
  
  saveDB();
  console.log(`🔒 Nullifier registered: ${nullifier.slice(0, 16)}...`);
  return { id, nullifier, fiId, transactionId, serialNumber, amount, registered_at: now };
}

// Check if nullifier exists
export async function checkNullifierGlobal(nullifier) {
  await getDB();
  const result = db.exec('SELECT * FROM nullifier_registry WHERE nullifier = ?', [nullifier]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  
  const columns = result[0].columns;
  const values = result[0].values[0];
  return Object.fromEntries(columns.map((col, i) => [col, values[i]]));
}

// Get all nullifiers for a FI
export async function getNullifiersByFI(fiId) {
  await getDB();
  const result = db.exec('SELECT * FROM nullifier_registry WHERE fi_id = ? ORDER BY registered_at DESC', [fiId]);
  if (result.length === 0) return [];
  
  const columns = result[0].columns;
  return result[0].values.map(values => 
    Object.fromEntries(columns.map((col, i) => [col, values[i]]))
  );
}

// Sync nullifiers from FI
export async function syncNullifiers(fiId, nullifiers) {
  await getDB();
  const results = [];
  const errors = [];
  
  for (const n of nullifiers) {
    try {
      const result = await registerNullifier(
        n.nullifier, 
        fiId, 
        n.transaction_id, 
        n.serial_number, 
        n.amount
      );
      results.push(result);
    } catch (error) {
      errors.push({ nullifier: n.nullifier, error: error.message });
    }
  }
  
  return { registered: results.length, errors, results };
}

// ============================================
// COMPLIANCE OPERATIONS
// ============================================

// Log compliance audit event
export async function logComplianceAudit(fiId, walletId, auditType, amount, dailyTotal, monthlyTotal, limitType, exceeded, details) {
  await getDB();
  const id = `audit-${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();
  
  db.run(`
    INSERT INTO compliance_audit (id, fi_id, wallet_id, audit_type, amount, daily_total, monthly_total, limit_type, exceeded, details, audit_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, fiId, walletId, auditType, amount, dailyTotal, monthlyTotal, limitType, exceeded ? 1 : 0, JSON.stringify(details), now]);
  
  saveDB();
  
  if (exceeded) {
    console.log(`⚠️ Compliance limit exceeded: ${walletId} - ${limitType}`);
  }
  
  return { id, fiId, walletId, auditType, exceeded };
}

// Update FI compliance status
export async function updateFIComplianceStatus(fiId, volumeToAdd, isOffline = false, isFlagged = false) {
  await getDB();
  const now = new Date().toISOString();
  
  // Check if status exists
  const existing = db.exec('SELECT * FROM fi_compliance_status WHERE fi_id = ?', [fiId]);
  
  if (existing.length === 0 || existing[0].values.length === 0) {
    // Create new status
    const id = `fics-${uuidv4().slice(0, 8)}`;
    db.run(`
      INSERT INTO fi_compliance_status (id, fi_id, total_daily_volume, total_monthly_volume, total_offline_transactions, flagged_transactions, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, fiId, volumeToAdd, volumeToAdd, isOffline ? 1 : 0, isFlagged ? 1 : 0, now]);
  } else {
    // Update existing
    db.run(`
      UPDATE fi_compliance_status 
      SET total_daily_volume = total_daily_volume + ?,
          total_monthly_volume = total_monthly_volume + ?,
          total_offline_transactions = total_offline_transactions + ?,
          flagged_transactions = flagged_transactions + ?,
          updated_at = ?
      WHERE fi_id = ?
    `, [volumeToAdd, volumeToAdd, isOffline ? 1 : 0, isFlagged ? 1 : 0, now, fiId]);
  }
  
  saveDB();
  return getFIComplianceStatus(fiId);
}

// Get FI compliance status
export async function getFIComplianceStatus(fiId) {
  await getDB();
  const result = db.exec('SELECT * FROM fi_compliance_status WHERE fi_id = ?', [fiId]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  
  const columns = result[0].columns;
  const values = result[0].values[0];
  return Object.fromEntries(columns.map((col, i) => [col, values[i]]));
}

// Get all compliance audits
export async function getComplianceAudits(fiId = null, limitType = null, exceededOnly = false) {
  await getDB();
  let query = 'SELECT * FROM compliance_audit WHERE 1=1';
  let params = [];
  
  if (fiId) {
    query += ' AND fi_id = ?';
    params.push(fiId);
  }
  if (limitType) {
    query += ' AND limit_type = ?';
    params.push(limitType);
  }
  if (exceededOnly) {
    query += ' AND exceeded = 1';
  }
  query += ' ORDER BY audit_date DESC';
  
  const result = db.exec(query, params);
  if (result.length === 0) return [];
  
  const columns = result[0].columns;
  return result[0].values.map(values => 
    Object.fromEntries(columns.map((col, i) => [col, values[i]]))
  );
}

// Reset daily compliance tracking (should be called daily by a cron job)
export async function resetDailyCompliance() {
  await getDB();
  const now = new Date().toISOString();
  
  db.run(`
    UPDATE fi_compliance_status 
    SET total_daily_volume = 0, 
        last_audit_date = ?,
        updated_at = ?
  `, [now, now]);
  
  saveDB();
  console.log('📊 Daily compliance counters reset');
  return { reset: true, timestamp: now };
}

// Reset monthly compliance tracking
export async function resetMonthlyCompliance() {
  await getDB();
  const now = new Date().toISOString();
  
  db.run(`
    UPDATE fi_compliance_status 
    SET total_monthly_volume = 0,
        updated_at = ?
  `, [now]);
  
  saveDB();
  console.log('📊 Monthly compliance counters reset');
  return { reset: true, timestamp: now };
}

// Get compliance summary
export async function getComplianceSummary() {
  await getDB();
  
  const totalAudits = db.exec('SELECT COUNT(*) as count FROM compliance_audit');
  const exceededAudits = db.exec('SELECT COUNT(*) as count FROM compliance_audit WHERE exceeded = 1');
  const totalNullifiers = db.exec('SELECT COUNT(*) as count FROM nullifier_registry');
  const fiStatuses = db.exec('SELECT * FROM fi_compliance_status');
  
  let statuses = [];
  if (fiStatuses.length > 0) {
    const columns = fiStatuses[0].columns;
    statuses = fiStatuses[0].values.map(values => 
      Object.fromEntries(columns.map((col, i) => [col, values[i]]))
    );
  }
  
  return {
    totalAudits: totalAudits[0]?.values[0]?.[0] || 0,
    exceededAudits: exceededAudits[0]?.values[0]?.[0] || 0,
    totalNullifiers: totalNullifiers[0]?.values[0]?.[0] || 0,
    fiStatuses: statuses,
    limits: zkpEnhanced.COMPLIANCE_LIMITS
  };
}

// ============================================
// CENTRAL BANK COMPLIANCE CONTROL FUNCTIONS
// ============================================

// Create/Update compliance rule
export async function setComplianceRule(ruleData) {
  await getDB();
  const id = ruleData.id || `rule-${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();
  
  // Check if rule exists
  const existing = db.exec('SELECT id FROM cb_compliance_rules WHERE id = ?', [id]);
  
  if (existing.length > 0 && existing[0].values.length > 0) {
    // Update existing rule
    db.run(`
      UPDATE cb_compliance_rules SET
        rule_name = ?,
        rule_type = ?,
        target_type = ?,
        target_id = ?,
        limit_value = ?,
        daily_limit = ?,
        monthly_limit = ?,
        max_offline_amount = ?,
        max_offline_count = ?,
        is_active = ?,
        priority = ?,
        description = ?,
        updated_at = ?
      WHERE id = ?
    `, [
      ruleData.rule_name, ruleData.rule_type, ruleData.target_type, ruleData.target_id,
      ruleData.limit_value, ruleData.daily_limit, ruleData.monthly_limit,
      ruleData.max_offline_amount, ruleData.max_offline_count,
      ruleData.is_active !== false ? 1 : 0, ruleData.priority || 1,
      ruleData.description, now, id
    ]);
  } else {
    // Insert new rule
    db.run(`
      INSERT INTO cb_compliance_rules (id, rule_name, rule_type, target_type, target_id, limit_value, daily_limit, monthly_limit, max_offline_amount, max_offline_count, is_active, priority, description, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, ruleData.rule_name, ruleData.rule_type, ruleData.target_type, ruleData.target_id,
      ruleData.limit_value, ruleData.daily_limit, ruleData.monthly_limit,
      ruleData.max_offline_amount, ruleData.max_offline_count,
      ruleData.is_active !== false ? 1 : 0, ruleData.priority || 1,
      ruleData.description, ruleData.created_by || 'admin', now, now
    ]);
  }
  
  saveDB();
  return getComplianceRule(id);
}

// Get compliance rule by ID
export async function getComplianceRule(id) {
  await getDB();
  const result = db.exec('SELECT * FROM cb_compliance_rules WHERE id = ?', [id]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  
  const columns = result[0].columns;
  const values = result[0].values[0];
  return Object.fromEntries(columns.map((col, i) => [col, values[i]]));
}

// Get all compliance rules
export async function getAllComplianceRules(targetType = null, activeOnly = true) {
  await getDB();
  let query = 'SELECT * FROM cb_compliance_rules WHERE 1=1';
  const params = [];
  
  if (targetType) {
    query += ' AND (target_type = ? OR target_type = ?)';
    params.push(targetType, 'all');
  }
  if (activeOnly) {
    query += ' AND is_active = 1';
  }
  query += ' ORDER BY priority DESC, created_at DESC';
  
  const result = db.exec(query, params);
  if (result.length === 0) return [];
  
  const columns = result[0].columns;
  return result[0].values.map(values => 
    Object.fromEntries(columns.map((col, i) => [col, values[i]]))
  );
}

// Delete compliance rule
export async function deleteComplianceRule(id) {
  await getDB();
  db.run('DELETE FROM cb_compliance_rules WHERE id = ?', [id]);
  saveDB();
  return { deleted: true, id };
}

// Check transaction against compliance rules
export async function checkTransactionCompliance(fiId, walletId, deviceId, amount, txType = 'online') {
  await getDB();
  const violations = [];
  
  // Get applicable rules
  const targetType = deviceId ? 'iot_device' : 'wallet';
  const rules = await getAllComplianceRules(targetType, true);
  
  // Check if entity is frozen (pass null-safe entity ID)
  const entityId = deviceId || walletId;
  if (entityId) {
    const frozen = await isEntityFrozen(targetType, entityId, fiId || null);
    if (frozen) {
      violations.push({
        rule: 'frozen_account',
        severity: 'critical',
        message: `${targetType === 'iot_device' ? 'Device' : 'Wallet'} is frozen`,
        blocked: true
      });
    }
    
    // Check if entity is blacklisted
    const watchlistEntry = await getWatchlistEntry(targetType, entityId, fiId || null);
    if (watchlistEntry && watchlistEntry.status === 'blacklisted') {
      violations.push({
        rule: 'blacklisted',
        severity: 'critical',
        message: `${targetType === 'iot_device' ? 'Device' : 'Wallet'} is blacklisted: ${watchlistEntry.reason}`,
        blocked: true
      });
    }
  }
  
  // Check against each rule
  for (const rule of rules) {
    // Single transaction limit
    if (rule.limit_value && amount > rule.limit_value) {
      violations.push({
        rule: rule.rule_name,
        severity: 'high',
        message: `Transaction amount ₹${amount} exceeds limit ₹${rule.limit_value}`,
        blocked: rule.rule_type === 'hard_limit'
      });
    }
    
    // Offline specific checks
    if (txType === 'offline') {
      if (rule.max_offline_amount && amount > rule.max_offline_amount) {
        violations.push({
          rule: rule.rule_name,
          severity: 'high',
          message: `Offline amount ₹${amount} exceeds limit ₹${rule.max_offline_amount}`,
          blocked: true
        });
      }
    }
  }
  
  // Create alerts for violations
  for (const v of violations) {
    await createAlert({
      alert_type: 'compliance_violation',
      severity: v.severity,
      fi_id: fiId || null,
      wallet_id: walletId || null,
      device_id: deviceId || null,
      amount: amount,
      message: v.message,
      details: JSON.stringify({ rule: v.rule, txType, blocked: v.blocked })
    });
  }
  
  return {
    compliant: violations.filter(v => v.blocked).length === 0,
    violations,
    blocked: violations.some(v => v.blocked)
  };
}

// ============================================
// ALERT MANAGEMENT
// ============================================

// Create alert
export async function createAlert(alertData) {
  await getDB();
  const id = `alert-${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();
  
  // Ensure all values are null-safe (convert undefined to null)
  const safeData = {
    fi_id: alertData.fi_id ?? null,
    wallet_id: alertData.wallet_id ?? null,
    device_id: alertData.device_id ?? null,
    transaction_id: alertData.transaction_id ?? null,
    amount: alertData.amount ?? null,
    details: alertData.details ?? null
  };
  
  db.run(`
    INSERT INTO cb_alerts (id, alert_type, severity, fi_id, wallet_id, device_id, transaction_id, amount, message, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, alertData.alert_type, alertData.severity || 'medium',
    safeData.fi_id, safeData.wallet_id, safeData.device_id,
    safeData.transaction_id, safeData.amount,
    alertData.message, safeData.details, now
  ]);
  
  saveDB();
  
  // Log alert to console for visibility
  const severityEmoji = {
    critical: '🚨',
    high: '⚠️',
    medium: '📢',
    low: 'ℹ️'
  };
  console.log(`${severityEmoji[alertData.severity] || '📢'} ALERT [${alertData.severity?.toUpperCase()}]: ${alertData.message}`);
  
  return { id, ...alertData, created_at: now };
}

// Get alerts
export async function getAlerts(filters = {}) {
  await getDB();
  let query = 'SELECT * FROM cb_alerts WHERE 1=1';
  const params = [];
  
  if (filters.severity) {
    query += ' AND severity = ?';
    params.push(filters.severity);
  }
  if (filters.fi_id) {
    query += ' AND fi_id = ?';
    params.push(filters.fi_id);
  }
  if (filters.unread_only) {
    query += ' AND is_read = 0';
  }
  if (filters.unresolved_only) {
    query += ' AND is_resolved = 0';
  }
  if (filters.alert_type) {
    query += ' AND alert_type = ?';
    params.push(filters.alert_type);
  }
  
  query += ' ORDER BY created_at DESC';
  
  if (filters.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }
  
  const result = db.exec(query, params);
  if (result.length === 0) return [];
  
  const columns = result[0].columns;
  return result[0].values.map(values => 
    Object.fromEntries(columns.map((col, i) => [col, values[i]]))
  );
}

// Get alert counts by severity
export async function getAlertCounts() {
  await getDB();
  const result = db.exec(`
    SELECT 
      severity,
      COUNT(*) as total,
      SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread,
      SUM(CASE WHEN is_resolved = 0 THEN 1 ELSE 0 END) as unresolved
    FROM cb_alerts
    GROUP BY severity
  `);
  
  if (result.length === 0) return { critical: 0, high: 0, medium: 0, low: 0, total: 0, unread: 0 };
  
  const counts = { critical: 0, high: 0, medium: 0, low: 0, total: 0, unread: 0 };
  const columns = result[0].columns;
  
  for (const row of result[0].values) {
    const entry = Object.fromEntries(columns.map((col, i) => [col, row[i]]));
    counts[entry.severity] = entry.total;
    counts.total += entry.total;
    counts.unread += entry.unread;
  }
  
  return counts;
}

// Mark alert as read
export async function markAlertRead(id) {
  await getDB();
  db.run('UPDATE cb_alerts SET is_read = 1 WHERE id = ?', [id]);
  saveDB();
  return { id, is_read: true };
}

// Resolve alert
export async function resolveAlert(id, resolvedBy = 'admin') {
  await getDB();
  const now = new Date().toISOString();
  db.run('UPDATE cb_alerts SET is_resolved = 1, resolved_by = ?, resolved_at = ? WHERE id = ?', [resolvedBy, now, id]);
  saveDB();
  return { id, is_resolved: true, resolved_by: resolvedBy, resolved_at: now };
}

// Bulk mark alerts as read
export async function markAllAlertsRead() {
  await getDB();
  db.run('UPDATE cb_alerts SET is_read = 1 WHERE is_read = 0');
  saveDB();
  return { success: true };
}

// ============================================
// WATCHLIST MANAGEMENT
// ============================================

// Add to watchlist
export async function addToWatchlist(entityType, entityId, fiId, status, reason, riskLevel = 'medium', expiresAt = null) {
  await getDB();
  const id = `watch-${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();
  
  // Check if already exists
  const existing = db.exec(
    'SELECT id FROM cb_watchlist WHERE entity_type = ? AND entity_id = ? AND (fi_id = ? OR fi_id IS NULL)',
    [entityType, entityId, fiId]
  );
  
  if (existing.length > 0 && existing[0].values.length > 0) {
    // Update existing entry
    db.run(`
      UPDATE cb_watchlist SET status = ?, risk_level = ?, reason = ?, expires_at = ?, added_at = ?
      WHERE entity_type = ? AND entity_id = ? AND (fi_id = ? OR fi_id IS NULL)
    `, [status, riskLevel, reason, expiresAt, now, entityType, entityId, fiId]);
    
    saveDB();
    return getWatchlistEntry(entityType, entityId, fiId);
  }
  
  db.run(`
    INSERT INTO cb_watchlist (id, entity_type, entity_id, fi_id, status, risk_level, reason, added_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, entityType, entityId, fiId, status, riskLevel, reason, now, expiresAt]);
  
  saveDB();
  
  // Create alert for watchlist addition
  await createAlert({
    alert_type: 'watchlist_update',
    severity: status === 'blacklisted' ? 'critical' : 'medium',
    fi_id: fiId,
    wallet_id: entityType === 'wallet' ? entityId : null,
    device_id: entityType === 'iot_device' ? entityId : null,
    message: `${entityType} ${entityId} added to ${status} list: ${reason}`
  });
  
  return getWatchlistEntry(entityType, entityId, fiId);
}

// Get watchlist entry
export async function getWatchlistEntry(entityType, entityId, fiId) {
  await getDB();
  
  // Handle null fiId by using different query
  let query, params;
  if (fiId) {
    query = 'SELECT * FROM cb_watchlist WHERE entity_type = ? AND entity_id = ? AND (fi_id = ? OR fi_id IS NULL)';
    params = [entityType, entityId, fiId];
  } else {
    query = 'SELECT * FROM cb_watchlist WHERE entity_type = ? AND entity_id = ?';
    params = [entityType, entityId];
  }
  
  const result = db.exec(query, params);
  
  if (result.length === 0 || result[0].values.length === 0) return null;
  
  const columns = result[0].columns;
  const values = result[0].values[0];
  return Object.fromEntries(columns.map((col, i) => [col, values[i]]));
}

// Get all watchlist entries
export async function getWatchlist(filters = {}) {
  await getDB();
  let query = 'SELECT * FROM cb_watchlist WHERE 1=1';
  const params = [];
  
  if (filters.status) {
    query += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters.entity_type) {
    query += ' AND entity_type = ?';
    params.push(filters.entity_type);
  }
  if (filters.fi_id) {
    query += ' AND fi_id = ?';
    params.push(filters.fi_id);
  }
  
  query += ' ORDER BY added_at DESC';
  
  const result = db.exec(query, params);
  if (result.length === 0) return [];
  
  const columns = result[0].columns;
  return result[0].values.map(values => 
    Object.fromEntries(columns.map((col, i) => [col, values[i]]))
  );
}

// Remove from watchlist
export async function removeFromWatchlist(entityType, entityId, fiId) {
  await getDB();
  db.run(
    'DELETE FROM cb_watchlist WHERE entity_type = ? AND entity_id = ? AND (fi_id = ? OR fi_id IS NULL)',
    [entityType, entityId, fiId]
  );
  saveDB();
  return { removed: true };
}

// ============================================
// FREEZE ACCOUNT MANAGEMENT
// ============================================

// Freeze account/wallet/device
export async function freezeEntity(entityType, entityId, fiId, reason, frozenBy = 'admin') {
  await getDB();
  const id = `freeze-${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();
  
  // Check if already frozen - handle null fiId
  let checkQuery, checkParams;
  if (fiId) {
    checkQuery = 'SELECT id FROM cb_frozen_accounts WHERE entity_type = ? AND entity_id = ? AND (fi_id = ? OR fi_id IS NULL) AND is_frozen = 1';
    checkParams = [entityType, entityId, fiId];
  } else {
    checkQuery = 'SELECT id FROM cb_frozen_accounts WHERE entity_type = ? AND entity_id = ? AND is_frozen = 1';
    checkParams = [entityType, entityId];
  }
  
  const existing = db.exec(checkQuery, checkParams);
  
  if (existing.length > 0 && existing[0].values.length > 0) {
    return { already_frozen: true, message: 'Entity is already frozen' };
  }
  
  db.run(`
    INSERT INTO cb_frozen_accounts (id, entity_type, entity_id, fi_id, frozen_by, reason, frozen_at, is_frozen)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `, [id, entityType, entityId, fiId || null, frozenBy, reason, now]);
  
  saveDB();
  
  // Create critical alert
  await createAlert({
    alert_type: 'account_frozen',
    severity: 'critical',
    fi_id: fiId || null,
    wallet_id: entityType === 'wallet' ? entityId : null,
    device_id: entityType === 'iot_device' ? entityId : null,
    message: `🔒 ${entityType} ${entityId} FROZEN by ${frozenBy}: ${reason}`
  });
  
  // Notify FI (if applicable)
  if (fiId) {
    const fi = await getFI(fiId);
    if (fi && fi.endpoint) {
      try {
        await fetch(`${fi.endpoint}/api/compliance/freeze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entityType, entityId, reason, frozenBy })
        });
      } catch (e) {
        console.log(`⚠️ Could not notify FI about freeze: ${e.message}`);
      }
    }
  }
  
  return { frozen: true, id, entityType, entityId, reason };
}

// Unfreeze entity
export async function unfreezeEntity(entityType, entityId, fiId, unfrozenBy = 'admin') {
  await getDB();
  const now = new Date().toISOString();
  
  db.run(`
    UPDATE cb_frozen_accounts SET is_frozen = 0, unfrozen_at = ?
    WHERE entity_type = ? AND entity_id = ? AND (fi_id = ? OR fi_id IS NULL) AND is_frozen = 1
  `, [now, entityType, entityId, fiId]);
  
  saveDB();
  
  // Create alert
  await createAlert({
    alert_type: 'account_unfrozen',
    severity: 'medium',
    fi_id: fiId,
    wallet_id: entityType === 'wallet' ? entityId : null,
    device_id: entityType === 'iot_device' ? entityId : null,
    message: `🔓 ${entityType} ${entityId} UNFROZEN by ${unfrozenBy}`
  });
  
  // Notify FI
  if (fiId) {
    const fi = await getFI(fiId);
    if (fi && fi.endpoint) {
      try {
        await fetch(`${fi.endpoint}/api/compliance/unfreeze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entityType, entityId })
        });
      } catch (e) {
        console.log(`⚠️ Could not notify FI about unfreeze: ${e.message}`);
      }
    }
  }
  
  return { unfrozen: true, entityType, entityId };
}

// Check if entity is frozen
export async function isEntityFrozen(entityType, entityId, fiId) {
  await getDB();
  
  // Handle null fiId by using different query
  let query, params;
  if (fiId) {
    query = 'SELECT * FROM cb_frozen_accounts WHERE entity_type = ? AND entity_id = ? AND (fi_id = ? OR fi_id IS NULL) AND is_frozen = 1';
    params = [entityType, entityId, fiId];
  } else {
    query = 'SELECT * FROM cb_frozen_accounts WHERE entity_type = ? AND entity_id = ? AND is_frozen = 1';
    params = [entityType, entityId];
  }
  
  const result = db.exec(query, params);
  return result.length > 0 && result[0].values.length > 0;
}

// Get all frozen entities
export async function getFrozenEntities(fiId = null) {
  await getDB();
  let query = 'SELECT * FROM cb_frozen_accounts WHERE is_frozen = 1';
  const params = [];
  
  if (fiId) {
    query += ' AND fi_id = ?';
    params.push(fiId);
  }
  
  query += ' ORDER BY frozen_at DESC';
  
  const result = db.exec(query, params);
  if (result.length === 0) return [];
  
  const columns = result[0].columns;
  return result[0].values.map(values => 
    Object.fromEntries(columns.map((col, i) => [col, values[i]]))
  );
}

// ============================================
// TRANSACTION MONITORING
// ============================================

// Monitor transaction and generate alerts if needed
export async function monitorTransaction(txData) {
  await getDB();
  const alerts = [];
  
  // Get alert rules
  const rules = db.exec('SELECT * FROM cb_alert_rules WHERE is_active = 1');
  if (rules.length === 0) return { alerts: [] };
  
  const columns = rules[0].columns;
  const activeRules = rules[0].values.map(values => 
    Object.fromEntries(columns.map((col, i) => [col, values[i]]))
  );
  
  for (const rule of activeRules) {
    let triggered = false;
    let alertMessage = '';
    
    switch (rule.condition_type) {
      case 'single_amount':
        if (txData.amount >= rule.threshold_value) {
          triggered = true;
          alertMessage = `High value transaction: ₹${txData.amount} (threshold: ₹${rule.threshold_value})`;
        }
        break;
        
      case 'round_amounts':
        // Check if amount is a round number (divisible by threshold)
        if (txData.amount % rule.threshold_value === 0 && txData.amount >= rule.threshold_value) {
          triggered = true;
          alertMessage = `Suspicious round amount transaction: ₹${txData.amount}`;
        }
        break;
        
      case 'new_device_high_value':
        if (txData.is_new_device && txData.amount >= rule.threshold_value) {
          triggered = true;
          alertMessage = `New device making high value transaction: ₹${txData.amount}`;
        }
        break;
    }
    
    if (triggered) {
      const alert = await createAlert({
        alert_type: rule.condition_type,
        severity: rule.severity,
        fi_id: txData.fi_id,
        wallet_id: txData.wallet_id,
        device_id: txData.device_id,
        transaction_id: txData.transaction_id,
        amount: txData.amount,
        message: alertMessage,
        details: JSON.stringify({ rule_name: rule.rule_name, rule_id: rule.id })
      });
      alerts.push(alert);
    }
  }
  
  return { alerts };
}

// Get compliance dashboard summary
export async function getComplianceDashboard() {
  await getDB();
  
  const alertCounts = await getAlertCounts();
  const rules = await getAllComplianceRules(null, false);
  const watchlist = await getWatchlist();
  const frozenEntities = await getFrozenEntities();
  const recentAlerts = await getAlerts({ limit: 10, unresolved_only: true });
  
  return {
    alerts: alertCounts,
    recentAlerts,
    rules: {
      total: rules.length,
      active: rules.filter(r => r.is_active === 1).length
    },
    watchlist: {
      total: watchlist.length,
      blacklisted: watchlist.filter(w => w.status === 'blacklisted').length,
      watching: watchlist.filter(w => w.status === 'watching').length
    },
    frozenEntities: {
      total: frozenEntities.length,
      wallets: frozenEntities.filter(f => f.entity_type === 'wallet').length,
      devices: frozenEntities.filter(f => f.entity_type === 'iot_device').length
    }
  };
}

// Initialize on import
initDB().catch(console.error);

export default { getDB, saveDB };
