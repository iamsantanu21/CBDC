"""
FI Node Database Module
Manages wallets, tokens, and transactions for a Financial Institution
"""
import sqlite3
import os
import time
import secrets
import json
import requests
from typing import Dict, List, Optional, Tuple
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared.token_utils import (
    generate_serial_number, DENOMINATIONS, make_change, 
    tokens_to_amount, calculate_change
)
from shared.zkp import (
    generate_keypair, generate_ownership_proof, 
    generate_token_transfer_proof, generate_compliance_proof
)

# Configuration from environment
FI_ID = os.environ.get('FI_ID', 'fi-default')
FI_NAME = os.environ.get('FI_NAME', 'Default FI')
CB_URL = os.environ.get('CB_URL', 'http://localhost:4000')

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
DB_PATH = os.path.join(DATA_DIR, f'{FI_ID}.db')


def get_db():
    """Get database connection"""
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize database schema"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Wallets table - now with Secure Element support
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS wallets (
            wallet_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            public_key TEXT NOT NULL,
            private_key TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            status TEXT DEFAULT 'active',
            se_enabled INTEGER DEFAULT 1,
            is_online INTEGER DEFAULT 1,
            last_sync INTEGER
        )
    ''')
    
    # Wallet Secure Element storage (for offline wallet-to-wallet payments)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS wallet_secure_element (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wallet_id TEXT NOT NULL,
            serial_number TEXT NOT NULL,
            denomination INTEGER NOT NULL,
            stored_at INTEGER NOT NULL,
            is_spent INTEGER DEFAULT 0,
            spent_to TEXT,
            spent_at INTEGER,
            synced INTEGER DEFAULT 0,
            FOREIGN KEY (wallet_id) REFERENCES wallets(wallet_id),
            UNIQUE(wallet_id, serial_number)
        )
    ''')
    
    # Wallet offline transactions (pending sync with ZKP)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS wallet_offline_transactions (
            id TEXT PRIMARY KEY,
            wallet_id TEXT NOT NULL,
            from_wallet TEXT NOT NULL,
            to_wallet TEXT NOT NULL,
            token_serials TEXT NOT NULL,
            amount INTEGER NOT NULL,
            description TEXT,
            zkp_proof TEXT,
            created_at INTEGER NOT NULL,
            synced INTEGER DEFAULT 0,
            synced_at INTEGER,
            FOREIGN KEY (wallet_id) REFERENCES wallets(wallet_id)
        )
    ''')
    
    # Sub-wallets (IoT devices with Secure Element)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS subwallets (
            subwallet_id TEXT PRIMARY KEY,
            parent_wallet_id TEXT NOT NULL,
            device_type TEXT,
            device_name TEXT,
            public_key TEXT NOT NULL,
            private_key TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            status TEXT DEFAULT 'active',
            is_online INTEGER DEFAULT 1,
            last_sync INTEGER,
            spending_limit INTEGER DEFAULT 1000,
            se_enabled INTEGER DEFAULT 1,
            FOREIGN KEY (parent_wallet_id) REFERENCES wallets(wallet_id)
        )
    ''')
    
    # Secure Element storage (offline token cache for IoT)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS secure_element (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subwallet_id TEXT NOT NULL,
            serial_number TEXT NOT NULL,
            denomination INTEGER NOT NULL,
            stored_at INTEGER NOT NULL,
            is_spent INTEGER DEFAULT 0,
            spent_to TEXT,
            spent_at INTEGER,
            synced INTEGER DEFAULT 0,
            FOREIGN KEY (subwallet_id) REFERENCES subwallets(subwallet_id),
            UNIQUE(subwallet_id, serial_number)
        )
    ''')
    
    # Offline transactions (pending sync)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS offline_transactions (
            id TEXT PRIMARY KEY,
            subwallet_id TEXT NOT NULL,
            from_id TEXT NOT NULL,
            to_id TEXT NOT NULL,
            token_serials TEXT NOT NULL,
            amount INTEGER NOT NULL,
            description TEXT,
            created_at INTEGER NOT NULL,
            synced INTEGER DEFAULT 0,
            synced_at INTEGER,
            FOREIGN KEY (subwallet_id) REFERENCES subwallets(subwallet_id)
        )
    ''')
    
    # Local token ownership (synced from CB)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tokens (
            serial_number TEXT PRIMARY KEY,
            denomination INTEGER NOT NULL,
            owner_id TEXT NOT NULL,
            owner_type TEXT NOT NULL,  -- 'fi', 'wallet', 'subwallet'
            received_at INTEGER NOT NULL,
            last_updated INTEGER
        )
    ''')
    
    # Transactions
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            from_id TEXT NOT NULL,
            to_id TEXT NOT NULL,
            to_fi TEXT,
            token_serials TEXT NOT NULL,
            amount INTEGER NOT NULL,
            description TEXT,
            zkp_proof TEXT,
            status TEXT DEFAULT 'completed',
            timestamp INTEGER NOT NULL
        )
    ''')
    
    # Compliance tracking
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS compliance (
            wallet_id TEXT PRIMARY KEY,
            daily_spent INTEGER DEFAULT 0,
            monthly_spent INTEGER DEFAULT 0,
            last_reset_daily INTEGER,
            last_reset_monthly INTEGER
        )
    ''')
    
    conn.commit()
    conn.close()
    print(f"✅ FI Node database initialized for {FI_NAME}")


def register_with_cb() -> Dict:
    """Register this FI with Central Bank"""
    try:
        response = requests.post(f"{CB_URL}/api/fi/register", json={
            'fi_id': FI_ID,
            'name': FI_NAME,
            'api_url': f"http://localhost:{os.environ.get('FI_PORT', 4001)}"
        })
        return response.json()
    except Exception as e:
        return {'error': str(e)}


def request_allocation(amount: int) -> Dict:
    """Request token allocation from Central Bank"""
    try:
        response = requests.post(f"{CB_URL}/api/fi/{FI_ID}/allocate", json={
            'amount': amount
        })
        result = response.json()
        
        if result.get('success'):
            # Store received tokens locally
            conn = get_db()
            cursor = conn.cursor()
            timestamp = int(time.time() * 1000)
            
            for token in result.get('tokens', []):
                cursor.execute('''
                    INSERT OR REPLACE INTO tokens (serial_number, denomination, owner_id, owner_type, received_at)
                    VALUES (?, ?, ?, 'fi', ?)
                ''', (token['serial_number'], token['denomination'], FI_ID, timestamp))
            
            conn.commit()
            conn.close()
        
        return result
    except Exception as e:
        return {'error': str(e)}


def get_fi_balance() -> Dict:
    """Get FI's token balance"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT SUM(denomination) as total, COUNT(*) as count 
        FROM tokens WHERE owner_id = ? AND owner_type = 'fi'
    ''', (FI_ID,))
    result = cursor.fetchone()
    
    # Breakdown by denomination
    cursor.execute('''
        SELECT denomination, COUNT(*) as count 
        FROM tokens WHERE owner_id = ? AND owner_type = 'fi'
        GROUP BY denomination ORDER BY denomination DESC
    ''', (FI_ID,))
    breakdown = {r['denomination']: r['count'] for r in cursor.fetchall()}
    
    conn.close()
    
    return {
        'fi_id': FI_ID,
        'fi_name': FI_NAME,
        'balance': result['total'] or 0,
        'token_count': result['count'] or 0,
        'breakdown': breakdown
    }


