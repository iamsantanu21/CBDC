# Token-Based CBDC System (Python)

A multi-node Central Bank Digital Currency (CBDC) system with **denominated tokens** instead of account balances.

## 🪙 Token-Based Architecture

Unlike account-based CBDC where balances are tracked as numbers, this system uses individual tokens with unique serial numbers, similar to physical currency.

### Token Denominations
- ₹2000, ₹500, ₹200, ₹100, ₹50, ₹20, ₹10, ₹5, ₹2, ₹1

### Example Token
```json
{
    "serial_number": "500-A1B2C3D4E5F6G7H8",
    "denomination": 500,
    "owner_id": "wallet_abc123",
    "owner_type": "wallet",
    "status": "active",
    "mint_batch": "BATCH-001"
}
```

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Web Dashboard (Flask)                     │
│                      Port: 3000                              │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ Central Bank  │◄───│  SBI (FI 1)   │    │  HDFC (FI 2)  │
│  Port: 4000   │    │  Port: 4001   │    │  Port: 4002   │
│ (Token Mint)  │    │(Token Store)  │    │ (Token Store) │
└───────────────┘    └───────┬───────┘    └───────┬───────┘
                             │                     │
                     ┌───────┴───────┐     ┌───────┴───────┐
                     │  Wallets      │     │   Wallets     │
                     │  + SubWallets │     │   + SubWallets│
                     └───────────────┘     └───────────────┘
```

## 📁 Project Structure

```
cbdc-token-python/
├── requirements.txt          # Python dependencies
├── README.md                 # This file
├── shared/
│   ├── __init__.py
│   ├── token_utils.py        # Token denomination handling
│   └── zkp.py                # ZKP proof simulation
├── central_bank/
│   ├── __init__.py
│   ├── database.py           # Token minting & FI management
│   ├── app.py                # Flask API (port 4000)
│   └── data/                 # SQLite database
├── fi_node/
│   ├── __init__.py
│   ├── database.py           # Wallet & transaction management
│   ├── app.py                # Flask API (configurable port)
│   └── data/                 # SQLite database
└── web_dashboard/
    ├── __init__.py
    ├── app.py                # Dashboard Flask API (port 3000)
    └── templates/
        └── index.html        # Dashboard UI
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd cbdc-token-python
pip install -r requirements.txt
```

### 2. Start Central Bank

```bash
cd central_bank
python app.py
# Runs on port 4000
```

### 3. Start Financial Institutions

```bash
# Terminal 2 - SBI
cd fi_node
FI_ID=sbi FI_NAME="State Bank of India" FI_PORT=4001 python app.py

# Terminal 3 - HDFC
cd fi_node
FI_ID=hdfc FI_NAME="HDFC Bank" FI_PORT=4002 python app.py
```

### 4. Start Web Dashboard

```bash
cd web_dashboard
python app.py
# Runs on port 3000
```

### 5. Open Dashboard

Open http://localhost:3000 in your browser.

## 📡 API Endpoints

### Central Bank (Port 4000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/money-supply` | Total tokens minted by denomination |
| GET | `/api/ledger` | All ledger entries |
| GET | `/api/fi/list` | List registered FIs |
| POST | `/api/token/mint` | Mint single denomination tokens |
| POST | `/api/token/mint/mixed` | Mint optimal denomination mix |
| POST | `/api/fi/register` | Register new FI |
| POST | `/api/fi/<fi_id>/allocate` | Allocate tokens to FI |

### FI Node (Port 4001/4002)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/balance` | FI total balance & token count |
| GET | `/api/wallet/list` | List all wallets |
| GET | `/api/wallet/<id>` | Get wallet details |
| GET | `/api/wallet/<id>/subwallets` | Get wallet's subwallets |
| GET | `/api/transactions` | List all transactions |
| POST | `/api/wallet/create` | Create new wallet |
| POST | `/api/wallet/<id>/allocate` | Allocate tokens to wallet |
| POST | `/api/wallet/<id>/device/register` | Register IoT subwallet |
| POST | `/api/transaction/create` | Transfer tokens |

## 🔐 Zero-Knowledge Proofs

The system uses simulated ZKP for:

1. **Ownership Proofs** - Prove token ownership without revealing private key
2. **Token Transfer Proofs** - Validate transactions privately
3. **Compliance Proofs** - AML/CFT checks without exposing balances
4. **Nullifiers** - Prevent double-spending

### ZKP Implementation

