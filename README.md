# CBDC Multi-Node System

A comprehensive multi-node Central Bank Digital Currency (CBDC) simulation system with a Central Bank, Financial Institutions, Wallets, and a Web-based Dashboard.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Web Dashboard (React)                     │
│                      Port: 3000                              │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ Central Bank  │◄───│    FI Node 1  │    │   FI Node 2   │
│  Port: 4000   │    │  Port: 4001   │    │  Port: 4002   │
│  (Ledger DB)  │◄───│  (Local DB)   │    │  (Local DB)   │
└───────────────┘    └───────┬───────┘    └───────┬───────┘
                             │                     │
                     ┌───────┴───────┐     ┌───────┴───────┐
                     │               │     │               │
                     ▼               ▼     ▼               ▼
                 ┌───────┐     ┌───────┐ ┌───────┐   ┌───────┐
                 │Wallet1│     │Wallet2│ │Wallet3│   │Wallet4│
                 └───────┘     └───────┘ └───────┘   └───────┘
```

## ✨ Features

- **Central Bank Node**: Main ledger database, manages Financial Institutions, allocates funds
- **Financial Institution Nodes**: Connect to Central Bank, create wallets, sync transactions
- **Wallet System**: P2P transactions between wallets, balance management
- **Web Dashboard**: Real-time control panel for all operations

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm

### Installation

```bash
# Clone the repository (if not already)
cd CBDC

# Install all dependencies
npm run install:all
```

### Running the System

**Start all services at once:**
```bash
npm run start:all
```

**Or start individually:**
```bash
# Terminal 1 - Central Bank (Port 4000)
npm run start:central-bank

# Terminal 2 - FI Node 1 (Port 4001)
npm run start:fi1

# Terminal 3 - FI Node 2 (Port 4002)
npm run start:fi2

# Terminal 4 - Web Dashboard (Port 3000)
npm run start:dashboard
```

### Access the Dashboard
Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📁 Project Structure

```
CBDC/
├── central-bank/              # Central Bank Node
│   ├── src/
│   │   ├── index.js           # Express server
│   │   ├── database.js        # SQLite ledger operations
│   │   └── routes/
│   │       ├── fi.js          # FI management routes
│   │       └── ledger.js      # Ledger routes
│   ├── data/                  # Ledger database (auto-created)
│   └── package.json
│
├── fi-node/                   # Financial Institution Node
│   ├── src/
│   │   ├── index.js           # Express server
│   │   ├── database.js        # Local SQLite operations
│   │   └── routes/
│   │       ├── wallet.js      # Wallet management
│   │       └── transaction.js # Transaction handling
│   ├── data/                  # FI databases (auto-created)
│   └── package.json
│
├── web-dashboard/             # React Frontend
│   ├── src/
│   │   ├── App.jsx            # Main dashboard component
│   │   ├── services/api.js    # API service layer
│   │   └── index.css          # Tailwind styles
│   └── package.json
│
└── package.json               # Root package with scripts
```

## 🔌 API Endpoints

### Central Bank (Port 4000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/stats` | System statistics |
| GET | `/api/fi/list` | List all registered FIs |
| POST | `/api/fi/register` | Register a new FI |
| POST | `/api/fi/allocate` | Allocate funds to FI |
| GET | `/api/ledger` | Get all ledger entries |
| POST | `/api/ledger/sync` | Sync transactions from FI |

### FI Node (Port 4001/4002)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/info` | FI information |
| GET | `/api/stats` | FI statistics |
| POST | `/api/wallet/create` | Create a new wallet |
| GET | `/api/wallet/list` | List all wallets |
| GET | `/api/wallet/:id` | Get wallet details |
| GET | `/api/wallet/:id/balance` | Get wallet balance |
| POST | `/api/wallet/:id/credit` | Credit wallet |
| POST | `/api/transaction/create` | Create P2P transaction |
| GET | `/api/transaction/list` | List all transactions |
| POST | `/api/transaction/sync` | Sync with Central Bank |

## 🎯 Usage Guide

### 1. Start the System
Start all nodes and the dashboard using `npm run start:all`

### 2. View Dashboard
Open http://localhost:3000 - The FI nodes will auto-register with the Central Bank

### 3. Allocate Funds
Go to **Central Bank** tab → Use the "Allocate Funds to FI" form

### 4. Create Wallets
Go to **Wallets** tab → Create wallets for each FI

### 5. Credit Wallets
Use the "Credit Wallet" form to add funds to wallets

### 6. Make Transactions
Go to **Transactions** tab → Create P2P transactions between wallets

### 7. Sync to Ledger
Click "Sync to Ledger" to push FI transactions to the Central Bank

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite (better-sqlite3)
- **Frontend**: React 18, Vite
- **Styling**: Tailwind CSS
- **Icons**: Lucide React

## 📝 License

MIT