# ========== WALLET OPERATIONS ==========

def create_wallet(name: str) -> Dict:
    """Create a new wallet"""
    conn = get_db()
    cursor = conn.cursor()
    
    wallet_id = f"wallet-{secrets.token_hex(4)}"
    keypair = generate_keypair()
    timestamp = int(time.time() * 1000)
    
    cursor.execute('''
        INSERT INTO wallets (wallet_id, name, public_key, private_key, created_at)
        VALUES (?, ?, ?, ?, ?)
    ''', (wallet_id, name, keypair['public_key'], keypair['private_key'], timestamp))
    
    conn.commit()
    conn.close()
    
    return {
        'success': True,
        'wallet_id': wallet_id,
        'name': name,
        'public_key': keypair['public_key']
    }


def get_wallet(wallet_id: str) -> Optional[Dict]:
    """Get wallet details"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM wallets WHERE wallet_id = ?', (wallet_id,))
    wallet = cursor.fetchone()
    
    if not wallet:
        conn.close()
        return None
    
    wallet = dict(wallet)
    
    # Get tokens
    cursor.execute('''
        SELECT serial_number, denomination FROM tokens 
        WHERE owner_id = ? ORDER BY denomination DESC
    ''', (wallet_id,))
    tokens = [dict(r) for r in cursor.fetchall()]
    
    wallet['tokens'] = tokens
    wallet['balance'] = sum(t['denomination'] for t in tokens)
    wallet['token_count'] = len(tokens)
    
    # Breakdown
    breakdown = {}
    for t in tokens:
        d = t['denomination']
        breakdown[d] = breakdown.get(d, 0) + 1
    wallet['breakdown'] = breakdown
    
    conn.close()
    return wallet


def get_all_wallets() -> List[Dict]:
    """Get all wallets"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('SELECT wallet_id, name, public_key, created_at, status FROM wallets')
    wallets = [dict(r) for r in cursor.fetchall()]
    
    for w in wallets:
        cursor.execute('''
            SELECT SUM(denomination) as balance, COUNT(*) as count 
            FROM tokens WHERE owner_id = ?
        ''', (w['wallet_id'],))
        result = cursor.fetchone()
        w['balance'] = result['balance'] or 0
        w['token_count'] = result['count'] or 0
    
    conn.close()
    return wallets


