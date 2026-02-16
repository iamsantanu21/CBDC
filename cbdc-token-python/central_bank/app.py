"""
Central Bank Flask API
"""
import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, jsonify, request
from flask_cors import CORS
from database import (
    mint_tokens, mint_mixed_tokens, mint_specific_denominations,
    register_fi, allocate_tokens_to_fi,
    get_fi_tokens, get_money_supply, get_ledger, get_all_fis,
    transfer_tokens_between_fis, validate_wallet
)
from shared.token_utils import DENOMINATIONS

app = Flask(__name__)
CORS(app)

PORT = int(os.environ.get('PORT', 4000))


@app.route('/api/health')
def health():
    return jsonify({'status': 'ok', 'service': 'Central Bank', 'type': 'token-based'})


# ========== TOKEN MINTING ==========

@app.route('/api/token/mint', methods=['POST'])
def api_mint_tokens():
    """Mint new tokens of a specific denomination"""
    data = request.json
    denomination = data.get('denomination')
    count = data.get('count', 1)
    purpose = data.get('purpose', 'General circulation')
    
    if not denomination:
        return jsonify({'error': 'denomination is required'}), 400
    
    result = mint_tokens(denomination, count, purpose)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify(result)


@app.route('/api/token/mint/mixed', methods=['POST'])
def api_mint_mixed():
    """Mint tokens to match a specific amount"""
    data = request.json
    amount = data.get('amount')
    purpose = data.get('purpose', 'Mixed minting')
    
    if not amount:
        return jsonify({'error': 'amount is required'}), 400
    
    result = mint_mixed_tokens(amount, purpose)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify(result)


@app.route('/api/token/mint/specific', methods=['POST'])
def api_mint_specific():
    """
    Mint specific number of tokens for each denomination
    Body: { "denominations": {"2000": 5, "500": 10, "100": 20}, "purpose": "..." }
    """
    data = request.json
    denominations = data.get('denominations', {})
    purpose = data.get('purpose', 'Specific denomination minting')
    
    if not denominations:
        return jsonify({'error': 'denominations object is required. Example: {"2000": 5, "500": 10}'}), 400
    
    # Convert string keys to integers
    denom_counts = {}
    for denom, count in denominations.items():
        try:
            denom_counts[int(denom)] = int(count)
        except ValueError:
            return jsonify({'error': f'Invalid denomination or count: {denom}={count}'}), 400
    
    result = mint_specific_denominations(denom_counts, purpose)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify(result)


@app.route('/api/token/denominations')
def api_denominations():
    """Get available denominations"""
    return jsonify({'denominations': DENOMINATIONS})


# ========== FI MANAGEMENT ==========

@app.route('/api/fi/register', methods=['POST'])
def api_register_fi():
    """Register a new Financial Institution"""
    data = request.json
    fi_id = data.get('fi_id')
    name = data.get('name')
    api_url = data.get('api_url')
    
    if not all([fi_id, name, api_url]):
        return jsonify({'error': 'fi_id, name, and api_url are required'}), 400
    
    result = register_fi(fi_id, name, api_url)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify(result)


@app.route('/api/fi/list')
def api_list_fis():
    """List all registered FIs"""
    fis = get_all_fis()
    return jsonify({'fis': fis})


@app.route('/api/fi/<fi_id>/allocate', methods=['POST'])
def api_allocate_to_fi(fi_id):
    """Allocate tokens to an FI"""
    data = request.json
    amount = data.get('amount')
    
    if not amount or amount <= 0:
        return jsonify({'error': 'Valid amount is required'}), 400
    
    result = allocate_tokens_to_fi(fi_id, amount)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify(result)


@app.route('/api/fi/<fi_id>/tokens')
def api_fi_tokens(fi_id):
    """Get tokens owned by an FI"""
    tokens = get_fi_tokens(fi_id)
    total = sum(t['denomination'] for t in tokens)
    
    # Group by denomination
    by_denom = {}
    for t in tokens:
        d = t['denomination']
        by_denom[d] = by_denom.get(d, 0) + 1
    
    return jsonify({
        'fi_id': fi_id,
        'total_balance': total,
        'token_count': len(tokens),
        'breakdown': by_denom,
        'tokens': tokens
    })


@app.route('/api/fi/transfer', methods=['POST'])
def api_transfer_between_fis():
    """Transfer tokens between FIs"""
    data = request.json
    from_fi = data.get('from_fi')
    to_fi = data.get('to_fi')
    token_serials = data.get('token_serials', [])
    
    if not all([from_fi, to_fi, token_serials]):
        return jsonify({'error': 'from_fi, to_fi, and token_serials are required'}), 400
    
    result = transfer_tokens_between_fis(from_fi, to_fi, token_serials)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify(result)


# ========== MONEY SUPPLY & LEDGER ==========

@app.route('/api/money-supply')
def api_money_supply():
    """Get money supply statistics"""
    return jsonify(get_money_supply())


@app.route('/api/ledger')
def api_ledger():
    """Get ledger entries"""
    limit = request.args.get('limit', 100, type=int)
    entries = get_ledger(limit)
    return jsonify({'ledger': entries, 'count': len(entries)})


# ========== WALLET VALIDATION ==========

@app.route('/api/wallet/validate/<wallet_id>')
def api_validate_wallet(wallet_id):
    """Validate a wallet"""
    result = validate_wallet(wallet_id)
    return jsonify(result)


if __name__ == '__main__':
    print(f"🏛️ Central Bank (Token-Based) starting on port {PORT}")
    print(f"📜 Valid denominations: {DENOMINATIONS}")
    app.run(host='0.0.0.0', port=PORT, debug=True)
