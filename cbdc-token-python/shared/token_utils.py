"""
Token Utilities for CBDC
Manages token denominations, serial numbers, and token operations
"""
import hashlib
import time
import secrets
from typing import List, Dict, Tuple, Optional

# Valid denominations in Indian Rupees
DENOMINATIONS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 2000]

def generate_serial_number(issuer_id: str, denomination: int, batch_id: str = None) -> str:
    """Generate unique serial number for a token"""
    timestamp = int(time.time() * 1000)
    random_part = secrets.token_hex(8)
    batch = batch_id or secrets.token_hex(4)
    
    data = f"{issuer_id}|{denomination}|{batch}|{timestamp}|{random_part}"
    hash_value = hashlib.sha256(data.encode()).hexdigest()[:16].upper()
    
    # Format: DEN-HASH (e.g., 500-A1B2C3D4E5F6G7H8)
    return f"{denomination}-{hash_value}"


def generate_nullifier(serial_number: str, owner_private_key: str, nonce: str = None) -> str:
    """Generate nullifier for spent token (prevents double-spending)"""
    n = nonce or secrets.token_hex(16)
    data = f"NULLIFIER|{serial_number}|{owner_private_key}|{n}"
    return hashlib.sha256(data.encode()).hexdigest()


def calculate_change(amount: int, available_tokens: List[Dict]) -> Tuple[List[Dict], List[Dict], int]:
    """
    Calculate which tokens to use and what change is needed
    
    Returns:
        - tokens_to_spend: List of tokens to transfer
        - change_tokens: List of new tokens as change
        - remaining: Amount that couldn't be covered (should be 0)
    """
    # Sort tokens by denomination (largest first for efficiency)
    sorted_tokens = sorted(available_tokens, key=lambda t: t['denomination'], reverse=True)
    
    tokens_to_spend = []
    total_spent = 0
    
    # Greedy selection
    for token in sorted_tokens:
        if total_spent >= amount:
            break
        tokens_to_spend.append(token)
        total_spent += token['denomination']
    
    if total_spent < amount:
        return [], [], amount - total_spent  # Insufficient funds
    
    change_amount = total_spent - amount
    change_tokens = make_change(change_amount)
    
    return tokens_to_spend, change_tokens, 0


def make_change(amount: int) -> List[int]:
    """
    Break down an amount into optimal denomination tokens
    Uses greedy algorithm (works for Indian denominations)
    """
    if amount <= 0:
        return []
    
    change = []
    remaining = amount
    
    for denom in sorted(DENOMINATIONS, reverse=True):
        while remaining >= denom:
            change.append(denom)
            remaining -= denom
    
    return change


def validate_denomination(amount: int) -> bool:
    """Check if amount is a valid denomination"""
    return amount in DENOMINATIONS


def tokens_to_amount(tokens: List[Dict]) -> int:
    """Calculate total value of tokens"""
    return sum(t.get('denomination', 0) for t in tokens)


def break_token(token: Dict, target_amount: int) -> Tuple[List[int], List[int]]:
    """
    Break a large token into smaller denominations
    
    Returns:
        - tokens_for_recipient: denominations totaling target_amount
        - tokens_for_sender: change denominations
    """
    denomination = token['denomination']
    
    if target_amount > denomination:
        return [], [denomination]  # Can't break, return original
    
    if target_amount == denomination:
        return [denomination], []  # Exact match
    
    # Break into recipient portion and change
    recipient_tokens = make_change(target_amount)
    change_tokens = make_change(denomination - target_amount)
    
    return recipient_tokens, change_tokens


def format_token_display(tokens: List[Dict]) -> str:
    """Format tokens for display"""
    if not tokens:
        return "No tokens"
    
    # Group by denomination
    by_denom = {}
    for t in tokens:
        d = t.get('denomination', 0)
        by_denom[d] = by_denom.get(d, 0) + 1
    
    parts = []
    for denom in sorted(by_denom.keys(), reverse=True):
        count = by_denom[denom]
        parts.append(f"₹{denom}×{count}")
    
    total = tokens_to_amount(tokens)
    return f"{', '.join(parts)} = ₹{total:,}"


class TokenBundle:
    """Helper class to manage a collection of tokens"""
    
    def __init__(self, tokens: List[Dict] = None):
        self.tokens = tokens or []
    
    @property
    def total(self) -> int:
        return tokens_to_amount(self.tokens)
    
    @property
    def count(self) -> int:
        return len(self.tokens)
    
    def by_denomination(self) -> Dict[int, int]:
        """Group tokens by denomination"""
        result = {}
        for t in self.tokens:
            d = t['denomination']
            result[d] = result.get(d, 0) + 1
        return result
    
    def select_for_payment(self, amount: int) -> Tuple[List[Dict], int]:
        """Select tokens for a payment, returns (selected_tokens, change_needed)"""
        tokens_to_spend, _, remaining = calculate_change(amount, self.tokens)
        if remaining > 0:
            return [], remaining  # Insufficient
        
        change = tokens_to_amount(tokens_to_spend) - amount
        return tokens_to_spend, change
    
    def __repr__(self):
        return format_token_display(self.tokens)
