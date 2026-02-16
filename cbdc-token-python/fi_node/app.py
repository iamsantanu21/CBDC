"""
FI Node Flask API
"""
import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, jsonify, request
from flask_cors import CORS
from database import (
    FI_ID, FI_NAME,
    register_with_cb, request_allocation, get_fi_balance,
    create_wallet, get_wallet, get_all_wallets, allocate_to_wallet, get_wallet_details,
    create_subwallet, get_subwallets, allocate_to_subwallet, get_subwallet_details,
    create_transaction, get_transactions, get_all_tokens,
    load_tokens_to_se, get_se_balance, offline_transaction,
    set_device_online_status, sync_subwallet,
    # Wallet SE operations
    load_tokens_to_wallet_se, get_wallet_se_balance, wallet_offline_transaction,
    set_wallet_online_status, sync_wallet_offline_transactions
)
from shared.token_utils import DENOMINATIONS

app = Flask(__name__)
CORS(app)

PORT = int(os.environ.get('FI_PORT', os.environ.get('PORT', 4001)))


@app.route('/api/health')
def health():
    return jsonify({
        'status': 'ok', 
        'service': 'FI Node',
        'fi_id': FI_ID,
        'fi_name': FI_NAME,
        'type': 'token-based'
    })


# ========== FI OPERATIONS ==========

@app.route('/api/register', methods=['POST'])
def api_register():
    """Register with Central Bank"""
    result = register_with_cb()
    if 'error' in result:
        return jsonify(result), 400
    return jsonify(result)


@app.route('/api/allocate', methods=['POST'])
def api_request_allocation():
    """Request token allocation from CB"""
    data = request.json
    amount = data.get('amount')
    
    if not amount or amount <= 0:
        return jsonify({'error': 'Valid amount is required'}), 400
    
    result = request_allocation(amount)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify(result)


@app.route('/api/balance')
def api_balance():
    """Get FI balance"""
    return jsonify(get_fi_balance())


@app.route('/api/tokens')
def api_tokens():
    """Get all tokens in this FI"""
    return jsonify(get_all_tokens())


# ========== WALLET OPERATIONS ==========

@app.route('/api/wallet/create', methods=['POST'])
def api_create_wallet():
    """Create a new wallet"""
    data = request.json
    name = data.get('name')
    
    if not name:
        return jsonify({'error': 'name is required'}), 400
    
    result = create_wallet(name)
    return jsonify(result)


@app.route('/api/wallet/list')
def api_list_wallets():
    """List all wallets"""
    wallets = get_all_wallets()
    return jsonify({'wallets': wallets})


@app.route('/api/wallet/<wallet_id>')
def api_get_wallet(wallet_id):
    """Get wallet details with tokens"""
    wallet = get_wallet(wallet_id)
    if not wallet:
        return jsonify({'error': 'Wallet not found'}), 404
    
    # Remove private key from response
    wallet.pop('private_key', None)
    return jsonify(wallet)


@app.route('/api/wallet/<wallet_id>/allocate', methods=['POST'])
def api_allocate_to_wallet(wallet_id):
    """Allocate tokens to wallet"""
    data = request.json
    amount = data.get('amount')
    
    if not amount or amount <= 0:
        return jsonify({'error': 'Valid amount is required'}), 400
    
    result = allocate_to_wallet(wallet_id, amount)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify(result)


# ========== SUB-WALLET (IoT) OPERATIONS ==========

@app.route('/api/wallet/<wallet_id>/device/register', methods=['POST'])
def api_register_device(wallet_id):
    """Register IoT device (create sub-wallet)"""
    data = request.json
    device_type = data.get('deviceType', 'generic')
    device_name = data.get('deviceName', 'Unknown Device')
    spending_limit = data.get('spendingLimit', 1000)
    se_enabled = data.get('seEnabled', True)
    
    result = create_subwallet(wallet_id, device_type, device_name, spending_limit, se_enabled)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify(result)


@app.route('/api/wallet/<wallet_id>/subwallets')
def api_get_subwallets(wallet_id):
    """Get sub-wallets for a wallet"""
    subwallets = get_subwallets(wallet_id)
    return jsonify({'subwallets': subwallets})


@app.route('/api/subwallet/<subwallet_id>')
def api_get_subwallet(subwallet_id):
    """Get detailed sub-wallet info"""
    details = get_subwallet_details(subwallet_id)
    if not details:
        return jsonify({'error': 'Sub-wallet not found'}), 404
    details.pop('private_key', None)
    return jsonify(details)


@app.route('/api/wallet/<wallet_id>/subwallet/<subwallet_id>/allocate', methods=['POST'])
def api_allocate_to_subwallet(wallet_id, subwallet_id):
    """Allocate tokens to sub-wallet"""
    data = request.json
    amount = data.get('amount')
    
    if not amount or amount <= 0:
        return jsonify({'error': 'Valid amount is required'}), 400
    
    result = allocate_to_subwallet(wallet_id, subwallet_id, amount)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify(result)


# ========== SECURE ELEMENT (SE) OPERATIONS ==========

@app.route('/api/wallet/<wallet_id>/subwallet/<subwallet_id>/se/load', methods=['POST'])
def api_load_to_se(wallet_id, subwallet_id):
    """Load tokens from wallet to IoT device's Secure Element"""
    data = request.json
    amount = data.get('amount')
    
    if not amount or amount <= 0:
        return jsonify({'error': 'Valid amount is required'}), 400
    
    result = load_tokens_to_se(wallet_id, subwallet_id, amount)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify(result)