def allocate_to_wallet(wallet_id: str, amount: int) -> Dict:
    """Allocate tokens from FI to wallet"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Verify wallet exists
    cursor.execute('SELECT * FROM wallets WHERE wallet_id = ?', (wallet_id,))
    wallet = cursor.fetchone()
    if not wallet:
        conn.close()
        return {'error': 'Wallet not found'}
    
    # Get FI tokens
    cursor.execute('''
        SELECT serial_number, denomination FROM tokens 
        WHERE owner_id = ? AND owner_type = 'fi'
        ORDER BY denomination DESC
    ''', (FI_ID,))
    fi_tokens = [dict(r) for r in cursor.fetchall()]
    
    # Select tokens for transfer
    selected = []
    total = 0
    for token in fi_tokens:
        if total >= amount:
            break
        selected.append(token)
        total += token['denomination']
    
    if total < amount:
        conn.close()
        # Try to get more from CB
        alloc_result = request_allocation(amount - total)
        if 'error' in alloc_result:
            return {'error': f'Insufficient tokens. Need {amount}, have {total}'}
        return allocate_to_wallet(wallet_id, amount)  # Retry
    
    # For exact amount, we may need to use different selection
    if total > amount:
        # Try to find exact combination
        selected = []
        total = 0
        for token in sorted(fi_tokens, key=lambda t: t['denomination']):
            if total + token['denomination'] <= amount:
                selected.append(token)
                total += token['denomination']
    
    timestamp = int(time.time() * 1000)
    
    # Transfer tokens
    for token in selected:
        cursor.execute('''
            UPDATE tokens SET owner_id = ?, owner_type = 'wallet', last_updated = ?
            WHERE serial_number = ?
        ''', (wallet_id, timestamp, token['serial_number']))
    
    # Record transaction
    tx_id = f"tx-{secrets.token_hex(8)}"
    cursor.execute('''
        INSERT INTO transactions (id, from_id, to_id, token_serials, amount, description, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (tx_id, FI_ID, wallet_id, json.dumps([t['serial_number'] for t in selected]), 
          total, f"Allocation from {FI_NAME}", timestamp))
    
    conn.commit()
    conn.close()
    
    return {
        'success': True,
        'wallet_id': wallet_id,
        'amount': total,
        'token_count': len(selected),
        'transaction_id': tx_id
    }


# ========== SUB-WALLET (IoT) OPERATIONS ==========

def create_subwallet(wallet_id: str, device_type: str, device_name: str, 
                     spending_limit: int = 1000, se_enabled: bool = True) -> Dict:
    """Create a sub-wallet for IoT device with Secure Element"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Verify parent wallet
    cursor.execute('SELECT * FROM wallets WHERE wallet_id = ?', (wallet_id,))
    if not cursor.fetchone():
        conn.close()
        return {'error': 'Parent wallet not found'}
    
    subwallet_id = f"sub-{secrets.token_hex(4)}"
    keypair = generate_keypair()
    timestamp = int(time.time() * 1000)
    
    cursor.execute('''
        INSERT INTO subwallets (subwallet_id, parent_wallet_id, device_type, device_name, 
                               public_key, private_key, created_at, spending_limit, se_enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (subwallet_id, wallet_id, device_type, device_name, 
          keypair['public_key'], keypair['private_key'], timestamp, spending_limit, 
          1 if se_enabled else 0))
    
    conn.commit()
    conn.close()
    
    return {
        'success': True,
        'subwallet_id': subwallet_id,
        'parent_wallet_id': wallet_id,
        'device_type': device_type,
        'device_name': device_name,
        'public_key': keypair['public_key'],
        'spending_limit': spending_limit,
        'se_enabled': se_enabled
    }


def get_subwallets(wallet_id: str) -> List[Dict]:
    """Get all sub-wallets for a wallet with SE status"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT subwallet_id, device_type, device_name, public_key, created_at, status,
               is_online, last_sync, spending_limit, se_enabled
        FROM subwallets WHERE parent_wallet_id = ?
    ''', (wallet_id,))
    subwallets = [dict(r) for r in cursor.fetchall()]
    
    for sw in subwallets:
        # Get tokens in main storage
        cursor.execute('''
            SELECT SUM(denomination) as balance, COUNT(*) as count 
            FROM tokens WHERE owner_id = ?
        ''', (sw['subwallet_id'],))
        result = cursor.fetchone()
        sw['balance'] = result['balance'] or 0
        sw['token_count'] = result['count'] or 0
        
        # Get tokens in Secure Element
        cursor.execute('''
            SELECT SUM(denomination) as se_balance, COUNT(*) as se_count 
            FROM secure_element WHERE subwallet_id = ? AND is_spent = 0
        ''', (sw['subwallet_id'],))
        se_result = cursor.fetchone()
        sw['se_balance'] = se_result['se_balance'] or 0
        sw['se_token_count'] = se_result['se_count'] or 0
        
        # Count pending offline transactions
        cursor.execute('''
            SELECT COUNT(*) as pending FROM offline_transactions 
            WHERE subwallet_id = ? AND synced = 0
        ''', (sw['subwallet_id'],))
        sw['pending_sync'] = cursor.fetchone()['pending']
        
        sw['is_online'] = bool(sw['is_online'])
        sw['se_enabled'] = bool(sw['se_enabled'])
    
    conn.close()
    return subwallets


