"""
Zero-Knowledge Proof Module for Token CBDC
Simulates ZKP for:
1. Token ownership proof
2. Valid denomination proof
3. Double-spending prevention
"""
import hashlib
import time
import secrets
from typing import Dict, Any, Optional

# Compliance limits
COMPLIANCE_LIMITS = {
    'SINGLE_TX_LIMIT': 50000,
    'DAILY_LIMIT': 200000,
    'MONTHLY_LIMIT': 1000000,
    'OFFLINE_LIMIT': 10000,
    'IOT_DEVICE_LIMIT': 5000,
}


def generate_private_key() -> str:
    """Generate a secure random private key"""
    return secrets.token_hex(32)


def derive_public_key(private_key: str) -> str:
    """Derive public key from private key (simulated)"""
    hash_value = hashlib.sha256(private_key.encode()).hexdigest()
    return f"pk_{hash_value[:40]}"


def generate_keypair() -> Dict[str, str]:
    """Generate a wallet keypair"""
    private_key = generate_private_key()
    public_key = derive_public_key(private_key)
    return {'private_key': private_key, 'public_key': public_key}


def generate_ownership_proof(private_key: str, public_key: str, 
                             token_serial: str = None, challenge: str = None) -> Dict[str, Any]:
    """
    Generate ZKP proof for token/wallet ownership
    Proves: "I own this token/wallet" without revealing private key
    """
    timestamp = int(time.time() * 1000)
    nonce = secrets.token_hex(16)
    challenge_value = challenge or secrets.token_hex(32)
    
    # Create signature
    sign_data = f"{private_key}|{challenge_value}|{timestamp}|{nonce}"
    if token_serial:
        sign_data += f"|{token_serial}"
    
    signature = hashlib.sha256(sign_data.encode()).hexdigest()
    
    # Verification hash (can be verified without private key)
    verify_data = f"{public_key}|{challenge_value}|{timestamp}"
    if token_serial:
        verify_data += f"|{token_serial}"
    verification_hash = hashlib.sha256(verify_data.encode()).hexdigest()[:16]
    
    return {
        'type': 'ownership',
        'public_key': public_key,
        'token_serial': token_serial,
        'challenge': challenge_value,
        'timestamp': timestamp,
        'nonce': nonce,
        'proof': signature,
        'verification_hash': verification_hash
    }


def verify_ownership_proof(proof: Dict, expected_public_key: str) -> bool:
    """Verify ownership proof"""
    if proof.get('type') != 'ownership':
        return False
    if proof.get('public_key') != expected_public_key:
        return False
    
    # Check timestamp freshness (5 minutes)
    age = int(time.time() * 1000) - proof.get('timestamp', 0)
    if age > 5 * 60 * 1000:
        return False
    
    # Verify hash
    verify_data = f"{proof['public_key']}|{proof['challenge']}|{proof['timestamp']}"
    if proof.get('token_serial'):
        verify_data += f"|{proof['token_serial']}"
    expected_hash = hashlib.sha256(verify_data.encode()).hexdigest()[:16]
    
    return proof.get('verification_hash') == expected_hash


def generate_token_transfer_proof(
    sender_private_key: str,
    sender_public_key: str,
    recipient_public_key: str,
    token_serials: list,
    amount: int
) -> Dict[str, Any]:
    """
    Generate ZKP proof for token transfer
    Proves:
    1. Sender owns the tokens
    2. Tokens are valid (not spent)
    3. Total matches claimed amount
    """
    timestamp = int(time.time() * 1000)
    nonce = secrets.token_hex(16)
    
    # Transaction hash
    tx_data = {
        'from': sender_public_key,
        'to': recipient_public_key,
        'tokens': sorted(token_serials),
        'amount': amount,
        'timestamp': timestamp
    }
    tx_hash = hashlib.sha256(str(tx_data).encode()).hexdigest()
    
    # Signature
    sign_data = f"{sender_private_key}|{tx_hash}|{nonce}"
    signature = hashlib.sha256(sign_data.encode()).hexdigest()
    
    # Generate nullifiers for each token (prevents double-spending)
    nullifiers = [
        generate_nullifier(serial, sender_private_key, nonce)
        for serial in token_serials
    ]
    
    return {
        'type': 'token_transfer',
        'tx_hash': tx_hash,
        'sender_public_key': sender_public_key,
        'recipient_public_key': recipient_public_key,
        'token_count': len(token_serials),
        'amount': amount,
        'timestamp': timestamp,
        'nonce': nonce,
        'signature': signature,
        'nullifiers': nullifiers,
        'verification_tag': hashlib.sha256(
            f"{tx_hash}|{sender_public_key}|{timestamp}".encode()
        ).hexdigest()[:20]
    }


def generate_nullifier(serial_number: str, private_key: str, nonce: str) -> str:
    """Generate nullifier for a token to prevent double-spending"""
    data = f"NULLIFIER|{serial_number}|{private_key}|{nonce}"
    return f"NUL-{hashlib.sha256(data.encode()).hexdigest()}"


def generate_compliance_proof(
    amount: int,
    daily_spent: int = 0,
    monthly_spent: int = 0,
    is_offline: bool = False,
    is_iot: bool = False
) -> Dict[str, Any]:
    """Generate ZKP compliance proof"""
    timestamp = int(time.time() * 1000)
    nonce = secrets.token_hex(16)
    
    # Check compliance
    checks = {
        'single_tx_valid': amount <= COMPLIANCE_LIMITS['SINGLE_TX_LIMIT'],
        'daily_valid': (daily_spent + amount) <= COMPLIANCE_LIMITS['DAILY_LIMIT'],
        'monthly_valid': (monthly_spent + amount) <= COMPLIANCE_LIMITS['MONTHLY_LIMIT'],
        'offline_valid': not is_offline or amount <= COMPLIANCE_LIMITS['OFFLINE_LIMIT'],
        'iot_valid': not is_iot or amount <= COMPLIANCE_LIMITS['IOT_DEVICE_LIMIT'],
    }
    
    is_compliant = all(checks.values())
    
    commitment = hashlib.sha256(
        f"COMPLIANCE|{str(checks)}|{nonce}".encode()
    ).hexdigest()
    
    return {
        'type': 'compliance_proof',
        'timestamp': timestamp,
        'nonce': nonce,
        'is_compliant': is_compliant,
        'checks': checks,
        'commitment': commitment,
        'verification_tag': hashlib.sha256(
            f"{commitment}|{timestamp}|{is_compliant}".encode()
        ).hexdigest()[:24]
    }


def verify_compliance_proof(proof: Dict) -> Dict[str, Any]:
    """Verify compliance proof"""
    if proof.get('type') != 'compliance_proof':
        return {'valid': False, 'error': 'Invalid proof type'}
    
    # Check freshness
    age = int(time.time() * 1000) - proof.get('timestamp', 0)
    if age > 5 * 60 * 1000:
        return {'valid': False, 'error': 'Proof expired'}
    
    # Verify tag
    expected_tag = hashlib.sha256(
        f"{proof['commitment']}|{proof['timestamp']}|{proof['is_compliant']}".encode()
    ).hexdigest()[:24]
    
    if proof.get('verification_tag') != expected_tag:
        return {'valid': False, 'error': 'Invalid verification tag'}
    
    return {
        'valid': True,
        'is_compliant': proof.get('is_compliant'),
        'checks': proof.get('checks')
    }
