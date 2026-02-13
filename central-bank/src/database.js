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
      timestamp TEXT DEFAULT (datetime('now'))
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

export async function syncTransactions(fiId, transactions) {
  await getDB();
  const results = [];
  
  for (const tx of transactions) {
    const ledgerId = `led-${uuidv4().slice(0, 8)}`;
    db.run(`
      INSERT INTO ledger (id, transaction_id, fi_id, from_wallet, to_wallet, amount, transaction_type, description, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      ledgerId,
      tx.id,
      fiId,
      tx.from_wallet,
      tx.to_wallet,
      tx.amount,
      tx.transaction_type,
      tx.description,
      tx.timestamp
    ]);
    results.push({ ledgerId, transactionId: tx.id });
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

// Initialize on import
initDB().catch(console.error);

export default { getDB, saveDB };