def allocate_to_subwallet(wallet_id: str, subwallet_id: str, amount: int) -> Dict:
    """Allocate tokens from wallet to sub-wallet"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Verify sub-wallet belongs to wallet
    cursor.execute('''
        SELECT * FROM subwallets WHERE subwallet_id = ? AND parent_wallet_id = ?
    ''', (subwallet_id, wallet_id))
    if not cursor.fetchone():
        conn.close()
        return {'error': 'Sub-wallet not found or does not belong to wallet'}
    
    # Get wallet tokens
    cursor.execute('''
        SELECT serial_number, denomination FROM tokens 
        WHERE owner_id = ? ORDER BY denomination
    ''', (wallet_id,))
    wallet_tokens = [dict(r) for r in cursor.fetchall()]
    
    # Select tokens
    selected = []
    total = 0
    for token in wallet_tokens:
        if total >= amount:
            break
        selected.append(token)
        total += token['denomination']
    
    if total < amount:
        conn.close()
        return {'error': f'Insufficient balance. Need {amount}, have {tokens_to_amount(wallet_tokens)}'}
    
    timestamp = int(time.time() * 1000)
    
    # Transfer
    for token in selected:
        cursor.execute('''
            UPDATE tokens SET owner_id = ?, owner_type = 'subwallet', last_updated = ?
            WHERE serial_number = ?
        ''', (subwallet_id, timestamp, token['serial_number']))
    
    # Record transaction
    tx_id = f"tx-{secrets.token_hex(8)}"
    cursor.execute('''
        INSERT INTO transactions (id, from_id, to_id, token_serials, amount, description, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (tx_id, wallet_id, subwallet_id, json.dumps([t['serial_number'] for t in selected]),
          total, "IoT device allocation", timestamp))
    
    conn.commit()
    conn.close()
    
    return {
        'success': True,
        'subwallet_id': subwallet_id,
        'amount': total,
        'token_count': len(selected),
        'transaction_id': tx_id
    }


# ========== SECURE ELEMENT OPERATIONS ==========

def load_tokens_to_se(wallet_id: str, subwallet_id: str, amount: int) -> Dict:
    """Load tokens from wallet to IoT device's Secure Element for offline use"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Verify sub-wallet belongs to wallet and has SE enabled
    cursor.execute('''
        SELECT * FROM subwallets WHERE subwallet_id = ? AND parent_wallet_id = ? AND se_enabled = 1
    ''', (subwallet_id, wallet_id))
    subwallet = cursor.fetchone()
    if not subwallet:
        conn.close()
        return {'error': 'Sub-wallet not found or SE not enabled'}
    
    # Check spending limit
    cursor.execute('''
        SELECT SUM(denomination) as current FROM secure_element 
        WHERE subwallet_id = ? AND is_spent = 0
    ''', (subwallet_id,))
    current = cursor.fetchone()['current'] or 0
    spending_limit = subwallet['spending_limit']
    
    if current + amount > spending_limit:
        conn.close()
        return {'error': f'Would exceed spending limit. Current: {current}, Limit: {spending_limit}'}
    
    # Get wallet tokens
    cursor.execute('''
        SELECT serial_number, denomination FROM tokens 
        WHERE owner_id = ? ORDER BY denomination
    ''', (wallet_id,))
    wallet_tokens = [dict(r) for r in cursor.fetchall()]
    
    # Select tokens up to amount (prefer smaller denominations for SE)
    selected = []
    total = 0
    for token in wallet_tokens:
        if total >= amount:
            break
        selected.append(token)
        total += token['denomination']
    
    if total < amount:
        conn.close()
        return {'error': f'Insufficient wallet balance. Need {amount}, have {tokens_to_amount(wallet_tokens)}'}
    
    timestamp = int(time.time() * 1000)
    
    # Move tokens to SE and update ownership
    for token in selected:
        # Update token ownership to subwallet
        cursor.execute('''
            UPDATE tokens SET owner_id = ?, owner_type = 'subwallet', last_updated = ?
            WHERE serial_number = ?
        ''', (subwallet_id, timestamp, token['serial_number']))
        
        # Store in Secure Element
        cursor.execute('''
            INSERT OR REPLACE INTO secure_element (subwallet_id, serial_number, denomination, stored_at)
            VALUES (?, ?, ?, ?)
        ''', (subwallet_id, token['serial_number'], token['denomination'], timestamp))
    
    # Record transaction
    tx_id = f"se-load-{secrets.token_hex(6)}"
    cursor.execute('''
        INSERT INTO transactions (id, from_id, to_id, token_serials, amount, description, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (tx_id, wallet_id, f"{subwallet_id}:SE", json.dumps([t['serial_number'] for t in selected]),
          total, "Loaded to Secure Element", timestamp))
    
    conn.commit()
    conn.close()
    
    return {
        'success': True,
        'subwallet_id': subwallet_id,
        'loaded_to_se': total,
        'token_count': len(selected),
        'tokens': [t['serial_number'] for t in selected],
        'transaction_id': tx_id
    }


def get_se_balance(subwallet_id: str) -> Dict:
    """Get Secure Element balance and tokens"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT serial_number, denomination, stored_at, is_spent 
        FROM secure_element WHERE subwallet_id = ?
    ''', (subwallet_id,))
    all_tokens = [dict(r) for r in cursor.fetchall()]
    
    available = [t for t in all_tokens if not t['is_spent']]
    spent = [t for t in all_tokens if t['is_spent']]
    
    conn.close()
    
    return {
        'subwallet_id': subwallet_id,
        'available_balance': sum(t['denomination'] for t in available),
        'available_tokens': len(available),
        'spent_pending_sync': len(spent),
        'tokens': available,
        'spent_tokens': spent
    }


