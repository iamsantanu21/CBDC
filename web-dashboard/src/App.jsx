import { useState, useEffect } from 'react';
import { Building2, Wallet, ArrowLeftRight, RefreshCw, Plus, Send, DollarSign, Activity, Server, ArrowLeft, User, CreditCard, Wifi, WifiOff, Watch, Smartphone, Radio, Shield, CheckCircle, XCircle, Clock, Cpu } from 'lucide-react';
import { centralBankApi, fi1Api, fi2Api, getOtherFIName, getFIApi } from './services/api';

// Format currency in Rupees
const formatRupees = (amount) => {
  return `₹${(amount || 0).toLocaleString('en-IN')}`;
};

// Central Bank Dashboard Component
function CentralBankDashboard() {
  const [fis, setFIs] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [allocateForm, setAllocateForm] = useState({ fiId: '', amount: '', description: '' });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, fisRes, ledgerRes] = await Promise.all([
        centralBankApi.getStats(),
        centralBankApi.getFIs(),
        centralBankApi.getLedger()
      ]);
      setStats(statsRes.stats);
      setFIs(fisRes.fis || []);
      setLedger(ledgerRes.ledger || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleAllocateFunds = async (e) => {
    e.preventDefault();
    try {
      await centralBankApi.allocateFunds(allocateForm.fiId, parseFloat(allocateForm.amount), allocateForm.description);
      setAllocateForm({ fiId: '', amount: '', description: '' });
      fetchData();
      alert('Funds allocated successfully!');
    } catch (err) {
      alert('Error allocating funds: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-800">
      {/* Header */}
      <header className="bg-blue-950 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="bg-yellow-500 p-3 rounded-full">
                <Building2 className="h-8 w-8 text-blue-900" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Reserve Bank of India</h1>
                <p className="text-blue-300">Central Bank Digital Currency System</p>
              </div>
            </div>
            <button 
              onClick={fetchData} 
              className="flex items-center space-x-2 bg-blue-700 hover:bg-blue-600 px-4 py-2 rounded-lg transition"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm">Registered FIs</p>
                  <p className="text-4xl font-bold text-blue-900">{stats.totalFIs}</p>
                </div>
                <div className="bg-blue-100 p-4 rounded-full">
                  <Building2 className="h-8 w-8 text-blue-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm">Total Allocated</p>
                  <p className="text-4xl font-bold text-green-600">{formatRupees(stats.totalAllocated)}</p>
                </div>
                <div className="bg-green-100 p-4 rounded-full">
                  <DollarSign className="h-8 w-8 text-green-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm">Total Transactions</p>
                  <p className="text-4xl font-bold text-purple-600">{stats.totalTransactions}</p>
                </div>
                <div className="bg-purple-100 p-4 rounded-full">
                  <Activity className="h-8 w-8 text-purple-600" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Allocate Funds Form */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
            <DollarSign className="h-6 w-6 mr-2 text-green-600" />
            Allocate Funds to Financial Institution
          </h2>
          <form onSubmit={handleAllocateFunds} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <select
              value={allocateForm.fiId}
              onChange={(e) => setAllocateForm({ ...allocateForm, fiId: e.target.value })}
              className="border-2 border-gray-200 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none"
              required
            >
              <option value="">Select Financial Institution</option>
              {fis.map((fi) => (
                <option key={fi.id} value={fi.id}>{fi.name}</option>
              ))}
            </select>
            <div className="relative">
              <span className="absolute left-3 top-3 text-gray-500 font-bold">₹</span>
              <input
                type="number"
                placeholder="Amount"
                value={allocateForm.amount}
                onChange={(e) => setAllocateForm({ ...allocateForm, amount: e.target.value })}
                className="border-2 border-gray-200 rounded-lg pl-8 pr-4 py-3 w-full focus:border-blue-500 focus:outline-none"
                required
                min="1"
                step="1"
              />
            </div>
            <input
              type="text"
              placeholder="Description (optional)"
              value={allocateForm.description}
              onChange={(e) => setAllocateForm({ ...allocateForm, description: e.target.value })}
              className="border-2 border-gray-200 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              className="bg-green-600 text-white rounded-lg px-6 py-3 font-semibold hover:bg-green-700 transition flex items-center justify-center"
            >
              <Send className="h-5 w-5 mr-2" />
              Allocate Funds
            </button>
          </form>
        </div>

        {/* Registered FIs */}
        <div className="bg-white rounded-xl shadow-lg mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-800">Registered Financial Institutions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">FI ID</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">Name</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">Total Allocated</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">Available Balance</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {fis.map((fi) => (
                  <tr key={fi.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-mono text-gray-600">{fi.id}</td>
                    <td className="px-6 py-4 font-medium text-gray-900">{fi.name}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-green-600">{formatRupees(fi.allocated_funds)}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-blue-600">{formatRupees(fi.available_balance)}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        fi.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {fi.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {fis.length === 0 && (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                      No Financial Institutions registered yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Allocation History */}
        <div className="bg-white rounded-xl shadow-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-800">Allocation History (Ledger)</h2>
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">Date & Time</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">FI Name</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">Type</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">Amount</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {ledger.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(entry.timestamp).toLocaleString('en-IN')}
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">{entry.fi_name || entry.fi_id}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        entry.transaction_type === 'allocation' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {entry.transaction_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-green-600">{formatRupees(entry.amount)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{entry.description || '-'}</td>
                  </tr>
                ))}
                {ledger.length === 0 && (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                      No allocations yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

// FI Dashboard Component
function FIDashboard({ fiApi, fiName, fiColor, onSelectWallet }) {
  const [wallets, setWallets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [stats, setStats] = useState(null);
  const [fiBalance, setFIBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [walletForm, setWalletForm] = useState({ name: '' });
  const [creditForm, setCreditForm] = useState({ walletId: '', amount: '', description: '' });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, walletsRes, txRes, balanceRes] = await Promise.all([
        fiApi.getStats(),
        fiApi.getWallets(),
        fiApi.getTransactions(),
        fiApi.getFIBalance()
      ]);
      setStats(statsRes.stats);
      setWallets(walletsRes.wallets || []);
      setTransactions(txRes.transactions || []);
      setFIBalance(balanceRes.balance || null);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateWallet = async (e) => {
    e.preventDefault();
    try {
      const result = await fiApi.createWallet(walletForm.name);
      setWalletForm({ name: '' });
      fetchData();
      alert(`Wallet "${result.wallet.name}" created successfully!`);
    } catch (err) {
      alert('Error creating wallet: ' + err.message);
    }
  };

  const handleCreditWallet = async (e) => {
    e.preventDefault();
    try {
      await fiApi.creditWallet(creditForm.walletId, parseFloat(creditForm.amount), creditForm.description);
      setCreditForm({ walletId: '', amount: '', description: '' });
      fetchData();
      alert('Wallet credited successfully!');
    } catch (err) {
      alert('Error crediting wallet: ' + err.message);
    }
  };

  const handleSync = async () => {
    try {
      const result = await fiApi.syncWithCentralBank();
      fetchData();
      alert(`Synced ${result.synced || 0} transactions to Central Bank`);
    } catch (err) {
      alert('Error syncing: ' + err.message);
    }
  };

  const bgGradient = fiColor === 'green' 
    ? 'from-green-800 to-green-700' 
    : 'from-purple-800 to-purple-700';
  const headerBg = fiColor === 'green' ? 'bg-green-900' : 'bg-purple-900';

  return (
    <div className={`min-h-screen bg-gradient-to-br ${bgGradient}`}>
      {/* Header */}
      <header className={`${headerBg} text-white shadow-lg`}>
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="bg-white/20 p-3 rounded-full">
                <Building2 className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{fiName}</h1>
                <p className="opacity-75">Financial Institution Dashboard</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button 
                onClick={handleSync}
                className="flex items-center space-x-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition"
              >
                <ArrowLeftRight className="h-4 w-4" />
                <span>Sync to Ledger</span>
              </button>
              <button 
                onClick={fetchData} 
                className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
            <div className="bg-white rounded-xl shadow-lg p-5">
              <p className="text-gray-500 text-sm">Allocated from CB</p>
              <p className="text-3xl font-bold text-purple-600">{formatRupees(fiBalance?.allocatedFromCB || 0)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-5">
              <p className="text-gray-500 text-sm">FI Available</p>
              <p className="text-3xl font-bold text-green-600">{formatRupees(fiBalance?.available || 0)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-5">
              <p className="text-gray-500 text-sm">In Wallets</p>
              <p className="text-3xl font-bold text-blue-600">{formatRupees(fiBalance?.inWallets || 0)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-5">
              <p className="text-gray-500 text-sm">Total Wallets</p>
              <p className="text-3xl font-bold text-gray-800">{stats.totalWallets}</p>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-5">
              <p className="text-gray-500 text-sm">Pending Sync</p>
              <p className="text-3xl font-bold text-orange-600">{stats.pendingSync}</p>
            </div>
          </div>
        )}

        {/* Create Wallet Form */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
            <Plus className="h-6 w-6 mr-2 text-blue-600" />
            Create New Wallet
          </h2>
          <form onSubmit={handleCreateWallet} className="flex gap-4">
            <input
              type="text"
              placeholder="Enter wallet holder name"
              value={walletForm.name}
              onChange={(e) => setWalletForm({ name: e.target.value })}
              className="flex-1 border-2 border-gray-200 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none"
              required
            />
            <button
              type="submit"
              className="bg-blue-600 text-white rounded-lg px-8 py-3 font-semibold hover:bg-blue-700 transition flex items-center"
            >
              <Plus className="h-5 w-5 mr-2" />
              Create Wallet
            </button>
          </form>
        </div>

        {/* Credit Wallet Form */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
            <CreditCard className="h-6 w-6 mr-2 text-green-600" />
            Credit Wallet (from FI allocation)
          </h2>
          <form onSubmit={handleCreditWallet} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <select
              value={creditForm.walletId}
              onChange={(e) => setCreditForm({ ...creditForm, walletId: e.target.value })}
              className="border-2 border-gray-200 rounded-lg px-4 py-3 focus:border-green-500 focus:outline-none"
              required
            >
              <option value="">Select Wallet</option>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({formatRupees(w.balance)})</option>
              ))}
            </select>
            <div className="relative">
              <span className="absolute left-3 top-3 text-gray-500 font-bold">₹</span>
              <input
                type="number"
                placeholder="Amount"
                value={creditForm.amount}
                onChange={(e) => setCreditForm({ ...creditForm, amount: e.target.value })}
                className="border-2 border-gray-200 rounded-lg pl-8 pr-4 py-3 w-full focus:border-green-500 focus:outline-none"
                required
                min="1"
              />
            </div>
            <input
              type="text"
              placeholder="Description"
              value={creditForm.description}
              onChange={(e) => setCreditForm({ ...creditForm, description: e.target.value })}
              className="border-2 border-gray-200 rounded-lg px-4 py-3 focus:border-green-500 focus:outline-none"
            />
            <button
              type="submit"
              className="bg-green-600 text-white rounded-lg px-6 py-3 font-semibold hover:bg-green-700 transition"
            >
              Credit Wallet
            </button>
          </form>
        </div>

        {/* Wallets List */}
        <div className="bg-white rounded-xl shadow-lg mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-800">Wallets</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
            {wallets.map((wallet) => (
              <div 
                key={wallet.id} 
                className="border-2 border-gray-200 rounded-xl p-5 hover:border-blue-400 hover:shadow-lg transition cursor-pointer"
                onClick={() => onSelectWallet(wallet, fiApi, fiName)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="bg-blue-100 p-2 rounded-full">
                      <User className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">{wallet.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{wallet.id.slice(0, 12)}...</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ${wallet.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100'}`}>
                    {wallet.status}
                  </span>
                </div>
                <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-4">
                  <p className="text-sm text-gray-500">Balance</p>
                  <p className="text-2xl font-bold text-green-600">{formatRupees(wallet.balance)}</p>
                </div>
                <p className="text-xs text-gray-400 mt-2 text-center">Click to open wallet dashboard →</p>
              </div>
            ))}
            {wallets.length === 0 && (
              <div className="col-span-full text-center py-12 text-gray-500">
                No wallets created yet. Create your first wallet above.
              </div>
            )}
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="bg-white rounded-xl shadow-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-800">Recent Transactions</h2>
          </div>
          <div className="overflow-x-auto max-h-64">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600">From</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600">To</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600">Amount</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600">Type</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600">Synced</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {transactions.slice(0, 10).map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm font-mono">{tx.from_wallet ? tx.from_wallet.slice(0,10) + '...' : 'System'}</td>
                    <td className="px-6 py-3 text-sm font-mono">{tx.to_wallet.slice(0,10)}...</td>
                    <td className="px-6 py-3 text-sm font-semibold text-green-600">{formatRupees(tx.amount)}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${tx.transaction_type === 'credit' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                        {tx.transaction_type}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${tx.synced ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {tx.synced ? 'Yes' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

// Wallet Dashboard Component
function WalletDashboard({ wallet, fiApi, fiName, onBack }) {
  const [walletData, setWalletData] = useState(wallet);
  const [transactions, setTransactions] = useState([]);
  const [allWallets, setAllWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [transferForm, setTransferForm] = useState({ toWallet: '', amount: '', description: '', isCrossFI: false });
  
  // New state for enhanced features
  const [isOffline, setIsOffline] = useState(false);
  const [pendingOffline, setPendingOffline] = useState([]);
  const [devices, setDevices] = useState([]);
  const [zkpProof, setZkpProof] = useState(null);
  const [deviceForm, setDeviceForm] = useState({ deviceType: 'smartwatch', deviceName: '' });
  const [iotPaymentForm, setIotPaymentForm] = useState({ deviceId: '', toWallet: '', amount: '' });
  const [activeTab, setActiveTab] = useState('transfer'); // transfer, offline, devices, zkp, subwallets, compliance
  const [otherFIWallets, setOtherFIWallets] = useState([]);
  
  // NEW: Enhanced Paper Features State
  const [subWallets, setSubWallets] = useState([]);
  const [compliance, setCompliance] = useState(null);
  const [complianceLimits, setComplianceLimits] = useState(null);
  const [subWalletForm, setSubWalletForm] = useState({ deviceId: '', balance: '', spendingLimit: 5000 });
  const [allocateSubForm, setAllocateSubForm] = useState({ subWalletId: '', amount: '' });
  const [subWalletPayForm, setSubWalletPayForm] = useState({ subWalletId: '', toWallet: '', amount: '' });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [walletsRes, txRes] = await Promise.all([
        fiApi.getWallets(),
        fiApi.getTransactions()
      ]);
      const wallets = walletsRes.wallets || [];
      setAllWallets(wallets.filter(w => w.id !== wallet.id));
      setWalletData(wallets.find(w => w.id === wallet.id) || wallet);
      // Filter transactions for this wallet
      const walletTx = (txRes.transactions || []).filter(
        tx => tx.from_wallet === wallet.id || tx.to_wallet === wallet.id
      );
      setTransactions(walletTx);
      
      // Fetch new data
      try {
        const [offlineRes, devicesRes] = await Promise.all([
          fiApi.getPendingOfflineTransactions(),
          fiApi.getWalletDevices(wallet.id)
        ]);
        setPendingOffline((offlineRes.transactions || []).filter(t => t.from_wallet === wallet.id));
        setDevices(devicesRes.devices || []);
      } catch (err) {
        console.log('Extended features not available:', err.message);
      }
      
      // NEW: Fetch enhanced paper features data
      try {
        const [subWalletsRes, complianceRes, limitsRes] = await Promise.all([
          fiApi.getSubWallets(wallet.id),
          fiApi.getWalletCompliance(wallet.id),
          fiApi.getComplianceLimits()
        ]);
        setSubWallets(subWalletsRes.subWallets || []);
        setCompliance(complianceRes.compliance || null);
        setComplianceLimits(limitsRes.limits || null);
      } catch (err) {
        console.log('Enhanced paper features not available:', err.message);
      }
      
      // Fetch other FI's wallets for cross-FI transfers
      try {
        const otherFIName = getOtherFIName(fiName);
        const otherApi = getFIApi(otherFIName);
        const otherWalletsRes = await otherApi.getWallets();
        setOtherFIWallets((otherWalletsRes.wallets || []).map(w => ({ ...w, fi: otherFIName })));
      } catch (err) {
        console.log('Could not fetch other FI wallets:', err.message);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [wallet.id]);

  const handleTransfer = async (e) => {
    e.preventDefault();
    try {
      if (isOffline) {
        // Create offline transaction with ZKP
        const targetFI = transferForm.isCrossFI ? getOtherFIName(fiName) : fiName;
        await fiApi.createOfflineTransaction(
          wallet.id, 
          transferForm.toWallet, 
          targetFI,
          parseFloat(transferForm.amount)
        );
        alert('Offline transaction queued with ZKP proof! Will be processed when online.');
      } else if (transferForm.isCrossFI) {
        // Cross-FI transfer via Central Bank
        const targetFI = getOtherFIName(fiName);
        await centralBankApi.routeCrossFI(
          fiName,
          targetFI,
          wallet.id,
          transferForm.toWallet,
          parseFloat(transferForm.amount)
        );
        alert(`Cross-FI transfer to ${targetFI} initiated!`);
      } else {
        // Normal same-FI transfer
        await fiApi.createTransaction(wallet.id, transferForm.toWallet, parseFloat(transferForm.amount), transferForm.description);
        alert('Transfer successful!');
      }
      setTransferForm({ toWallet: '', amount: '', description: '', isCrossFI: false });
      fetchData();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleGenerateProof = async () => {
    try {
      const result = await fiApi.generateWalletProof(wallet.id);
      setZkpProof(result);
      alert('ZKP ownership proof generated!');
    } catch (err) {
      alert('Error generating proof: ' + err.message);
    }
  };

  const handleVerifyOwnership = async () => {
    try {
      if (!zkpProof) {
        alert('Generate a proof first!');
        return;
      }
      const result = await fiApi.verifyWalletOwnership(wallet.id, zkpProof.proof);
      alert(result.valid ? '✅ Ownership verified!' : '❌ Verification failed!');
    } catch (err) {
      alert('Error verifying: ' + err.message);
    }
  };

  const handleRegisterDevice = async (e) => {
    e.preventDefault();
    try {
      await fiApi.registerDevice(wallet.id, deviceForm.deviceType, deviceForm.deviceName || `${deviceForm.deviceType}-${Date.now()}`);
      setDeviceForm({ deviceType: 'smartwatch', deviceName: '' });
      fetchData();
      alert('Device registered successfully!');
    } catch (err) {
      alert('Error registering device: ' + err.message);
    }
  };

  const handleRevokeDevice = async (deviceId) => {
    if (!confirm('Are you sure you want to revoke this device?')) return;
    try {
      await fiApi.revokeDevice(wallet.id, deviceId);
      fetchData();
      alert('Device revoked!');
    } catch (err) {
      alert('Error revoking device: ' + err.message);
    }
  };

  const handleIoTPayment = async (e) => {
    e.preventDefault();
    try {
      await fiApi.createIoTPayment(iotPaymentForm.deviceId, iotPaymentForm.toWallet, parseFloat(iotPaymentForm.amount));
      setIotPaymentForm({ deviceId: '', toWallet: '', amount: '' });
      fetchData();
      alert('IoT payment successful!');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleProcessOffline = async () => {
    try {
      const result = await fiApi.processAllOfflineTransactions();
      fetchData();
      alert(`Processed ${result.processed || 0} offline transactions!`);
    } catch (err) {
      alert('Error processing offline transactions: ' + err.message);
    }
  };

  // NEW: Sub-Wallet Handlers
  const handleCreateSubWallet = async (e) => {
    e.preventDefault();
    try {
      const initialBalance = parseFloat(subWalletForm.balance) || 0;
      if (initialBalance > walletData.balance) {
        alert('Insufficient wallet balance!');
        return;
      }
      if (initialBalance > 25000) {
        alert('Sub-wallet initial balance cannot exceed ₹25,000 (AML/CFT compliance)');
        return;
      }
      // Create sub-wallet for selected device with initial balance
      await fiApi.createSubWalletForDevice(
        wallet.id, 
        subWalletForm.deviceId, 
        parseInt(subWalletForm.spendingLimit),
        initialBalance
      );
      setSubWalletForm({ deviceId: '', balance: '', spendingLimit: 5000 });
      fetchData();
      alert('Sub-wallet created successfully! ₹' + initialBalance.toLocaleString() + ' allocated from main wallet.');
    } catch (err) {
      alert('Error creating sub-wallet: ' + err.message);
    }
  };

  const handleAllocateToSubWallet = async (e) => {
    e.preventDefault();
    try {
      await fiApi.allocateToSubWallet(wallet.id, allocateSubForm.subWalletId, parseFloat(allocateSubForm.amount));
      setAllocateSubForm({ subWalletId: '', amount: '' });
      fetchData();
      alert('Funds allocated to sub-wallet!');
    } catch (err) {
      alert('Error allocating: ' + err.message);
    }
  };

  const handleReturnFromSubWallet = async (subWalletId) => {
    try {
      const subWallet = subWallets.find(sw => sw.id === subWalletId);
      if (!subWallet || subWallet.balance <= 0) {
        alert('No balance to return!');
        return;
      }
      await fiApi.returnFromSubWallet(wallet.id, subWalletId, subWallet.balance);
      fetchData();
      alert('Funds returned from sub-wallet!');
    } catch (err) {
      alert('Error returning funds: ' + err.message);
    }
  };

  const handleRevokeSubWallet = async (subWalletId) => {
    if (!confirm('Are you sure you want to revoke this sub-wallet? All funds will be returned to main wallet.')) {
      return;
    }
    try {
      const result = await fiApi.revokeSubWallet(wallet.id, subWalletId);
      fetchData();
      alert(`Sub-wallet revoked! ${result.returned ? '₹' + result.returned.toLocaleString() + ' returned to main wallet.' : ''}`);
    } catch (err) {
      alert('Error revoking sub-wallet: ' + err.message);
    }
  };

  const handleSubWalletPayment = async (e) => {
    e.preventDefault();
    try {
      await fiApi.subWalletPay(subWalletPayForm.subWalletId, subWalletPayForm.toWallet, parseFloat(subWalletPayForm.amount));
      setSubWalletPayForm({ subWalletId: '', toWallet: '', amount: '' });
      fetchData();
      alert('Sub-wallet payment successful!');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleCheckCompliance = async (amount) => {
    try {
      const result = await fiApi.checkComplianceForTransaction(wallet.id, amount, 'online');
      if (result.compliance?.allowed) {
        alert('✅ Transaction allowed within compliance limits');
      } else {
        alert(`❌ Transaction blocked: ${result.compliance?.reason || 'Limit exceeded'}`);
      }
    } catch (err) {
      alert('Error checking compliance: ' + err.message);
    }
  };

  const getDeviceIcon = (type) => {
    switch (type) {
      case 'smartwatch': return <Watch className="h-5 w-5" />;
      case 'smart_ring': return <Radio className="h-5 w-5" />;
      case 'mobile': return <Smartphone className="h-5 w-5" />;
      case 'pos': return <CreditCard className="h-5 w-5" />;
      case 'transport_card': return <CreditCard className="h-5 w-5" />;
      default: return <Cpu className="h-5 w-5" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 to-blue-800">
      {/* Header */}
      <header className="bg-indigo-950 text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button 
                onClick={onBack}
                className="bg-indigo-800 hover:bg-indigo-700 p-2 rounded-lg transition"
              >
                <ArrowLeft className="h-6 w-6" />
              </button>
              <div className="bg-indigo-500 p-3 rounded-full">
                <Wallet className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{walletData.name}'s Wallet</h1>
                <p className="text-indigo-300 text-sm">{fiName} • {wallet.id.slice(0, 20)}...</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {/* Offline Mode Toggle */}
              <button 
                onClick={() => setIsOffline(!isOffline)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${
                  isOffline ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500'
                }`}
              >
                {isOffline ? <WifiOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
                <span>{isOffline ? 'Offline' : 'Online'}</span>
              </button>
              <button 
                onClick={fetchData} 
                className="flex items-center space-x-2 bg-indigo-700 hover:bg-indigo-600 px-4 py-2 rounded-lg transition"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Balance Card */}
        <div className={`rounded-2xl shadow-2xl p-8 mb-8 text-white ${
          isOffline ? 'bg-gradient-to-r from-gray-600 to-gray-700' : 'bg-gradient-to-r from-indigo-600 to-purple-600'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <p className={isOffline ? 'text-gray-300' : 'text-indigo-200'}>Available Balance</p>
                {isOffline && (
                  <span className="bg-red-500 px-2 py-0.5 rounded text-xs flex items-center">
                    <WifiOff className="h-3 w-3 mr-1" /> Offline Mode
                  </span>
                )}
              </div>
              <p className="text-5xl font-bold">{formatRupees(walletData.balance)}</p>
              <div className="flex items-center space-x-4 mt-4">
                <p className={`text-sm ${isOffline ? 'text-gray-300' : 'text-indigo-200'}`}>
                  Status: <span className="bg-green-500 px-2 py-1 rounded text-white text-xs ml-1">{walletData.status}</span>
                </p>
                {pendingOffline.length > 0 && (
                  <span className="bg-yellow-500 px-2 py-1 rounded text-xs flex items-center">
                    <Clock className="h-3 w-3 mr-1" /> {pendingOffline.length} pending offline
                  </span>
                )}
              </div>
            </div>
            <div className="bg-white/20 p-6 rounded-full">
              <Wallet className="h-16 w-16" />
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-xl shadow-lg mb-6">
          <div className="flex border-b overflow-x-auto">
            {[
              { id: 'transfer', label: 'Transfer', icon: <Send className="h-4 w-4" /> },
              { id: 'offline', label: 'Offline Queue', icon: <WifiOff className="h-4 w-4" />, badge: pendingOffline.length },
              { id: 'devices', label: 'IoT Devices', icon: <Watch className="h-4 w-4" />, badge: devices.length },
              { id: 'subwallets', label: 'Sub-Wallets', icon: <Smartphone className="h-4 w-4" />, badge: subWallets.length },
              { id: 'compliance', label: 'Compliance', icon: <Shield className="h-4 w-4" /> },
              { id: 'zkp', label: 'ZKP Auth', icon: <Shield className="h-4 w-4" /> },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-6 py-4 font-medium transition ${
                  activeTab === tab.id 
                    ? 'text-blue-600 border-b-2 border-blue-600' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.badge > 0 && (
                  <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full text-xs">{tab.badge}</span>
                )}
              </button>
            ))}
          </div>

          {/* Transfer Tab */}
          {activeTab === 'transfer' && (
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <Send className="h-6 w-6 mr-2 text-blue-600" />
                Transfer Money {isOffline && <span className="text-sm text-red-500 ml-2">(Offline Mode - ZKP Protected)</span>}
              </h2>
              
              {/* Cross-FI Toggle */}
              <div className="mb-4 flex items-center space-x-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={transferForm.isCrossFI}
                    onChange={(e) => setTransferForm({ ...transferForm, isCrossFI: e.target.checked, toWallet: '' })}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-gray-700">Cross-FI Transfer (to {getOtherFIName(fiName)})</span>
                </label>
              </div>

              <form onSubmit={handleTransfer} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <select
                  value={transferForm.toWallet}
                  onChange={(e) => setTransferForm({ ...transferForm, toWallet: e.target.value })}
                  className="border-2 border-gray-200 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none"
                  required
                >
                  <option value="">Select Recipient</option>
                  {transferForm.isCrossFI ? (
                    otherFIWallets.map((w) => (
                      <option key={w.id} value={w.id}>{w.name} ({w.fi})</option>
                    ))
                  ) : (
                    allWallets.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))
                  )}
                </select>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-gray-500 font-bold">₹</span>
                  <input
                    type="number"
                    placeholder="Amount"
                    value={transferForm.amount}
                    onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
                    className="border-2 border-gray-200 rounded-lg pl-8 pr-4 py-3 w-full focus:border-blue-500 focus:outline-none"
                    required
                    min="1"
                    max={walletData.balance}
                  />
                </div>
                <input
                  type="text"
                  placeholder="Note (optional)"
                  value={transferForm.description}
                  onChange={(e) => setTransferForm({ ...transferForm, description: e.target.value })}
                  className="border-2 border-gray-200 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="submit"
                  className={`rounded-lg px-6 py-3 font-semibold transition flex items-center justify-center ${
                    isOffline 
                      ? 'bg-orange-600 text-white hover:bg-orange-700' 
                      : transferForm.isCrossFI
                        ? 'bg-purple-600 text-white hover:bg-purple-700'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                  disabled={walletData.balance <= 0}
                >
                  {isOffline ? <WifiOff className="h-5 w-5 mr-2" /> : <Send className="h-5 w-5 mr-2" />}
                  {isOffline ? 'Queue Offline' : transferForm.isCrossFI ? 'Cross-FI Send' : 'Send'}
                </button>
              </form>
              {walletData.balance <= 0 && (
                <p className="text-red-500 text-sm mt-2">Insufficient balance for transfers</p>
              )}
              {isOffline && (
                <p className="text-orange-600 text-sm mt-2 flex items-center">
                  <Shield className="h-4 w-4 mr-1" />
                  Offline transfers are protected with Zero-Knowledge Proofs and will be processed when you go online.
                </p>
              )}
            </div>
          )}

          {/* Offline Queue Tab */}
          {activeTab === 'offline' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800 flex items-center">
                  <WifiOff className="h-6 w-6 mr-2 text-orange-600" />
                  Pending Offline Transactions
                </h2>
                {pendingOffline.length > 0 && !isOffline && (
                  <button
                    onClick={handleProcessOffline}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition flex items-center"
                  >
                    <Wifi className="h-4 w-4 mr-2" />
                    Go Online & Process All
                  </button>
                )}
              </div>
              
              {pendingOffline.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <WifiOff className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No pending offline transactions</p>
                  <p className="text-sm mt-2">Switch to offline mode to create ZKP-protected transactions</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingOffline.map((tx) => (
                    <div key={tx.id} className="border-2 border-orange-200 bg-orange-50 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="bg-orange-100 p-2 rounded-full">
                            <Clock className="h-5 w-5 text-orange-600" />
                          </div>
                          <div>
                            <p className="font-medium">To: {tx.to_wallet.slice(0, 12)}...</p>
                            <p className="text-sm text-gray-500">Target FI: {tx.to_fi || fiName}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-orange-600">{formatRupees(tx.amount)}</p>
                          <p className="text-xs text-gray-500">{tx.status}</p>
                        </div>
                      </div>
                      {tx.zkp_proof && (
                        <div className="mt-3 bg-white rounded p-2">
                          <p className="text-xs text-gray-500 flex items-center">
                            <Shield className="h-3 w-3 mr-1 text-green-500" />
                            ZKP Proof: {tx.zkp_proof.slice(0, 40)}...
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* IoT Devices Tab */}
          {activeTab === 'devices' && (
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <Watch className="h-6 w-6 mr-2 text-blue-600" />
                IoT Device Management
              </h2>
              
              {/* Register Device Form */}
              <form onSubmit={handleRegisterDevice} className="bg-gray-50 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-gray-700 mb-3">Register New Device</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <select
                    value={deviceForm.deviceType}
                    onChange={(e) => setDeviceForm({ ...deviceForm, deviceType: e.target.value })}
                    className="border-2 border-gray-200 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="smartwatch">⌚ Smartwatch</option>
                    <option value="smart_ring">💍 Smart Ring</option>
                    <option value="mobile">📱 Mobile Device</option>
                    <option value="pos">🏪 POS Terminal</option>
                    <option value="transport_card">🚇 Transport Card</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Device Name (optional)"
                    value={deviceForm.deviceName}
                    onChange={(e) => setDeviceForm({ ...deviceForm, deviceName: e.target.value })}
                    className="border-2 border-gray-200 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="bg-blue-600 text-white rounded-lg px-6 py-3 font-semibold hover:bg-blue-700 transition flex items-center justify-center"
                  >
                    <Plus className="h-5 w-5 mr-2" />
                    Register Device
                  </button>
                </div>
              </form>

              {/* Registered Devices */}
              <h3 className="font-semibold text-gray-700 mb-3">Registered Devices</h3>
              {devices.length === 0 ? (
                <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
                  <Watch className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No devices registered</p>
                  <p className="text-sm">Register a smartwatch, ring, or other IoT device for contactless payments</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {devices.map((device) => (
                    <div key={device.id} className="border-2 border-gray-200 rounded-lg p-4 hover:border-blue-300 transition">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className={`p-2 rounded-full ${device.status === 'active' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                            {getDeviceIcon(device.device_type)}
                          </div>
                          <div>
                            <p className="font-medium">{device.device_name}</p>
                            <p className="text-xs text-gray-500 capitalize">{device.device_type.replace('_', ' ')}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded text-xs ${device.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {device.status}
                          </span>
                          <button
                            onClick={() => handleRevokeDevice(device.id)}
                            className="text-red-500 hover:text-red-700 p-1"
                            title="Revoke device"
                          >
                            <XCircle className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* IoT Payment Form */}
              {devices.filter(d => d.status === 'active').length > 0 && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-700 mb-3 flex items-center">
                    <Radio className="h-5 w-5 mr-2 text-blue-600" />
                    Make IoT Payment
                  </h3>
                  <form onSubmit={handleIoTPayment} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <select
                      value={iotPaymentForm.deviceId}
                      onChange={(e) => setIotPaymentForm({ ...iotPaymentForm, deviceId: e.target.value })}
                      className="border-2 border-gray-200 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none bg-white"
                      required
                    >
                      <option value="">Select Device</option>
                      {devices.filter(d => d.status === 'active').map((d) => (
                        <option key={d.id} value={d.id}>{d.device_name}</option>
                      ))}
                    </select>
                    <select
                      value={iotPaymentForm.toWallet}
                      onChange={(e) => setIotPaymentForm({ ...iotPaymentForm, toWallet: e.target.value })}
                      className="border-2 border-gray-200 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none bg-white"
                      required
                    >
                      <option value="">Select Recipient</option>
                      {allWallets.map((w) => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                    <div className="relative">
                      <span className="absolute left-3 top-3 text-gray-500 font-bold">₹</span>
                      <input
                        type="number"
                        placeholder="Amount"
                        value={iotPaymentForm.amount}
                        onChange={(e) => setIotPaymentForm({ ...iotPaymentForm, amount: e.target.value })}
                        className="border-2 border-gray-200 rounded-lg pl-8 pr-4 py-3 w-full focus:border-blue-500 focus:outline-none"
                        required
                        min="1"
                      />
                    </div>
                    <button
                      type="submit"
                      className="bg-blue-600 text-white rounded-lg px-6 py-3 font-semibold hover:bg-blue-700 transition flex items-center justify-center"
                    >
                      <Radio className="h-5 w-5 mr-2" />
                      Tap to Pay
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* ZKP Authentication Tab */}
          {activeTab === 'zkp' && (
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <Shield className="h-6 w-6 mr-2 text-green-600" />
                Zero-Knowledge Proof Authentication
              </h2>
              
              <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 mb-6">
                <p className="text-green-800 text-sm">
                  ZKP allows you to prove wallet ownership without revealing your private key. 
                  This is used for secure offline transactions and IoT device authentication.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border-2 border-gray-200 rounded-lg p-6">
                  <h3 className="font-semibold text-gray-700 mb-4">Generate Ownership Proof</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Generate a cryptographic proof that you own this wallet without exposing your private key.
                  </p>
                  <button
                    onClick={handleGenerateProof}
                    className="w-full bg-green-600 text-white rounded-lg px-6 py-3 font-semibold hover:bg-green-700 transition flex items-center justify-center"
                  >
                    <Shield className="h-5 w-5 mr-2" />
                    Generate ZKP Proof
                  </button>
                </div>

                <div className="border-2 border-gray-200 rounded-lg p-6">
                  <h3 className="font-semibold text-gray-700 mb-4">Verify Ownership</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Verify your generated proof to confirm wallet ownership.
                  </p>
                  <button
                    onClick={handleVerifyOwnership}
                    disabled={!zkpProof}
                    className={`w-full rounded-lg px-6 py-3 font-semibold transition flex items-center justify-center ${
                      zkpProof 
                        ? 'bg-blue-600 text-white hover:bg-blue-700' 
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    <CheckCircle className="h-5 w-5 mr-2" />
                    Verify Proof
                  </button>
                </div>
              </div>

              {zkpProof && (
                <div className="mt-6 bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-700 mb-2">Current Proof</h3>
                  <div className="bg-white rounded p-3 font-mono text-xs break-all">
                    <p><span className="text-gray-500">Proof:</span> {zkpProof.proof}</p>
                    <p className="mt-2"><span className="text-gray-500">Challenge:</span> {zkpProof.challenge}</p>
                    <p className="mt-2"><span className="text-gray-500">Generated:</span> {new Date(zkpProof.timestamp).toLocaleString()}</p>
                  </div>
                </div>
              )}

              {/* Wallet Keys Info */}
              <div className="mt-6 bg-blue-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-700 mb-2">Wallet Secure Element</h3>
                <p className="text-sm text-gray-600 mb-2">
                  Your wallet has a cryptographic keypair stored in a secure element. The public key is used for verification while the private key never leaves the secure storage.
                </p>
                <div className="bg-white rounded p-3 font-mono text-xs">
                  <p><span className="text-gray-500">Wallet ID:</span> {wallet.id}</p>
                  <p className="mt-1"><span className="text-gray-500">Public Key:</span> {walletData.public_key?.slice(0, 40) || 'Not available'}...</p>
                </div>
              </div>
            </div>
          )}

          {/* Sub-Wallets Tab (Paper Section 3.2) */}
          {activeTab === 'subwallets' && (
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <Smartphone className="h-6 w-6 mr-2 text-purple-600" />
                IoT Sub-Wallets (Paper §3.2)
              </h2>
              
              <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-4 mb-6">
                <p className="text-purple-800 text-sm">
                  Sub-wallets allow you to allocate limited funds to IoT devices (smartwatches, rings, etc.) for contactless payments.
                  Each sub-wallet has its own spending limit as defined in the paper's AML/CFT compliance (max ₹25,000).
                  Sub-wallet balance is deducted from your main wallet. Revoke to return all funds.
                </p>
                <div className="mt-2 text-xs text-purple-600">
                  Main Wallet: {formatRupees(walletData.balance)} | In Sub-Wallets: {formatRupees(subWallets.reduce((sum, sw) => sum + sw.balance, 0))} | Total: {formatRupees(walletData.balance + subWallets.reduce((sum, sw) => sum + sw.balance, 0))}
                </div>
              </div>

              {/* Create Sub-Wallet Form - Must have device registered first */}
              {devices.length === 0 ? (
                <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4 mb-6">
                  <p className="text-yellow-800 text-sm">
                    ⚠️ You need to register an IoT device first (in the "IoT Devices" tab) before creating a sub-wallet.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleCreateSubWallet} className="bg-gray-50 rounded-lg p-4 mb-6">
                  <h3 className="font-semibold text-gray-700 mb-3">Create New Sub-Wallet for Device</h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <select
                      value={subWalletForm.deviceId || ''}
                      onChange={(e) => setSubWalletForm({ ...subWalletForm, deviceId: e.target.value })}
                      className="border-2 border-gray-200 rounded-lg px-4 py-3 focus:border-purple-500 focus:outline-none"
                      required
                    >
                      <option value="">Select Device</option>
                      {devices.filter(d => d.status === 'active' && !subWallets.some(sw => sw.device_id === d.id)).map((d) => (
                        <option key={d.id} value={d.id}>{d.device_name || d.device_type} ({d.device_type})</option>
                      ))}
                    </select>
                    <div className="relative">
                      <span className="absolute left-3 top-3 text-gray-500 font-bold">₹</span>
                      <input
                        type="number"
                        placeholder="Initial Balance"
                        value={subWalletForm.balance || ''}
                        onChange={(e) => setSubWalletForm({ ...subWalletForm, balance: e.target.value })}
                        className="border-2 border-gray-200 rounded-lg pl-8 pr-4 py-3 w-full focus:border-purple-500 focus:outline-none"
                        max={Math.min(walletData.balance, 25000)}
                        min="100"
                        required
                      />
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-3 text-gray-500 font-bold">₹</span>
                      <input
                        type="number"
                        placeholder="Spending Limit (max ₹25,000)"
                        value={subWalletForm.spendingLimit}
                        onChange={(e) => setSubWalletForm({ ...subWalletForm, spendingLimit: e.target.value })}
                        className="border-2 border-gray-200 rounded-lg pl-8 pr-4 py-3 w-full focus:border-purple-500 focus:outline-none"
                        max="25000"
                        min="100"
                      />
                    </div>
                    <button
                      type="submit"
                      className="bg-purple-600 text-white rounded-lg px-6 py-3 font-semibold hover:bg-purple-700 transition flex items-center justify-center"
                      disabled={walletData.balance < 100}
                    >
                      <Plus className="h-5 w-5 mr-2" />
                      Create
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Creating sub-wallet will deduct balance from your main wallet</p>
                </form>
              )}

              {/* Sub-Wallets List */}
              <h3 className="font-semibold text-gray-700 mb-3">Your Sub-Wallets</h3>
              {subWallets.length === 0 ? (
                <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
                  <Smartphone className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No sub-wallets created</p>
                  <p className="text-sm">Register a device and create a sub-wallet to allocate funds</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {subWallets.map((sw) => (
                    <div key={sw.id} className={`border-2 rounded-lg p-4 ${sw.status === 'active' ? 'border-purple-200 bg-purple-50' : 'border-gray-200 bg-gray-50'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div className={`p-2 rounded-full ${sw.status === 'active' ? 'bg-purple-100' : 'bg-gray-200'}`}>
                            {getDeviceIcon(sw.device_type)}
                          </div>
                          <div>
                            <p className="font-medium">{sw.device_type}</p>
                            <p className="text-xs text-gray-500">Limit: {formatRupees(sw.spending_limit)} | Daily: {formatRupees(sw.daily_spent || 0)}/{formatRupees(sw.daily_limit)}</p>
                          </div>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs ${
                          sw.status === 'active' ? 'bg-green-100 text-green-800' : 
                          sw.status === 'revoked' ? 'bg-red-100 text-red-800' : 'bg-gray-100'}`}>
                          {sw.status}
                        </span>
                      </div>
                      <div className="bg-white rounded p-3 mb-3">
                        <p className="text-sm text-gray-500">Balance</p>
                        <p className="text-2xl font-bold text-purple-600">{formatRupees(sw.balance)}</p>
                      </div>
                      {sw.status === 'active' && (
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleReturnFromSubWallet(sw.id)}
                            className="flex-1 bg-gray-200 text-gray-700 rounded px-3 py-2 text-sm hover:bg-gray-300 transition"
                            disabled={sw.balance <= 0}
                          >
                            Return Funds
                          </button>
                          <button
                            onClick={() => handleRevokeSubWallet(sw.id)}
                            className="flex-1 bg-red-100 text-red-700 rounded px-3 py-2 text-sm hover:bg-red-200 transition"
                          >
                            Revoke
                          </button>
                        </div>
                      )}
                      {sw.status === 'revoked' && (
                        <p className="text-xs text-center text-gray-500">Sub-wallet revoked - funds returned to main wallet</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Allocate to Sub-Wallet */}
              {subWallets.filter(sw => sw.status === 'active').length > 0 && (
                <div className="bg-blue-50 rounded-lg p-4 mb-6">
                  <h3 className="font-semibold text-gray-700 mb-3">Allocate More Funds to Sub-Wallet</h3>
                  <form onSubmit={handleAllocateToSubWallet} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <select
                      value={allocateSubForm.subWalletId}
                      onChange={(e) => setAllocateSubForm({ ...allocateSubForm, subWalletId: e.target.value })}
                      className="border-2 border-gray-200 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none bg-white"
                      required
                    >
                      <option value="">Select Sub-Wallet</option>
                      {subWallets.filter(sw => sw.status === 'active').map((sw) => (
                        <option key={sw.id} value={sw.id}>{sw.device_type} ({formatRupees(sw.balance)} / {formatRupees(sw.spending_limit)})</option>
                      ))}
                    </select>
                    <div className="relative">
                      <span className="absolute left-3 top-3 text-gray-500 font-bold">₹</span>
                      <input
                        type="number"
                        placeholder="Amount"
                        value={allocateSubForm.amount}
                        onChange={(e) => setAllocateSubForm({ ...allocateSubForm, amount: e.target.value })}
                        className="border-2 border-gray-200 rounded-lg pl-8 pr-4 py-3 w-full focus:border-blue-500 focus:outline-none"
                        required
                        min="1"
                        max={walletData.balance}
                      />
                    </div>
                    <button
                      type="submit"
                      className="bg-blue-600 text-white rounded-lg px-6 py-3 font-semibold hover:bg-blue-700 transition"
                      disabled={walletData.balance <= 0}
                    >
                      Allocate
                    </button>
                  </form>
                </div>
              )}

              {/* Sub-Wallet Payment */}
              {subWallets.filter(sw => sw.balance > 0 && sw.status === 'active').length > 0 && (
                <div className="bg-green-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-700 mb-3">Pay from Sub-Wallet</h3>
                  <form onSubmit={handleSubWalletPayment} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <select
                      value={subWalletPayForm.subWalletId}
                      onChange={(e) => setSubWalletPayForm({ ...subWalletPayForm, subWalletId: e.target.value })}
                      className="border-2 border-gray-200 rounded-lg px-4 py-3 focus:border-green-500 focus:outline-none bg-white"
                      required
                    >
                      <option value="">Select Sub-Wallet</option>
                      {subWallets.filter(sw => sw.balance > 0 && sw.status === 'active').map((sw) => (
                        <option key={sw.id} value={sw.id}>{sw.device_type} ({formatRupees(sw.balance)})</option>
                      ))}
                    </select>
                    <select
                      value={subWalletPayForm.toWallet}
                      onChange={(e) => setSubWalletPayForm({ ...subWalletPayForm, toWallet: e.target.value })}
                      className="border-2 border-gray-200 rounded-lg px-4 py-3 focus:border-green-500 focus:outline-none bg-white"
                      required
                    >
                      <option value="">Select Recipient</option>
                      {allWallets.map((w) => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                    <div className="relative">
                      <span className="absolute left-3 top-3 text-gray-500 font-bold">₹</span>
                      <input
                        type="number"
                        placeholder="Amount"
                        value={subWalletPayForm.amount}
                        onChange={(e) => setSubWalletPayForm({ ...subWalletPayForm, amount: e.target.value })}
                        className="border-2 border-gray-200 rounded-lg pl-8 pr-4 py-3 w-full focus:border-green-500 focus:outline-none"
                        required
                        min="1"
                      />
                    </div>
                    <button
                      type="submit"
                      className="bg-green-600 text-white rounded-lg px-6 py-3 font-semibold hover:bg-green-700 transition"
                    >
                      Pay
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* Compliance Tab (Paper Section 3.4) */}
          {activeTab === 'compliance' && (
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <Shield className="h-6 w-6 mr-2 text-red-600" />
                AML/CFT Compliance (Paper §3.4)
              </h2>
              
              <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-6">
                <p className="text-red-800 text-sm">
                  Compliance limits as per the paper's AML/CFT framework. These limits are enforced cryptographically via Zero-Knowledge Proofs.
                </p>
              </div>

              {/* Compliance Limits */}
              {complianceLimits && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-white border-2 border-gray-200 rounded-lg p-4">
                    <p className="text-sm text-gray-500">Single Transaction Limit</p>
                    <p className="text-2xl font-bold text-blue-600">{formatRupees(complianceLimits.SINGLE_TX_LIMIT)}</p>
                  </div>
                  <div className="bg-white border-2 border-gray-200 rounded-lg p-4">
                    <p className="text-sm text-gray-500">Daily Limit</p>
                    <p className="text-2xl font-bold text-green-600">{formatRupees(complianceLimits.DAILY_LIMIT)}</p>
                  </div>
                  <div className="bg-white border-2 border-gray-200 rounded-lg p-4">
                    <p className="text-sm text-gray-500">Monthly Limit</p>
                    <p className="text-2xl font-bold text-purple-600">{formatRupees(complianceLimits.MONTHLY_LIMIT)}</p>
                  </div>
                  <div className="bg-white border-2 border-gray-200 rounded-lg p-4">
                    <p className="text-sm text-gray-500">Offline Transaction Limit</p>
                    <p className="text-2xl font-bold text-orange-600">{formatRupees(complianceLimits.OFFLINE_LIMIT)}</p>
                  </div>
                  <div className="bg-white border-2 border-gray-200 rounded-lg p-4">
                    <p className="text-sm text-gray-500">IoT Device Limit</p>
                    <p className="text-2xl font-bold text-teal-600">{formatRupees(complianceLimits.IOT_DEVICE_LIMIT)}</p>
                  </div>
                  <div className="bg-white border-2 border-gray-200 rounded-lg p-4">
                    <p className="text-sm text-gray-500">Sub-Wallet Limit</p>
                    <p className="text-2xl font-bold text-pink-600">{formatRupees(complianceLimits.SUB_WALLET_LIMIT)}</p>
                  </div>
                </div>
              )}

              {/* Current Compliance Status */}
              {compliance && (
                <div className="bg-white border-2 border-gray-200 rounded-lg p-6 mb-6">
                  <h3 className="font-semibold text-gray-700 mb-4">Your Compliance Status</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Today's Spending</p>
                      <div className="flex items-center space-x-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-3">
                          <div 
                            className="bg-blue-600 h-3 rounded-full" 
                            style={{ width: `${Math.min((compliance.daily_spent / (complianceLimits?.DAILY_LIMIT || 200000)) * 100, 100)}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium">{formatRupees(compliance.daily_spent)}</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">This Month's Spending</p>
                      <div className="flex items-center space-x-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-3">
                          <div 
                            className="bg-green-600 h-3 rounded-full" 
                            style={{ width: `${Math.min((compliance.monthly_spent / (complianceLimits?.MONTHLY_LIMIT || 1000000)) * 100, 100)}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium">{formatRupees(compliance.monthly_spent)}</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Offline Transactions Today</p>
                      <p className="text-xl font-bold">{compliance.offline_tx_count || 0} / {complianceLimits?.OFFLINE_DAILY_COUNT || 10}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Last Updated</p>
                      <p className="text-sm">{compliance.updated_at ? new Date(compliance.updated_at).toLocaleString() : 'N/A'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Compliance Check Tool */}
              <div className="bg-yellow-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-700 mb-3">Check Transaction Compliance</h3>
                <p className="text-sm text-gray-600 mb-3">Enter an amount to check if it would be allowed under current compliance limits.</p>
                <div className="flex gap-4">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-3 text-gray-500 font-bold">₹</span>
                    <input
                      type="number"
                      placeholder="Enter amount to check"
                      id="complianceCheckAmount"
                      className="border-2 border-gray-200 rounded-lg pl-8 pr-4 py-3 w-full focus:border-yellow-500 focus:outline-none"
                      min="1"
                    />
                  </div>
                  <button
                    onClick={() => {
                      const amount = document.getElementById('complianceCheckAmount').value;
                      if (amount) handleCheckCompliance(parseFloat(amount));
                    }}
                    className="bg-yellow-600 text-white rounded-lg px-6 py-3 font-semibold hover:bg-yellow-700 transition"
                  >
                    Check Compliance
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Transaction History */}
        <div className="bg-white rounded-xl shadow-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-800">Transaction History</h2>
          </div>
          <div className="divide-y">
            {transactions.map((tx) => {
              const isCredit = tx.to_wallet === wallet.id;
              return (
                <div key={tx.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex items-center space-x-4">
                    <div className={`p-3 rounded-full ${isCredit ? 'bg-green-100' : 'bg-red-100'}`}>
                      {isCredit ? (
                        <ArrowLeftRight className="h-5 w-5 text-green-600" />
                      ) : (
                        <Send className="h-5 w-5 text-red-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">
                        {isCredit ? (tx.from_wallet ? `From ${tx.from_wallet.slice(0,10)}...` : 'Credit from FI') : `To ${tx.to_wallet.slice(0,10)}...`}
                      </p>
                      <p className="text-sm text-gray-500">{tx.description || tx.transaction_type}</p>
                      <p className="text-xs text-gray-400">{new Date(tx.timestamp).toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                  <p className={`text-xl font-bold ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                    {isCredit ? '+' : '-'}{formatRupees(tx.amount)}
                  </p>
                </div>
              );
            })}
            {transactions.length === 0 && (
              <div className="px-6 py-12 text-center text-gray-500">
                No transactions yet
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// Main App with Navigation
function App() {
  const [currentView, setCurrentView] = useState('home');
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [selectedFiApi, setSelectedFiApi] = useState(null);
  const [selectedFiName, setSelectedFiName] = useState('');
  const [allUserWallets, setAllUserWallets] = useState([]);
  const [moneySupply, setMoneySupply] = useState(null);
  const [loadingWallets, setLoadingWallets] = useState(false);

  // Fetch all user wallets from all FIs
  const fetchAllUserWallets = async () => {
    setLoadingWallets(true);
    try {
      const [fi1Wallets, fi2Wallets, supplyRes] = await Promise.all([
        fi1Api.getWallets(),
        fi2Api.getWallets(),
        centralBankApi.getMoneySupply().catch(() => null)
      ]);
      
      const wallets = [
        ...(fi1Wallets.wallets || []).map(w => ({ ...w, fi: 'FI-Alpha', fiApi: fi1Api })),
        ...(fi2Wallets.wallets || []).map(w => ({ ...w, fi: 'FI-Beta', fiApi: fi2Api }))
      ];
      setAllUserWallets(wallets);
      if (supplyRes?.moneySupply) setMoneySupply(supplyRes.moneySupply);
    } catch (err) {
      console.error('Error fetching wallets:', err);
    } finally {
      setLoadingWallets(false);
    }
  };

  useEffect(() => {
    if (currentView === 'home' || currentView === 'user-wallets') {
      fetchAllUserWallets();
      // Auto-refresh every 5 seconds for real-time updates
      const interval = setInterval(fetchAllUserWallets, 5000);
      return () => clearInterval(interval);
    }
  }, [currentView]);

  const handleSelectWallet = (wallet, fiApi, fiName) => {
    setSelectedWallet(wallet);
    setSelectedFiApi(fiApi);
    setSelectedFiName(fiName);
    setCurrentView('wallet');
  };

  const handleBackFromWallet = () => {
    if (selectedFiName) {
      setCurrentView(selectedFiName === 'FI-Alpha' ? 'fi1' : 'fi2');
    } else {
      setCurrentView('user-wallets');
    }
    setSelectedWallet(null);
  };

  // Render based on current view
  if (currentView === 'central-bank') {
    return (
      <>
        <nav className="bg-gray-900 text-white px-4 py-2">
          <button onClick={() => setCurrentView('home')} className="flex items-center space-x-2 hover:text-blue-300">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Home</span>
          </button>
        </nav>
        <CentralBankDashboard />
      </>
    );
  }

  if (currentView === 'fi1') {
    return (
      <>
        <nav className="bg-gray-900 text-white px-4 py-2">
          <button onClick={() => setCurrentView('home')} className="flex items-center space-x-2 hover:text-green-300">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Home</span>
          </button>
        </nav>
        <FIDashboard fiApi={fi1Api} fiName="FI-Alpha" fiColor="green" onSelectWallet={handleSelectWallet} />
      </>
    );
  }

  if (currentView === 'fi2') {
    return (
      <>
        <nav className="bg-gray-900 text-white px-4 py-2">
          <button onClick={() => setCurrentView('home')} className="flex items-center space-x-2 hover:text-purple-300">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Home</span>
          </button>
        </nav>
        <FIDashboard fiApi={fi2Api} fiName="FI-Beta" fiColor="purple" onSelectWallet={handleSelectWallet} />
      </>
    );
  }

  if (currentView === 'wallet' && selectedWallet) {
    return (
      <WalletDashboard 
        wallet={selectedWallet} 
        fiApi={selectedFiApi} 
        fiName={selectedFiName}
        onBack={handleBackFromWallet}
      />
    );
  }

  // User Wallets View - All wallets from all FIs
  if (currentView === 'user-wallets') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 to-purple-900">
        <nav className="bg-black/50 text-white px-4 py-2">
          <button onClick={() => setCurrentView('home')} className="flex items-center space-x-2 hover:text-indigo-300">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Home</span>
          </button>
        </nav>
        <header className="bg-indigo-950 text-white py-6">
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex items-center space-x-4">
              <div className="bg-indigo-500 p-3 rounded-full">
                <Wallet className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">User Wallets</h1>
                <p className="text-indigo-300">All wallets across Financial Institutions</p>
              </div>
            </div>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-4 py-8">
          {loadingWallets ? (
            <div className="text-center text-white py-12">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p>Loading wallets...</p>
            </div>
          ) : allUserWallets.length === 0 ? (
            <div className="text-center text-white py-12">
              <Wallet className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-xl">No wallets created yet</p>
              <p className="text-indigo-300 mt-2">Go to an FI dashboard to create a wallet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {allUserWallets.map((wallet) => (
                <div 
                  key={wallet.id}
                  onClick={() => handleSelectWallet(wallet, wallet.fiApi, wallet.fi)}
                  className="bg-white rounded-xl shadow-lg p-6 cursor-pointer hover:scale-105 transition-transform"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="bg-indigo-100 p-2 rounded-full">
                        <User className="h-6 w-6 text-indigo-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800">{wallet.name}</p>
                        <p className="text-xs text-gray-500">{wallet.fi}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs ${wallet.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100'}`}>
                      {wallet.status}
                    </span>
                  </div>
                  <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4 mb-3">
                    <p className="text-sm text-gray-500">Balance</p>
                    <p className="text-2xl font-bold text-indigo-600">{formatRupees(wallet.balance)}</p>
                  </div>
                  <div className="text-xs text-gray-400">
                    <p>Public Key: {wallet.public_key?.slice(0, 20) || 'N/A'}...</p>
                  </div>
                  <p className="text-xs text-indigo-500 mt-2 text-center">Click to manage wallet →</p>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  // Home Page - 3 Sections
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800">
      <header className="bg-black/50 text-white py-8">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center mb-2">
            <img src="/logo.png" alt="Digital Rupee" className="h-16 w-16 mr-3" />
            <h1 className="text-4xl font-bold">Digital Rupee (e₹)</h1>
          </div>
          <p className="text-gray-400">Central Bank Digital Currency Payment System Using IoT Devices</p>
          {moneySupply && (
            <div className="mt-4 inline-flex items-center space-x-6 bg-gray-800 rounded-full px-6 py-2">
              <span className="text-green-400">💰 Total Circulation: {formatRupees(moneySupply.totalCreated)}</span>
              <span className="text-blue-400">🏛️ In FIs: {formatRupees(moneySupply.breakdown?.inFIs || 0)}</span>
              <span className="text-purple-400">👛 In Wallets: {formatRupees(moneySupply.breakdown?.inWallets || 0)}</span>
              <span className="text-yellow-400">📱 In Sub-Wallets: {formatRupees(moneySupply.breakdown?.inSubWallets || 0)}</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Section 1: Central Bank */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
            <Building2 className="h-6 w-6 mr-2 text-yellow-400" />
            Central Bank
          </h2>
          <div 
            onClick={() => setCurrentView('central-bank')}
            className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-8 text-white cursor-pointer hover:scale-[1.02] transition-transform shadow-xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="bg-yellow-400 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                  <Building2 className="h-10 w-10 text-blue-900" />
                </div>
                <h3 className="text-2xl font-bold mb-2">Reserve Bank of India</h3>
                <p className="text-blue-200 mb-4">Central Bank Dashboard - Issuer of Digital Rupee</p>
                <ul className="text-sm text-blue-100 space-y-1">
                  <li>• Issue & Allocate Digital Rupees to FIs</li>
                  <li>• View All Registered Financial Institutions</li>
                  <li>• Monitor Ledger & Money Supply</li>
                  <li>• AML/CFT Compliance Oversight</li>
                </ul>
              </div>
              <div className="text-right">
                {moneySupply && (
                  <div className="bg-blue-900/50 rounded-lg p-4 mb-4">
                    <p className="text-blue-300 text-sm">Total Digital Rupees Issued</p>
                    <p className="text-3xl font-bold">{formatRupees(moneySupply.totalCreated)}</p>
                  </div>
                )}
                <span className="bg-blue-500 px-6 py-3 rounded-full text-sm font-semibold">Open Dashboard →</span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Financial Institutions */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
            <Server className="h-6 w-6 mr-2 text-green-400" />
            Financial Institutions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* FI-Alpha Card */}
            <div 
              onClick={() => setCurrentView('fi1')}
              className="bg-gradient-to-br from-green-600 to-green-800 rounded-2xl p-6 text-white cursor-pointer hover:scale-[1.02] transition-transform shadow-xl"
            >
              <div className="flex items-center space-x-4 mb-4">
                <div className="bg-green-300 w-14 h-14 rounded-full flex items-center justify-center">
                  <Building2 className="h-8 w-8 text-green-900" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">FI-Alpha</h3>
                  <p className="text-green-200 text-sm">Financial Institution 1 • Port 4001</p>
                </div>
              </div>
              <ul className="text-sm text-green-100 space-y-1 mb-4">
                <li>• Create User Wallets with Public Keys</li>
                <li>• Credit Wallets from FI Allocation</li>
                <li>• Sync Transactions to Central Bank</li>
              </ul>
              {moneySupply?.fiBreakdown && (
                <div className="bg-green-900/50 rounded-lg p-3 mb-4">
                  <p className="text-green-300 text-xs">Allocated / In Wallets</p>
                  <p className="text-xl font-bold">
                    {formatRupees(moneySupply.fiBreakdown.find(f => f.name === 'FI-Alpha')?.allocated || 0)}
                  </p>
                </div>
              )}
              <div className="text-right">
                <span className="bg-green-500 px-4 py-2 rounded-full text-sm">Open Dashboard →</span>
              </div>
            </div>

            {/* FI-Beta Card */}
            <div 
              onClick={() => setCurrentView('fi2')}
              className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-2xl p-6 text-white cursor-pointer hover:scale-[1.02] transition-transform shadow-xl"
            >
              <div className="flex items-center space-x-4 mb-4">
                <div className="bg-purple-300 w-14 h-14 rounded-full flex items-center justify-center">
                  <Building2 className="h-8 w-8 text-purple-900" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">FI-Beta</h3>
                  <p className="text-purple-200 text-sm">Financial Institution 2 • Port 4002</p>
                </div>
              </div>
              <ul className="text-sm text-purple-100 space-y-1 mb-4">
                <li>• Create User Wallets with Public Keys</li>
                <li>• Credit Wallets from FI Allocation</li>
                <li>• Sync Transactions to Central Bank</li>
              </ul>
              {moneySupply?.fiBreakdown && (
                <div className="bg-purple-900/50 rounded-lg p-3 mb-4">
                  <p className="text-purple-300 text-xs">Allocated / In Wallets</p>
                  <p className="text-xl font-bold">
                    {formatRupees(moneySupply.fiBreakdown.find(f => f.name === 'FI-Beta')?.allocated || 0)}
                  </p>
                </div>
              )}
              <div className="text-right">
                <span className="bg-purple-500 px-4 py-2 rounded-full text-sm">Open Dashboard →</span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: User Wallets */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
            <Wallet className="h-6 w-6 mr-2 text-indigo-400" />
            User Wallets
          </h2>
          <div 
            onClick={() => setCurrentView('user-wallets')}
            className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white cursor-pointer hover:scale-[1.02] transition-transform shadow-xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-4 mb-4">
                  <div className="bg-indigo-300 w-14 h-14 rounded-full flex items-center justify-center">
                    <Wallet className="h-8 w-8 text-indigo-900" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">All User Wallets</h3>
                    <p className="text-indigo-200 text-sm">View wallets created by FIs • Managed by Users</p>
                  </div>
                </div>
                <ul className="text-sm text-indigo-100 space-y-1">
                  <li>• Each wallet has a unique Public Key for transactions</li>
                  <li>• Users manage their own IoT Sub-Wallets</li>
                  <li>• Make P2P and Cross-FI transfers</li>
                  <li>• Offline transactions with ZKP authentication</li>
                </ul>
              </div>
              <div className="text-right">
                <div className="bg-indigo-900/50 rounded-lg p-4 mb-4">
                  <p className="text-indigo-300 text-sm">Total Wallets</p>
                  <p className="text-3xl font-bold">{allUserWallets.length}</p>
                </div>
                <span className="bg-indigo-500 px-6 py-3 rounded-full text-sm font-semibold">View All Wallets →</span>
              </div>
            </div>
          </div>
          
          {/* Quick preview of wallets */}
          {allUserWallets.length > 0 && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              {allUserWallets.slice(0, 4).map((wallet) => (
                <div 
                  key={wallet.id}
                  onClick={() => handleSelectWallet(wallet, wallet.fiApi, wallet.fi)}
                  className="bg-gray-800 rounded-lg p-4 cursor-pointer hover:bg-gray-700 transition"
                >
                  <div className="flex items-center space-x-2 mb-2">
                    <User className="h-4 w-4 text-indigo-400" />
                    <span className="text-white font-medium text-sm truncate">{wallet.name}</span>
                  </div>
                  <p className="text-green-400 font-bold">{formatRupees(wallet.balance)}</p>
                  <p className="text-gray-500 text-xs">{wallet.fi}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Architecture Info */}
        <div className="bg-white rounded-xl p-8 shadow-lg">
          <h3 className="text-xl font-bold mb-4 text-gray-800">System Architecture</h3>
          <div className="flex justify-center">
            <img 
              src="/architecture.png" 
              alt="CBDC System Architecture - Central Bank, FIs, Wallets, and IoT Devices"
              className="max-w-full h-auto rounded-lg"
              style={{ maxHeight: '600px' }}
            />
          </div>
        </div>
      </main>

      <footer className="text-center text-gray-500 py-8">
        <p>Zero-Knowledge Proof (ZKP) Authentication for Offline CBDC Payment System Using IoT Devices</p>
      </footer>
    </div>
  );
}

export default App;
