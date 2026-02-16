"""
Central Bank Database Module
Manages token minting, FI registration, and ledger
"""
import sqlite3
import os
import time
import secrets
from typing import Dict, List, Optional, Tuple
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared.token_utils import generate_serial_number, DENOMINATIONS, make_change
from shared.zkp import generate_keypair

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
DB_PATH = os.path.join(DATA_DIR, 'central_bank.db')

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
    
    # Tokens table - each row is a single token (like a banknote)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tokens (
            serial_number TEXT PRIMARY KEY,
            denomination INTEGER NOT NULL,
            status TEXT DEFAULT 'active',  -- active, spent, destroyed
            current_owner TEXT,            -- wallet_id or fi_id
            owner_type TEXT,               -- 'cb', 'fi', 'wallet', 'subwallet'
            minted_at INTEGER NOT NULL,
            batch_id TEXT,
            nullifier TEXT,
            last_transfer_at INTEGER
        )
    ''')
    
    # Financial Institutions
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS financial_institutions (
            fi_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            api_url TEXT NOT NULL,
            public_key TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            registered_at INTEGER NOT NULL,
            allocated_tokens TEXT DEFAULT '[]'
        )
    ''')
    
    # Ledger - all transactions
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ledger (
            id TEXT PRIMARY KEY,
            transaction_type TEXT NOT NULL,
            from_entity TEXT,
            to_entity TEXT,
            token_serials TEXT NOT NULL,
            total_amount INTEGER NOT NULL,
            description TEXT,
            zkp_proof TEXT,
            timestamp INTEGER NOT NULL
        )
    ''')
    
    # Spent nullifiers (for double-spending prevention)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS nullifiers (
            nullifier TEXT PRIMARY KEY,
            token_serial TEXT NOT NULL,
            spent_at INTEGER NOT NULL,
            transaction_id TEXT
        )
    ''')
    
    # Token batches (for tracking minting)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS token_batches (
            batch_id TEXT PRIMARY KEY,
            denomination INTEGER NOT NULL,
            count INTEGER NOT NULL,
            minted_at INTEGER NOT NULL,
            purpose TEXT
        )
    ''')
    
    conn.commit()
    conn.close()
    print("✅ Central Bank database initialized")


def mint_tokens(denomination: int, count: int, purpose: str = "General circulation") -> Dict:
    """
    Mint new tokens of a specific denomination
    Only Central Bank can mint tokens
    """
    if denomination not in DENOMINATIONS:
        return {'error': f'Invalid denomination. Valid: {DENOMINATIONS}'}
    
    if count <= 0 or count > 10000:
        return {'error': 'Count must be between 1 and 10000'}
    
    conn = get_db()
    cursor = conn.cursor()
    
    batch_id = f"BATCH-{secrets.token_hex(4).upper()}"
    timestamp = int(time.time() * 1000)
    
    tokens = []
    for i in range(count):
        serial = generate_serial_number("RBI", denomination, batch_id)
        tokens.append({
            'serial_number': serial,
            'denomination': denomination
        })
        
        cursor.execute('''
            INSERT INTO tokens (serial_number, denomination, status, current_owner, owner_type, minted_at, batch_id)
            VALUES (?, ?, 'active', 'CB', 'cb', ?, ?)
        ''', (serial, denomination, timestamp, batch_id))
    
    # Record batch
    cursor.execute('''
        INSERT INTO token_batches (batch_id, denomination, count, minted_at, purpose)
        VALUES (?, ?, ?, ?, ?)
    ''', (batch_id, denomination, count, timestamp, purpose))
    
    # Record in ledger
    tx_id = f"mint-{secrets.token_hex(8)}"
    cursor.execute('''
        INSERT INTO ledger (id, transaction_type, from_entity, to_entity, token_serials, total_amount, description, timestamp)
        VALUES (?, 'mint', 'CENTRAL_BANK', 'CB_VAULT', ?, ?, ?, ?)
    ''', (tx_id, str([t['serial_number'] for t in tokens]), denomination * count, f"Minted {count}x ₹{denomination}", timestamp))
    
    conn.commit()
    conn.close()
    
    return {
        'success': True,
        'batch_id': batch_id,
        'denomination': denomination,
        'count': count,
        'total_value': denomination * count,
        'tokens': tokens
    }


def mint_specific_denominations(denomination_counts: Dict[int, int], purpose: str = "Specific minting") -> Dict:
    """
    Mint specific number of tokens for each denomination
    Example: {2000: 5, 500: 10, 100: 20} = 5x₹2000 + 10x₹500 + 20x₹100
    """
    # Validate all denominations
    for denom in denomination_counts.keys():
        if denom not in DENOMINATIONS:
            return {'error': f'Invalid denomination {denom}. Valid: {DENOMINATIONS}'}
        if denomination_counts[denom] <= 0:
            return {'error': f'Count for ₹{denom} must be positive'}
        if denomination_counts[denom] > 10000:
            return {'error': f'Count for ₹{denom} cannot exceed 10000'}
    
    conn = get_db()
    cursor = conn.cursor()
    
    batch_id = f"BATCH-{secrets.token_hex(4).upper()}"
    timestamp = int(time.time() * 1000)
    
    all_tokens = []
    breakdown = {}
    total_value = 0
    
    for denom, count in denomination_counts.items():
        if count <= 0:
            continue
            
        breakdown[denom] = count
        denom_value = denom * count
        total_value += denom_value
        
        for i in range(count):
            serial = generate_serial_number("RBI", denom, batch_id)
            all_tokens.append({
                'serial_number': serial,
                'denomination': denom
            })
            
            cursor.execute('''
                INSERT INTO tokens (serial_number, denomination, status, current_owner, owner_type, minted_at, batch_id)
                VALUES (?, ?, 'active', 'CB', 'cb', ?, ?)
            ''', (serial, denom, timestamp, batch_id))
        
        # Record batch per denomination
        cursor.execute('''
            INSERT INTO token_batches (batch_id, denomination, count, minted_at, purpose)
            VALUES (?, ?, ?, ?, ?)
        ''', (f"{batch_id}-{denom}", denom, count, timestamp, purpose))
    
    # Record in ledger
    tx_id = f"mint-{secrets.token_hex(8)}"
    description = "Minted: " + ", ".join([f"{c}x₹{d}" for d, c in breakdown.items()])
    cursor.execute('''
        INSERT INTO ledger (id, transaction_type, from_entity, to_entity, token_serials, total_amount, description, timestamp)
        VALUES (?, 'mint', 'CENTRAL_BANK', 'CB_VAULT', ?, ?, ?, ?)
    ''', (tx_id, str([t['serial_number'] for t in all_tokens]), total_value, description, timestamp))
    
    conn.commit()
    conn.close()
    
    return {
        'success': True,
        'batch_id': batch_id,
        'breakdown': breakdown,
        'total_tokens': len(all_tokens),
        'total_value': total_value,
        'tokens': all_tokens
    }


def mint_mixed_tokens(amount: int, purpose: str = "FI allocation") -> Dict:
    """
    Mint tokens to match a specific amount using optimal denominations
    """
    if amount <= 0:
        return {'error': 'Amount must be positive'}
    
    # Calculate optimal denomination breakdown
    denominations_needed = make_change(amount)
    
    if sum(denominations_needed) != amount:
        return {'error': f'Cannot create exact amount {amount} with available denominations'}
    
    conn = get_db()
    cursor = conn.cursor()
    
    batch_id = f"BATCH-{secrets.token_hex(4).upper()}"
    timestamp = int(time.time() * 1000)
    
    tokens = []
    for denom in denominations_needed:
        serial = generate_serial_number("RBI", denom, batch_id)
        tokens.append({
            'serial_number': serial,
            'denomination': denom
        })
        
        cursor.execute('''
            INSERT INTO tokens (serial_number, denomination, status, current_owner, owner_type, minted_at, batch_id)
            VALUES (?, ?, 'active', 'CB', 'cb', ?, ?)
        ''', (serial, denom, timestamp, batch_id))
    
    # Record batch
    cursor.execute('''
        INSERT INTO token_batches (batch_id, denomination, count, minted_at, purpose)
        VALUES (?, ?, ?, ?, ?)
    ''', (batch_id, 0, len(tokens), timestamp, f"Mixed: {purpose}"))
    
    # Record in ledger
    tx_id = f"mint-{secrets.token_hex(8)}"
    cursor.execute('''
        INSERT INTO ledger (id, transaction_type, from_entity, to_entity, token_serials, total_amount, description, timestamp)
        VALUES (?, 'mint', 'CENTRAL_BANK', 'CB_VAULT', ?, ?, ?, ?)
    ''', (tx_id, str([t['serial_number'] for t in tokens]), amount, purpose, timestamp))
    
    conn.commit()
    conn.close()
    
    # Group by denomination for display
    by_denom = {}
    for t in tokens:
        d = t['denomination']
        by_denom[d] = by_denom.get(d, 0) + 1
    
    return {
        'success': True,
        'batch_id': batch_id,
        'total_value': amount,
        'token_count': len(tokens),
        'breakdown': by_denom,
        'tokens': tokens
    }


def register_fi(fi_id: str, name: str, api_url: str) -> Dict:
    """Register a new Financial Institution"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if already exists
    cursor.execute('SELECT fi_id FROM financial_institutions WHERE fi_id = ?', (fi_id,))
    if cursor.fetchone():
        conn.close()
        return {'error': 'FI already registered', 'fi_id': fi_id}
    
    keypair = generate_keypair()
    timestamp = int(time.time() * 1000)
    
    cursor.execute('''
        INSERT INTO financial_institutions (fi_id, name, api_url, public_key, registered_at)
        VALUES (?, ?, ?, ?, ?)
    ''', (fi_id, name, api_url, keypair['public_key'], timestamp))
    
    conn.commit()
    conn.close()
    
    return {
        'success': True,
        'fi_id': fi_id,
        'name': name,
        'public_key': keypair['public_key']
    }


def allocate_tokens_to_fi(fi_id: str, amount: int) -> Dict:
    """Allocate tokens from CB vault to an FI"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Verify FI exists
    cursor.execute('SELECT * FROM financial_institutions WHERE fi_id = ?', (fi_id,))
    fi = cursor.fetchone()
    if not fi:
        conn.close()
        return {'error': 'FI not found'}
    
    # Get available tokens from CB vault
    cursor.execute('''
        SELECT serial_number, denomination FROM tokens 
        WHERE current_owner = 'CB' AND status = 'active'
        ORDER BY denomination DESC
    ''')
    available = [dict(r) for r in cursor.fetchall()]
    
    # Select tokens to transfer
    selected = []
    total = 0
    for token in available:
        if total >= amount:
            break
        selected.append(token)
        total += token['denomination']
    
    if total < amount:
        # Need to mint more tokens
        conn.close()
        mint_result = mint_mixed_tokens(amount - total, f"Additional for {fi_id}")
        if 'error' in mint_result:
            return mint_result
        
        # Retry with new tokens
        return allocate_tokens_to_fi(fi_id, amount)
    
    # Calculate change if overpaid
    if total > amount:
        # For simplicity, only transfer exact tokens
        # In real system, would break tokens
        selected = []
        total = 0
        for token in sorted(available, key=lambda t: t['denomination']):
            if total + token['denomination'] <= amount:
                selected.append(token)
                total += token['denomination']
        
        if total < amount:
            # Mint exact amount needed
            conn.close()
            mint_result = mint_mixed_tokens(amount, f"Allocation for {fi_id}")
            if 'error' in mint_result:
                return mint_result
            selected = mint_result['tokens']
            total = amount
    
    timestamp = int(time.time() * 1000)
    
    # Transfer ownership
    for token in selected:
        cursor.execute('''
            UPDATE tokens SET current_owner = ?, owner_type = 'fi', last_transfer_at = ?
            WHERE serial_number = ?
        ''', (fi_id, timestamp, token['serial_number']))
    
    # Record in ledger
    tx_id = f"alloc-{secrets.token_hex(8)}"
    cursor.execute('''
        INSERT INTO ledger (id, transaction_type, from_entity, to_entity, token_serials, total_amount, description, timestamp)
        VALUES (?, 'allocation', 'CB', ?, ?, ?, ?, ?)
    ''', (tx_id, fi_id, str([t['serial_number'] for t in selected]), total, f"Allocation to {fi['name']}", timestamp))
    
    conn.commit()
    conn.close()
    
    # Group by denomination
    by_denom = {}
    for t in selected:
        d = t['denomination']
        by_denom[d] = by_denom.get(d, 0) + 1
    
    return {
        'success': True,
        'fi_id': fi_id,
        'amount': total,
        'token_count': len(selected),
        'breakdown': by_denom,
        'tokens': selected,
        'transaction_id': tx_id
    }


def get_fi_tokens(fi_id: str) -> List[Dict]:
    """Get all tokens owned by an FI"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT serial_number, denomination, minted_at, last_transfer_at
        FROM tokens WHERE current_owner = ? AND status = 'active'
        ORDER BY denomination DESC
    ''', (fi_id,))
    
    tokens = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return tokens