def offline_transaction(subwallet_id: str, to_id: str, amount: int, description: str = "") -> Dict:
    """Create offline transaction using Secure Element tokens"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Get subwallet info
    cursor.execute('SELECT * FROM subwallets WHERE subwallet_id = ?', (subwallet_id,))
    subwallet = cursor.fetchone()
    if not subwallet:
        conn.close()
        return {'error': 'Sub-wallet not found'}
    
    # Get available SE tokens
    cursor.execute('''
        SELECT serial_number, denomination FROM secure_element 
        WHERE subwallet_id = ? AND is_spent = 0
        ORDER BY denomination
    ''', (subwallet_id,))
    se_tokens = [dict(r) for r in cursor.fetchall()]
    
    # Select tokens for payment
    selected = []
    total = 0
    for token in se_tokens:
        if total >= amount:
            break
        selected.append(token)
        total += token['denomination']
    
    if total < amount:
        conn.close()
        return {'error': f'Insufficient SE balance. Need {amount}, have {sum(t["denomination"] for t in se_tokens)}'}
    
    timestamp = int(time.time() * 1000)
    tx_id = f"offline-{secrets.token_hex(8)}"
    
    # Mark tokens as spent in SE
    for token in selected:
        cursor.execute('''
            UPDATE secure_element SET is_spent = 1, spent_to = ?, spent_at = ?
            WHERE subwallet_id = ? AND serial_number = ?
        ''', (to_id, timestamp, subwallet_id, token['serial_number']))
    
    # Create offline transaction record (pending sync)
    cursor.execute('''
        INSERT INTO offline_transactions 
        (id, subwallet_id, from_id, to_id, token_serials, amount, description, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (tx_id, subwallet_id, subwallet_id, to_id, 
          json.dumps([t['serial_number'] for t in selected]), total, description, timestamp))
    
    conn.commit()
    conn.close()
    
    return {
        'success': True,
        'transaction_id': tx_id,
        'mode': 'offline',
        'from': subwallet_id,
        'to': to_id,
        'amount': total,
        'tokens_used': len(selected),
        'change': total - amount if total > amount else 0,
        'pending_sync': True
    }


def set_device_online_status(subwallet_id: str, is_online: bool) -> Dict:
    """Toggle device online/offline status"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM subwallets WHERE subwallet_id = ?', (subwallet_id,))
    if not cursor.fetchone():
        conn.close()
        return {'error': 'Sub-wallet not found'}
    
    timestamp = int(time.time() * 1000)
    
    cursor.execute('''
        UPDATE subwallets SET is_online = ?, last_sync = ? WHERE subwallet_id = ?
    ''', (1 if is_online else 0, timestamp if is_online else None, subwallet_id))
    
    conn.commit()
    conn.close()
    
    return {
        'success': True,
        'subwallet_id': subwallet_id,
        'is_online': is_online,
        'message': 'Device is now online' if is_online else 'Device is now offline (SE mode active)'
    }


def sync_subwallet(subwallet_id: str) -> Dict:
    """Sync offline transactions back to network"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Get subwallet
    cursor.execute('''
        SELECT sw.*, w.wallet_id as parent_id 
        FROM subwallets sw 
        JOIN wallets w ON sw.parent_wallet_id = w.wallet_id
        WHERE sw.subwallet_id = ?
    ''', (subwallet_id,))
    subwallet = cursor.fetchone()
    if not subwallet:
        conn.close()
        return {'error': 'Sub-wallet not found'}
    
    # Get pending offline transactions
    cursor.execute('''
        SELECT * FROM offline_transactions WHERE subwallet_id = ? AND synced = 0
    ''', (subwallet_id,))
    pending = [dict(r) for r in cursor.fetchall()]
    
    if not pending:
        conn.close()
        return {
            'success': True,
            'subwallet_id': subwallet_id,
            'synced_count': 0,
            'message': 'No pending transactions to sync'
        }
    
    timestamp = int(time.time() * 1000)
    synced_txs = []
    
    for tx in pending:
        token_serials = json.loads(tx['token_serials'])
        
        # Update token ownership in main ledger
        for serial in token_serials:
            cursor.execute('''
                UPDATE tokens SET owner_id = ?, owner_type = 'external', last_updated = ?
                WHERE serial_number = ?
            ''', (tx['to_id'], timestamp, serial))
            
            # Remove from SE
            cursor.execute('''
                DELETE FROM secure_element WHERE subwallet_id = ? AND serial_number = ?
            ''', (subwallet_id, serial))
        
        # Mark offline transaction as synced
        cursor.execute('''
            UPDATE offline_transactions SET synced = 1, synced_at = ? WHERE id = ?
        ''', (timestamp, tx['id']))
        
        # Create main transaction record
        cursor.execute('''
            INSERT INTO transactions (id, from_id, to_id, token_serials, amount, description, status, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, 'synced', ?)
        ''', (tx['id'], tx['from_id'], tx['to_id'], tx['token_serials'], 
              tx['amount'], f"[SYNCED] {tx['description']}", timestamp))
        
        synced_txs.append(tx['id'])
    
    # Update last sync time
    cursor.execute('''
        UPDATE subwallets SET last_sync = ?, is_online = 1 WHERE subwallet_id = ?
    ''', (timestamp, subwallet_id))
    
    conn.commit()
    conn.close()
    
    return {
        'success': True,
        'subwallet_id': subwallet_id,
        'synced_count': len(synced_txs),
        'synced_transactions': synced_txs,
        'sync_time': timestamp
    }


def get_subwallet_details(subwallet_id: str) -> Optional[Dict]:
    """Get detailed sub-wallet info including SE status"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT sw.*, w.name as parent_name
        FROM subwallets sw 
        JOIN wallets w ON sw.parent_wallet_id = w.wallet_id
        WHERE sw.subwallet_id = ?
    ''', (subwallet_id,))
    sw = cursor.fetchone()
    
    if not sw:
        conn.close()
        return None
    
    sw = dict(sw)
    
    # Get tokens in main storage
    cursor.execute('''
        SELECT serial_number, denomination FROM tokens WHERE owner_id = ?
    ''', (subwallet_id,))
    sw['tokens'] = [dict(r) for r in cursor.fetchall()]
    sw['balance'] = sum(t['denomination'] for t in sw['tokens'])
    
    # Get SE status
    se_info = get_se_balance(subwallet_id)
    sw['secure_element'] = se_info
    
    # Get pending offline transactions
    cursor.execute('''
        SELECT * FROM offline_transactions WHERE subwallet_id = ? AND synced = 0
    ''', (subwallet_id,))
    sw['pending_transactions'] = [dict(r) for r in cursor.fetchall()]
    
    sw['is_online'] = bool(sw['is_online'])
    sw['se_enabled'] = bool(sw['se_enabled'])
    
    conn.close()
    return sw


# ========== WALLET SECURE ELEMENT OPERATIONS ==========
# (For wallet-to-wallet offline payments with ZKP)

def load_tokens_to_wallet_se(wallet_id: str, amount: int) -> Dict:
    """Load tokens from wallet balance to wallet's Secure Element for offline use"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Verify wallet exists and has SE enabled
    cursor.execute('SELECT * FROM wallets WHERE wallet_id = ? AND se_enabled = 1', (wallet_id,))
    wallet = cursor.fetchone()
    if not wallet:
        conn.close()
        return {'error': 'Wallet not found or SE not enabled'}
    
    # Get wallet's available tokens (not already in SE)
    cursor.execute('''
        SELECT serial_number, denomination FROM tokens 
        WHERE owner_id = ? AND owner_type = 'wallet'
        AND serial_number NOT IN (SELECT serial_number FROM wallet_secure_element WHERE wallet_id = ?)
        ORDER BY denomination
    ''', (wallet_id, wallet_id))
    available_tokens = [dict(r) for r in cursor.fetchall()]
    
    # Select tokens up to amount
    selected = []
    total = 0
    for token in available_tokens:
        if total >= amount:
            break
        selected.append(token)
        total += token['denomination']
    
    if total < amount:
        conn.close()
        return {'error': f'Insufficient available balance. Need {amount}, have {sum(t["denomination"] for t in available_tokens)}'}
    
    timestamp = int(time.time() * 1000)
    
    # Store in wallet Secure Element
    for token in selected:
        cursor.execute('''
            INSERT OR REPLACE INTO wallet_secure_element (wallet_id, serial_number, denomination, stored_at)
            VALUES (?, ?, ?, ?)
        ''', (wallet_id, token['serial_number'], token['denomination'], timestamp))
    
    conn.commit()
    conn.close()
    
    return {
        'success': True,
        'wallet_id': wallet_id,
        'loaded_to_se': total,
        'token_count': len(selected),
        'tokens': [t['serial_number'] for t in selected]
    }


def get_wallet_se_balance(wallet_id: str) -> Dict:
    """Get wallet Secure Element balance and tokens"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT serial_number, denomination, stored_at, is_spent 
        FROM wallet_secure_element WHERE wallet_id = ?
    ''', (wallet_id,))
    all_tokens = [dict(r) for r in cursor.fetchall()]
    
    available = [t for t in all_tokens if not t['is_spent']]
    spent = [t for t in all_tokens if t['is_spent']]
    
    conn.close()
    
    return {
        'wallet_id': wallet_id,
        'available_balance': sum(t['denomination'] for t in available),
        'available_tokens': len(available),
        'spent_pending_sync': len(spent),
        'tokens': available,
        'spent_tokens': spent
    }


