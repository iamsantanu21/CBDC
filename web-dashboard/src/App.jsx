import { useState, useEffect } from 'react';
import { Building2, Wallet, ArrowLeftRight, RefreshCw, Plus, Send, DollarSign, Activity, Server, ArrowLeft, User, CreditCard, Wifi, WifiOff, Watch, Smartphone, Radio, Shield, CheckCircle, XCircle, Clock, Cpu, AlertTriangle, Lock, Unlock, Eye, Bell, ChevronDown, History, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
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
  
  // Compliance Control State
  const [complianceDashboard, setComplianceDashboard] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [frozenEntities, setFrozenEntities] = useState([]);
  const [rules, setRules] = useState([]);
  const [showCompliance, setShowCompliance] = useState(true);
  const [freezeForm, setFreezeForm] = useState({ entityType: 'wallet', entityId: '', fiId: '', reason: '' });
  const [watchlistForm, setWatchlistForm] = useState({ entityType: 'wallet', entityId: '', fiId: '', status: 'watching', reason: '', riskLevel: 'medium' });
  const [ruleForm, setRuleForm] = useState({
    id: '',
    rule_name: '',
    rule_type: 'limit',
    target_type: 'wallet',
    limit_value: '',
    daily_limit: '',
    monthly_limit: '',
    max_offline_amount: '',
    max_offline_count: '',
    description: '',
    is_active: true
  });
  const [editingRule, setEditingRule] = useState(false);
  const [ledgerFilter, setLedgerFilter] = useState('all'); // all, allocation, wallet, iot

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
      
      // Fetch compliance data
      try {
        const [dashboardRes, alertsRes, watchlistRes, frozenRes, rulesRes] = await Promise.all([
          centralBankApi.getComplianceDashboard(),
          centralBankApi.getAlerts({ unresolved_only: true, limit: 20 }),
          centralBankApi.getWatchlist(),
          centralBankApi.getFrozenEntities(),
          centralBankApi.getComplianceRules(null, false)
        ]);
        setComplianceDashboard(dashboardRes.dashboard);
        setAlerts(alertsRes.alerts || []);
        setWatchlist(watchlistRes.watchlist || []);
        setFrozenEntities(frozenRes.frozen || []);
        setRules(rulesRes.rules || []);
      } catch (compErr) {
        console.log('Compliance data fetch error:', compErr);
      }
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

  // Compliance Control Handlers
  const handleFreezeEntity = async (e) => {
    e.preventDefault();
    try {
      await centralBankApi.freezeEntity(
        freezeForm.entityType, 
        freezeForm.entityId, 
        freezeForm.fiId || null, 
        freezeForm.reason
      );
      setFreezeForm({ entityType: 'wallet', entityId: '', fiId: '', reason: '' });
      fetchData();
      alert(`${freezeForm.entityType === 'wallet' ? 'Wallet' : 'Device'} frozen successfully!`);
    } catch (err) {
      alert('Error freezing entity: ' + err.message);
    }
  };

  const handleUnfreeze = async (entityType, entityId, fiId) => {
    if (!confirm(`Are you sure you want to unfreeze ${entityId}?`)) return;
    try {
      await centralBankApi.unfreezeEntity(entityType, entityId, fiId);
      fetchData();
      alert('Entity unfrozen successfully!');
    } catch (err) {
      alert('Error unfreezing entity: ' + err.message);
    }
  };

  const handleAddToWatchlist = async (e) => {
    e.preventDefault();
    try {
      await centralBankApi.addToWatchlist(
        watchlistForm.entityType,
        watchlistForm.entityId,
        watchlistForm.fiId || null,
        watchlistForm.status,
        watchlistForm.reason,
        watchlistForm.riskLevel
      );
      setWatchlistForm({ entityType: 'wallet', entityId: '', fiId: '', status: 'watching', reason: '', riskLevel: 'medium' });
      fetchData();
      alert('Added to watchlist successfully!');
    } catch (err) {
      alert('Error adding to watchlist: ' + err.message);
    }
  };

  const handleRemoveFromWatchlist = async (entityType, entityId, fiId) => {
    if (!confirm(`Remove ${entityId} from watchlist?`)) return;
    try {
      await centralBankApi.removeFromWatchlist(entityType, entityId, fiId);
      fetchData();
      alert('Removed from watchlist!');
    } catch (err) {
      alert('Error removing from watchlist: ' + err.message);
    }
  };

  const handleResolveAlert = async (alertId) => {
    try {
      await centralBankApi.resolveAlert(alertId);
      fetchData();
    } catch (err) {
      alert('Error resolving alert: ' + err.message);
    }
  };

  // Compliance Rule Handlers
  const handleCreateOrUpdateRule = async (e) => {
    e.preventDefault();
    try {
      const ruleData = {
        rule_name: ruleForm.rule_name,
        rule_type: ruleForm.rule_type,
        target_type: ruleForm.target_type,
        limit_value: ruleForm.limit_value ? parseFloat(ruleForm.limit_value) : null,
        daily_limit: ruleForm.daily_limit ? parseFloat(ruleForm.daily_limit) : null,
        monthly_limit: ruleForm.monthly_limit ? parseFloat(ruleForm.monthly_limit) : null,
        max_offline_amount: ruleForm.max_offline_amount ? parseFloat(ruleForm.max_offline_amount) : null,
        max_offline_count: ruleForm.max_offline_count ? parseInt(ruleForm.max_offline_count) : null,
        description: ruleForm.description,
        is_active: ruleForm.is_active
      };
      
      if (editingRule && ruleForm.id) {
        ruleData.id = ruleForm.id;
      }
      
      await centralBankApi.setComplianceRule(ruleData);
      resetRuleForm();
      fetchData();
      alert(`Compliance rule ${editingRule ? 'updated' : 'created'} successfully!`);
    } catch (err) {
      alert('Error saving rule: ' + err.message);
    }
  };

  const handleEditRule = (rule) => {
    setRuleForm({
      id: rule.id,
      rule_name: rule.rule_name || '',
      rule_type: rule.rule_type || 'limit',
      target_type: rule.target_type || 'wallet',
      limit_value: rule.limit_value?.toString() || '',
      daily_limit: rule.daily_limit?.toString() || '',
      monthly_limit: rule.monthly_limit?.toString() || '',
      max_offline_amount: rule.max_offline_amount?.toString() || '',
      max_offline_count: rule.max_offline_count?.toString() || '',
      description: rule.description || '',
      is_active: rule.is_active !== 0
    });
    setEditingRule(true);
  };

  const handleDeleteRule = async (ruleId) => {
    if (!confirm('Are you sure you want to delete this compliance rule?')) return;
    try {
      await centralBankApi.deleteComplianceRule(ruleId);
      fetchData();
      alert('Rule deleted successfully!');
    } catch (err) {
      alert('Error deleting rule: ' + err.message);
    }
  };

  const resetRuleForm = () => {
    setRuleForm({
      id: '',
      rule_name: '',
      rule_type: 'limit',
      target_type: 'wallet',
      limit_value: '',
      daily_limit: '',
      monthly_limit: '',
      max_offline_amount: '',
      max_offline_count: '',
      description: '',
      is_active: true
    });
    setEditingRule(false);
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
              <option value="">Select Bank</option>
              {fis.map((fi) => (
                <option key={fi.id} value={fi.id}>
                  {fi.name === 'FI-Alpha' || fi.name === 'SBI' ? '🏦 State Bank of India (SBI)' : 
                   fi.name === 'FI-Beta' || fi.name === 'HDFC' ? '🏦 HDFC Bank' : fi.name}
                </option>
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
                {fis.map((fi) => {
                  const isSBI = fi.name === 'FI-Alpha' || fi.name === 'SBI';
                  const isHDFC = fi.name === 'FI-Beta' || fi.name === 'HDFC';
                  const displayName = isSBI ? 'State Bank of India (SBI)' : isHDFC ? 'HDFC Bank' : fi.name;
                  return (
                  <tr key={fi.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-mono text-gray-600">{fi.id}</td>
                    <td className="px-6 py-4 font-medium text-gray-900 flex items-center space-x-2">
                      {isSBI && (
                        <img src="https://upload.wikimedia.org/wikipedia/en/thumb/5/58/State_Bank_of_India_logo.svg/200px-State_Bank_of_India_logo.svg.png" alt="SBI" className="w-6 h-6 object-contain" onError={(e) => e.target.style.display='none'} />
                      )}
                      {isHDFC && (
                        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/HDFC_Bank_Logo.svg/200px-HDFC_Bank_Logo.svg.png" alt="HDFC" className="w-6 h-6 object-contain" onError={(e) => e.target.style.display='none'} />
                      )}
                      <span>{displayName}</span>
                    </td>
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
                  );
                })}
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

        {/* Complete Transaction Ledger */}
        <div className="bg-white rounded-xl shadow-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">📒 Complete Transaction Ledger</h2>
              <div className="flex space-x-2">
                <button
                  onClick={() => setLedgerFilter('all')}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                    ledgerFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  All ({ledger.length})
                </button>
                <button
                  onClick={() => setLedgerFilter('allocation')}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                    ledgerFilter === 'allocation' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                >
                  Allocations ({ledger.filter(e => e.transaction_type === 'allocation').length})
                </button>
                <button
                  onClick={() => setLedgerFilter('wallet')}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                    ledgerFilter === 'wallet' ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  }`}
                >
                  Wallet Txns ({ledger.filter(e => ['credit', 'debit', 'transfer'].includes(e.transaction_type)).length})
                </button>
                <button
                  onClick={() => setLedgerFilter('iot')}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                    ledgerFilter === 'iot' ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                  }`}
                >
                  IoT ({ledger.filter(e => e.is_iot_transaction || e.transaction_type === 'iot_offline').length})
                </button>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Date & Time</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">FI</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">From</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">To</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Device/Source</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {ledger
                  .filter(entry => {
                    if (ledgerFilter === 'all') return true;
                    if (ledgerFilter === 'allocation') return entry.transaction_type === 'allocation';
                    if (ledgerFilter === 'wallet') return ['credit', 'debit', 'transfer'].includes(entry.transaction_type);
                    if (ledgerFilter === 'iot') return entry.is_iot_transaction || entry.transaction_type === 'iot_offline';
                    return true;
                  })
                  .map((entry) => (
                  <tr key={entry.id} className={`hover:bg-gray-50 ${
                    entry.is_iot_transaction || entry.transaction_type === 'iot_offline' ? 'bg-purple-50' : ''
                  }`}>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {new Date(entry.timestamp).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-gray-900">{entry.fi_name || entry.fi_id}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        entry.transaction_type === 'allocation' ? 'bg-green-100 text-green-800' :
                        entry.transaction_type === 'credit' ? 'bg-blue-100 text-blue-800' :
                        entry.transaction_type === 'debit' ? 'bg-red-100 text-red-800' :
                        entry.transaction_type === 'transfer' ? 'bg-yellow-100 text-yellow-800' :
                        entry.transaction_type === 'iot_offline' ? 'bg-purple-100 text-purple-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {entry.transaction_type === 'iot_offline' ? '📡 IoT' : entry.transaction_type}
                      </span>
                      {entry.is_iot_transaction === 1 && (
                        <span className="ml-1 px-2 py-1 rounded-full text-xs bg-purple-200 text-purple-800">IoT</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {entry.from_wallet ? (
                        <span className="font-mono bg-gray-100 px-2 py-1 rounded text-gray-700">
                          {entry.from_wallet.substring(0, 12)}...
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {entry.to_wallet ? (
                        <span className="font-mono bg-gray-100 px-2 py-1 rounded text-gray-700">
                          {entry.to_wallet.substring(0, 12)}...
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-green-600">{formatRupees(entry.amount)}</td>
                    <td className="px-4 py-3 text-xs">
                      {entry.device_id ? (
                        <span className="flex items-center">
                          <Smartphone className="h-3 w-3 mr-1 text-purple-600" />
                          <span className="font-mono text-purple-700">{entry.device_id.substring(0, 10)}...</span>
                        </span>
                      ) : entry.main_wallet_id ? (
                        <span className="flex items-center">
                          <Wallet className="h-3 w-3 mr-1 text-blue-600" />
                          <span className="font-mono text-blue-700">{entry.main_wallet_id.substring(0, 10)}...</span>
                        </span>
                      ) : (
                        <span className="text-gray-400">Direct</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">{entry.description || '-'}</td>
                  </tr>
                ))}
                {ledger.length === 0 && (
                  <tr>
                    <td colSpan="8" className="px-6 py-12 text-center text-gray-500">
                      No transactions yet. Allocate funds to FIs and they will sync transactions here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Ledger Summary */}
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-sm">
            <div className="flex space-x-6">
              <span className="text-gray-600">
                Total: <span className="font-semibold text-gray-900">{ledger.length}</span> entries
              </span>
              <span className="text-green-600">
                Allocations: <span className="font-semibold">{formatRupees(ledger.filter(e => e.transaction_type === 'allocation').reduce((sum, e) => sum + (e.amount || 0), 0))}</span>
              </span>
              <span className="text-blue-600">
                Wallet Txns: <span className="font-semibold">{formatRupees(ledger.filter(e => ['credit', 'debit', 'transfer'].includes(e.transaction_type)).reduce((sum, e) => sum + (e.amount || 0), 0))}</span>
              </span>
              <span className="text-purple-600">
                IoT Txns: <span className="font-semibold">{formatRupees(ledger.filter(e => e.is_iot_transaction || e.transaction_type === 'iot_offline').reduce((sum, e) => sum + (e.amount || 0), 0))}</span>
              </span>
            </div>
            <button onClick={fetchData} className="text-gray-600 hover:text-gray-900 flex items-center">
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </button>
          </div>
        </div>

        {/* Compliance Control Panel */}
        <div className="mt-8">
          <div 
            className="flex items-center justify-between cursor-pointer bg-red-800 text-white rounded-t-xl px-6 py-4"
            onClick={() => setShowCompliance(!showCompliance)}
          >
            <h2 className="text-xl font-bold flex items-center">
              <Shield className="h-6 w-6 mr-2" />
              Compliance Control Center
            </h2>
            <div className="flex items-center space-x-4">
              {complianceDashboard && (
                <div className="flex space-x-4 text-sm">
                  <span className="bg-red-600 px-3 py-1 rounded-full flex items-center">
                    <Bell className="h-4 w-4 mr-1" />
                    {complianceDashboard.alerts?.unread || 0} Unread
                  </span>
                  <span className="bg-orange-500 px-3 py-1 rounded-full">
                    {frozenEntities.length} Frozen
                  </span>
                  <span className="bg-yellow-500 text-black px-3 py-1 rounded-full">
                    {watchlist.length} Watchlist
                  </span>
                </div>
              )}
              <span className="text-2xl">{showCompliance ? '▼' : '▶'}</span>
            </div>
          </div>

          {showCompliance && (
            <div className="bg-white rounded-b-xl shadow-lg">
              {/* Alert Summary Bar */}
              {complianceDashboard && (
                <div className="grid grid-cols-4 gap-4 p-4 bg-gray-50 border-b">
                  <div className="text-center p-3 bg-red-100 rounded-lg">
                    <p className="text-2xl font-bold text-red-600">{complianceDashboard.alerts?.critical || 0}</p>
                    <p className="text-xs text-red-800">Critical Alerts</p>
                  </div>
                  <div className="text-center p-3 bg-orange-100 rounded-lg">
                    <p className="text-2xl font-bold text-orange-600">{complianceDashboard.alerts?.high || 0}</p>
                    <p className="text-xs text-orange-800">High Priority</p>
                  </div>
                  <div className="text-center p-3 bg-yellow-100 rounded-lg">
                    <p className="text-2xl font-bold text-yellow-600">{complianceDashboard.alerts?.medium || 0}</p>
                    <p className="text-xs text-yellow-800">Medium</p>
                  </div>
                  <div className="text-center p-3 bg-blue-100 rounded-lg">
                    <p className="text-2xl font-bold text-blue-600">{complianceDashboard.rules?.active || 0}</p>
                    <p className="text-xs text-blue-800">Active Rules</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
                {/* Recent Alerts */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-bold text-gray-800 mb-3 flex items-center">
                    <AlertTriangle className="h-5 w-5 mr-2 text-red-500" />
                    Recent Alerts
                  </h3>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {alerts.length > 0 ? alerts.map(alert => (
                      <div key={alert.id} className={`p-3 rounded-lg border-l-4 ${
                        alert.severity === 'critical' ? 'bg-red-50 border-red-500' :
                        alert.severity === 'high' ? 'bg-orange-50 border-orange-500' :
                        alert.severity === 'medium' ? 'bg-yellow-50 border-yellow-500' :
                        'bg-blue-50 border-blue-500'
                      }`}>
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-800">{alert.message}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(alert.created_at).toLocaleString('en-IN')}
                              {alert.wallet_id && ` | Wallet: ${alert.wallet_id}`}
                            </p>
                          </div>
                          {!alert.is_resolved && (
                            <button
                              onClick={() => handleResolveAlert(alert.id)}
                              className="text-xs bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600"
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      </div>
                    )) : (
                      <p className="text-center text-gray-500 py-4">No active alerts</p>
                    )}
                  </div>
                </div>

                {/* Frozen Entities */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-bold text-gray-800 mb-3 flex items-center">
                    <Lock className="h-5 w-5 mr-2 text-red-500" />
                    Frozen Wallets/Devices
                  </h3>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {frozenEntities.length > 0 ? frozenEntities.map(entity => (
                      <div key={entity.id} className="p-3 bg-red-50 rounded-lg flex justify-between items-center">
                        <div>
                          <p className="font-mono text-sm text-gray-800">{entity.entity_id}</p>
                          <p className="text-xs text-gray-500">
                            {entity.entity_type} | {entity.reason}
                          </p>
                        </div>
                        <button
                          onClick={() => handleUnfreeze(entity.entity_type, entity.entity_id, entity.fi_id)}
                          className="flex items-center text-xs bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
                        >
                          <Unlock className="h-3 w-3 mr-1" />
                          Unfreeze
                        </button>
                      </div>
                    )) : (
                      <p className="text-center text-gray-500 py-4">No frozen entities</p>
                    )}
                  </div>
                </div>

                {/* Freeze Entity Form */}
                <div className="bg-red-50 rounded-lg p-4">
                  <h3 className="font-bold text-red-800 mb-3 flex items-center">
                    <Lock className="h-5 w-5 mr-2" />
                    Freeze Wallet/Device
                  </h3>
                  <form onSubmit={handleFreezeEntity} className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={freezeForm.entityType}
                        onChange={(e) => setFreezeForm({ ...freezeForm, entityType: e.target.value })}
                        className="border rounded px-3 py-2 text-sm"
                      >
                        <option value="wallet">Wallet</option>
                        <option value="iot_device">IoT Device</option>
                      </select>
                      <select
                        value={freezeForm.fiId}
                        onChange={(e) => setFreezeForm({ ...freezeForm, fiId: e.target.value })}
                        className="border rounded px-3 py-2 text-sm"
                      >
                        <option value="">All Banks</option>
                        {fis.map(fi => (
                          <option key={fi.id} value={fi.id}>
                            {fi.name === 'FI-Alpha' || fi.name === 'SBI' ? 'SBI' : 
                             fi.name === 'FI-Beta' || fi.name === 'HDFC' ? 'HDFC' : fi.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      type="text"
                      placeholder="Entity ID (wallet-xxx or subwallet-xxx)"
                      value={freezeForm.entityId}
                      onChange={(e) => setFreezeForm({ ...freezeForm, entityId: e.target.value })}
                      className="w-full border rounded px-3 py-2 text-sm"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Reason for freezing"
                      value={freezeForm.reason}
                      onChange={(e) => setFreezeForm({ ...freezeForm, reason: e.target.value })}
                      className="w-full border rounded px-3 py-2 text-sm"
                      required
                    />
                    <button
                      type="submit"
                      className="w-full bg-red-600 text-white py-2 rounded font-semibold hover:bg-red-700 flex items-center justify-center"
                    >
                      <Lock className="h-4 w-4 mr-2" />
                      Freeze Entity
                    </button>
                  </form>
                </div>

                {/* Watchlist Form */}
                <div className="bg-yellow-50 rounded-lg p-4">
                  <h3 className="font-bold text-yellow-800 mb-3 flex items-center">
                    <Eye className="h-5 w-5 mr-2" />
                    Add to Watchlist
                  </h3>
                  <form onSubmit={handleAddToWatchlist} className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <select
                        value={watchlistForm.entityType}
                        onChange={(e) => setWatchlistForm({ ...watchlistForm, entityType: e.target.value })}
                        className="border rounded px-3 py-2 text-sm"
                      >
                        <option value="wallet">Wallet</option>
                        <option value="iot_device">IoT Device</option>
                      </select>
                      <select
                        value={watchlistForm.status}
                        onChange={(e) => setWatchlistForm({ ...watchlistForm, status: e.target.value })}
                        className="border rounded px-3 py-2 text-sm"
                      >
                        <option value="watching">Watching</option>
                        <option value="blacklisted">Blacklist</option>
                      </select>
                      <select
                        value={watchlistForm.riskLevel}
                        onChange={(e) => setWatchlistForm({ ...watchlistForm, riskLevel: e.target.value })}
                        className="border rounded px-3 py-2 text-sm"
                      >
                        <option value="low">Low Risk</option>
                        <option value="medium">Medium Risk</option>
                        <option value="high">High Risk</option>
                      </select>
                    </div>
                    <input
                      type="text"
                      placeholder="Entity ID (wallet-xxx or subwallet-xxx)"
                      value={watchlistForm.entityId}
                      onChange={(e) => setWatchlistForm({ ...watchlistForm, entityId: e.target.value })}
                      className="w-full border rounded px-3 py-2 text-sm"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Reason (suspicious activity, fraud, etc.)"
                      value={watchlistForm.reason}
                      onChange={(e) => setWatchlistForm({ ...watchlistForm, reason: e.target.value })}
                      className="w-full border rounded px-3 py-2 text-sm"
                      required
                    />
                    <button
                      type="submit"
                      className="w-full bg-yellow-600 text-white py-2 rounded font-semibold hover:bg-yellow-700 flex items-center justify-center"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Add to Watchlist
                    </button>
                  </form>
                </div>

                {/* Current Watchlist */}
                <div className="lg:col-span-2 bg-gray-50 rounded-lg p-4">
                  <h3 className="font-bold text-gray-800 mb-3 flex items-center">
                    <Eye className="h-5 w-5 mr-2 text-yellow-500" />
                    Current Watchlist
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-200">
                        <tr>
                          <th className="px-3 py-2 text-left">Type</th>
                          <th className="px-3 py-2 text-left">Entity ID</th>
                          <th className="px-3 py-2 text-left">Status</th>
                          <th className="px-3 py-2 text-left">Risk</th>
                          <th className="px-3 py-2 text-left">Reason</th>
                          <th className="px-3 py-2 text-left">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {watchlist.length > 0 ? watchlist.map(entry => (
                          <tr key={entry.id} className={entry.status === 'blacklisted' ? 'bg-red-50' : 'bg-yellow-50'}>
                            <td className="px-3 py-2">{entry.entity_type}</td>
                            <td className="px-3 py-2 font-mono">{entry.entity_id}</td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-1 rounded text-xs ${
                                entry.status === 'blacklisted' ? 'bg-red-200 text-red-800' : 'bg-yellow-200 text-yellow-800'
                              }`}>
                                {entry.status}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-1 rounded text-xs ${
                                entry.risk_level === 'high' ? 'bg-red-200 text-red-800' :
                                entry.risk_level === 'medium' ? 'bg-orange-200 text-orange-800' :
                                'bg-green-200 text-green-800'
                              }`}>
                                {entry.risk_level}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-600">{entry.reason || '-'}</td>
                            <td className="px-3 py-2">
                              <button
                                onClick={() => handleRemoveFromWatchlist(entry.entity_type, entry.entity_id, entry.fi_id)}
                                className="text-red-600 hover:text-red-800 text-xs"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        )) : (
                          <tr>
                            <td colSpan="6" className="px-3 py-8 text-center text-gray-500">No entities in watchlist</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Compliance Rules */}
                <div className="lg:col-span-2 bg-blue-50 rounded-lg p-4">
                  <h3 className="font-bold text-blue-800 mb-3 flex items-center justify-between">
                    <span className="flex items-center">
                      <Shield className="h-5 w-5 mr-2" />
                      Compliance Rules Management
                    </span>
                    {editingRule && (
                      <button
                        onClick={resetRuleForm}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Cancel Edit
                      </button>
                    )}
                  </h3>

                  {/* Rule Form */}
                  <form onSubmit={handleCreateOrUpdateRule} className="bg-white p-4 rounded-lg mb-4 border border-blue-200">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                      <input
                        type="text"
                        placeholder="Rule Name *"
                        value={ruleForm.rule_name}
                        onChange={(e) => setRuleForm({ ...ruleForm, rule_name: e.target.value })}
                        className="border rounded px-3 py-2 text-sm col-span-2"
                        required
                      />
                      <select
                        value={ruleForm.rule_type}
                        onChange={(e) => setRuleForm({ ...ruleForm, rule_type: e.target.value })}
                        className="border rounded px-3 py-2 text-sm"
                      >
                        <option value="limit">Limit</option>
                        <option value="hard_limit">Hard Limit</option>
                        <option value="soft_limit">Soft Limit</option>
                        <option value="monitoring">Monitoring</option>
                      </select>
                      <select
                        value={ruleForm.target_type}
                        onChange={(e) => setRuleForm({ ...ruleForm, target_type: e.target.value })}
                        className="border rounded px-3 py-2 text-sm"
                      >
                        <option value="wallet">Wallet</option>
                        <option value="iot_device">IoT Device</option>
                        <option value="all">All</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
                      <input
                        type="number"
                        placeholder="Single Limit (₹)"
                        value={ruleForm.limit_value}
                        onChange={(e) => setRuleForm({ ...ruleForm, limit_value: e.target.value })}
                        className="border rounded px-3 py-2 text-sm"
                      />
                      <input
                        type="number"
                        placeholder="Daily Limit (₹)"
                        value={ruleForm.daily_limit}
                        onChange={(e) => setRuleForm({ ...ruleForm, daily_limit: e.target.value })}
                        className="border rounded px-3 py-2 text-sm"
                      />
                      <input
                        type="number"
                        placeholder="Monthly Limit (₹)"
                        value={ruleForm.monthly_limit}
                        onChange={(e) => setRuleForm({ ...ruleForm, monthly_limit: e.target.value })}
                        className="border rounded px-3 py-2 text-sm"
                      />
                      <input
                        type="number"
                        placeholder="Offline Limit (₹)"
                        value={ruleForm.max_offline_amount}
                        onChange={(e) => setRuleForm({ ...ruleForm, max_offline_amount: e.target.value })}
                        className="border rounded px-3 py-2 text-sm"
                      />
                      <input
                        type="number"
                        placeholder="Offline Count"
                        value={ruleForm.max_offline_count}
                        onChange={(e) => setRuleForm({ ...ruleForm, max_offline_count: e.target.value })}
                        className="border rounded px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="flex gap-3">
                      <input
                        type="text"
                        placeholder="Description (optional)"
                        value={ruleForm.description}
                        onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
                        className="flex-1 border rounded px-3 py-2 text-sm"
                      />
                      <label className="flex items-center space-x-2 px-3">
                        <input
                          type="checkbox"
                          checked={ruleForm.is_active}
                          onChange={(e) => setRuleForm({ ...ruleForm, is_active: e.target.checked })}
                          className="rounded"
                        />
                        <span className="text-sm">Active</span>
                      </label>
                      <button
                        type="submit"
                        className={`px-6 py-2 rounded font-semibold text-white ${
                          editingRule ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                      >
                        {editingRule ? 'Update Rule' : 'Add Rule'}
                      </button>
                    </div>
                  </form>

                  {/* Rules Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-blue-100">
                        <tr>
                          <th className="px-3 py-2 text-left">Rule Name</th>
                          <th className="px-3 py-2 text-left">Type</th>
                          <th className="px-3 py-2 text-left">Target</th>
                          <th className="px-3 py-2 text-left">Limit</th>
                          <th className="px-3 py-2 text-left">Daily</th>
                          <th className="px-3 py-2 text-left">Monthly</th>
                          <th className="px-3 py-2 text-left">Status</th>
                          <th className="px-3 py-2 text-left">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {rules.length > 0 ? rules.map(rule => (
                          <tr key={rule.id} className={rule.is_active ? 'bg-white' : 'bg-gray-100'}>
                            <td className="px-3 py-2 font-medium">{rule.rule_name}</td>
                            <td className="px-3 py-2">{rule.rule_type}</td>
                            <td className="px-3 py-2">{rule.target_type}</td>
                            <td className="px-3 py-2">{rule.limit_value ? formatRupees(rule.limit_value) : '-'}</td>
                            <td className="px-3 py-2">{rule.daily_limit ? formatRupees(rule.daily_limit) : '-'}</td>
                            <td className="px-3 py-2">{rule.monthly_limit ? formatRupees(rule.monthly_limit) : '-'}</td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-1 rounded text-xs ${
                                rule.is_active ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-600'
                              }`}>
                                {rule.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-3 py-2 space-x-2">
                              <button
                                onClick={() => handleEditRule(rule)}
                                className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteRule(rule.id)}
                                className="text-red-600 hover:text-red-800 text-xs font-medium"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        )) : (
                          <tr>
                            <td colSpan="8" className="px-3 py-8 text-center text-gray-500">No compliance rules defined</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
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

  const bgGradient = fiColor === 'blue' 
    ? 'from-blue-800 to-blue-700' 
    : fiColor === 'red'
    ? 'from-red-800 to-red-700'
    : fiColor === 'green' 
    ? 'from-green-800 to-green-700' 
    : 'from-purple-800 to-purple-700';
  const headerBg = fiColor === 'blue' ? 'bg-blue-900' : fiColor === 'red' ? 'bg-red-900' : fiColor === 'green' ? 'bg-green-900' : 'bg-purple-900';

  // Bank logos
  const getBankLogo = () => {
    if (fiName === 'SBI') {
      return (
        <img 
          src="https://upload.wikimedia.org/wikipedia/en/thumb/5/58/State_Bank_of_India_logo.svg/200px-State_Bank_of_India_logo.svg.png" 
          alt="SBI Logo"
          className="w-6 h-6 object-contain"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
      );
    } else if (fiName === 'HDFC') {
      return (
        <img 
          src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/HDFC_Bank_Logo.svg/200px-HDFC_Bank_Logo.svg.png" 
          alt="HDFC Logo"
          className="w-6 h-6 object-contain"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
      );
    }
    return <Building2 className="h-8 w-8" />;
  };

  const getBankFullName = () => {
    if (fiName === 'SBI') return 'State Bank of India';
    if (fiName === 'HDFC') return 'HDFC Bank';
    return fiName;
  };

  return (
    <div className={`min-h-screen bg-gradient-to-br ${bgGradient}`}>
      {/* Header */}
      <header className={`${headerBg} text-white shadow-lg`}>
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="bg-white p-2 rounded-full">
                {getBankLogo()}
              </div>
              <div>
                <h1 className="text-2xl font-bold">{getBankFullName()}</h1>
                <p className="opacity-75">{fiName} Dashboard</p>
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
  const [transferForm, setTransferForm] = useState({ toWallet: '', amount: '', description: '', recipientType: 'wallet', recipientFI: '' });
  
  // New state for enhanced features
  const [isOffline, setIsOffline] = useState(false);
  const [pendingOffline, setPendingOffline] = useState([]);
  const [devices, setDevices] = useState([]);
  const [zkpProof, setZkpProof] = useState(null);
  const [deviceForm, setDeviceForm] = useState({ deviceType: 'smartwatch', deviceName: '' });
  const [iotPaymentForm, setIotPaymentForm] = useState({ deviceId: '', toWallet: '', amount: '' });
  const [activeTab, setActiveTab] = useState('transfer'); // transfer, offline, devices, zkp, subwallets, compliance
  const [otherFIWallets, setOtherFIWallets] = useState([]);
  
  // NEW: Universal Recipients (all wallets + sub-wallets across all FIs)
  const [allRecipients, setAllRecipients] = useState([]);
  
  // NEW: Enhanced Paper Features State
  const [subWallets, setSubWallets] = useState([]);
  const [compliance, setCompliance] = useState(null);
  const [complianceLimits, setComplianceLimits] = useState(null);
  const [subWalletForm, setSubWalletForm] = useState({ deviceId: '', balance: '', spendingLimit: 5000 });
  const [allocateSubForm, setAllocateSubForm] = useState({ subWalletId: '', amount: '' });
  const [subWalletPayForm, setSubWalletPayForm] = useState({ subWalletId: '', toWallet: '', amount: '' });
  
  // NEW: Expanded device view state
  const [expandedDeviceId, setExpandedDeviceId] = useState(null);
  const [deviceTransactions, setDeviceTransactions] = useState([]);
  const [loadingDeviceTx, setLoadingDeviceTx] = useState(false);

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
      
      // NEW: Fetch ALL recipients from ALL FIs (wallets + sub-wallets)
      const recipients = [];
      
      // Add this FI's wallets (excluding current wallet)
      wallets.filter(w => w.id !== wallet.id).forEach(w => {
        recipients.push({
          id: w.id,
          name: w.name,
          type: 'wallet',
          fi: fiName,
          balance: w.balance,
          label: `👛 ${w.name} (${fiName})`
        });
      });
      
      // Add this FI's sub-wallets from all wallets except current
      try {
        for (const w of wallets.filter(ww => ww.id !== wallet.id)) {
          const swRes = await fiApi.getSubWallets(w.id);
          (swRes.subWallets || []).filter(sw => sw.status === 'active').forEach(sw => {
            recipients.push({
              id: sw.id,
              name: `${w.name}'s ${sw.device_type}`,
              type: 'subwallet',
              fi: fiName,
              parentWallet: w.id,
              balance: sw.balance,
              label: `📱 ${w.name}'s ${sw.device_type} (${fiName})`
            });
          });
        }
      } catch (err) {
        console.log('Could not fetch this FI sub-wallets:', err.message);
      }
      
      // Fetch other FI's wallets and sub-wallets
      try {
        const otherFIName = getOtherFIName(fiName);
        const otherApi = getFIApi(otherFIName);
        const otherWalletsRes = await otherApi.getWallets();
        const otherWallets = otherWalletsRes.wallets || [];
        setOtherFIWallets(otherWallets.map(w => ({ ...w, fi: otherFIName })));
        
        // Add other FI's wallets
        otherWallets.forEach(w => {
          recipients.push({
            id: w.id,
            name: w.name,
            type: 'wallet',
            fi: otherFIName,
            balance: w.balance,
            label: `👛 ${w.name} (${otherFIName})`
          });
        });
        
        // Add other FI's sub-wallets
        for (const w of otherWallets) {
          try {
            const swRes = await otherApi.getSubWallets(w.id);
            (swRes.subWallets || []).filter(sw => sw.status === 'active').forEach(sw => {
              recipients.push({
                id: sw.id,
                name: `${w.name}'s ${sw.device_type}`,
                type: 'subwallet',
                fi: otherFIName,
                parentWallet: w.id,
                balance: sw.balance,
                label: `📱 ${w.name}'s ${sw.device_type} (${otherFIName})`
              });
            });
          } catch (err) {
            // Skip if sub-wallets not available for this wallet
          }
        }
      } catch (err) {
        console.log('Could not fetch other FI wallets:', err.message);
      }
      
      setAllRecipients(recipients);
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
      // Find the recipient from allRecipients to determine type and FI
      const recipient = allRecipients.find(r => r.id === transferForm.toWallet);
      if (!recipient) {
        alert('Please select a valid recipient');
        return;
      }
      
      const isCrossFI = recipient.fi !== fiName;
      const isToSubWallet = recipient.type === 'subwallet';
      const amount = parseFloat(transferForm.amount);
      
      if (isOffline) {
        // Create offline transaction with ZKP
        await fiApi.createOfflineTransaction(
          wallet.id, 
          transferForm.toWallet, 
          recipient.fi,
          amount,
          isToSubWallet ? 'subwallet' : 'wallet'
        );
        alert('Offline transaction queued with ZKP proof! Will be processed when online.');
      } else if (isCrossFI) {
        // Cross-FI transfer via Central Bank
        if (isToSubWallet) {
          // For sub-wallet: toWallet = parentWallet, toSubWallet = the sub-wallet ID
          await centralBankApi.routeCrossFI(
            fiName,
            recipient.fi,
            wallet.id,
            recipient.parentWallet,  // Parent wallet ID
            transferForm.toWallet,   // Sub-wallet ID
            amount,
            transferForm.description,
            'subwallet'
          );
          alert(`Cross-FI transfer to ${recipient.name} (IoT) @ ${recipient.fi} initiated!`);
        } else {
          // Normal wallet-to-wallet cross-FI
          await centralBankApi.routeCrossFI(
            fiName,
            recipient.fi,
            wallet.id,
            transferForm.toWallet,
            null,  // No sub-wallet
            amount,
            transferForm.description,
            'wallet'
          );
          alert(`Cross-FI transfer to ${recipient.name} @ ${recipient.fi} initiated!`);
        }
      } else {
        // Same-FI transfer
        if (isToSubWallet) {
          // Pay to sub-wallet in same FI
          await fiApi.payToSubWallet(
            wallet.id,
            recipient.parentWallet,
            transferForm.toWallet,
            amount,
            transferForm.description
          );
          alert(`Payment to ${recipient.name} successful!`);
        } else {
          // Normal wallet-to-wallet transfer
          await fiApi.createTransaction(wallet.id, transferForm.toWallet, amount, transferForm.description);
          alert('Transfer successful!');
        }
      }
      setTransferForm({ toWallet: '', amount: '', description: '', recipientType: 'wallet', recipientFI: '' });
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

  // Toggle device expansion and fetch transactions
  const handleToggleDeviceExpand = async (deviceId) => {
    if (expandedDeviceId === deviceId) {
      setExpandedDeviceId(null);
      setDeviceTransactions([]);
      return;
    }
    
    setExpandedDeviceId(deviceId);
    setDeviceTransactions([]);
    
    // Find the sub-wallet for this device
    const subWallet = subWallets.find(sw => sw.device_id === deviceId);
    if (subWallet) {
      setLoadingDeviceTx(true);
      try {
        const result = await fiApi.getSubWalletTransactions(subWallet.id);
        setDeviceTransactions(result.transactions || []);
      } catch (err) {
        console.log('Error fetching device transactions:', err.message);
      } finally {
        setLoadingDeviceTx(false);
      }
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
              
              {/* Universal Payment Info */}
              <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-700">
                  💡 Pay to any wallet or IoT device across all Financial Institutions. Cross-FI payments are automatically routed via Central Bank.
                </p>
              </div>

              <form onSubmit={handleTransfer} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <select
                  value={transferForm.toWallet}
                  onChange={(e) => setTransferForm({ ...transferForm, toWallet: e.target.value })}
                  className="border-2 border-gray-200 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none"
                  required
                >
                  <option value="">Select Recipient (Wallet / IoT)</option>
                  <optgroup label={`📍 ${fiName} - Wallets`}>
                    {allRecipients.filter(r => r.fi === fiName && r.type === 'wallet').map((r) => (
                      <option key={r.id} value={r.id}>👛 {r.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label={`📍 ${fiName} - IoT Devices`}>
                    {allRecipients.filter(r => r.fi === fiName && r.type === 'subwallet').map((r) => (
                      <option key={r.id} value={r.id}>📱 {r.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label={`🌐 ${getOtherFIName(fiName)} - Wallets`}>
                    {allRecipients.filter(r => r.fi !== fiName && r.type === 'wallet').map((r) => (
                      <option key={r.id} value={r.id}>👛 {r.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label={`🌐 ${getOtherFIName(fiName)} - IoT Devices`}>
                    {allRecipients.filter(r => r.fi !== fiName && r.type === 'subwallet').map((r) => (
                      <option key={r.id} value={r.id}>📱 {r.name}</option>
                    ))}
                  </optgroup>
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
                      : (allRecipients.find(r => r.id === transferForm.toWallet)?.fi !== fiName)
                        ? 'bg-purple-600 text-white hover:bg-purple-700'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                  disabled={walletData.balance <= 0}
                >
                  {isOffline ? <WifiOff className="h-5 w-5 mr-2" /> : <Send className="h-5 w-5 mr-2" />}
                  {isOffline ? 'Queue Offline' : (allRecipients.find(r => r.id === transferForm.toWallet)?.fi !== fiName) ? 'Cross-FI Send' : 'Send'}
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

          {/* IoT Devices Tab - Consolidated with Sub-Wallets */}
          {activeTab === 'devices' && (
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <Watch className="h-6 w-6 mr-2 text-blue-600" />
                IoT Device Management
              </h2>
              
              {/* Info Banner */}
              <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-blue-800 text-sm">
                  Register IoT devices (smartwatches, rings, etc.) and allocate funds for contactless payments.
                  Each device can have a sub-wallet with spending limits (max ₹25,000) as per AML/CFT compliance.
                </p>
                <div className="mt-2 text-xs text-blue-600">
                  Main Wallet: {formatRupees(walletData.balance)} | In IoT Devices: {formatRupees(subWallets.reduce((sum, sw) => sum + sw.balance, 0))} | Total: {formatRupees(walletData.balance + subWallets.reduce((sum, sw) => sum + sw.balance, 0))}
                </div>
              </div>
              
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

              {/* Registered Devices List */}
              <h3 className="font-semibold text-gray-700 mb-3">Your IoT Devices ({devices.length})</h3>
              {devices.length === 0 ? (
                <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
                  <Watch className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No devices registered</p>
                  <p className="text-sm">Register a smartwatch, ring, or other IoT device for contactless payments</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {devices.map((device) => {
                    const deviceSubWallet = subWallets.find(sw => sw.device_id === device.id);
                    const isExpanded = expandedDeviceId === device.id;
                    
                    return (
                      <div key={device.id} className={`border-2 rounded-lg transition-all ${
                        isExpanded 
                          ? 'border-blue-400 shadow-lg' 
                          : device.status === 'active' ? 'border-gray-200 hover:border-blue-300' : 'border-gray-200 bg-gray-50'
                      }`}>
                        {/* Device Header - Clickable */}
                        <div 
                          className="p-4 cursor-pointer flex items-center justify-between"
                          onClick={() => handleToggleDeviceExpand(device.id)}
                        >
                          <div className="flex items-center space-x-3">
                            <div className={`p-2 rounded-full ${device.status === 'active' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                              {getDeviceIcon(device.device_type)}
                            </div>
                            <div>
                              <p className="font-medium">{device.device_name || device.device_type}</p>
                              <p className="text-xs text-gray-500 capitalize">{device.device_type.replace('_', ' ')}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-3">
                            {deviceSubWallet && (
                              <div className="text-right mr-4">
                                <p className="text-xs text-gray-500">Balance</p>
                                <p className="font-bold text-purple-600">{formatRupees(deviceSubWallet.balance)}</p>
                              </div>
                            )}
                            <span className={`px-2 py-1 rounded text-xs ${device.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {device.status}
                            </span>
                            <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'transform rotate-180' : ''}`} />
                          </div>
                        </div>
                        
                        {/* Expanded Content */}
                        {isExpanded && device.status === 'active' && (
                          <div className="border-t border-gray-200 p-4 bg-gray-50">
                            {/* Sub-wallet info or create form */}
                            {deviceSubWallet ? (
                              <div className="space-y-4">
                                {/* Sub-wallet Balance Card */}
                                <div className="bg-white rounded-lg p-4 border border-purple-200">
                                  <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-semibold text-gray-700">Device Wallet</h4>
                                    <span className={`px-2 py-1 rounded text-xs ${
                                      deviceSubWallet.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                    }`}>
                                      {deviceSubWallet.status}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-3 gap-4 mb-4">
                                    <div>
                                      <p className="text-xs text-gray-500">Balance</p>
                                      <p className="text-xl font-bold text-purple-600">{formatRupees(deviceSubWallet.balance)}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-gray-500">Spending Limit</p>
                                      <p className="text-lg font-semibold text-gray-700">{formatRupees(deviceSubWallet.spending_limit)}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-gray-500">Daily Spent</p>
                                      <p className="text-lg font-semibold text-gray-700">{formatRupees(deviceSubWallet.daily_spent || 0)}</p>
                                    </div>
                                  </div>
                                  
                                  {deviceSubWallet.status === 'active' && (
                                    <div className="flex space-x-2">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleReturnFromSubWallet(deviceSubWallet.id);
                                        }}
                                        className="flex-1 bg-gray-200 text-gray-700 rounded px-3 py-2 text-sm hover:bg-gray-300 transition"
                                        disabled={deviceSubWallet.balance <= 0}
                                      >
                                        Return Funds
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRevokeSubWallet(deviceSubWallet.id);
                                        }}
                                        className="flex-1 bg-red-100 text-red-700 rounded px-3 py-2 text-sm hover:bg-red-200 transition"
                                      >
                                        Revoke Wallet
                                      </button>
                                    </div>
                                  )}
                                </div>
                                
                                {/* Allocate More Funds */}
                                {deviceSubWallet.status === 'active' && (
                                  <div className="bg-blue-50 rounded-lg p-4">
                                    <h4 className="font-semibold text-gray-700 mb-2">Add Funds</h4>
                                    <form onSubmit={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setAllocateSubForm({ ...allocateSubForm, subWalletId: deviceSubWallet.id });
                                      handleAllocateToSubWallet(e);
                                    }} className="flex space-x-2">
                                      <div className="relative flex-1">
                                        <span className="absolute left-3 top-2 text-gray-500 font-bold">₹</span>
                                        <input
                                          type="number"
                                          placeholder="Amount"
                                          value={allocateSubForm.subWalletId === deviceSubWallet.id ? allocateSubForm.amount : ''}
                                          onChange={(e) => setAllocateSubForm({ subWalletId: deviceSubWallet.id, amount: e.target.value })}
                                          onClick={(e) => e.stopPropagation()}
                                          className="border border-gray-300 rounded pl-8 pr-3 py-2 w-full text-sm"
                                          min="1"
                                          max={walletData.balance}
                                        />
                                      </div>
                                      <button
                                        type="submit"
                                        onClick={(e) => e.stopPropagation()}
                                        className="bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700"
                                      >
                                        Allocate
                                      </button>
                                    </form>
                                  </div>
                                )}
                                
                                {/* Make Payment */}
                                {deviceSubWallet.status === 'active' && deviceSubWallet.balance > 0 && (
                                  <div className="bg-green-50 rounded-lg p-4">
                                    <h4 className="font-semibold text-gray-700 mb-2">Make Payment</h4>
                                    <form onSubmit={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setSubWalletPayForm({ ...subWalletPayForm, subWalletId: deviceSubWallet.id });
                                      handleSubWalletPayment(e);
                                    }} className="flex space-x-2">
                                      <select
                                        value={subWalletPayForm.subWalletId === deviceSubWallet.id ? subWalletPayForm.toWallet : ''}
                                        onChange={(e) => setSubWalletPayForm({ subWalletId: deviceSubWallet.id, toWallet: e.target.value, amount: subWalletPayForm.subWalletId === deviceSubWallet.id ? subWalletPayForm.amount : '' })}
                                        onClick={(e) => e.stopPropagation()}
                                        className="border border-gray-300 rounded px-3 py-2 text-sm flex-1"
                                        required
                                      >
                                        <option value="">Select Recipient</option>
                                        {allWallets.map((w) => (
                                          <option key={w.id} value={w.id}>{w.name}</option>
                                        ))}
                                      </select>
                                      <div className="relative">
                                        <span className="absolute left-3 top-2 text-gray-500 font-bold">₹</span>
                                        <input
                                          type="number"
                                          placeholder="Amount"
                                          value={subWalletPayForm.subWalletId === deviceSubWallet.id ? subWalletPayForm.amount : ''}
                                          onChange={(e) => setSubWalletPayForm({ subWalletId: deviceSubWallet.id, toWallet: subWalletPayForm.subWalletId === deviceSubWallet.id ? subWalletPayForm.toWallet : '', amount: e.target.value })}
                                          onClick={(e) => e.stopPropagation()}
                                          className="border border-gray-300 rounded pl-8 pr-3 py-2 w-24 text-sm"
                                          min="1"
                                          max={deviceSubWallet.balance}
                                        />
                                      </div>
                                      <button
                                        type="submit"
                                        onClick={(e) => e.stopPropagation()}
                                        className="bg-green-600 text-white rounded px-4 py-2 text-sm hover:bg-green-700"
                                      >
                                        Pay
                                      </button>
                                    </form>
                                  </div>
                                )}
                                
                                {/* Transaction History */}
                                <div className="bg-white rounded-lg p-4 border border-gray-200">
                                  <h4 className="font-semibold text-gray-700 mb-3 flex items-center">
                                    <History className="h-4 w-4 mr-2" />
                                    Transaction History
                                  </h4>
                                  {loadingDeviceTx ? (
                                    <p className="text-sm text-gray-500">Loading transactions...</p>
                                  ) : deviceTransactions.length === 0 ? (
                                    <p className="text-sm text-gray-500">No transactions yet</p>
                                  ) : (
                                    <div className="space-y-2 max-h-48 overflow-y-auto">
                                      {deviceTransactions.map((tx, idx) => (
                                        <div key={tx.id || idx} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                                          <div className="flex items-center space-x-2">
                                            <div className={`p-1 rounded-full ${tx.type === 'credit' || tx.type === 'allocation' ? 'bg-green-100' : 'bg-red-100'}`}>
                                              {tx.type === 'credit' || tx.type === 'allocation' ? (
                                                <ArrowDownLeft className="h-3 w-3 text-green-600" />
                                              ) : (
                                                <ArrowUpRight className="h-3 w-3 text-red-600" />
                                              )}
                                            </div>
                                            <div>
                                              <p className="text-xs font-medium">{tx.description || tx.type}</p>
                                              <p className="text-xs text-gray-400">{new Date(tx.created_at || tx.timestamp).toLocaleString()}</p>
                                            </div>
                                          </div>
                                          <p className={`font-medium text-sm ${tx.type === 'credit' || tx.type === 'allocation' ? 'text-green-600' : 'text-red-600'}`}>
                                            {tx.type === 'credit' || tx.type === 'allocation' ? '+' : '-'}{formatRupees(tx.amount)}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              /* Create Sub-wallet Form */
                              <div className="bg-purple-50 rounded-lg p-4">
                                <h4 className="font-semibold text-gray-700 mb-3">Setup Device Wallet</h4>
                                <p className="text-sm text-gray-600 mb-3">
                                  Create a sub-wallet to allocate funds for this device. Balance will be deducted from your main wallet.
                                </p>
                                <form onSubmit={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setSubWalletForm({ ...subWalletForm, deviceId: device.id });
                                  handleCreateSubWallet(e);
                                }} className="grid grid-cols-3 gap-3">
                                  <div className="relative">
                                    <span className="absolute left-3 top-2 text-gray-500 font-bold">₹</span>
                                    <input
                                      type="number"
                                      placeholder="Initial Balance"
                                      value={subWalletForm.deviceId === device.id ? subWalletForm.balance : ''}
                                      onChange={(e) => setSubWalletForm({ deviceId: device.id, balance: e.target.value, spendingLimit: subWalletForm.deviceId === device.id ? subWalletForm.spendingLimit : 5000 })}
                                      onClick={(e) => e.stopPropagation()}
                                      className="border border-gray-300 rounded pl-8 pr-3 py-2 w-full text-sm"
                                      max={Math.min(walletData.balance, 25000)}
                                      min="100"
                                      required
                                    />
                                  </div>
                                  <div className="relative">
                                    <span className="absolute left-3 top-2 text-gray-500 font-bold">₹</span>
                                    <input
                                      type="number"
                                      placeholder="Spending Limit"
                                      value={subWalletForm.deviceId === device.id ? subWalletForm.spendingLimit : 5000}
                                      onChange={(e) => setSubWalletForm({ deviceId: device.id, balance: subWalletForm.deviceId === device.id ? subWalletForm.balance : '', spendingLimit: e.target.value })}
                                      onClick={(e) => e.stopPropagation()}
                                      className="border border-gray-300 rounded pl-8 pr-3 py-2 w-full text-sm"
                                      max="25000"
                                      min="100"
                                    />
                                  </div>
                                  <button
                                    type="submit"
                                    onClick={(e) => e.stopPropagation()}
                                    className="bg-purple-600 text-white rounded px-4 py-2 text-sm hover:bg-purple-700"
                                    disabled={walletData.balance < 100}
                                  >
                                    Create Wallet
                                  </button>
                                </form>
                              </div>
                            )}
                            
                            {/* Revoke Device Button */}
                            <div className="mt-4 pt-4 border-t border-gray-200">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRevokeDevice(device.id);
                                }}
                                className="text-red-500 hover:text-red-700 text-sm flex items-center"
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Revoke Device
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
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

          {/* Compliance Tab */}
          {activeTab === 'compliance' && (
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <Shield className="h-6 w-6 mr-2 text-red-600" />
                AML/CFT Compliance
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
        ...(fi1Wallets.wallets || []).map(w => ({ ...w, fi: 'SBI', fiApi: fi1Api })),
        ...(fi2Wallets.wallets || []).map(w => ({ ...w, fi: 'HDFC', fiApi: fi2Api }))
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
      setCurrentView((selectedFiName === 'FI-Alpha' || selectedFiName === 'SBI') ? 'fi1' : 'fi2');
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
        <FIDashboard fiApi={fi1Api} fiName="SBI" fiColor="blue" onSelectWallet={handleSelectWallet} />
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
        <FIDashboard fiApi={fi2Api} fiName="HDFC" fiColor="red" onSelectWallet={handleSelectWallet} />
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
              <span className="text-green-400">Total Circulation: {formatRupees(moneySupply.totalCreated)}</span>
              <span className="text-blue-400">In FIs: {formatRupees(moneySupply.breakdown?.inFIs || 0)}</span>
              <span className="text-purple-400">In Wallets: {formatRupees(moneySupply.breakdown?.inWallets || 0)}</span>
              <span className="text-yellow-400">In Sub-Wallets: {formatRupees(moneySupply.breakdown?.inSubWallets || 0)}</span>
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
                <p className="text-blue-200">Central Bank Dashboard - Issuer of Digital Rupee</p>
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
            {/* SBI Card */}
            <div 
              onClick={() => setCurrentView('fi1')}
              className="bg-gradient-to-br from-blue-600 to-blue-900 rounded-2xl p-6 text-white cursor-pointer hover:scale-[1.02] transition-transform shadow-xl"
            >
              <div className="flex items-center space-x-4 mb-4">
                <div className="bg-white w-14 h-14 rounded-full flex items-center justify-center overflow-hidden p-1">
                  <img 
                    src="https://upload.wikimedia.org/wikipedia/en/thumb/5/58/State_Bank_of_India_logo.svg/200px-State_Bank_of_India_logo.svg.png" 
                    alt="SBI Logo"
                    className="w-10 h-10 object-contain"
                    onError={(e) => { e.target.onerror = null; e.target.src = ''; e.target.parentElement.innerHTML = '<span class="text-blue-900 font-bold text-lg">SBI</span>'; }}
                  />
                </div>
                <div>
                  <h3 className="text-xl font-bold">State Bank of India</h3>
                  <p className="text-blue-200 text-sm">SBI • Port 4001</p>
                </div>
              </div>
              {moneySupply?.fiBreakdown && (
                <div className="bg-blue-900/50 rounded-lg p-3 mb-4">
                  <p className="text-blue-300 text-xs">Allocated / In Wallets</p>
                  <p className="text-xl font-bold">
                    {formatRupees(moneySupply.fiBreakdown.find(f => f.name === 'FI-Alpha' || f.name === 'SBI')?.allocated || 0)}
                  </p>
                </div>
              )}
              <div className="text-right">
                <span className="bg-blue-500 px-4 py-2 rounded-full text-sm">Open Dashboard →</span>
              </div>
            </div>

            {/* HDFC Card */}
            <div 
              onClick={() => setCurrentView('fi2')}
              className="bg-gradient-to-br from-red-600 to-red-900 rounded-2xl p-6 text-white cursor-pointer hover:scale-[1.02] transition-transform shadow-xl"
            >
              <div className="flex items-center space-x-4 mb-4">
                <div className="bg-white w-14 h-14 rounded-full flex items-center justify-center overflow-hidden p-1">
                  <img 
                    src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/HDFC_Bank_Logo.svg/200px-HDFC_Bank_Logo.svg.png" 
                    alt="HDFC Logo"
                    className="w-10 h-10 object-contain"
                    onError={(e) => { e.target.onerror = null; e.target.src = ''; e.target.parentElement.innerHTML = '<span class="text-red-900 font-bold text-sm">HDFC</span>'; }}
                  />
                </div>
                <div>
                  <h3 className="text-xl font-bold">HDFC Bank</h3>
                  <p className="text-red-200 text-sm">HDFC • Port 4002</p>
                </div>
              </div>
              {moneySupply?.fiBreakdown && (
                <div className="bg-red-900/50 rounded-lg p-3 mb-4">
                  <p className="text-red-300 text-xs">Allocated / In Wallets</p>
                  <p className="text-xl font-bold">
                    {formatRupees(moneySupply.fiBreakdown.find(f => f.name === 'FI-Beta' || f.name === 'HDFC')?.allocated || 0)}
                  </p>
                </div>
              )}
              <div className="text-right">
                <span className="bg-red-500 px-4 py-2 rounded-full text-sm">Open Dashboard →</span>
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
