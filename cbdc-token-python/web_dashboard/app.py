"""
Web Dashboard for Token-Based CBDC
Simple Flask-based dashboard
"""
import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)

PORT = int(os.environ.get('DASHBOARD_PORT', 3000))
CB_URL = os.environ.get('CB_URL', 'http://localhost:4000')
FI1_URL = os.environ.get('FI1_URL', 'http://localhost:4001')
FI2_URL = os.environ.get('FI2_URL', 'http://localhost:4002')


def safe_request(url, method='GET', json_data=None):
    """Make a safe request with error handling"""
    try:
        if method == 'GET':
            response = requests.get(url, timeout=5)
        else:
            response = requests.post(url, json=json_data, timeout=5)
        return response.json()
    except Exception as e:
        return {'error': str(e)}


@app.route('/')
def index():
    """Serve the dashboard HTML"""
    return render_template('index.html')


# ========== CENTRAL BANK APIs ==========

@app.route('/api/cb/health')
def cb_health():
    return jsonify(safe_request(f'{CB_URL}/api/health'))


@app.route('/api/cb/money-supply')
def cb_money_supply():
    return jsonify(safe_request(f'{CB_URL}/api/money-supply'))


@app.route('/api/cb/ledger')
def cb_ledger():
    limit = request.args.get('limit', 50)
    return jsonify(safe_request(f'{CB_URL}/api/ledger?limit={limit}'))


@app.route('/api/cb/fis')
def cb_fis():
    return jsonify(safe_request(f'{CB_URL}/api/fi/list'))


@app.route('/api/cb/mint', methods=['POST'])
def cb_mint():
    data = request.json
    return jsonify(safe_request(f'{CB_URL}/api/token/mint/mixed', 'POST', data))


@app.route('/api/cb/mint/specific', methods=['POST'])
def cb_mint_specific():
    """Mint specific number of tokens for each denomination"""
    data = request.json
    return jsonify(safe_request(f'{CB_URL}/api/token/mint/specific', 'POST', data))


@app.route('/api/cb/allocate/<fi_id>', methods=['POST'])
def cb_allocate(fi_id):
    data = request.json
    return jsonify(safe_request(f'{CB_URL}/api/fi/{fi_id}/allocate', 'POST', data))


# ========== FI1 APIs ==========

@app.route('/api/fi1/health')
def fi1_health():
    return jsonify(safe_request(f'{FI1_URL}/api/health'))


@app.route('/api/fi1/balance')
def fi1_balance():
    return jsonify(safe_request(f'{FI1_URL}/api/balance'))


@app.route('/api/fi1/wallets')
def fi1_wallets():
    return jsonify(safe_request(f'{FI1_URL}/api/wallet/list'))


@app.route('/api/fi1/wallet/<wallet_id>')
def fi1_wallet(wallet_id):
    return jsonify(safe_request(f'{FI1_URL}/api/wallet/{wallet_id}'))


@app.route('/api/fi1/wallet/create', methods=['POST'])
def fi1_create_wallet():
    data = request.json
    return jsonify(safe_request(f'{FI1_URL}/api/wallet/create', 'POST', data))


@app.route('/api/fi1/wallet/<wallet_id>/allocate', methods=['POST'])
def fi1_allocate_wallet(wallet_id):
    data = request.json
    return jsonify(safe_request(f'{FI1_URL}/api/wallet/{wallet_id}/allocate', 'POST', data))


@app.route('/api/fi1/wallet/<wallet_id>/subwallets')
def fi1_subwallets(wallet_id):
    return jsonify(safe_request(f'{FI1_URL}/api/wallet/{wallet_id}/subwallets'))


@app.route('/api/fi1/wallet/<wallet_id>/device', methods=['POST'])
def fi1_register_device(wallet_id):
    data = request.json
    return jsonify(safe_request(f'{FI1_URL}/api/wallet/{wallet_id}/device/register', 'POST', data))


@app.route('/api/fi1/wallet/<wallet_id>/device/register', methods=['POST'])
def fi1_register_device_alt(wallet_id):
    data = request.json
    return jsonify(safe_request(f'{FI1_URL}/api/wallet/{wallet_id}/device/register', 'POST', data))


@app.route('/api/fi1/wallet/<wallet_id>/subwallet/<subwallet_id>/se/load', methods=['POST'])
def fi1_se_load(wallet_id, subwallet_id):
    data = request.json
    return jsonify(safe_request(f'{FI1_URL}/api/wallet/{wallet_id}/subwallet/{subwallet_id}/se/load', 'POST', data))