```python
# Generate ownership proof
proof = generate_ownership_proof(private_key, token_serial)

# Generate transfer proof
transfer_proof = generate_token_transfer_proof(
    tokens,
    sender_key,
    recipient_id
)

# Generate compliance proof
compliance_proof = generate_compliance_proof(
    amount,
    sender_balance,
    recipient_balance
)
```

## 💰 Token Flow

### 1. Minting
```
Central Bank mints tokens → Tokens have unique serial numbers
Example: Amount ₹1753 creates:
  - 1x ₹1000 (serial: 1000-XXXX)
  - 1x ₹500 (serial: 500-XXXX)
  - 1x ₹200 (serial: 200-XXXX)
  - 1x ₹50 (serial: 50-XXXX)
  - 3x ₹1 (serials: 1-XXXX, 1-YYYY, 1-ZZZZ)
```

### 2. Allocation to FI
```
Central Bank → FI
Tokens transfer ownership:
  owner_id: "cb" → "sbi"
  owner_type: "cb" → "fi"
```

### 3. Wallet Creation & Funding
```
FI → Wallet
Tokens transfer to wallet:
  owner_id: "sbi" → "wallet_123"
  owner_type: "fi" → "wallet"
```

### 4. P2P Transfer
```
Wallet A → Wallet B
Specific tokens move between wallets
Change calculation for exact amounts
```

## 🔄 Token vs Account-Based Comparison

| Feature | Account-Based | Token-Based |
|---------|--------------|-------------|
| Balance | Single number | Collection of tokens |
| Transfer | Update balances | Transfer specific tokens |
| Denominations | N/A | ₹1 to ₹2000 |
| Tracking | Account level | Per-token serial |
| Change | N/A | Automatic calculation |
| Physical analogy | Bank balance | Cash notes & coins |

## 🌳 Money Flow Hierarchy

```
Reserve Bank of India (Central Bank)
├── Minted Tokens (CB Reserve)
│
├── SBI (Financial Institution)
│   ├── FI Reserve Tokens
│   │
│   ├── Wallet: Rahul
│   │   ├── Tokens: [₹500, ₹100, ₹50]
│   │   └── SubWallet: Smart Watch
│   │       └── Tokens: [₹100, ₹20]
│   │
│   └── Wallet: Priya
│       └── Tokens: [₹200, ₹100, ₹50, ₹10]
│
└── HDFC (Financial Institution)
    ├── FI Reserve Tokens
    │
    └── Wallet: Amit
        └── Tokens: [₹500, ₹200, ₹100]
```

## 🧪 Testing with cURL

### Mint Tokens
```bash
curl -X POST http://localhost:4000/api/token/mint/mixed \
  -H "Content-Type: application/json" \
  -d '{"amount": 10000}'
```

### Allocate to FI
```bash
curl -X POST http://localhost:4000/api/fi/sbi/allocate \
  -H "Content-Type: application/json" \
  -d '{"amount": 5000}'
```

### Create Wallet
```bash
curl -X POST http://localhost:4001/api/wallet/create \
  -H "Content-Type: application/json" \
  -d '{"name": "Rahul Kumar"}'
```

### Transfer Tokens
```bash
curl -X POST http://localhost:4001/api/transaction/create \
  -H "Content-Type: application/json" \
  -d '{
    "fromWallet": "wallet_abc123",
    "toWallet": "wallet_xyz789",
    "amount": 150
  }'
```

## 📊 Database Schema

### Central Bank Tables

- **tokens** - All minted tokens with serial numbers
- **financial_institutions** - Registered FIs
- **ledger** - Transaction audit trail
- **nullifiers** - Double-spend prevention
- **token_batches** - Minting batch records

### FI Node Tables

- **wallets** - User wallets with ZKP keys
- **subwallets** - IoT device subwallets
- **tokens** - Tokens held by this FI
- **transactions** - Transaction history
- **compliance** - AML/CFT records

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CB_PORT` | 4000 | Central Bank port |
| `FI_PORT` | 4001 | FI Node port |
| `FI_ID` | fi_001 | FI identifier |
| `FI_NAME` | FI Node | FI display name |
| `CB_URL` | http://localhost:4000 | Central Bank URL |
| `DASHBOARD_PORT` | 3000 | Dashboard port |

## 🛡️ Security Features

1. **Unique Token Serials** - Each token has a cryptographically unique 16-character serial
2. **Nullifiers** - Prevent double-spending by tracking spent tokens
3. **ZKP Proofs** - Privacy-preserving transaction validation
4. **Compliance Limits** - AML/CFT thresholds for transactions

## 📝 License

MIT License - For educational and research purposes.

## 🤝 Contributing

This is a demonstration system for understanding token-based CBDC architecture.