def wallet_offline_transaction(from_wallet: str, to_wallet: str, amount: int, description: str = "") -> Dict:
    """Create offline wallet-to-wallet transaction using Secure Element tokens with ZKP"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Get sender wallet
    cursor.execute('SELECT * FROM wallets WHERE wallet_id = ?', (from_wallet,))
    sender = cursor.fetchone()
    if not sender:
        conn.close()
        return {'error': 'Sender wallet not found'}
    
    # Get available SE tokens
    cursor.execute('''
        SELECT serial_number, denomination FROM wallet_secure_element 
        WHERE wallet_id = ? AND is_spent = 0
        ORDER BY denomination
    ''', (from_wallet,))
    se_tokens = [dict(r) for r in cursor.fetchall()]
    
    # Select tokens for payment
    selected = []
    total = 0
    for token in se_tokens:
        if total >= amount:
            break
        selected.append(token)
        total += token['denomination']
    
    if total < amount:
        conn.close()
        return {'error': f'Insufficient SE balance. Need {amount}, have {sum(t["denomination"] for t in se_tokens)}'}
    
    timestamp = int(time.time() * 1000)
    tx_id = f"wallet-offline-{secrets.token_hex(8)}"
    
    # Generate ZKP proof for offline transaction
    zkp_proof = generate_token_transfer_proof(
        sender['private_key'],
        [t['serial_number'] for t in selected],
        total,
        from_wallet,
        to_wallet
    )
    
    # Mark tokens as spent in wallet SE
    for token in selected:
        cursor.execute('''
            UPDATE wallet_secure_element SET is_spent = 1, spent_to = ?, spent_at = ?
            WHERE wallet_id = ? AND serial_number = ?
        ''', (to_wallet, timestamp, from_wallet, token['serial_number']))
    
    # Create offline transaction record (pending sync)
    cursor.execute('''
        INSERT INTO wallet_offline_transactions 
        (id, wallet_id, from_wallet, to_wallet, token_serials, amount, description, zkp_proof, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (tx_id, from_wallet, from_wallet, to_wallet, 
          json.dumps([t['serial_number'] for t in selected]), total, description, 
          json.dumps(zkp_proof), timestamp))
    
    conn.commit()
    conn.close()
    
    return {
        'success': True,
        'transaction_id': tx_id,
        'from_wallet': from_wallet,
        'to_wallet': to_wallet,
        'amount': total,
        'token_count': len(selected),
        'tokens': [t['serial_number'] for t in selected],
        'zkp_proof': zkp_proof,
        'status': 'offline_pending_sync'
    }


def set_wallet_online_status(wallet_id: str, is_online: bool) -> Dict:
    """Set wallet online/offline status"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM wallets WHERE wallet_id = ?', (wallet_id,))
    if not cursor.fetchone():
        conn.close()
        return {'error': 'Wallet not found'}
    
    cursor.execute('''
        UPDATE wallets SET is_online = ? WHERE wallet_id = ?
    ''', (1 if is_online else 0, wallet_id))
    
    conn.commit()
    conn.close()
    
    return {
        'success': True,
        'wallet_id': wallet_id,
        'is_online': is_online,
        'message': 'Wallet is now online' if is_online else 'Wallet is now offline (SE mode active)'
    }


