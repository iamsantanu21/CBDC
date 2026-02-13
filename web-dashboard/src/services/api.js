// API Service for communicating with CBDC nodes

const CENTRAL_BANK_URL = 'http://localhost:4000';
const FI1_URL = 'http://localhost:4001';
const FI2_URL = 'http://localhost:4002';

// Central Bank API
export const centralBankApi = {
  async getHealth() {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/health`);
    return res.json();
  },
  
  async getStats() {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/stats`);
    return res.json();
  },
  
  async getFIs() {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/fi/list`);
    return res.json();
  },
  
  async registerFI(name, endpoint) {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/fi/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, endpoint })
    });
    return res.json();
  },
  
  async allocateFunds(fiId, amount, description) {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/fi/allocate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fiId, amount, description })
    });
    return res.json();
  },
  
  async getLedger() {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/ledger`);
    return res.json();
  },
  
  // Cross-FI Transaction Routing (supports wallets and sub-wallets)
  async routeCrossFI(sourceFiName, targetFiName, fromWallet, toWallet, toSubWallet, amount, description = '', recipientType = 'wallet') {
    const payload = { sourceFiName, targetFiName, fromWallet, toWallet, amount, description, recipientType };
    if (recipientType === 'subwallet' && toSubWallet) {
      payload.toSubWallet = toSubWallet;
    }
    const res = await fetch(`${CENTRAL_BANK_URL}/api/ledger/cross-fi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },
  
  // Cleanup duplicate FIs
  async cleanupDuplicateFIs() {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/fi/cleanup`, {
      method: 'POST'
    });
    return res.json();
  },
  
  // Get money supply (total circulation tallied with FIs)
  async getMoneySupply() {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/fi/money-supply`);
    return res.json();
  },
  
  // ========== NEW: Compliance APIs ==========
  async getComplianceSummary() {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/ledger/compliance/summary`);
    return res.json();
  },
  
  async getComplianceLimits() {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/ledger/compliance/limits`);
    return res.json();
  },
  
  async getComplianceAudits(fiId = null, exceededOnly = false) {
    const params = new URLSearchParams();
    if (fiId) params.append('fiId', fiId);
    if (exceededOnly) params.append('exceededOnly', 'true');
    const res = await fetch(`${CENTRAL_BANK_URL}/api/ledger/compliance/audits?${params}`);
    return res.json();
  },
  
  async getFIComplianceStatus(fiId) {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/ledger/compliance/fi/${fiId}`);
    return res.json();
  },
  
  // ========== NEW: Nullifier Registry APIs ==========
  async checkNullifier(nullifier) {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/ledger/nullifier/check/${nullifier}`);
    return res.json();
  },
  
  async getNullifiersByFI(fiId) {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/ledger/nullifier/fi/${fiId}`);
    return res.json();
  },
  
  // ========== NEW: ZKP Verification APIs ==========
  async verifyZKPProof(proof, publicInputs, proofType) {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/ledger/zkp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proof, publicInputs, proofType })
    });
    return res.json();
  },

  // ========== COMPLIANCE CONTROL APIs ==========
  
  // Get compliance dashboard summary
  async getComplianceDashboard() {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/compliance/dashboard`);
    return res.json();
  },
  
  // Compliance Rules
  async getComplianceRules(targetType = null, activeOnly = true) {
    const params = new URLSearchParams();
    if (targetType) params.append('targetType', targetType);
    params.append('activeOnly', activeOnly.toString());
    const res = await fetch(`${CENTRAL_BANK_URL}/api/compliance/rules?${params}`);
    return res.json();
  },
  
  async setComplianceRule(ruleData) {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/compliance/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ruleData)
    });
    return res.json();
  },
  
  async deleteComplianceRule(ruleId) {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/compliance/rules/${ruleId}`, {
      method: 'DELETE'
    });
    return res.json();
  },
  
  // Alerts
  async getAlerts(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) params.append(key, value);
    });
    const res = await fetch(`${CENTRAL_BANK_URL}/api/compliance/alerts?${params}`);
    return res.json();
  },
  
  async getAlertStats() {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/compliance/alerts/stats`);
    return res.json();
  },
  
  async markAlertRead(alertId) {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/compliance/alerts/${alertId}/read`, {
      method: 'PUT'
    });
    return res.json();
  },
  
  async resolveAlert(alertId, resolvedBy = 'admin') {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/compliance/alerts/${alertId}/resolve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved_by: resolvedBy })
    });
    return res.json();
  },
  
  async markAllAlertsRead() {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/compliance/alerts/mark-all-read`, {
      method: 'POST'
    });
    return res.json();
  },
  
  // Watchlist
  async getWatchlist(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) params.append(key, value);
    });
    const res = await fetch(`${CENTRAL_BANK_URL}/api/compliance/watchlist?${params}`);
    return res.json();
  },
  
  async addToWatchlist(entityType, entityId, fiId, status, reason, riskLevel = 'medium') {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/compliance/watchlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId, fi_id: fiId, status, reason, risk_level: riskLevel })
    });
    return res.json();
  },
  
  async removeFromWatchlist(entityType, entityId, fiId = null) {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/compliance/watchlist/${entityType}/${entityId}?fi_id=${fiId || ''}`, {
      method: 'DELETE'
    });
    return res.json();
  },
  
  // Freeze/Unfreeze
  async getFrozenEntities(fiId = null) {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/compliance/frozen${fiId ? `?fi_id=${fiId}` : ''}`);
    return res.json();
  },
  
  async freezeEntity(entityType, entityId, fiId, reason, frozenBy = 'admin') {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/compliance/freeze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId, fi_id: fiId, reason, frozen_by: frozenBy })
    });
    return res.json();
  },
  
  async unfreezeEntity(entityType, entityId, fiId, unfrozenBy = 'admin') {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/compliance/unfreeze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId, fi_id: fiId, unfrozen_by: unfrozenBy })
    });
    return res.json();
  },
  
  async checkEntityFrozen(entityType, entityId, fiId = null) {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/compliance/frozen/check/${entityType}/${entityId}?fi_id=${fiId || ''}`);
    return res.json();
  },
  
  // Transaction Compliance Check
  async checkTransactionCompliance(fiId, walletId, deviceId, amount, txType = 'online') {
    const res = await fetch(`${CENTRAL_BANK_URL}/api/compliance/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fi_id: fiId, wallet_id: walletId, device_id: deviceId, amount, tx_type: txType })
    });
    return res.json();
  }
};

// FI API Factory
function createFIApi(baseUrl) {
  return {
    async getHealth() {
      const res = await fetch(`${baseUrl}/api/health`);
      return res.json();
    },
    
    async getInfo() {
      const res = await fetch(`${baseUrl}/api/info`);
      return res.json();
    },
    
    async getStats() {
      const res = await fetch(`${baseUrl}/api/stats`);
      return res.json();
    },
    
    async getFIBalance() {
      const res = await fetch(`${baseUrl}/api/balance`);
      return res.json();
    },
    
    async getWallets() {
      const res = await fetch(`${baseUrl}/api/wallet/list`);
      return res.json();
    },
    
    async createWallet(name) {
      const res = await fetch(`${baseUrl}/api/wallet/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      return res.json();
    },
    
    async creditWallet(walletId, amount, description) {
      const res = await fetch(`${baseUrl}/api/wallet/${walletId}/credit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, description })
      });
      return res.json();
    },
    
    async getTransactions() {
      const res = await fetch(`${baseUrl}/api/transaction/list`);
      return res.json();
    },
    
    async createTransaction(fromWallet, toWallet, amount, description, targetFi = null) {
      const res = await fetch(`${baseUrl}/api/transaction/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromWallet, toWallet, amount, description, targetFi })
      });
      return res.json();
    },
    
    // Pay from wallet to another wallet's sub-wallet (same FI)
    async payToSubWallet(fromWallet, toWalletId, toSubWalletId, amount, description = '') {
      const res = await fetch(`${baseUrl}/api/transaction/pay-to-subwallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromWallet, toWalletId, toSubWalletId, amount, description })
      });
      return res.json();
    },
    
    async syncWithCentralBank() {
      const res = await fetch(`${baseUrl}/api/transaction/sync`, {
        method: 'POST'
      });
      return res.json();
    },
    
    // ========== NEW: Offline Transaction APIs ==========
    async createOfflineTransaction(fromWallet, toWallet, amount, description, toFi = null) {
      const res = await fetch(`${baseUrl}/api/transaction/offline/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromWallet, toWallet, amount, description, toFi })
      });
      return res.json();
    },
    
    async getPendingOfflineTransactions() {
      const res = await fetch(`${baseUrl}/api/transaction/offline/pending`);
      return res.json();
    },
    
    async processAllOfflineTransactions() {
      const res = await fetch(`${baseUrl}/api/transaction/offline/process-all`, {
        method: 'POST'
      });
      return res.json();
    },
    
    // ========== NEW: ZKP APIs ==========
    async generateWalletProof(walletId) {
      const res = await fetch(`${baseUrl}/api/wallet/${walletId}/proof`, {
        method: 'POST'
      });
      return res.json();
    },
    
    async verifyWalletOwnership(walletId, proof) {
      const res = await fetch(`${baseUrl}/api/wallet/${walletId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proof })
      });
      return res.json();
    },
    
    // ========== NEW: IoT Device APIs ==========
    async registerDevice(walletId, deviceType, deviceName) {
      const res = await fetch(`${baseUrl}/api/wallet/${walletId}/device/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceType, deviceName })
      });
      return res.json();
    },
    
    async getWalletDevices(walletId) {
      const res = await fetch(`${baseUrl}/api/wallet/${walletId}/devices`);
      return res.json();
    },
    
    async getAllDevices() {
      const res = await fetch(`${baseUrl}/api/transaction/iot/devices`);
      return res.json();
    },
    
    async createIoTPayment(deviceId, authToken, toWallet, amount, description, toFi = null) {
      const res = await fetch(`${baseUrl}/api/transaction/iot/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, authToken, toWallet, amount, description, toFi })
      });
      return res.json();
    },
    
    async revokeDevice(walletId, deviceId) {
      const res = await fetch(`${baseUrl}/api/wallet/${walletId}/device/${deviceId}`, {
        method: 'DELETE'
      });
      return res.json();
    },
    
    // ========== NEW: Enhanced Offline Transaction APIs ==========
    async createEnhancedOfflineTransaction(fromWallet, toWallet, amount, devicePubKey, monotonicCounter) {
      const res = await fetch(`${baseUrl}/api/transaction/offline/enhanced/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromWalletId: fromWallet, toWalletId: toWallet, amount, devicePubKey, monotonicCounter })
      });
      return res.json();
    },
    
    async processEnhancedOfflineTransaction(id, validateNullifier = true) {
      const res = await fetch(`${baseUrl}/api/transaction/offline/enhanced/${id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ validateNullifier })
      });
      return res.json();
    },
    
    async getNullifiers() {
      const res = await fetch(`${baseUrl}/api/transaction/nullifiers`);
      return res.json();
    },
    
    async getComplianceLimits() {
      const res = await fetch(`${baseUrl}/api/transaction/compliance/limits`);
      return res.json();
    },
    
    async verifyZKPProof(proof, publicInputs, proofType) {
      const res = await fetch(`${baseUrl}/api/transaction/zkp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proof, publicInputs, proofType })
      });
      return res.json();
    },
    
    // ========== NEW: Sub-Wallet APIs ==========
    async createSubWallet(walletId, subWalletName, devicePubKey, spendingLimit) {
      const res = await fetch(`${baseUrl}/api/wallet/${walletId}/subwallet/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: subWalletName, devicePubKey, spendingLimit })
      });
      return res.json();
    },
    
    async createSubWalletForDevice(walletId, deviceId, spendingLimit, allocatedBalance = 0) {
      const res = await fetch(`${baseUrl}/api/wallet/${walletId}/subwallet/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, allocatedBalance, spendingLimit })
      });
      return res.json();
    },
    
    async getSubWallets(walletId) {
      const res = await fetch(`${baseUrl}/api/wallet/${walletId}/subwallets`);
      return res.json();
    },
    
    async allocateToSubWallet(walletId, subWalletId, amount) {
      const res = await fetch(`${baseUrl}/api/wallet/${walletId}/subwallet/${subWalletId}/allocate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount })
      });
      return res.json();
    },
    
    async returnFromSubWallet(walletId, subWalletId, amount) {
      const res = await fetch(`${baseUrl}/api/wallet/${walletId}/subwallet/${subWalletId}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount })
      });
      return res.json();
    },
    
    async revokeSubWallet(walletId, subWalletId) {
      const res = await fetch(`${baseUrl}/api/wallet/${walletId}/subwallet/${subWalletId}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      return res.json();
    },
    
    async subWalletPay(subWalletId, toWallet, amount, description, toFi = null) {
      const res = await fetch(`${baseUrl}/api/wallet/subwallet/${subWalletId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toWallet, amount, description, toFi })
      });
      return res.json();
    },
    
    async getSubWalletTransactions(subWalletId) {
      const res = await fetch(`${baseUrl}/api/wallet/subwallet/${subWalletId}/transactions`);
      return res.json();
    },
    
    // ========== NEW: Compliance APIs ==========
    async getWalletCompliance(walletId) {
      const res = await fetch(`${baseUrl}/api/wallet/${walletId}/compliance`);
      return res.json();
    },
    
    async checkComplianceForTransaction(walletId, amount, txType = 'online') {
      const res = await fetch(`${baseUrl}/api/wallet/${walletId}/compliance/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, txType })
      });
      return res.json();
    },
    
    async getWalletNullifiers(walletId) {
      const res = await fetch(`${baseUrl}/api/wallet/${walletId}/nullifiers`);
      return res.json();
    },
    
    async getWalletSerialNumbers(walletId) {
      const res = await fetch(`${baseUrl}/api/wallet/${walletId}/serial-numbers`);
      return res.json();
    },
    
    async getSecureElementLogs(walletId) {
      const res = await fetch(`${baseUrl}/api/wallet/${walletId}/secure-element/logs`);
      return res.json();
    }
  };
}

export const fi1Api = createFIApi(FI1_URL);
export const fi2Api = createFIApi(FI2_URL);

// Helper to get FI API by ID or name
export function getFIApi(fiId) {
  if (fiId === 'fi-001' || fiId === 'fi1' || fiId === 'FI-Alpha' || fiId === 'SBI' || fiId === 'fi-alpha' || fiId === 'sbi') return fi1Api;
  if (fiId === 'fi-002' || fiId === 'fi2' || fiId === 'FI-Beta' || fiId === 'HDFC' || fiId === 'fi-beta' || fiId === 'hdfc') return fi2Api;
  return null;
}

// Helper to get the other FI's name
export function getOtherFIName(currentFiName) {
  return (currentFiName === 'FI-Alpha' || currentFiName === 'SBI') ? 'HDFC' : 'SBI';
}