def get_money_supply() -> Dict:
    """Get current money supply statistics"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Total minted
    cursor.execute('SELECT SUM(denomination) as total FROM tokens WHERE status != "destroyed"')
    total_minted = cursor.fetchone()['total'] or 0
    
    # In CB vault
    cursor.execute('SELECT SUM(denomination) as total FROM tokens WHERE current_owner = "CB" AND status = "active"')
    in_cb = cursor.fetchone()['total'] or 0
    
    # In FIs
    cursor.execute('SELECT SUM(denomination) as total FROM tokens WHERE owner_type = "fi" AND status = "active"')
    in_fis = cursor.fetchone()['total'] or 0
    
    # In wallets
    cursor.execute('SELECT SUM(denomination) as total FROM tokens WHERE owner_type = "wallet" AND status = "active"')
    in_wallets = cursor.fetchone()['total'] or 0
    
    # In sub-wallets
    cursor.execute('SELECT SUM(denomination) as total FROM tokens WHERE owner_type = "subwallet" AND status = "active"')
    in_subwallets = cursor.fetchone()['total'] or 0
    
    # Token counts by denomination
    cursor.execute('''
        SELECT denomination, COUNT(*) as count FROM tokens WHERE status = 'active'
        GROUP BY denomination ORDER BY denomination DESC
    ''')
    by_denomination = {r['denomination']: r['count'] for r in cursor.fetchall()}
    
    conn.close()
    
    return {
        'total_minted': total_minted,
        'in_circulation': total_minted - in_cb,
        'breakdown': {
            'in_cb_vault': in_cb,
            'in_fis': in_fis,
            'in_wallets': in_wallets,
            'in_subwallets': in_subwallets,
        },
        'by_denomination': by_denomination,
        'is_balanced': (in_cb + in_fis + in_wallets + in_subwallets) == total_minted
    }


def get_ledger(limit: int = 100) -> List[Dict]:
    """Get ledger entries"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT * FROM ledger ORDER BY timestamp DESC LIMIT ?
    ''', (limit,))
    
    entries = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return entries


def get_all_fis() -> List[Dict]:
    """Get all registered FIs"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('SELECT fi_id, name, api_url, status, registered_at FROM financial_institutions')
    fis = [dict(r) for r in cursor.fetchall()]
    
    # Add balance for each FI
    for fi in fis:
        cursor.execute('''
            SELECT SUM(denomination) as balance FROM tokens 
            WHERE current_owner = ? AND status = 'active'
        ''', (fi['fi_id'],))
        fi['balance'] = cursor.fetchone()['balance'] or 0
    
    conn.close()
    return fis


def transfer_tokens_between_fis(from_fi: str, to_fi: str, token_serials: List[str]) -> Dict:
    """Transfer tokens between FIs (for cross-FI transactions)"""
    conn = get_db()
    cursor = conn.cursor()
    
    timestamp = int(time.time() * 1000)
    total = 0
    
    for serial in token_serials:
        # Verify ownership
        cursor.execute('SELECT * FROM tokens WHERE serial_number = ? AND current_owner = ?', 
                      (serial, from_fi))
        token = cursor.fetchone()
        if not token:
            conn.close()
            return {'error': f'Token {serial} not owned by {from_fi}'}
        
        total += token['denomination']
        
        # Transfer
        cursor.execute('''
            UPDATE tokens SET current_owner = ?, last_transfer_at = ?
            WHERE serial_number = ?
        ''', (to_fi, timestamp, serial))
    
    # Record in ledger
    tx_id = f"xfi-{secrets.token_hex(8)}"
    cursor.execute('''
        INSERT INTO ledger (id, transaction_type, from_entity, to_entity, token_serials, total_amount, timestamp)
        VALUES (?, 'cross_fi_transfer', ?, ?, ?, ?, ?)
    ''', (tx_id, from_fi, to_fi, str(token_serials), total, timestamp))
    
    conn.commit()
    conn.close()
    
    return {
        'success': True,
        'transaction_id': tx_id,
        'from_fi': from_fi,
        'to_fi': to_fi,
        'amount': total,
        'token_count': len(token_serials)
    }


def validate_wallet(wallet_id: str) -> Dict:
    """Validate if a wallet exists in any FI"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if any tokens are owned by this wallet
    cursor.execute('''
        SELECT COUNT(*) as count, SUM(denomination) as balance 
        FROM tokens WHERE current_owner = ? AND status = 'active'
    ''', (wallet_id,))
    result = cursor.fetchone()
    
    conn.close()
    
    if result['count'] > 0:
        return {'valid': True, 'wallet_id': wallet_id, 'balance': result['balance']}
    
    return {'valid': False, 'wallet_id': wallet_id}


# Initialize on import
init_db()