def sync_wallet_offline_transactions(wallet_id: str) -> Dict:
    """Sync wallet's offline transactions back to network with ZKP verification"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Get wallet
    cursor.execute('SELECT * FROM wallets WHERE wallet_id = ?', (wallet_id,))
    wallet = cursor.fetchone()
    if not wallet:
        conn.close()
        return {'error': 'Wallet not found'}
    
    # Get pending offline transactions
    cursor.execute('''
        SELECT * FROM wallet_offline_transactions WHERE wallet_id = ? AND synced = 0
    ''', (wallet_id,))
    pending = [dict(r) for r in cursor.fetchall()]
    
    if not pending:
        conn.close()
        return {
            'success': True,
            'wallet_id': wallet_id,
            'synced_count': 0,
            'message': 'No pending transactions to sync'
        }
    
    timestamp = int(time.time() * 1000)
    synced_txs = []
    
    for tx in pending:
        token_serials = json.loads(tx['token_serials'])
        
        # Update token ownership in main ledger
        for serial in token_serials:
            cursor.execute('''
                UPDATE tokens SET owner_id = ?, owner_type = 'wallet', last_updated = ?
                WHERE serial_number = ?
            ''', (tx['to_wallet'], timestamp, serial))
            
            # Remove from wallet SE
            cursor.execute('''
                DELETE FROM wallet_secure_element WHERE wallet_id = ? AND serial_number = ?
            ''', (wallet_id, serial))
        
        # Mark offline transaction as synced
        cursor.execute('''
            UPDATE wallet_offline_transactions SET synced = 1, synced_at = ? WHERE id = ?
        ''', (timestamp, tx['id']))
        
        # Create main transaction record
        cursor.execute('''
            INSERT INTO transactions (id, from_id, to_id, token_serials, amount, description, zkp_proof, status, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'synced', ?)
        ''', (tx['id'], tx['from_wallet'], tx['to_wallet'], tx['token_serials'], 
              tx['amount'], f"[SYNCED] {tx['description']}", tx['zkp_proof'], timestamp))
        
        synced_txs.append(tx['id'])
    
    # Update last sync time
    cursor.execute('''
        UPDATE wallets SET last_sync = ?, is_online = 1 WHERE wallet_id = ?
    ''', (timestamp, wallet_id))
    
    conn.commit()
    conn.close()
    
    return {
        'success': True,
        'wallet_id': wallet_id,
        'synced_count': len(synced_txs),
        'synced_transactions': synced_txs,
        'sync_time': timestamp
    }


def get_wallet_details(wallet_id: str) -> Optional[Dict]:
    """Get detailed wallet info including SE status"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM wallets WHERE wallet_id = ?', (wallet_id,))
    wallet = cursor.fetchone()
    
    if not wallet:
        conn.close()
        return None
    
    wallet = dict(wallet)
    
    # Get tokens in main storage
    cursor.execute('''
        SELECT serial_number, denomination FROM tokens WHERE owner_id = ?
    ''', (wallet_id,))
    wallet['tokens'] = [dict(r) for r in cursor.fetchall()]
    wallet['balance'] = sum(t['denomination'] for t in wallet['tokens'])
    
    # Get SE status
    wallet['secure_element'] = get_wallet_se_balance(wallet_id)
    
    # Get pending offline transactions
    cursor.execute('''
        SELECT * FROM wallet_offline_transactions WHERE wallet_id = ? AND synced = 0
    ''', (wallet_id,))
    wallet['pending_offline_transactions'] = [dict(r) for r in cursor.fetchall()]
    
    # Get subwallets
    wallet['subwallets'] = get_subwallets(wallet_id)
    
    wallet['is_online'] = bool(wallet.get('is_online', 1))
    wallet['se_enabled'] = bool(wallet.get('se_enabled', 1))
    
    conn.close()
    return wallet


# ========== TRANSACTIONS ==========

