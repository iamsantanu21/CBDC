import initSqlJs from 'sql.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

// Import enhanced ZKP module
import * as zkpEnhanced from '../../shared/zkp-enhanced.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FI_ID = process.env.FI_ID || 'fi-001';
const FI_NAME = process.env.FI_NAME || 'FI-Alpha';
const dataDir = path.join(__dirname, '../data');
const dbPath = path.join(dataDir, `${FI_ID}.db`);

// Compliance limits from paper
const COMPLIANCE_LIMITS = zkpEnhanced.COMPLIANCE_LIMITS;

// ========== ZKP UTILITY FUNCTIONS (Inline for simplicity) ==========
function generatePrivateKey() {
  return crypto.randomBytes(32).toString('hex');
}

function derivePublicKey(privateKey) {
  const hash = crypto.createHash('sha256').update(privateKey).digest('hex');
  return `pk_${hash.substring(0, 40)}`;
}

function generateOwnershipProof(privateKey, publicKey, challenge = null) {
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

function verifyOwnershipProof(proof, expectedPublicKey) {
  if (proof.type !== 'ownership') return false;
  if (proof.publicKey !== expectedPublicKey) return false;
  const age = Date.now() - proof.timestamp;
  if (age > 5 * 60 * 1000) return false;
  
  const expectedHash = crypto.createHash('sha256')
    .update(`${proof.publicKey}||${proof.challenge}||${proof.timestamp}`)
    .digest('hex').substring(0, 16);
  
  return proof.verificationHash === expectedHash;
}

function generateOfflineTransactionProof(transaction, senderPrivateKey, senderPublicKey) {
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(16).toString('hex');
  
  const txHash = crypto.createHash('sha256')
    .update(JSON.stringify({
      from: transaction.fromWallet,
      to: transaction.toWallet,
      amount: transaction.amount,
      timestamp: transaction.timestamp
    }))
    .digest('hex');
  
  const signature = crypto.createHash('sha256')
    .update(`${senderPrivateKey}||${txHash}||${nonce}`)
    .digest('hex');
  
  const doubleSpendToken = crypto.createHash('sha256')
    .update(`${transaction.fromWallet}||${transaction.amount}||${timestamp}||${nonce}`)
    .digest('hex');
  
  return {
    type: 'offline_transaction',
    txHash,
    senderPublicKey,
    timestamp,
    nonce,
    signature,
    doubleSpendToken,
    verificationTag: crypto.createHash('sha256')
      .update(`${txHash}||${senderPublicKey}||${timestamp}`)
      .digest('hex').substring(0, 20)
  };
}

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
    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      balance REAL DEFAULT 0,
      status TEXT DEFAULT 'active',
      public_key TEXT,
      private_key TEXT,
      device_bindings TEXT DEFAULT '[]',
      offline_balance REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      from_wallet TEXT,
      to_wallet TEXT,
      amount REAL NOT NULL,
      transaction_type TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'completed',
      synced INTEGER DEFAULT 0,
      is_offline INTEGER DEFAULT 0,
      zkp_proof TEXT,
      target_fi TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS offline_transactions (
      id TEXT PRIMARY KEY,
      from_wallet TEXT NOT NULL,
      to_wallet TEXT NOT NULL,
      to_fi TEXT,
      amount REAL NOT NULL,
      description TEXT,
      zkp_proof TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      synced_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS iot_devices (
      id TEXT PRIMARY KEY,
      wallet_id TEXT NOT NULL,
      device_type TEXT NOT NULL,
      device_name TEXT,
      auth_token TEXT,
      last_used TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (wallet_id) REFERENCES wallets(id)
    )
  `);

  // ========== NEW TABLES FOR PAPER COMPLIANCE ==========
  
  // Sub-wallets for IoT devices (from paper: "Main wallet allocates partial balance to IoT sub-wallets")
  db.run(`
    CREATE TABLE IF NOT EXISTS sub_wallets (
      id TEXT PRIMARY KEY,
      main_wallet_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      device_type TEXT NOT NULL,
      balance REAL DEFAULT 0,
      spending_limit REAL DEFAULT ${COMPLIANCE_LIMITS.SUB_WALLET_LIMIT},
      daily_spent REAL DEFAULT 0,
      daily_limit REAL DEFAULT ${COMPLIANCE_LIMITS.IOT_DEVICE_LIMIT},
      last_daily_reset TEXT DEFAULT (datetime('now')),
      monotonic_counter INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (main_wallet_id) REFERENCES wallets(id),
      FOREIGN KEY (device_id) REFERENCES iot_devices(id)
    )
  `);

  // Nullifier registry for double-spending prevention
  db.run(`
    CREATE TABLE IF NOT EXISTS nullifiers (
      nullifier TEXT PRIMARY KEY,
      serial_number TEXT NOT NULL,
      wallet_id TEXT NOT NULL,
      transaction_id TEXT,
      amount REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (wallet_id) REFERENCES wallets(id)
    )
  `);

  // Serial numbers for CBDC tokens
  db.run(`
    CREATE TABLE IF NOT EXISTS serial_numbers (
      serial_number TEXT PRIMARY KEY,
      wallet_id TEXT,
      amount REAL NOT NULL,
      batch_id TEXT,
      status TEXT DEFAULT 'active',
      issued_at TEXT DEFAULT (datetime('now')),
      spent_at TEXT,
      FOREIGN KEY (wallet_id) REFERENCES wallets(id)
    )
  `);

  // IoT/Sub-wallet offline transactions (stored until sync)
  db.run(`
    CREATE TABLE IF NOT EXISTS iot_offline_transactions (
      id TEXT PRIMARY KEY,
      sub_wallet_id TEXT NOT NULL,
      main_wallet_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      to_wallet TEXT NOT NULL,
      to_fi TEXT,
      amount REAL NOT NULL,
      description TEXT,
      tx_type TEXT DEFAULT 'offline',
      monotonic_counter INTEGER NOT NULL,
      zkp_proof TEXT,
      nullifier TEXT,
      status TEXT DEFAULT 'pending',
      synced_to_wallet INTEGER DEFAULT 0,
      synced_to_fi INTEGER DEFAULT 0,
      synced_to_cb INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      wallet_synced_at TEXT,
      fi_synced_at TEXT,
      cb_synced_at TEXT,
      FOREIGN KEY (sub_wallet_id) REFERENCES sub_wallets(id),
      FOREIGN KEY (main_wallet_id) REFERENCES wallets(id),
      FOREIGN KEY (device_id) REFERENCES iot_devices(id)
    )
  `);

  // Compliance tracking per wallet
  db.run(`
    CREATE TABLE IF NOT EXISTS compliance_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_id TEXT NOT NULL,
      daily_spent REAL DEFAULT 0,
      monthly_spent REAL DEFAULT 0,
      daily_tx_count INTEGER DEFAULT 0,
      offline_tx_count INTEGER DEFAULT 0,
      last_daily_reset TEXT DEFAULT (datetime('now')),
      last_monthly_reset TEXT DEFAULT (datetime('now')),
      status TEXT DEFAULT 'compliant',
      flags TEXT DEFAULT '[]',
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (wallet_id) REFERENCES wallets(id)
    )
  `);

  // Secure Element logs (monotonic counter + transaction signatures)
  db.run(`
    CREATE TABLE IF NOT EXISTS secure_element_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      tx_hash TEXT NOT NULL,
      signature TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (wallet_id) REFERENCES wallets(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS fi_info (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // FI fund allocations tracking (money received from Central Bank)
  db.run(`
    CREATE TABLE IF NOT EXISTS fi_funds (
      id TEXT PRIMARY KEY,
      allocation_id TEXT,
      amount REAL NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    )
  `);

  // Initialize FI balance if not exists
  const fiBalance = db.exec(`SELECT value FROM fi_info WHERE key = 'allocated_balance'`);
  if (fiBalance.length === 0 || fiBalance[0].values.length === 0) {
    db.run(`INSERT OR IGNORE INTO fi_info (key, value) VALUES ('allocated_balance', '0')`);
    db.run(`INSERT OR IGNORE INTO fi_info (key, value) VALUES ('available_balance', '0')`);
  }
  
  // Add is_offline column to wallets if not exists
  try {
    db.run(`ALTER TABLE wallets ADD COLUMN is_offline INTEGER DEFAULT 0`);
  } catch (e) { /* Column exists */ }
  
  // Add is_offline column to sub_wallets if not exists
  try {
    db.run(`ALTER TABLE sub_wallets ADD COLUMN is_offline INTEGER DEFAULT 0`);
  } catch (e) { /* Column exists */ }
  
  // Add freeze columns to wallets if not exists
  try {
    db.run(`ALTER TABLE wallets ADD COLUMN is_frozen INTEGER DEFAULT 0`);
    db.run(`ALTER TABLE wallets ADD COLUMN freeze_reason TEXT`);
    db.run(`ALTER TABLE wallets ADD COLUMN frozen_by TEXT`);
    db.run(`ALTER TABLE wallets ADD COLUMN frozen_at TEXT`);
  } catch (e) { /* Columns exist */ }
  
  // Add freeze columns to sub_wallets if not exists
  try {
    db.run(`ALTER TABLE sub_wallets ADD COLUMN is_frozen INTEGER DEFAULT 0`);
    db.run(`ALTER TABLE sub_wallets ADD COLUMN freeze_reason TEXT`);
    db.run(`ALTER TABLE sub_wallets ADD COLUMN frozen_by TEXT`);
    db.run(`ALTER TABLE sub_wallets ADD COLUMN frozen_at TEXT`);
  } catch (e) { /* Columns exist */ }
  
  saveDB();
  console.log(`📦 FI database initialized: ${FI_ID}`);
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

// Helper to convert result to object
function resultToObject(result) {
  if (result.length === 0 || result[0].values.length === 0) return null;
  const columns = result[0].columns;
  const values = result[0].values[0];
  return Object.fromEntries(columns.map((col, i) => [col, values[i]]));
}

function resultToArray(result) {
  if (result.length === 0) return [];
  const columns = result[0].columns;
  return result[0].values.map(values => 
    Object.fromEntries(columns.map((col, i) => [col, values[i]]))
  );
}

// Wallet Operations - ENHANCED with Secure Element
export async function createWallet(name) {
  await getDB();
  const id = `wallet-${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();
  
  // Generate cryptographic keypair for secure element
  const privateKey = generatePrivateKey();
  const publicKey = derivePublicKey(privateKey);
  
  db.run(`
    INSERT INTO wallets (id, name, public_key, private_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [id, name, publicKey, privateKey, now, now]);
  
  saveDB();
  return getWallet(id);
}

export async function getWallet(id) {
  await getDB();
  const result = db.exec(`SELECT * FROM wallets WHERE id = ?`, [id]);
  const wallet = resultToObject(result);
  if (wallet && wallet.device_bindings) {
    try {
      wallet.device_bindings = JSON.parse(wallet.device_bindings);
    } catch (e) {
      wallet.device_bindings = [];
    }
  }
  return wallet;
}

// Get wallet with public info only (no private key)
export async function getWalletPublic(id) {
  await getDB();
  const result = db.exec(`SELECT id, name, balance, status, public_key, offline_balance, is_offline, created_at, updated_at FROM wallets WHERE id = ?`, [id]);
  return resultToObject(result);
}

export async function getAllWallets() {
  await getDB();
  const result = db.exec(`SELECT id, name, balance, status, public_key, offline_balance, is_offline, created_at, updated_at FROM wallets ORDER BY created_at DESC`);
  return resultToArray(result);
}

// Set wallet offline/online mode
export async function setWalletOfflineMode(walletId, isOffline) {
  await getDB();
  const wallet = await getWallet(walletId);
  if (!wallet) throw new Error('Wallet not found');
  
  const now = new Date().toISOString();
  db.run(`UPDATE wallets SET is_offline = ?, updated_at = ? WHERE id = ?`, [isOffline ? 1 : 0, now, walletId]);
  saveDB();
  
  return {
    walletId,
    isOffline: isOffline,
    message: `Wallet is now ${isOffline ? 'OFFLINE - transactions will not sync until online' : 'ONLINE - transactions will sync automatically'}`
  };
}

// Set sub-wallet offline/online mode
export async function setSubWalletOfflineMode(subWalletId, isOffline) {
  await getDB();
  const subWallet = await getSubWallet(subWalletId);
  if (!subWallet) throw new Error('Sub-wallet not found');
  
  const now = new Date().toISOString();
  db.run(`UPDATE sub_wallets SET is_offline = ?, updated_at = ? WHERE id = ?`, [isOffline ? 1 : 0, now, subWalletId]);
  saveDB();
  
  return {
    subWalletId,
    isOffline: isOffline,
    message: `Sub-wallet is now ${isOffline ? 'OFFLINE - transactions will not sync until online' : 'ONLINE - transactions will sync automatically'}`
  };
}

// Get wallet by public key
export async function getWalletByPublicKey(publicKey) {
  await getDB();
  const result = db.exec(`SELECT * FROM wallets WHERE public_key = ?`, [publicKey]);
  return resultToObject(result);
}

// Verify wallet ownership with ZKP
export async function verifyWalletOwnership(walletId, proof) {
  const wallet = await getWallet(walletId);
  if (!wallet) return { valid: false, error: 'Wallet not found' };
  return { valid: verifyOwnershipProof(proof, wallet.public_key), wallet };
}

// Generate ownership proof for wallet
export async function generateWalletProof(walletId) {
  const wallet = await getWallet(walletId);
  if (!wallet) throw new Error('Wallet not found');
  return generateOwnershipProof(wallet.private_key, wallet.public_key);
}

export async function updateWalletBalance(id, amount) {
  await getDB();
  const now = new Date().toISOString();
  db.run(`
    UPDATE wallets 
    SET balance = balance + ?, updated_at = ? 
    WHERE id = ?
  `, [amount, now, id]);
  saveDB();
  return getWallet(id);
}

export async function getWalletBalance(id) {
  const wallet = await getWallet(id);
  return wallet ? wallet.balance : null;
}

// ============================================
// WALLET VALIDATION HELPER
// ============================================
const CENTRAL_BANK_URL = process.env.CENTRAL_BANK_URL || 'http://localhost:4000';

// Validate if receiver wallet exists (local wallet, local sub-wallet, or cross-FI via CB)
export async function validateReceiverWallet(walletId, allowCrossFI = true) {
  await getDB();
  
  // 1. Check if it's a local wallet
  const localWallet = await getWallet(walletId);
  if (localWallet) {
    return { 
      valid: true, 
      type: 'wallet', 
      local: true,
      name: localWallet.name 
    };
  }
  
  // 2. Check if it's a local sub-wallet
  const localSubWallet = await getSubWallet(walletId);
  if (localSubWallet) {
    const mainWallet = await getWallet(localSubWallet.main_wallet_id);
    return { 
      valid: true, 
      type: 'sub_wallet', 
      local: true,
      name: mainWallet ? `${mainWallet.name} - ${localSubWallet.device_type}` : walletId,
      main_wallet_id: localSubWallet.main_wallet_id
    };
  }
  
  // 3. If cross-FI is allowed, check with Central Bank
  if (allowCrossFI) {
    try {
      const response = await fetch(`${CENTRAL_BANK_URL}/api/fi/wallet/validate/${walletId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.valid) {
          return { 
            valid: true, 
            type: data.wallet_type, 
            local: false,
            fi_id: data.fi_id,
            fi_name: data.fi_name,
            name: data.wallet_name
          };
        }
      }
    } catch (err) {
      console.log(`⚠️ CB wallet validation unavailable: ${err.message}`);
      // If CB is unreachable, don't allow cross-FI transactions
    }
  }
  
  return { valid: false, error: 'Receiver wallet not found in CBDC system' };
}

// Transaction Operations
export async function createTransaction(fromWallet, toWallet, amount, description = '', targetFi = null) {
  await getDB();
  const id = `tx-${uuidv4().slice(0, 8)}`;
  
  // Validate sender wallet
  if (fromWallet) {
    const sender = await getWallet(fromWallet);
    if (!sender) throw new Error('Sender wallet not found');
    if (sender.balance < amount) throw new Error('Insufficient balance');
  }
  
  // Validate receiver wallet exists in CBDC system
  const receiverValidation = await validateReceiverWallet(toWallet, !!targetFi);
  if (!receiverValidation.valid) {
    throw new Error(`Invalid receiver: ${receiverValidation.error}. All payments must be to registered wallets or IoT devices.`);
  }
  
  const now = new Date().toISOString();
  const txType = targetFi ? 'cross_fi_transfer' : 'transfer';
  
  // Create transaction
  db.run(`
    INSERT INTO transactions (id, from_wallet, to_wallet, amount, transaction_type, description, target_fi, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, fromWallet, toWallet, amount, txType, description, targetFi, now]);
  
  // Update balances for local transfers (receiver must be local wallet)
  if (fromWallet) {
    await updateWalletBalance(fromWallet, -amount);
  }
  if (toWallet && receiverValidation.local && receiverValidation.type === 'wallet') {
    await updateWalletBalance(toWallet, amount);
  }
  
  saveDB();
  console.log(`✅ Transaction ${id}: ${fromWallet} → ${toWallet} (${receiverValidation.name}) : ₹${amount}`);
  return getTransaction(id);
}

// Create offline transaction with ZKP proof
export async function createOfflineTransaction(fromWallet, toWallet, amount, description = '', toFi = null) {
  await getDB();
  
  const sender = await getWallet(fromWallet);
  if (!sender) throw new Error('Sender wallet not found');
  if (sender.balance < amount) throw new Error('Insufficient balance');
  
  // Validate receiver exists in CBDC system
  const receiverValidation = await validateReceiverWallet(toWallet, !!toFi);
  if (!receiverValidation.valid) {
    throw new Error(`Invalid receiver: ${receiverValidation.error}. All payments must be to registered wallets or IoT devices.`);
  }
  
  const id = `offline-tx-${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();
  
  // Generate ZKP proof for offline transaction
  const txData = {
    fromWallet,
    toWallet,
    amount,
    timestamp: now
  };
  const zkpProof = generateOfflineTransactionProof(txData, sender.private_key, sender.public_key);
  
  // Reserve balance for offline transaction
  db.run(`
    UPDATE wallets SET 
      balance = balance - ?,
      offline_balance = offline_balance + ?,
      updated_at = ?
    WHERE id = ?
  `, [amount, amount, now, fromWallet]);
  
  // Store offline transaction
  db.run(`
    INSERT INTO offline_transactions (id, from_wallet, to_wallet, to_fi, amount, description, zkp_proof, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, fromWallet, toWallet, toFi, amount, description, JSON.stringify(zkpProof), now]);
  
  saveDB();
  
  console.log(`✅ Offline TX ${id}: ${fromWallet} → ${toWallet} (${receiverValidation.name}) : ₹${amount}`);
  
  return {
    id,
    fromWallet,
    toWallet,
    toFi,
    amount,
    description,
    zkpProof,
    status: 'pending',
    createdAt: now,
    receiverInfo: receiverValidation
  };
}

// Process offline transaction when coming online
export async function processOfflineTransaction(offlineTxId) {
  await getDB();
  
  const result = db.exec(`SELECT * FROM offline_transactions WHERE id = ? AND status = 'pending'`, [offlineTxId]);
  const offlineTx = resultToObject(result);
  
  if (!offlineTx) throw new Error('Offline transaction not found or already processed');
  
  const now = new Date().toISOString();
  const txId = `tx-${uuidv4().slice(0, 8)}`;
  const zkpProof = JSON.parse(offlineTx.zkp_proof);
  
  // Create actual transaction record
  db.run(`
    INSERT INTO transactions (id, from_wallet, to_wallet, amount, transaction_type, description, is_offline, zkp_proof, target_fi, timestamp)
    VALUES (?, ?, ?, ?, 'offline_transfer', ?, 1, ?, ?, ?)
  `, [txId, offlineTx.from_wallet, offlineTx.to_wallet, offlineTx.amount, offlineTx.description, JSON.stringify(zkpProof), offlineTx.to_fi, now]);
  
  // Debit sender
  db.run(`
    UPDATE wallets SET balance = balance - ?, updated_at = ? WHERE id = ?
  `, [offlineTx.amount, now, offlineTx.from_wallet]);
  
  // Credit receiver if local (to_fi is null, empty, or matches current FI)
  const isLocalTransfer = !offlineTx.to_fi || offlineTx.to_fi === '' || offlineTx.to_fi === FI_NAME;
  if (isLocalTransfer) {
    const receiver = await getWallet(offlineTx.to_wallet);
    if (receiver) {
      db.run(`UPDATE wallets SET balance = balance + ?, updated_at = ? WHERE id = ?`, 
        [offlineTx.amount, now, offlineTx.to_wallet]);
    }
  }
  // If cross-FI, the transaction will be routed through Central Bank during sync
  
  // Clear offline balance from sender
  db.run(`
    UPDATE wallets SET offline_balance = offline_balance - ?, updated_at = ? WHERE id = ?
  `, [offlineTx.amount, now, offlineTx.from_wallet]);
  
  // Update offline transaction status
  db.run(`
    UPDATE offline_transactions SET status = 'completed', synced_at = ? WHERE id = ?
  `, [now, offlineTxId]);
  
  saveDB();
  return getTransaction(txId);
}

// Get all pending offline transactions
export async function getPendingOfflineTransactions() {
  await getDB();
  const result = db.exec(`SELECT * FROM offline_transactions WHERE status = 'pending' ORDER BY created_at DESC`);
  return resultToArray(result).map(tx => ({
    ...tx,
    zkp_proof: JSON.parse(tx.zkp_proof)
  }));
}

export async function getTransaction(id) {
  await getDB();
  const result = db.exec(`SELECT * FROM transactions WHERE id = ?`, [id]);
  return resultToObject(result);
}

export async function getAllTransactions() {
  await getDB();
  const result = db.exec(`SELECT * FROM transactions ORDER BY timestamp DESC`);
  return resultToArray(result);
}

export async function getWalletTransactions(walletId) {
  await getDB();
  const result = db.exec(`
    SELECT * FROM transactions 
    WHERE from_wallet = ? OR to_wallet = ? 
    ORDER BY timestamp DESC
  `, [walletId, walletId]);
  return resultToArray(result);
}

// Get unsynced transactions for syncing with Central Bank
export async function getUnsyncedTransactions() {
  await getDB();
  const result = db.exec(`SELECT * FROM transactions WHERE synced = 0`);
  return resultToArray(result);
}

export async function markTransactionsSynced(transactionIds) {
  await getDB();
  for (const id of transactionIds) {
    db.run(`UPDATE transactions SET synced = 1 WHERE id = ?`, [id]);
  }
  saveDB();
}

// ========== FI FUND MANAGEMENT (Money from Central Bank) ==========

// Receive allocation from Central Bank
export async function receiveAllocationFromCB(allocationId, amount, description = 'Allocation from Central Bank') {
  await getDB();
  
  const id = `fi-fund-${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();
  
  // Record the incoming funds
  db.run(`
    INSERT INTO fi_funds (id, allocation_id, amount, type, description, timestamp)
    VALUES (?, ?, ?, 'credit', ?, ?)
  `, [id, allocationId, amount, description, now]);
  
  // Update FI balances
  const currentAllocated = parseFloat(await getFIInfo('allocated_balance') || '0');
  const currentAvailable = parseFloat(await getFIInfo('available_balance') || '0');
  
  await setFIInfo('allocated_balance', String(currentAllocated + amount));
  await setFIInfo('available_balance', String(currentAvailable + amount));
  
  saveDB();
  
  return {
    id,
    allocationId,
    amount,
    totalAllocated: currentAllocated + amount,
    availableBalance: currentAvailable + amount
  };
}

// Get FI fund balance
export async function getFIBalance() {
  await getDB();
  
  const allocated = parseFloat(await getFIInfo('allocated_balance') || '0');
  const available = parseFloat(await getFIInfo('available_balance') || '0');
  
  // Calculate amount in wallets (main balance)
  const inWallets = db.exec('SELECT SUM(balance) as total FROM wallets');
  const inWalletsAmount = inWallets[0]?.values[0]?.[0] || 0;
  
  // Calculate amount in sub-wallets (IoT devices)
  const inSubWallets = db.exec('SELECT SUM(balance) as total FROM sub_wallets WHERE status = "active"');
  const inSubWalletsAmount = inSubWallets[0]?.values[0]?.[0] || 0;
  
  // Total in user hands = main wallet balances + sub-wallet balances
  const totalInUserHands = inWalletsAmount + inSubWalletsAmount;
  
  return {
    allocatedFromCB: allocated,
    available: available,
    inWallets: inWalletsAmount,
    inSubWallets: inSubWalletsAmount,
    totalInUserHands: totalInUserHands,
    isBalanced: Math.abs(allocated - (available + totalInUserHands)) < 0.01
  };
}

// Credit wallet from FI allocation (when FI gives money to wallet)
// ENFORCES: FI must have received funds from Central Bank first
export async function creditFromAllocation(walletId, amount, description = 'Credit from FI allocation') {
  await getDB();
  const wallet = await getWallet(walletId);
  if (!wallet) throw new Error('Wallet not found');
  
  // Check FI has enough available balance
  const fiBalance = await getFIBalance();
  if (fiBalance.available < amount) {
    throw new Error(`Insufficient FI funds. Available: ₹${fiBalance.available}, Requested: ₹${amount}. ` +
      `FI must receive allocation from Central Bank first.`);
  }
  
  const id = `tx-${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();
  
  // Record the transaction
  db.run(`
    INSERT INTO transactions (id, from_wallet, to_wallet, amount, transaction_type, description, timestamp)
    VALUES (?, NULL, ?, ?, 'credit', ?, ?)
  `, [id, walletId, amount, description, now]);
  
  // Record FI funds outflow
  db.run(`
    INSERT INTO fi_funds (id, allocation_id, amount, type, description, timestamp)
    VALUES (?, ?, ?, 'debit', ?, ?)
  `, [`fi-fund-${uuidv4().slice(0, 8)}`, null, amount, `Credited to wallet ${walletId}`, now]);
  
  // Deduct from FI available balance
  const currentAvailable = parseFloat(await getFIInfo('available_balance') || '0');
  await setFIInfo('available_balance', String(currentAvailable - amount));
  
  // Credit the wallet
  await updateWalletBalance(walletId, amount);
  saveDB();
  
  return getTransaction(id);
}

// Credit wallet directly (for cross-FI transfers - money already transferred between FIs)
// This does NOT deduct from FI balance as the money comes from another FI
export async function creditWalletDirect(walletId, amount, description = 'Credit from cross-FI transfer') {
  await getDB();
  const wallet = await getWallet(walletId);
  if (!wallet) throw new Error('Wallet not found');
  
  const id = `tx-${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();
  
  // Record the transaction
  db.run(`
    INSERT INTO transactions (id, from_wallet, to_wallet, amount, transaction_type, description, timestamp)
    VALUES (?, NULL, ?, ?, 'cross_fi_credit', ?, ?)
  `, [id, walletId, amount, description, now]);
  
  // For cross-FI: receive funds from other FI (adds to FI allocation)
  const currentAllocated = parseFloat(await getFIInfo('allocated_balance') || '0');
  await setFIInfo('allocated_balance', String(currentAllocated + amount));
  
  // Credit the wallet
  await updateWalletBalance(walletId, amount);
  saveDB();
  
  return getTransaction(id);
}

// FI Info Operations
export async function setFIInfo(key, value) {
  await getDB();
  db.run(`
    INSERT OR REPLACE INTO fi_info (key, value) VALUES (?, ?)
  `, [key, value]);
  saveDB();
}

export async function getFIInfo(key) {
  await getDB();
  const result = db.exec(`SELECT value FROM fi_info WHERE key = ?`, [key]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return result[0].values[0][0];
}

// Get FI statistics
export async function getFIStats() {
  await getDB();
  
  const totalWallets = db.exec('SELECT COUNT(*) as count FROM wallets');
  const totalBalance = db.exec('SELECT SUM(balance) as total FROM wallets');
  const totalTransactions = db.exec('SELECT COUNT(*) as count FROM transactions');
  const pendingSync = db.exec('SELECT COUNT(*) as count FROM transactions WHERE synced = 0');
  const offlineBalance = db.exec('SELECT SUM(offline_balance) as total FROM wallets');
  const pendingOffline = db.exec('SELECT COUNT(*) as count FROM offline_transactions WHERE status = "pending"');
  const totalDevices = db.exec('SELECT COUNT(*) as count FROM iot_devices WHERE status = "active"');
  
  // FI fund balance
  const fiBalance = await getFIBalance();
  
  return {
    totalWallets: totalWallets[0]?.values[0]?.[0] || 0,
    totalBalance: totalBalance[0]?.values[0]?.[0] || 0,
    totalTransactions: totalTransactions[0]?.values[0]?.[0] || 0,
    pendingSync: pendingSync[0]?.values[0]?.[0] || 0,
    offlineBalance: offlineBalance[0]?.values[0]?.[0] || 0,
    pendingOffline: pendingOffline[0]?.values[0]?.[0] || 0,
    totalDevices: totalDevices[0]?.values[0]?.[0] || 0,
    // FI fund tracking
    allocatedFromCB: fiBalance.allocatedFromCB,
    availableToCredit: fiBalance.available,
    inWallets: fiBalance.inWallets,
    inSubWallets: fiBalance.inSubWallets,
    totalInUserHands: fiBalance.totalInUserHands,
    fundsBalanced: fiBalance.isBalanced
  };
}

// ========== IoT DEVICE OPERATIONS ==========

export async function registerIoTDevice(walletId, deviceType, deviceName) {
  await getDB();
  const wallet = await getWallet(walletId);
  if (!wallet) throw new Error('Wallet not found');
  
  const id = `device-${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();
  
  // Generate auth token
  const authToken = crypto.createHash('sha256')
    .update(`${id}||${walletId}||${wallet.public_key}||${now}`)
    .digest('hex');
  
  db.run(`
    INSERT INTO iot_devices (id, wallet_id, device_type, device_name, auth_token, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [id, walletId, deviceType, deviceName, authToken, now]);
  
  // Update wallet device bindings
  const bindings = wallet.device_bindings || [];
  bindings.push({ deviceId: id, deviceType, deviceName });
  db.run(`UPDATE wallets SET device_bindings = ? WHERE id = ?`, [JSON.stringify(bindings), walletId]);
  
  saveDB();
  
  return {
    id,
    walletId,
    deviceType,
    deviceName,
    authToken,
    status: 'active',
    createdAt: now
  };
}

export async function getWalletDevices(walletId) {
  await getDB();
  const result = db.exec(`SELECT * FROM iot_devices WHERE wallet_id = ? AND status = 'active'`, [walletId]);
  return resultToArray(result);
}

export async function verifyDeviceAuth(deviceId, authToken) {
  await getDB();
  const result = db.exec(`SELECT * FROM iot_devices WHERE id = ? AND auth_token = ? AND status = 'active'`, [deviceId, authToken]);
  const device = resultToObject(result);
  if (!device) return { valid: false, error: 'Invalid device or token' };
  return { valid: true, device };
}

export async function createIoTPayment(deviceId, authToken, toWallet, amount, description = '', toFi = null) {
  // Verify device first
  const authResult = await verifyDeviceAuth(deviceId, authToken);
  if (!authResult.valid) throw new Error(authResult.error);
  
  const device = authResult.device;
  const now = new Date().toISOString();
  
  // Update device last used
  db.run(`UPDATE iot_devices SET last_used = ? WHERE id = ?`, [now, deviceId]);
  saveDB();
  
  // Create transaction from device's wallet
  return createTransaction(device.wallet_id, toWallet, amount, `${description} [via ${device.device_type}]`, toFi);
}

export async function revokeDevice(deviceId) {
  await getDB();
  const now = new Date().toISOString();
  db.run(`UPDATE iot_devices SET status = 'revoked' WHERE id = ?`, [deviceId]);
  saveDB();
  return { success: true, revokedAt: now };
}

// Get all IoT devices
export async function getAllDevices() {
  await getDB();
  const result = db.exec(`SELECT * FROM iot_devices ORDER BY created_at DESC`);
  return resultToArray(result);
}

// ========== SUB-WALLET OPERATIONS (Paper Section III-B) ==========

/**
 * Create sub-wallet for IoT device
 * From paper: "Main wallet allocates partial balance to IoT sub-wallets"
 */
export async function createSubWallet(mainWalletId, deviceId, allocatedBalance, spendingLimit = null) {
  await getDB();
  
  const mainWallet = await getWallet(mainWalletId);
  if (!mainWallet) throw new Error('Main wallet not found');
  
  const device = await getDevice(deviceId);
  if (!device) throw new Error('Device not found');
  if (device.wallet_id !== mainWalletId) throw new Error('Device not linked to this wallet');
  
  // Enforce limits from paper
  const effectiveLimit = Math.min(
    spendingLimit || COMPLIANCE_LIMITS.SUB_WALLET_LIMIT,
    COMPLIANCE_LIMITS.SUB_WALLET_LIMIT
  );
  const effectiveBalance = Math.min(allocatedBalance, effectiveLimit);
  
  if (mainWallet.balance < effectiveBalance) {
    throw new Error('Insufficient main wallet balance');
  }
  
  const id = `sub-${uuidv4().slice(0, 8)}`;
  const txId = `tx-${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();
  
  // Deduct from main wallet
  db.run(`UPDATE wallets SET balance = balance - ?, updated_at = ? WHERE id = ?`, 
    [effectiveBalance, now, mainWalletId]);
  
  // Create sub-wallet
  db.run(`
    INSERT INTO sub_wallets (id, main_wallet_id, device_id, device_type, balance, spending_limit, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, mainWalletId, deviceId, device.device_type, effectiveBalance, effectiveLimit, now, now]);
  
  // Record allocation transaction for IoT transaction history
  db.run(`
    INSERT INTO transactions (id, from_wallet, to_wallet, amount, transaction_type, description, status, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [txId, mainWalletId, id, effectiveBalance, 'sub_wallet_allocation', 
      `Initial allocation to ${device.device_name || device.device_type} [Sub-wallet: ${id}]`, 'completed', now]);
  
  saveDB();
  
  return getSubWallet(id);
}

export async function getSubWallet(id) {
  await getDB();
  const result = db.exec(`SELECT * FROM sub_wallets WHERE id = ?`, [id]);
  return resultToObject(result);
}

export async function getSubWalletsByMainWallet(mainWalletId, includeRevoked = true) {
  await getDB();
  const statusFilter = includeRevoked ? '' : "AND status = 'active'";
  const result = db.exec(`SELECT * FROM sub_wallets WHERE main_wallet_id = ? ${statusFilter} ORDER BY created_at DESC`, [mainWalletId]);
  return resultToArray(result);
}

export async function getSubWalletByDevice(deviceId) {
  await getDB();
  const result = db.exec(`SELECT * FROM sub_wallets WHERE device_id = ? AND status = 'active'`, [deviceId]);
  return resultToObject(result);
}

/**
 * Allocate additional funds to sub-wallet
 */
export async function allocateToSubWallet(subWalletId, amount) {
  await getDB();
  
  const subWallet = await getSubWallet(subWalletId);
  if (!subWallet) throw new Error('Sub-wallet not found');
  
  const mainWallet = await getWallet(subWallet.main_wallet_id);
  if (!mainWallet) throw new Error('Main wallet not found');
  
  if (mainWallet.balance < amount) throw new Error('Insufficient main wallet balance');
  if (subWallet.balance + amount > subWallet.spending_limit) {
    throw new Error('Would exceed sub-wallet spending limit');
  }
  
  const txId = `tx-${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();
  
  db.run(`UPDATE wallets SET balance = balance - ?, updated_at = ? WHERE id = ?`,
    [amount, now, subWallet.main_wallet_id]);
  db.run(`UPDATE sub_wallets SET balance = balance + ?, updated_at = ? WHERE id = ?`,
    [amount, now, subWalletId]);
  
  // Record allocation transaction for IoT transaction history
  db.run(`
    INSERT INTO transactions (id, from_wallet, to_wallet, amount, transaction_type, description, status, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [txId, subWallet.main_wallet_id, subWalletId, amount, 'sub_wallet_allocation', 
      `Additional allocation to ${subWallet.device_type} [Sub-wallet: ${subWalletId}]`, 'completed', now]);
  
  saveDB();
  return getSubWallet(subWalletId);
}

/**
 * Return funds from sub-wallet to main wallet
 */
export async function returnFromSubWallet(subWalletId, amount = null) {
  await getDB();
  
  const subWallet = await getSubWallet(subWalletId);
  if (!subWallet) throw new Error('Sub-wallet not found');
  
  const returnAmount = amount || subWallet.balance;
  if (returnAmount > subWallet.balance) throw new Error('Insufficient sub-wallet balance');
  
  const txId = `tx-${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();
  
  db.run(`UPDATE wallets SET balance = balance + ?, updated_at = ? WHERE id = ?`,
    [returnAmount, now, subWallet.main_wallet_id]);
  db.run(`UPDATE sub_wallets SET balance = balance - ?, updated_at = ? WHERE id = ?`,
    [returnAmount, now, subWalletId]);
  
  // Record return transaction for IoT transaction history
  db.run(`
    INSERT INTO transactions (id, from_wallet, to_wallet, amount, transaction_type, description, status, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [txId, subWalletId, subWallet.main_wallet_id, returnAmount, 'sub_wallet_return', 
      `Funds returned from ${subWallet.device_type} [Sub-wallet: ${subWalletId}]`, 'completed', now]);
  
  saveDB();
  return {
    subWallet: await getSubWallet(subWalletId),
    mainWallet: await getWalletPublic(subWallet.main_wallet_id),
    returnedAmount: returnAmount
  };
}

/**
 * Revoke sub-wallet - returns all balance to main wallet and deactivates
 */
export async function revokeSubWallet(subWalletId) {
  await getDB();
  
  const subWallet = await getSubWallet(subWalletId);
  if (!subWallet) throw new Error('Sub-wallet not found');
  
  const returnAmount = subWallet.balance;
  const now = new Date().toISOString();
  
  // Return all balance to main wallet
  if (returnAmount > 0) {
    db.run(`UPDATE wallets SET balance = balance + ?, updated_at = ? WHERE id = ?`,
      [returnAmount, now, subWallet.main_wallet_id]);
  }
  
  // Deactivate sub-wallet and zero out balance
  db.run(`UPDATE sub_wallets SET balance = 0, status = 'revoked', updated_at = ? WHERE id = ?`,
    [now, subWalletId]);
  
  saveDB();
  
  return {
    success: true,
    revokedSubWallet: await getSubWallet(subWalletId),
    mainWallet: await getWalletPublic(subWallet.main_wallet_id),
    returnedAmount: returnAmount,
    message: `Sub-wallet revoked. ₹${returnAmount} returned to main wallet.`
  };
}

/**
 * Create payment from sub-wallet (IoT device payment)
 */
export async function createSubWalletPayment(subWalletId, authToken, toWallet, amount, description = '') {
  await getDB();
  
  const subWallet = await getSubWallet(subWalletId);
  if (!subWallet) throw new Error('Sub-wallet not found');
  if (subWallet.status !== 'active') throw new Error('Sub-wallet is not active');
  
  // Verify device auth
  const device = await getDevice(subWallet.device_id);
  if (!device || device.auth_token !== authToken) throw new Error('Invalid auth token');
  
  // Check balance
  if (subWallet.balance < amount) throw new Error('Insufficient sub-wallet balance');
  
  // Check daily limit
  await resetDailyLimitsIfNeeded(subWalletId);
  const updatedSubWallet = await getSubWallet(subWalletId);
  if (updatedSubWallet.daily_spent + amount > updatedSubWallet.daily_limit) {
    throw new Error('Would exceed daily spending limit');
  }
  
  // Check IoT device transaction limit
  if (amount > COMPLIANCE_LIMITS.IOT_DEVICE_LIMIT) {
    throw new Error(`Amount exceeds IoT device limit (₹${COMPLIANCE_LIMITS.IOT_DEVICE_LIMIT})`);
  }
  
  const now = new Date().toISOString();
  const txId = `tx-${uuidv4().slice(0, 8)}`;
  
  // Increment monotonic counter
  const newCounter = subWallet.monotonic_counter + 1;
  
  // Deduct from sub-wallet
  db.run(`
    UPDATE sub_wallets SET 
      balance = balance - ?, 
      daily_spent = daily_spent + ?,
      monotonic_counter = ?,
      updated_at = ? 
    WHERE id = ?
  `, [amount, amount, newCounter, now, subWalletId]);
  
  // Credit receiver
  const receiver = await getWallet(toWallet);
  if (receiver) {
    db.run(`UPDATE wallets SET balance = balance + ?, updated_at = ? WHERE id = ?`,
      [amount, now, toWallet]);
  }
  
  // Create transaction record
  db.run(`
    INSERT INTO transactions (id, from_wallet, to_wallet, amount, transaction_type, description, timestamp)
    VALUES (?, ?, ?, ?, 'sub_wallet_transfer', ?, ?)
  `, [txId, subWallet.main_wallet_id, toWallet, amount, `[Sub-wallet: ${subWalletId}] ${description}`, now]);
  
  // Update device last used
  db.run(`UPDATE iot_devices SET last_used = ? WHERE id = ?`, [now, subWallet.device_id]);
  
  saveDB();
  return getTransaction(txId);
}

async function resetDailyLimitsIfNeeded(subWalletId) {
  await getDB();
  const subWallet = await getSubWallet(subWalletId);
  if (!subWallet) return;
  
  const lastReset = new Date(subWallet.last_daily_reset);
  const now = new Date();
  
  // Reset if new day
  if (lastReset.toDateString() !== now.toDateString()) {
    db.run(`
      UPDATE sub_wallets SET daily_spent = 0, last_daily_reset = ? WHERE id = ?
    `, [now.toISOString(), subWalletId]);
    saveDB();
  }
}

// ========== NULLIFIER OPERATIONS (Paper Section III-D) ==========

/**
 * Register a nullifier (marks token as spent)
 */
export async function registerNullifier(nullifier, serialNumber, walletId, transactionId, amount) {
  await getDB();
  
  // Check if nullifier already exists (double-spend attempt)
  const existing = db.exec(`SELECT * FROM nullifiers WHERE nullifier = ?`, [nullifier]);
  if (existing.length > 0 && existing[0].values.length > 0) {
    throw new Error('DOUBLE_SPEND_DETECTED: Nullifier already registered');
  }
  
  const now = new Date().toISOString();
  db.run(`
    INSERT INTO nullifiers (nullifier, serial_number, wallet_id, transaction_id, amount, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [nullifier, serialNumber, walletId, transactionId, amount, now]);
  
  saveDB();
  return { nullifier, registered: true, registeredAt: now };
}

/**
 * Check if nullifier exists (double-spend check)
 */
export async function checkNullifier(nullifier) {
  await getDB();
  const result = db.exec(`SELECT * FROM nullifiers WHERE nullifier = ?`, [nullifier]);
  const exists = result.length > 0 && result[0].values.length > 0;
  return { 
    exists, 
    data: exists ? resultToObject(result) : null 
  };
}

/**
 * Get all nullifiers for a wallet
 */
export async function getWalletNullifiers(walletId) {
  await getDB();
  const result = db.exec(`SELECT * FROM nullifiers WHERE wallet_id = ? ORDER BY created_at DESC`, [walletId]);
  return resultToArray(result);
}

/**
 * Get all nullifiers (for sync to Central Bank)
 */
export async function getAllNullifiers() {
  await getDB();
  const result = db.exec(`SELECT * FROM nullifiers ORDER BY created_at DESC`);
  return resultToArray(result);
}

// ========== SERIAL NUMBER OPERATIONS ==========

/**
 * Issue serial numbers for CBDC tokens in wallet
 */
export async function issueSerialNumbers(walletId, totalAmount, batchId = null) {
  await getDB();
  
  const batch = batchId || `batch-${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();
  const serialNumbers = [];
  
  // Create serial numbers for each unit (simplified: one per 100 units)
  const unitSize = 100;
  const numUnits = Math.ceil(totalAmount / unitSize);
  
  for (let i = 0; i < numUnits; i++) {
    const amount = Math.min(unitSize, totalAmount - (i * unitSize));
    const sn = zkpEnhanced.generateSerialNumber(FI_ID, batch, i);
    
    db.run(`
      INSERT INTO serial_numbers (serial_number, wallet_id, amount, batch_id, issued_at)
      VALUES (?, ?, ?, ?, ?)
    `, [sn.serialNumber, walletId, amount, batch, now]);
    
    serialNumbers.push(sn);
  }
  
  saveDB();
  return { batchId: batch, serialNumbers, totalAmount };
}

/**
 * Get active serial numbers for wallet
 */
export async function getWalletSerialNumbers(walletId) {
  await getDB();
  const result = db.exec(`SELECT * FROM serial_numbers WHERE wallet_id = ? AND status = 'active'`, [walletId]);
  return resultToArray(result);
}

/**
 * Mark serial number as spent
 */
export async function spendSerialNumber(serialNumber) {
  await getDB();
  const now = new Date().toISOString();
  db.run(`UPDATE serial_numbers SET status = 'spent', spent_at = ? WHERE serial_number = ?`, [now, serialNumber]);
  saveDB();
}

// ========== COMPLIANCE TRACKING (Paper Section III-C) ==========

/**
 * Initialize compliance tracking for wallet
 */
export async function initComplianceTracking(walletId) {
  await getDB();
  
  // Check if already exists
  const existing = db.exec(`SELECT * FROM compliance_tracking WHERE wallet_id = ?`, [walletId]);
  if (existing.length > 0 && existing[0].values.length > 0) return;
  
  const now = new Date().toISOString();
  db.run(`
    INSERT INTO compliance_tracking (wallet_id, last_daily_reset, last_monthly_reset, updated_at)
    VALUES (?, ?, ?, ?)
  `, [walletId, now, now, now]);
  saveDB();
}

/**
 * Update compliance tracking after transaction
 */
export async function updateComplianceTracking(walletId, amount, isOffline = false) {
  await getDB();
  await initComplianceTracking(walletId);
  await resetComplianceLimitsIfNeeded(walletId);
  
  const now = new Date().toISOString();
  
  db.run(`
    UPDATE compliance_tracking SET 
      daily_spent = daily_spent + ?,
      monthly_spent = monthly_spent + ?,
      daily_tx_count = daily_tx_count + 1,
      offline_tx_count = offline_tx_count + ?,
      updated_at = ?
    WHERE wallet_id = ?
  `, [amount, amount, isOffline ? 1 : 0, now, walletId]);
  
  saveDB();
  return getComplianceStatus(walletId);
}

async function resetComplianceLimitsIfNeeded(walletId) {
  await getDB();
  const result = db.exec(`SELECT * FROM compliance_tracking WHERE wallet_id = ?`, [walletId]);
  const tracking = resultToObject(result);
  if (!tracking) return;
  
  const now = new Date();
  const lastDaily = new Date(tracking.last_daily_reset);
  const lastMonthly = new Date(tracking.last_monthly_reset);
  
  // Reset daily if new day
  if (lastDaily.toDateString() !== now.toDateString()) {
    db.run(`
      UPDATE compliance_tracking SET daily_spent = 0, daily_tx_count = 0, offline_tx_count = 0, last_daily_reset = ? WHERE wallet_id = ?
    `, [now.toISOString(), walletId]);
  }
  
  // Reset monthly if new month
  if (lastMonthly.getMonth() !== now.getMonth() || lastMonthly.getFullYear() !== now.getFullYear()) {
    db.run(`
      UPDATE compliance_tracking SET monthly_spent = 0, last_monthly_reset = ? WHERE wallet_id = ?
    `, [now.toISOString(), walletId]);
  }
  
  saveDB();
}

/**
 * Get compliance status for wallet
 */
export async function getComplianceStatus(walletId) {
  await getDB();
  await initComplianceTracking(walletId);
  await resetComplianceLimitsIfNeeded(walletId);
  
  const result = db.exec(`SELECT * FROM compliance_tracking WHERE wallet_id = ?`, [walletId]);
  const tracking = resultToObject(result);
  
  if (!tracking) return null;
  
  return {
    walletId,
    dailySpent: tracking.daily_spent,
    dailyRemaining: COMPLIANCE_LIMITS.DAILY_LIMIT - tracking.daily_spent,
    monthlySpent: tracking.monthly_spent,
    monthlyRemaining: COMPLIANCE_LIMITS.MONTHLY_LIMIT - tracking.monthly_spent,
    dailyTxCount: tracking.daily_tx_count,
    offlineTxCount: tracking.offline_tx_count,
    offlineTxRemaining: COMPLIANCE_LIMITS.OFFLINE_DAILY_COUNT - tracking.offline_tx_count,
    limits: COMPLIANCE_LIMITS,
    status: tracking.status,
    flags: JSON.parse(tracking.flags || '[]')
  };
}

/**
 * Check if transaction is compliant
 */
export async function checkTransactionCompliance(walletId, amount, isOffline = false) {
  const status = await getComplianceStatus(walletId);
  if (!status) return { compliant: false, error: 'Compliance tracking not found' };
  
  const issues = [];
  
  if (amount > COMPLIANCE_LIMITS.SINGLE_TX_LIMIT) {
    issues.push(`Amount exceeds single transaction limit (₹${COMPLIANCE_LIMITS.SINGLE_TX_LIMIT})`);
  }
  if (status.dailySpent + amount > COMPLIANCE_LIMITS.DAILY_LIMIT) {
    issues.push(`Would exceed daily limit (₹${COMPLIANCE_LIMITS.DAILY_LIMIT})`);
  }
  if (status.monthlySpent + amount > COMPLIANCE_LIMITS.MONTHLY_LIMIT) {
    issues.push(`Would exceed monthly limit (₹${COMPLIANCE_LIMITS.MONTHLY_LIMIT})`);
  }
  if (isOffline) {
    if (amount > COMPLIANCE_LIMITS.OFFLINE_LIMIT) {
      issues.push(`Amount exceeds offline transaction limit (₹${COMPLIANCE_LIMITS.OFFLINE_LIMIT})`);
    }
    if (status.offlineTxCount >= COMPLIANCE_LIMITS.OFFLINE_DAILY_COUNT) {
      issues.push(`Daily offline transaction count exceeded (${COMPLIANCE_LIMITS.OFFLINE_DAILY_COUNT})`);
    }
  }
  
  return {
    compliant: issues.length === 0,
    issues,
    status
  };
}

// ========== SECURE ELEMENT LOG OPERATIONS ==========

/**
 * Log transaction in secure element
 */
export async function logToSecureElement(walletId, txHash, signature) {
  await getDB();
  
  // Get current sequence
  const seqResult = db.exec(`SELECT MAX(sequence) as max_seq FROM secure_element_logs WHERE wallet_id = ?`, [walletId]);
  const currentSeq = (seqResult[0]?.values[0]?.[0] || 0);
  const newSeq = currentSeq + 1;
  
  const now = new Date().toISOString();
  db.run(`
    INSERT INTO secure_element_logs (wallet_id, sequence, tx_hash, signature, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `, [walletId, newSeq, txHash, signature, now]);
  
  saveDB();
  return { sequence: newSeq, txHash, timestamp: now };
}

/**
 * Get secure element logs for wallet
 */
export async function getSecureElementLogs(walletId, limit = 100) {
  await getDB();
  const result = db.exec(`SELECT * FROM secure_element_logs WHERE wallet_id = ? ORDER BY sequence DESC LIMIT ?`, [walletId, limit]);
  return resultToArray(result);
}

/**
 * Get monotonic counter for wallet
 */
export async function getMonotonicCounter(walletId) {
  await getDB();
  const result = db.exec(`SELECT MAX(sequence) as counter FROM secure_element_logs WHERE wallet_id = ?`, [walletId]);
  return result[0]?.values[0]?.[0] || 0;
}

// ========== ENHANCED OFFLINE TRANSACTION ==========

/**
 * Create enhanced offline transaction with full ZKP proof
 */
export async function createEnhancedOfflineTransaction(fromWallet, toWallet, amount, description = '', toFi = null) {
  await getDB();
  
  const sender = await getWallet(fromWallet);
  if (!sender) throw new Error('Sender wallet not found');
  if (sender.balance < amount) throw new Error('Insufficient balance');
  
  // Check compliance
  const compliance = await checkTransactionCompliance(fromWallet, amount, true);
  if (!compliance.compliant) {
    throw new Error(`Compliance check failed: ${compliance.issues.join(', ')}`);
  }
  
  // Get or create serial number
  let serialNumbers = await getWalletSerialNumbers(fromWallet);
  if (serialNumbers.length === 0) {
    await issueSerialNumbers(fromWallet, sender.balance);
    serialNumbers = await getWalletSerialNumbers(fromWallet);
  }
  const serialNumber = serialNumbers[0]?.serial_number || `SN-${crypto.randomBytes(16).toString('hex')}`;
  
  const id = `offline-tx-${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();
  
  // Generate enhanced ZKP proof
  const txData = { fromWallet, toWallet, amount, timestamp: now };
  const enhancedProof = zkpEnhanced.generateEnhancedOfflineProof({
    transaction: txData,
    senderPrivateKey: sender.private_key,
    senderPublicKey: sender.public_key,
    senderBalance: sender.balance,
    serialNumber,
    dailySpent: compliance.status.dailySpent,
    monthlySpent: compliance.status.monthlySpent,
    offlineTxCount: compliance.status.offlineTxCount
  });
  
  // Reserve balance
  db.run(`
    UPDATE wallets SET 
      balance = balance - ?,
      offline_balance = offline_balance + ?,
      updated_at = ?
    WHERE id = ?
  `, [amount, amount, now, fromWallet]);
  
  // Store offline transaction
  db.run(`
    INSERT INTO offline_transactions (id, from_wallet, to_wallet, to_fi, amount, description, zkp_proof, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, fromWallet, toWallet, toFi, amount, description, JSON.stringify(enhancedProof), now]);
  
  // Log to secure element
  await logToSecureElement(fromWallet, enhancedProof.txHash, enhancedProof.combinedSignature);
  
  saveDB();
  
  return {
    id,
    fromWallet,
    toWallet,
    toFi,
    amount,
    description,
    zkpProof: enhancedProof,
    nullifier: enhancedProof.nullifier,
    status: 'pending',
    createdAt: now
  };
}

/**
 * Process enhanced offline transaction with nullifier registration
 */
export async function processEnhancedOfflineTransaction(offlineTxId) {
  await getDB();
  
  const result = db.exec(`SELECT * FROM offline_transactions WHERE id = ? AND status = 'pending'`, [offlineTxId]);
  const offlineTx = resultToObject(result);
  
  if (!offlineTx) throw new Error('Offline transaction not found or already processed');
  
  const zkpProof = JSON.parse(offlineTx.zkp_proof);
  
  // Check for double-spend via nullifier
  const nullifierCheck = await checkNullifier(zkpProof.nullifier);
  if (nullifierCheck.exists) {
    throw new Error('DOUBLE_SPEND_DETECTED: Transaction already processed');
  }
  
  const now = new Date().toISOString();
  const txId = `tx-${uuidv4().slice(0, 8)}`;
  
  // Register nullifier
  await registerNullifier(
    zkpProof.nullifier,
    'from_offline_tx',
    offlineTx.from_wallet,
    txId,
    offlineTx.amount
  );
  
  // Create actual transaction
  db.run(`
    INSERT INTO transactions (id, from_wallet, to_wallet, amount, transaction_type, description, is_offline, zkp_proof, target_fi, timestamp)
    VALUES (?, ?, ?, ?, 'enhanced_offline_transfer', ?, 1, ?, ?, ?)
  `, [txId, offlineTx.from_wallet, offlineTx.to_wallet, offlineTx.amount, offlineTx.description, JSON.stringify(zkpProof), offlineTx.to_fi, now]);
  
  // Debit sender (already done via offline_balance)
  db.run(`UPDATE wallets SET offline_balance = offline_balance - ?, updated_at = ? WHERE id = ?`,
    [offlineTx.amount, now, offlineTx.from_wallet]);
  
  // Credit receiver if local
  const isLocalTransfer = !offlineTx.to_fi || offlineTx.to_fi === '' || offlineTx.to_fi === FI_NAME;
  if (isLocalTransfer) {
    const receiver = await getWallet(offlineTx.to_wallet);
    if (receiver) {
      db.run(`UPDATE wallets SET balance = balance + ?, updated_at = ? WHERE id = ?`,
        [offlineTx.amount, now, offlineTx.to_wallet]);
    }
  }
  
  // Update compliance tracking
  await updateComplianceTracking(offlineTx.from_wallet, offlineTx.amount, true);
  
  // Update offline transaction status
  db.run(`UPDATE offline_transactions SET status = 'completed', synced_at = ? WHERE id = ?`, [now, offlineTxId]);
  
  saveDB();
  return getTransaction(txId);
}

// Helper function
async function getDevice(deviceId) {
  await getDB();
  const result = db.exec(`SELECT * FROM iot_devices WHERE id = ?`, [deviceId]);
  return resultToObject(result);
}

// ============================================
// FREEZE/UNFREEZE FUNCTIONS (CB Control)
// ============================================

// Freeze a wallet
export async function freezeWallet(walletId, reason, frozenBy = 'central_bank') {
  await getDB();
  const now = new Date().toISOString();
  
  db.run(`
    UPDATE wallets SET 
      is_frozen = 1, 
      status = 'frozen',
      freeze_reason = ?,
      frozen_by = ?,
      frozen_at = ?,
      updated_at = ?
    WHERE id = ?
  `, [reason, frozenBy, now, now, walletId]);
  
  saveDB();
  console.log(`🔒 Wallet ${walletId} FROZEN by ${frozenBy}: ${reason}`);
  return { frozen: true, walletId, reason, frozenBy, frozenAt: now };
}

// Unfreeze a wallet
export async function unfreezeWallet(walletId) {
  await getDB();
  const now = new Date().toISOString();
  
  db.run(`
    UPDATE wallets SET 
      is_frozen = 0, 
      status = 'active',
      freeze_reason = NULL,
      frozen_by = NULL,
      frozen_at = NULL,
      updated_at = ?
    WHERE id = ?
  `, [now, walletId]);
  
  saveDB();
  console.log(`🔓 Wallet ${walletId} UNFROZEN`);
  return { unfrozen: true, walletId };
}

// Check if wallet is frozen
export async function isWalletFrozen(walletId) {
  await getDB();
  const result = db.exec(`SELECT is_frozen, freeze_reason, frozen_by FROM wallets WHERE id = ?`, [walletId]);
  if (result.length === 0 || result[0].values.length === 0) return false;
  return result[0].values[0][0] === 1;
}

// Freeze a sub-wallet/device
export async function freezeSubWallet(subWalletId, reason, frozenBy = 'central_bank') {
  await getDB();
  const now = new Date().toISOString();
  
  db.run(`
    UPDATE sub_wallets SET 
      is_frozen = 1, 
      status = 'frozen',
      freeze_reason = ?,
      frozen_by = ?,
      frozen_at = ?,
      updated_at = ?
    WHERE id = ?
  `, [reason, frozenBy, now, now, subWalletId]);
  
  saveDB();
  console.log(`🔒 Sub-wallet ${subWalletId} FROZEN by ${frozenBy}: ${reason}`);
  return { frozen: true, subWalletId, reason, frozenBy, frozenAt: now };
}

// Unfreeze a sub-wallet/device
export async function unfreezeSubWallet(subWalletId) {
  await getDB();
  const now = new Date().toISOString();
  
  db.run(`
    UPDATE sub_wallets SET 
      is_frozen = 0, 
      status = 'active',
      freeze_reason = NULL,
      frozen_by = NULL,
      frozen_at = NULL,
      updated_at = ?
    WHERE id = ?
  `, [now, subWalletId]);
  
  saveDB();
  console.log(`🔓 Sub-wallet ${subWalletId} UNFROZEN`);
  return { unfrozen: true, subWalletId };
}

// Check if sub-wallet is frozen
export async function isSubWalletFrozen(subWalletId) {
  await getDB();
  const result = db.exec(`SELECT is_frozen FROM sub_wallets WHERE id = ?`, [subWalletId]);
  if (result.length === 0 || result[0].values.length === 0) return false;
  return result[0].values[0][0] === 1;
}

// Get all frozen entities
export async function getFrozenEntities() {
  await getDB();
  
  const frozenWallets = db.exec(`SELECT id, name, freeze_reason, frozen_by, frozen_at FROM wallets WHERE is_frozen = 1`);
  const frozenSubWallets = db.exec(`SELECT id, main_wallet_id, device_type, freeze_reason, frozen_by, frozen_at FROM sub_wallets WHERE is_frozen = 1`);
  
  return {
    wallets: frozenWallets.length > 0 ? frozenWallets[0].values.map(v => ({
      id: v[0], name: v[1], freeze_reason: v[2], frozen_by: v[3], frozen_at: v[4]
    })) : [],
    subWallets: frozenSubWallets.length > 0 ? frozenSubWallets[0].values.map(v => ({
      id: v[0], main_wallet_id: v[1], device_type: v[2], freeze_reason: v[3], frozen_by: v[4], frozen_at: v[5]
    })) : []
  };
}

// ============================================
// IOT OFFLINE TRANSACTION & SYNC FUNCTIONS
// ============================================

// Create IoT offline transaction (stored locally until sync)
export async function createIoTOfflineTransaction(subWalletId, toWallet, amount, description = '', toFi = null, zkpProof = null) {
  await getDB();
  const id = `iot-tx-${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();
  
  // Get sub-wallet details
  const subWallet = await getSubWallet(subWalletId);
  if (!subWallet) {
    throw new Error('Sub-wallet not found');
  }
  
  // Check if sub-wallet is frozen
  if (subWallet.is_frozen === 1) {
    throw new Error('Sub-wallet is frozen');
  }
  
  // Validate receiver exists in CBDC system
  const receiverValidation = await validateReceiverWallet(toWallet, !!toFi);
  if (!receiverValidation.valid) {
    throw new Error(`Invalid receiver: ${receiverValidation.error}. Merchants must have a registered wallet or IoT device to receive payments.`);
  }
  
  // Check balance
  if (subWallet.balance < amount) {
    throw new Error(`Insufficient balance: ${subWallet.balance} < ${amount}`);
  }
  
  // Check daily limit
  const dailySpent = subWallet.daily_spent || 0;
  const dailyLimit = subWallet.daily_limit || COMPLIANCE_LIMITS.IOT_DEVICE_LIMIT;
  if (dailySpent + amount > dailyLimit) {
    throw new Error(`Daily limit exceeded: ${dailySpent + amount} > ${dailyLimit}`);
  }
  
  // Increment monotonic counter
  const newCounter = (subWallet.monotonic_counter || 0) + 1;
  
  // Generate nullifier for double-spend prevention
  const nullifier = crypto.createHash('sha256')
    .update(`${subWalletId}||${newCounter}||${amount}||${now}`)
    .digest('hex');
  
  // Deduct from sub-wallet
  db.run(`
    UPDATE sub_wallets SET 
      balance = balance - ?,
      daily_spent = daily_spent + ?,
      monotonic_counter = ?,
      updated_at = ?
    WHERE id = ?
  `, [amount, amount, newCounter, now, subWalletId]);
  
  // Create offline transaction record
  db.run(`
    INSERT INTO iot_offline_transactions 
    (id, sub_wallet_id, main_wallet_id, device_id, to_wallet, to_fi, amount, description, monotonic_counter, zkp_proof, nullifier, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, subWalletId, subWallet.main_wallet_id, subWallet.device_id, toWallet, toFi || null, amount, description, newCounter, zkpProof || null, nullifier, now]);
  
  saveDB();
  
  console.log(`📱 IoT Offline TX Created: ${subWalletId} → ${toWallet} (${receiverValidation.name}) : ₹${amount} (Counter: ${newCounter})`);
  
  return {
    id,
    sub_wallet_id: subWalletId,
    main_wallet_id: subWallet.main_wallet_id,
    device_id: subWallet.device_id,
    to_wallet: toWallet,
    to_wallet_name: receiverValidation.name,
    to_fi: toFi,
    amount,
    monotonic_counter: newCounter,
    nullifier,
    status: 'pending',
    created_at: now,
    receiverInfo: receiverValidation
  };
}

// Get pending IoT offline transactions for a sub-wallet
export async function getPendingIoTTransactions(subWalletId = null) {
  await getDB();
  let query = `SELECT * FROM iot_offline_transactions WHERE synced_to_wallet = 0`;
  const params = [];
  
  if (subWalletId) {
    query += ` AND sub_wallet_id = ?`;
    params.push(subWalletId);
  }
  
  query += ` ORDER BY created_at ASC`;
  
  const result = db.exec(query, params);
  if (result.length === 0) return [];
  
  const columns = result[0].columns;
  return result[0].values.map(values => 
    Object.fromEntries(columns.map((col, i) => [col, values[i]]))
  );
}

// Sync IoT transactions to main wallet
export async function syncIoTToWallet(subWalletId) {
  await getDB();
  const now = new Date().toISOString();
  
  // Get pending transactions for this sub-wallet
  const pendingTxs = await getPendingIoTTransactions(subWalletId);
  
  if (pendingTxs.length === 0) {
    return { synced: 0, message: 'No pending transactions' };
  }
  
  const syncedIds = [];
  const errors = [];
  
  for (const tx of pendingTxs) {
    try {
      // Check for double-spend using nullifier
      const existingNullifier = db.exec(`SELECT * FROM nullifiers WHERE nullifier = ?`, [tx.nullifier]);
      if (existingNullifier.length > 0 && existingNullifier[0].values.length > 0) {
        errors.push({ id: tx.id, error: 'Double-spend detected' });
        db.run(`UPDATE iot_offline_transactions SET status = 'rejected' WHERE id = ?`, [tx.id]);
        continue;
      }
      
      // Register nullifier
      db.run(`
        INSERT INTO nullifiers (nullifier, serial_number, wallet_id, transaction_id, amount, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [tx.nullifier, `sn-${tx.id}`, tx.main_wallet_id, tx.id, tx.amount, now]);
      
      // Create a regular transaction record (using transaction_type instead of type)
      const txId = `tx-${uuidv4().slice(0, 8)}`;
      db.run(`
        INSERT INTO transactions (id, from_wallet, to_wallet, amount, transaction_type, status, description, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [txId, tx.sub_wallet_id, tx.to_wallet, tx.amount, 'iot_offline', 'completed', 
          `IoT offline: ${tx.description || 'Sub-wallet payment'}`, tx.created_at]);
      
      // CREDIT THE RECEIVER WALLET - This was missing!
      const receiverWallet = await getWallet(tx.to_wallet);
      if (receiverWallet) {
        db.run(`UPDATE wallets SET balance = balance + ?, updated_at = ? WHERE id = ?`, 
          [tx.amount, now, tx.to_wallet]);
        console.log(`💰 Credited ₹${tx.amount} to ${receiverWallet.name} (${tx.to_wallet})`);
      } else {
        // Check if receiver is a sub-wallet
        const receiverSubWallet = await getSubWallet(tx.to_wallet);
        if (receiverSubWallet) {
          db.run(`UPDATE sub_wallets SET balance = balance + ?, updated_at = ? WHERE id = ?`,
            [tx.amount, now, tx.to_wallet]);
          console.log(`💰 Credited ₹${tx.amount} to sub-wallet ${tx.to_wallet}`);
        }
      }
      
      // Mark as synced to wallet
      db.run(`
        UPDATE iot_offline_transactions SET 
          synced_to_wallet = 1, 
          wallet_synced_at = ?,
          status = 'synced_to_wallet'
        WHERE id = ?
      `, [now, tx.id]);
      
      syncedIds.push(tx.id);
      console.log(`✅ IoT TX synced to wallet: ${tx.id}`);
    } catch (err) {
      errors.push({ id: tx.id, error: err.message });
    }
  }
  
  saveDB();
  
  return {
    synced: syncedIds.length,
    syncedIds,
    errors,
    message: `Synced ${syncedIds.length}/${pendingTxs.length} transactions`
  };
}

// Get transactions pending sync to FI (from wallet level)
export async function getTransactionsPendingSyncToFI() {
  await getDB();
  
  // Get regular unsynced transactions (using 'synced' column)
  const regularTxs = db.exec(`SELECT * FROM transactions WHERE synced = 0 ORDER BY timestamp ASC`);
  
  // Get IoT transactions synced to wallet but not to FI
  const iotTxs = db.exec(`SELECT * FROM iot_offline_transactions WHERE synced_to_wallet = 1 AND synced_to_fi = 0 ORDER BY created_at ASC`);
  
  const regular = regularTxs.length > 0 ? regularTxs[0].values.map(v => {
    const cols = regularTxs[0].columns;
    return Object.fromEntries(cols.map((col, i) => [col, v[i]]));
  }) : [];
  
  const iot = iotTxs.length > 0 ? iotTxs[0].values.map(v => {
    const cols = iotTxs[0].columns;
    const tx = Object.fromEntries(cols.map((col, i) => [col, v[i]]));
    tx.is_iot_transaction = true;
    return tx;
  }) : [];
  
  return { regular, iot, total: regular.length + iot.length };
}

// Mark IoT transactions as synced to FI
export async function markIoTTransactionsSyncedToFI(txIds) {
  await getDB();
  const now = new Date().toISOString();
  
  for (const id of txIds) {
    db.run(`
      UPDATE iot_offline_transactions SET 
        synced_to_fi = 1, 
        fi_synced_at = ?,
        status = 'synced_to_fi'
      WHERE id = ?
    `, [now, id]);
  }
  
  saveDB();
  return { marked: txIds.length };
}

// Mark IoT transactions as synced to CB
export async function markIoTTransactionsSyncedToCB(txIds) {
  await getDB();
  const now = new Date().toISOString();
  
  for (const id of txIds) {
    db.run(`
      UPDATE iot_offline_transactions SET 
        synced_to_cb = 1, 
        cb_synced_at = ?,
        status = 'fully_synced'
      WHERE id = ?
    `, [now, id]);
  }
  
  saveDB();
  return { marked: txIds.length };
}

// Get all IoT transactions for a wallet (including sub-wallets)
export async function getWalletIoTTransactions(walletId) {
  await getDB();
  
  const result = db.exec(`
    SELECT * FROM iot_offline_transactions 
    WHERE main_wallet_id = ? 
    ORDER BY created_at DESC
  `, [walletId]);
  
  if (result.length === 0) return [];
  
  const columns = result[0].columns;
  return result[0].values.map(values => 
    Object.fromEntries(columns.map((col, i) => [col, values[i]]))
  );
}

// Get sync status summary
export async function getSyncStatus() {
  await getDB();
  
  const pendingWallet = db.exec(`SELECT COUNT(*) FROM iot_offline_transactions WHERE synced_to_wallet = 0`);
  const pendingFI = db.exec(`SELECT COUNT(*) FROM iot_offline_transactions WHERE synced_to_wallet = 1 AND synced_to_fi = 0`);
  const pendingCB = db.exec(`SELECT COUNT(*) FROM iot_offline_transactions WHERE synced_to_fi = 1 AND synced_to_cb = 0`);
  const fullySynced = db.exec(`SELECT COUNT(*) FROM iot_offline_transactions WHERE synced_to_cb = 1`);
  
  const regularUnsynced = db.exec(`SELECT COUNT(*) FROM transactions WHERE synced = 0`);
  
  return {
    iot: {
      pending_wallet_sync: pendingWallet[0]?.values[0]?.[0] || 0,
      pending_fi_sync: pendingFI[0]?.values[0]?.[0] || 0,
      pending_cb_sync: pendingCB[0]?.values[0]?.[0] || 0,
      fully_synced: fullySynced[0]?.values[0]?.[0] || 0
    },
    regular: {
      unsynced: regularUnsynced[0]?.values[0]?.[0] || 0
    }
  };
}

// Sync all sub-wallets for a main wallet
export async function syncAllSubWalletsToWallet(mainWalletId) {
  await getDB();
  
  // Get all sub-wallets for this main wallet
  const subWallets = db.exec(`SELECT id FROM sub_wallets WHERE main_wallet_id = ?`, [mainWalletId]);
  
  if (subWallets.length === 0 || subWallets[0].values.length === 0) {
    return { synced: 0, message: 'No sub-wallets found' };
  }
  
  let totalSynced = 0;
  const results = [];
  
  for (const [subWalletId] of subWallets[0].values) {
    const result = await syncIoTToWallet(subWalletId);
    totalSynced += result.synced;
    results.push({ subWalletId, ...result });
  }
  
  return {
    totalSynced,
    subWalletResults: results,
    message: `Synced ${totalSynced} transactions from ${subWallets[0].values.length} sub-wallets`
  };
}

// ============================================
// IOT DEVICE TRANSACTION HISTORY
// ============================================

// Get complete transaction history for a specific sub-wallet/IoT device
export async function getSubWalletTransactions(subWalletId) {
  await getDB();
  
  // Get sub-wallet details
  const subWallet = await getSubWallet(subWalletId);
  if (!subWallet) {
    throw new Error('Sub-wallet not found');
  }
  
  // Get IoT offline transactions (outgoing from this device)
  const iotTxsResult = db.exec(`
    SELECT 
      id,
      sub_wallet_id as from_wallet,
      to_wallet,
      amount,
      'iot_offline' as transaction_type,
      description,
      monotonic_counter,
      nullifier,
      status,
      created_at as timestamp,
      synced_to_wallet,
      synced_to_fi,
      synced_to_cb,
      'outgoing' as direction
    FROM iot_offline_transactions 
    WHERE sub_wallet_id = ?
    ORDER BY created_at DESC
  `, [subWalletId]);
  
  // Get outgoing transactions from this sub-wallet in regular transactions table
  // (These are created by createSubWalletPayment or returnFromSubWallet)
  const outgoingTxsResult = db.exec(`
    SELECT 
      id,
      from_wallet,
      to_wallet,
      amount,
      transaction_type,
      description,
      NULL as monotonic_counter,
      NULL as nullifier,
      status,
      timestamp,
      synced as synced_to_wallet,
      synced as synced_to_fi,
      synced as synced_to_cb,
      'outgoing' as direction
    FROM transactions 
    WHERE (description LIKE ? AND transaction_type = 'sub_wallet_transfer')
       OR (from_wallet = ? AND transaction_type = 'sub_wallet_return')
    ORDER BY timestamp DESC
  `, [`%[Sub-wallet: ${subWalletId}]%`, subWalletId]);
  
  // Get incoming transactions where this sub-wallet is the receiver
  const incomingTxsResult = db.exec(`
    SELECT 
      id,
      from_wallet,
      to_wallet,
      amount,
      transaction_type,
      description,
      NULL as monotonic_counter,
      NULL as nullifier,
      status,
      timestamp,
      synced as synced_to_wallet,
      synced as synced_to_fi,
      synced as synced_to_cb,
      'incoming' as direction
    FROM transactions 
    WHERE to_wallet = ? AND transaction_type != 'iot_offline'
    ORDER BY timestamp DESC
  `, [subWalletId]);
  
  // Convert results to arrays
  const iotTransactions = iotTxsResult.length > 0 ? iotTxsResult[0].values.map(v => {
    const cols = iotTxsResult[0].columns;
    return Object.fromEntries(cols.map((col, i) => [col, v[i]]));
  }) : [];
  
  const outgoingTransactions = outgoingTxsResult.length > 0 ? outgoingTxsResult[0].values.map(v => {
    const cols = outgoingTxsResult[0].columns;
    return Object.fromEntries(cols.map((col, i) => [col, v[i]]));
  }) : [];
  
  const incomingTransactions = incomingTxsResult.length > 0 ? incomingTxsResult[0].values.map(v => {
    const cols = incomingTxsResult[0].columns;
    return Object.fromEntries(cols.map((col, i) => [col, v[i]]));
  }) : [];
  
  // Merge and sort by timestamp
  const allTransactions = [...iotTransactions, ...outgoingTransactions, ...incomingTransactions]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  // Calculate summary
  const totalOutgoing = allTransactions
    .filter(tx => tx.direction === 'outgoing')
    .reduce((sum, tx) => sum + (tx.amount || 0), 0);
  
  const totalIncoming = allTransactions
    .filter(tx => tx.direction === 'incoming')
    .reduce((sum, tx) => sum + (tx.amount || 0), 0);
  
  return {
    subWallet: {
      id: subWallet.id,
      device_type: subWallet.device_type,
      device_id: subWallet.device_id,
      main_wallet_id: subWallet.main_wallet_id,
      balance: subWallet.balance,
      daily_spent: subWallet.daily_spent,
      daily_limit: subWallet.daily_limit
    },
    transactions: allTransactions,
    summary: {
      total_transactions: allTransactions.length,
      total_outgoing: totalOutgoing,
      total_incoming: totalIncoming,
      net_flow: totalIncoming - totalOutgoing,
      pending_sync: iotTransactions.filter(tx => !tx.synced_to_wallet).length,
      synced_to_fi: iotTransactions.filter(tx => tx.synced_to_fi).length,
      synced_to_cb: iotTransactions.filter(tx => tx.synced_to_cb).length
    }
  };
}

// Initialize on import
initDB().catch(console.error);

export default { getDB, saveDB };
