# CBDC Multi-Node System

## Project Overview
A multi-node Central Bank Digital Currency (CBDC) system with:
- **Central Bank**: Main ledger database, manages FIs, allocates funds
- **Financial Institutions (FI)**: Connect to Central Bank, create wallets, sync transactions
- **Wallets**: Perform P2P transactions, sync with parent FI
- **Web Dashboard**: Control panel to manage all nodes

## Architecture
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

## Tech Stack
- **Backend**: Node.js, Express.js
- **Database**: SQLite (better-sqlite3)
- **Frontend**: React with Vite
- **Styling**: Tailwind CSS

## Project Structure
```
CBDC/
├── central-bank/          # Central Bank Node
│   ├── src/
│   │   ├── index.js       # Express server
│   │   ├── database.js    # SQLite ledger
│   │   └── routes/        # API routes
│   └── package.json
├── fi-node/               # Financial Institution Node
│   ├── src/
│   │   ├── index.js       # Express server
│   │   ├── database.js    # Local SQLite DB
│   │   └── routes/        # API routes
│   └── package.json
├── web-dashboard/         # React Frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   └── services/      # API services
│   └── package.json
└── package.json           # Root package.json
```

## Running the Project
1. Install dependencies: `npm run install:all`
2. Start all services: `npm run start:all`
3. Or start individually:
   - Central Bank: `npm run start:central-bank`
   - FI Node 1: `npm run start:fi1`
   - FI Node 2: `npm run start:fi2`
   - Dashboard: `npm run start:dashboard`

## API Endpoints

### Central Bank (Port 4000)
- `GET /api/ledger` - Get all ledger entries
- `POST /api/fi/register` - Register a new FI
- `POST /api/fi/allocate` - Allocate funds to FI
- `POST /api/transactions/sync` - Sync transactions from FI
- `GET /api/fi/list` - List all registered FIs

### FI Node (Port 4001/4002)
- `POST /api/wallet/create` - Create a new wallet
- `GET /api/wallets` - List all wallets
- `POST /api/transaction` - Process a transaction
- `GET /api/balance/:walletId` - Get wallet balance
- `POST /api/sync` - Sync with Central Bank