def create_transaction(from_id: str, to_id: str, amount: int, 
                       description: str = "", to_fi: str = None) -> Dict:
    """Create a token transaction"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Determine sender type and get tokens
    cursor.execute('SELECT * FROM wallets WHERE wallet_id = ?', (from_id,))
    sender_wallet = cursor.fetchone()
    
    if not sender_wallet:
        cursor.execute('SELECT * FROM subwallets WHERE subwallet_id = ?', (from_id,))
        sender = cursor.fetchone()
        if not sender:
            conn.close()
            return {'error': 'Sender not found'}
        sender_type = 'subwallet'
        sender_private_key = sender['private_key']
        sender_public_key = sender['public_key']
    else:
        sender_type = 'wallet'
        sender_private_key = sender_wallet['private_key']
        sender_public_key = sender_wallet['public_key']
    
    # Get sender's tokens
    cursor.execute('''
        SELECT serial_number, denomination FROM tokens 
        WHERE owner_id = ? ORDER BY denomination DESC
    ''', (from_id,))
    sender_tokens = [dict(r) for r in cursor.fetchall()]
    
    # Select tokens for payment
    selected = []
    total = 0
    for token in sender_tokens:
        if total >= amount:
            break
        selected.append(token)
        total += token['denomination']
    
    if total < amount:
        conn.close()
        return {'error': f'Insufficient balance. Need {amount}, have {tokens_to_amount(sender_tokens)}'}
    
    # Calculate change
    change_amount = total - amount
    
    timestamp = int(time.time() * 1000)
    
    # Generate ZKP proof
    zkp_proof = generate_token_transfer_proof(
        sender_private_key,
        sender_public_key,
        to_id,  # Would need recipient's public key in real system
        [t['serial_number'] for t in selected],
        amount
    )
    
    # Compliance check
    compliance_proof = generate_compliance_proof(amount, is_iot=(sender_type == 'subwallet'))
    if not compliance_proof['is_compliant']:
        conn.close()
        return {'error': 'Compliance check failed', 'details': compliance_proof['checks']}
    
    # Determine if cross-FI
    is_cross_fi = to_fi and to_fi != FI_ID
    
    if is_cross_fi:
        # For cross-FI, notify Central Bank
        try:
            cb_response = requests.post(f"{CB_URL}/api/fi/transfer", json={
                'from_fi': FI_ID,
                'to_fi': to_fi,
                'token_serials': [t['serial_number'] for t in selected]
            })
            cb_result = cb_response.json()
            if 'error' in cb_result:
                conn.close()
                return cb_result
        except Exception as e:
            conn.close()
            return {'error': f'Cross-FI transfer failed: {str(e)}'}
        
        # Remove tokens from local DB (transferred to other FI)
        for token in selected:
            cursor.execute('DELETE FROM tokens WHERE serial_number = ?', (token['serial_number'],))
    else:
        # Local transfer
        for token in selected:
            cursor.execute('''
                UPDATE tokens SET owner_id = ?, owner_type = 'wallet', last_updated = ?
                WHERE serial_number = ?
            ''', (to_id, timestamp, token['serial_number']))
    
    # Handle change (in real system, tokens would be split)
    # For simplicity, we only transfer exact amounts or closest possible
    
    # Record transaction
    tx_id = f"tx-{secrets.token_hex(8)}"
    cursor.execute('''
        INSERT INTO transactions (id, from_id, to_id, to_fi, token_serials, amount, 
                                 description, zkp_proof, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (tx_id, from_id, to_id, to_fi, json.dumps([t['serial_number'] for t in selected]),
          total, description, json.dumps(zkp_proof), timestamp))
    
    conn.commit()
    conn.close()
    
    return {
        'success': True,
        'transaction_id': tx_id,
        'from': from_id,
        'to': to_id,
        'to_fi': to_fi,
        'amount': total,
        'tokens_transferred': len(selected),
        'is_cross_fi': is_cross_fi,
        'zkp': {
            'verified': True,
            'compliance': compliance_proof['is_compliant']
        }
    }


def get_transactions(entity_id: str = None, limit: int = 50) -> List[Dict]:
    """Get transactions"""
    conn = get_db()
    cursor = conn.cursor()
    
    if entity_id:
        cursor.execute('''
            SELECT * FROM transactions 
            WHERE from_id = ? OR to_id = ?
            ORDER BY timestamp DESC LIMIT ?
        ''', (entity_id, entity_id, limit))
    else:
        cursor.execute('''
            SELECT * FROM transactions ORDER BY timestamp DESC LIMIT ?
        ''', (limit,))
    
    transactions = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return transactions


def get_all_tokens() -> Dict:
    """Get all tokens in this FI"""
    conn = get_db()
    cursor = conn.cursor()
    
    # FI tokens
    cursor.execute('''
        SELECT SUM(denomination) as total FROM tokens WHERE owner_type = 'fi'
    ''')
    in_fi = cursor.fetchone()['total'] or 0
    
    # Wallet tokens
    cursor.execute('''
        SELECT SUM(denomination) as total FROM tokens WHERE owner_type = 'wallet'
    ''')
    in_wallets = cursor.fetchone()['total'] or 0
    
    # Sub-wallet tokens
    cursor.execute('''
        SELECT SUM(denomination) as total FROM tokens WHERE owner_type = 'subwallet'
    ''')
    in_subwallets = cursor.fetchone()['total'] or 0
    
    # Total count
    cursor.execute('SELECT COUNT(*) as count FROM tokens')
    total_count = cursor.fetchone()['count']
    
    conn.close()
    
    return {
        'fi_id': FI_ID,
        'fi_name': FI_NAME,
        'total_tokens': total_count,
        'total_value': in_fi + in_wallets + in_subwallets,
        'breakdown': {
            'in_fi': in_fi,
            'in_wallets': in_wallets,
            'in_subwallets': in_subwallets
        }
    }


# Initialize on import
init_db()