@app.route('/api/subwallet/<subwallet_id>/se/balance')
def api_se_balance(subwallet_id):
    """Get Secure Element balance"""
    result = get_se_balance(subwallet_id)
    return jsonify(result)


@app.route('/api/subwallet/<subwallet_id>/offline/transaction', methods=['POST'])
def api_offline_transaction(subwallet_id):
    """Create offline transaction using SE tokens"""
    data = request.json
    to_id = data.get('toWallet') or data.get('to')
    amount = data.get('amount')
    description = data.get('description', 'Offline payment')
    
    if not to_id or not amount:
        return jsonify({'error': 'to and amount are required'}), 400
    
    result = offline_transaction(subwallet_id, to_id, amount, description)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify(result)


@app.route('/api/subwallet/<subwallet_id>/status', methods=['POST'])
def api_set_device_status(subwallet_id):
    """Set device online/offline status"""
    data = request.json
    is_online = data.get('isOnline', True)
    
    result = set_device_online_status(subwallet_id, is_online)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify(result)


@app.route('/api/subwallet/<subwallet_id>/sync', methods=['POST'])
def api_sync_subwallet(subwallet_id):
    """Sync offline transactions to network"""
    result = sync_subwallet(subwallet_id)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify(result)


# ========== WALLET SECURE ELEMENT (SE) OPERATIONS ==========
# (For wallet-to-wallet offline payments with ZKP)

@app.route('/api/wallet/<wallet_id>/details')
def api_wallet_details(wallet_id):
    """Get detailed wallet info including SE status"""
    details = get_wallet_details(wallet_id)
    if not details:
        return jsonify({'error': 'Wallet not found'}), 404
    details.pop('private_key', None)
    return jsonify(details)


@app.route('/api/wallet/<wallet_id>/se/load', methods=['POST'])
def api_wallet_se_load(wallet_id):
    """Load tokens from wallet to wallet's Secure Element for offline use"""
    data = request.json
    amount = data.get('amount')
    
    if not amount or amount <= 0:
        return jsonify({'error': 'Valid amount is required'}), 400
    
    result = load_tokens_to_wallet_se(wallet_id, amount)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify(result)


@app.route('/api/wallet/<wallet_id>/se/balance')
def api_wallet_se_balance(wallet_id):
    """Get wallet Secure Element balance"""
    result = get_wallet_se_balance(wallet_id)
    return jsonify(result)


@app.route('/api/wallet/<wallet_id>/offline/transaction', methods=['POST'])
def api_wallet_offline_transaction(wallet_id):
    """Create offline wallet-to-wallet transaction using SE tokens with ZKP"""
    data = request.json
    to_wallet = data.get('toWallet') or data.get('to')
    amount = data.get('amount')
    description = data.get('description', 'Offline payment')
    
    if not to_wallet or not amount:
        return jsonify({'error': 'toWallet and amount are required'}), 400
    
    result = wallet_offline_transaction(wallet_id, to_wallet, amount, description)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify(result)


@app.route('/api/wallet/<wallet_id>/status', methods=['POST'])
def api_wallet_status(wallet_id):
    """Set wallet online/offline status"""
    data = request.json
    is_online = data.get('isOnline', True)
    
    result = set_wallet_online_status(wallet_id, is_online)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify(result)


@app.route('/api/wallet/<wallet_id>/sync', methods=['POST'])
def api_wallet_sync(wallet_id):
    """Sync wallet's offline transactions to network"""
    result = sync_wallet_offline_transactions(wallet_id)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify(result)


# ========== TRANSACTIONS ==========

@app.route('/api/transaction/create', methods=['POST'])
def api_create_transaction():
    """Create a token transaction"""
    data = request.json
    from_id = data.get('fromWallet') or data.get('from')
    to_id = data.get('toWallet') or data.get('to')
    amount = data.get('amount')
    description = data.get('description', '')
    to_fi = data.get('toFi')
    
    if not all([from_id, to_id, amount]):
        return jsonify({'error': 'from, to, and amount are required'}), 400
    
    result = create_transaction(from_id, to_id, amount, description, to_fi)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify(result)


@app.route('/api/transactions')
def api_get_transactions():
    """Get all transactions"""
    entity_id = request.args.get('entity')
    limit = request.args.get('limit', 50, type=int)
    
    transactions = get_transactions(entity_id, limit)
    return jsonify({'transactions': transactions})


@app.route('/api/wallet/<wallet_id>/transactions')
def api_wallet_transactions(wallet_id):
    """Get wallet transactions"""
    transactions = get_transactions(wallet_id)
    return jsonify({'transactions': transactions})


if __name__ == '__main__':
    print(f"🏦 {FI_NAME} (Token-Based) starting on port {PORT}")
    print(f"📜 Valid denominations: {DENOMINATIONS}")
    
    # Auto-register with CB
    reg_result = register_with_cb()
    if 'error' not in reg_result:
        print(f"✅ Registered with Central Bank")
    else:
        print(f"⚠️ CB registration: {reg_result.get('error', 'Unknown error')}")
    
    app.run(host='0.0.0.0', port=PORT, debug=True)