@app.route('/api/fi1/subwallet/<subwallet_id>/se/balance')
def fi1_se_balance(subwallet_id):
    return jsonify(safe_request(f'{FI1_URL}/api/subwallet/{subwallet_id}/se/balance'))


@app.route('/api/fi1/subwallet/<subwallet_id>/offline/transaction', methods=['POST'])
def fi1_offline_tx(subwallet_id):
    data = request.json
    return jsonify(safe_request(f'{FI1_URL}/api/subwallet/{subwallet_id}/offline/transaction', 'POST', data))


@app.route('/api/fi1/subwallet/<subwallet_id>/status', methods=['POST'])
def fi1_device_status(subwallet_id):
    data = request.json
    return jsonify(safe_request(f'{FI1_URL}/api/subwallet/{subwallet_id}/status', 'POST', data))


@app.route('/api/fi1/subwallet/<subwallet_id>/sync', methods=['POST'])
def fi1_sync(subwallet_id):
    data = request.json
    return jsonify(safe_request(f'{FI1_URL}/api/subwallet/{subwallet_id}/sync', 'POST', data))


@app.route('/api/fi1/subwallet/<subwallet_id>')
def fi1_subwallet_detail(subwallet_id):
    return jsonify(safe_request(f'{FI1_URL}/api/subwallet/{subwallet_id}'))


# FI1 Wallet SE Routes (for wallet-to-wallet offline with ZKP)
@app.route('/api/fi1/wallet/<wallet_id>/details')
def fi1_wallet_details(wallet_id):
    return jsonify(safe_request(f'{FI1_URL}/api/wallet/{wallet_id}/details'))


@app.route('/api/fi1/wallet/<wallet_id>/se/load', methods=['POST'])
def fi1_wallet_se_load(wallet_id):
    data = request.json
    return jsonify(safe_request(f'{FI1_URL}/api/wallet/{wallet_id}/se/load', 'POST', data))


@app.route('/api/fi1/wallet/<wallet_id>/se/balance')
def fi1_wallet_se_balance(wallet_id):
    return jsonify(safe_request(f'{FI1_URL}/api/wallet/{wallet_id}/se/balance'))


@app.route('/api/fi1/wallet/<wallet_id>/offline/transaction', methods=['POST'])
def fi1_wallet_offline_tx(wallet_id):
    data = request.json
    return jsonify(safe_request(f'{FI1_URL}/api/wallet/{wallet_id}/offline/transaction', 'POST', data))


@app.route('/api/fi1/wallet/<wallet_id>/status', methods=['POST'])
def fi1_wallet_status(wallet_id):
    data = request.json
    return jsonify(safe_request(f'{FI1_URL}/api/wallet/{wallet_id}/status', 'POST', data))


@app.route('/api/fi1/wallet/<wallet_id>/sync', methods=['POST'])
def fi1_wallet_sync(wallet_id):
    data = request.json
    return jsonify(safe_request(f'{FI1_URL}/api/wallet/{wallet_id}/sync', 'POST', data))


@app.route('/api/fi1/transaction', methods=['POST'])
def fi1_transaction():
    data = request.json
    return jsonify(safe_request(f'{FI1_URL}/api/transaction/create', 'POST', data))


@app.route('/api/fi1/transactions')
def fi1_transactions():
    return jsonify(safe_request(f'{FI1_URL}/api/transactions'))


# ========== FI2 APIs ==========

@app.route('/api/fi2/health')
def fi2_health():
    return jsonify(safe_request(f'{FI2_URL}/api/health'))


@app.route('/api/fi2/balance')
def fi2_balance():
    return jsonify(safe_request(f'{FI2_URL}/api/balance'))


@app.route('/api/fi2/wallets')
def fi2_wallets():
    return jsonify(safe_request(f'{FI2_URL}/api/wallet/list'))


@app.route('/api/fi2/wallet/<wallet_id>')
def fi2_wallet(wallet_id):
    return jsonify(safe_request(f'{FI2_URL}/api/wallet/{wallet_id}'))


@app.route('/api/fi2/wallet/create', methods=['POST'])
def fi2_create_wallet():
    data = request.json
    return jsonify(safe_request(f'{FI2_URL}/api/wallet/create', 'POST', data))


@app.route('/api/fi2/wallet/<wallet_id>/allocate', methods=['POST'])
def fi2_allocate_wallet(wallet_id):
    data = request.json
    return jsonify(safe_request(f'{FI2_URL}/api/wallet/{wallet_id}/allocate', 'POST', data))


@app.route('/api/fi2/wallet/<wallet_id>/subwallets')
def fi2_subwallets(wallet_id):
    return jsonify(safe_request(f'{FI2_URL}/api/wallet/{wallet_id}/subwallets'))


@app.route('/api/fi2/wallet/<wallet_id>/device', methods=['POST'])
def fi2_register_device(wallet_id):
    data = request.json
    return jsonify(safe_request(f'{FI2_URL}/api/wallet/{wallet_id}/device/register', 'POST', data))


@app.route('/api/fi2/wallet/<wallet_id>/device/register', methods=['POST'])
def fi2_register_device_alt(wallet_id):
    data = request.json
    return jsonify(safe_request(f'{FI2_URL}/api/wallet/{wallet_id}/device/register', 'POST', data))


@app.route('/api/fi2/wallet/<wallet_id>/subwallet/<subwallet_id>/se/load', methods=['POST'])
def fi2_se_load(wallet_id, subwallet_id):
    data = request.json
    return jsonify(safe_request(f'{FI2_URL}/api/wallet/{wallet_id}/subwallet/{subwallet_id}/se/load', 'POST', data))


@app.route('/api/fi2/subwallet/<subwallet_id>/se/balance')
def fi2_se_balance(subwallet_id):
    return jsonify(safe_request(f'{FI2_URL}/api/subwallet/{subwallet_id}/se/balance'))


@app.route('/api/fi2/subwallet/<subwallet_id>/offline/transaction', methods=['POST'])
def fi2_offline_tx(subwallet_id):
    data = request.json
    return jsonify(safe_request(f'{FI2_URL}/api/subwallet/{subwallet_id}/offline/transaction', 'POST', data))


@app.route('/api/fi2/subwallet/<subwallet_id>/status', methods=['POST'])
def fi2_device_status(subwallet_id):
    data = request.json
    return jsonify(safe_request(f'{FI2_URL}/api/subwallet/{subwallet_id}/status', 'POST', data))


@app.route('/api/fi2/subwallet/<subwallet_id>/sync', methods=['POST'])
def fi2_sync(subwallet_id):
    data = request.json
    return jsonify(safe_request(f'{FI2_URL}/api/subwallet/{subwallet_id}/sync', 'POST', data))


@app.route('/api/fi2/subwallet/<subwallet_id>')
def fi2_subwallet_detail(subwallet_id):
    return jsonify(safe_request(f'{FI2_URL}/api/subwallet/{subwallet_id}'))


# FI2 Wallet SE Routes (for wallet-to-wallet offline with ZKP)
@app.route('/api/fi2/wallet/<wallet_id>/details')
def fi2_wallet_details(wallet_id):
    return jsonify(safe_request(f'{FI2_URL}/api/wallet/{wallet_id}/details'))


@app.route('/api/fi2/wallet/<wallet_id>/se/load', methods=['POST'])
def fi2_wallet_se_load(wallet_id):
    data = request.json
    return jsonify(safe_request(f'{FI2_URL}/api/wallet/{wallet_id}/se/load', 'POST', data))


@app.route('/api/fi2/wallet/<wallet_id>/se/balance')
def fi2_wallet_se_balance(wallet_id):
    return jsonify(safe_request(f'{FI2_URL}/api/wallet/{wallet_id}/se/balance'))


@app.route('/api/fi2/wallet/<wallet_id>/offline/transaction', methods=['POST'])
def fi2_wallet_offline_tx(wallet_id):
    data = request.json
    return jsonify(safe_request(f'{FI2_URL}/api/wallet/{wallet_id}/offline/transaction', 'POST', data))


@app.route('/api/fi2/wallet/<wallet_id>/status', methods=['POST'])
def fi2_wallet_status(wallet_id):
    data = request.json
    return jsonify(safe_request(f'{FI2_URL}/api/wallet/{wallet_id}/status', 'POST', data))


@app.route('/api/fi2/wallet/<wallet_id>/sync', methods=['POST'])
def fi2_wallet_sync(wallet_id):
    data = request.json
    return jsonify(safe_request(f'{FI2_URL}/api/wallet/{wallet_id}/sync', 'POST', data))


@app.route('/api/fi2/transaction', methods=['POST'])
def fi2_transaction():
    data = request.json
    return jsonify(safe_request(f'{FI2_URL}/api/transaction/create', 'POST', data))


@app.route('/api/fi2/transactions')
def fi2_transactions():
    return jsonify(safe_request(f'{FI2_URL}/api/transactions'))


if __name__ == '__main__':
    print(f"🌐 Token CBDC Dashboard starting on port {PORT}")
    print(f"   Central Bank: {CB_URL}")
    print(f"   FI1: {FI1_URL}")
    print(f"   FI2: {FI2_URL}")
    app.run(host='0.0.0.0', port=PORT, debug=True)
