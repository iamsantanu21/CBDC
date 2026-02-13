import express from 'express';
import {
  setComplianceRule,
  getComplianceRule,
  getAllComplianceRules,
  deleteComplianceRule,
  checkTransactionCompliance,
  createAlert,
  getAlerts,
  getAlertCounts,
  markAlertRead,
  resolveAlert,
  markAllAlertsRead,
  addToWatchlist,
  getWatchlist,
  removeFromWatchlist,
  freezeEntity,
  unfreezeEntity,
  getFrozenEntities,
  isEntityFrozen,
  monitorTransaction,
  getComplianceDashboard
} from '../database.js';

const router = express.Router();

// ============================================
// COMPLIANCE RULES
// ============================================

// Get all compliance rules
router.get('/rules', async (req, res) => {
  try {
    const { targetType, activeOnly } = req.query;
    const rules = await getAllComplianceRules(
      targetType, 
      activeOnly !== 'false'
    );
    res.json({ success: true, rules });
  } catch (error) {
    console.error('Error getting compliance rules:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get specific compliance rule
router.get('/rules/:id', async (req, res) => {
  try {
    const rule = await getComplianceRule(req.params.id);
    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    res.json({ success: true, rule });
  } catch (error) {
    console.error('Error getting compliance rule:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create/Update compliance rule
router.post('/rules', async (req, res) => {
  try {
    const rule = await setComplianceRule(req.body);
    console.log(`📋 Compliance rule ${req.body.id ? 'updated' : 'created'}: ${rule.rule_name}`);
    res.json({ success: true, rule });
  } catch (error) {
    console.error('Error setting compliance rule:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update compliance rule (alias)
router.put('/rules/:id', async (req, res) => {
  try {
    const rule = await setComplianceRule({ ...req.body, id: req.params.id });
    console.log(`📋 Compliance rule updated: ${rule.rule_name}`);
    res.json({ success: true, rule });
  } catch (error) {
    console.error('Error updating compliance rule:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete compliance rule
router.delete('/rules/:id', async (req, res) => {
  try {
    const result = await deleteComplianceRule(req.params.id);
    console.log(`🗑️ Compliance rule deleted: ${req.params.id}`);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error deleting compliance rule:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ALERTS
// ============================================

// Get alert statistics
router.get('/alerts/stats', async (req, res) => {
  try {
    const counts = await getAlertCounts();
    res.json({ success: true, counts });
  } catch (error) {
    console.error('Error getting alert stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all alerts
router.get('/alerts', async (req, res) => {
  try {
    const { severity, fi_id, unread_only, unresolved_only, alert_type, limit } = req.query;
    const alerts = await getAlerts({
      severity,
      fi_id,
      unread_only: unread_only === 'true',
      unresolved_only: unresolved_only === 'true',
      alert_type,
      limit: limit ? parseInt(limit) : undefined
    });
    res.json({ success: true, alerts });
  } catch (error) {
    console.error('Error getting alerts:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create manual alert
router.post('/alerts', async (req, res) => {
  try {
    const alert = await createAlert(req.body);
    res.json({ success: true, alert });
  } catch (error) {
    console.error('Error creating alert:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mark alert as read
router.put('/alerts/:id/read', async (req, res) => {
  try {
    const result = await markAlertRead(req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error marking alert read:', error);
    res.status(500).json({ error: error.message });
  }
});

// Resolve alert
router.put('/alerts/:id/resolve', async (req, res) => {
  try {
    const { resolved_by } = req.body;
    const result = await resolveAlert(req.params.id, resolved_by);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error resolving alert:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mark all alerts as read
router.post('/alerts/mark-all-read', async (req, res) => {
  try {
    const result = await markAllAlertsRead();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error marking all alerts read:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// WATCHLIST
// ============================================

// Get watchlist
router.get('/watchlist', async (req, res) => {
  try {
    const { status, entity_type, fi_id } = req.query;
    const watchlist = await getWatchlist({ status, entity_type, fi_id });
    res.json({ success: true, watchlist });
  } catch (error) {
    console.error('Error getting watchlist:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add to watchlist
router.post('/watchlist', async (req, res) => {
  try {
    const { entity_type, entity_id, fi_id, status, reason, risk_level, expires_at } = req.body;
    
    if (!entity_type || !entity_id || !status) {
      return res.status(400).json({ error: 'entity_type, entity_id, and status are required' });
    }
    
    const entry = await addToWatchlist(entity_type, entity_id, fi_id, status, reason, risk_level, expires_at);
    console.log(`📝 Added to ${status} list: ${entity_type} ${entity_id}`);
    res.json({ success: true, entry });
  } catch (error) {
    console.error('Error adding to watchlist:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove from watchlist
router.delete('/watchlist/:entityType/:entityId', async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { fi_id } = req.query;
    const result = await removeFromWatchlist(entityType, entityId, fi_id);
    console.log(`🗑️ Removed from watchlist: ${entityType} ${entityId}`);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error removing from watchlist:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// FREEZE/UNFREEZE
// ============================================

// Get frozen entities
router.get('/frozen', async (req, res) => {
  try {
    const { fi_id } = req.query;
    const frozen = await getFrozenEntities(fi_id);
    res.json({ success: true, frozen });
  } catch (error) {
    console.error('Error getting frozen entities:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check if entity is frozen
router.get('/frozen/check/:entityType/:entityId', async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { fi_id } = req.query;
    const isFrozen = await isEntityFrozen(entityType, entityId, fi_id);
    res.json({ success: true, is_frozen: isFrozen });
  } catch (error) {
    console.error('Error checking frozen status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Freeze entity
router.post('/freeze', async (req, res) => {
  try {
    const { entity_type, entity_id, fi_id, reason, frozen_by } = req.body;
    
    if (!entity_type || !entity_id) {
      return res.status(400).json({ error: 'entity_type and entity_id are required' });
    }
    
    const result = await freezeEntity(entity_type, entity_id, fi_id, reason, frozen_by);
    console.log(`🔒 FROZEN: ${entity_type} ${entity_id} - ${reason}`);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error freezing entity:', error);
    res.status(500).json({ error: error.message });
  }
});

// Unfreeze entity
router.post('/unfreeze', async (req, res) => {
  try {
    const { entity_type, entity_id, fi_id, unfrozen_by } = req.body;
    
    if (!entity_type || !entity_id) {
      return res.status(400).json({ error: 'entity_type and entity_id are required' });
    }
    
    const result = await unfreezeEntity(entity_type, entity_id, fi_id, unfrozen_by);
    console.log(`🔓 UNFROZEN: ${entity_type} ${entity_id}`);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error unfreezing entity:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// COMPLIANCE CHECKING
// ============================================

// Check transaction compliance
router.post('/check', async (req, res) => {
  try {
    const { fi_id, wallet_id, device_id, amount, tx_type } = req.body;
    
    if (!amount) {
      return res.status(400).json({ error: 'amount is required' });
    }
    
    const result = await checkTransactionCompliance(fi_id, wallet_id, device_id, amount, tx_type);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error checking compliance:', error);
    res.status(500).json({ error: error.message });
  }
});

// Monitor transaction (called by FIs during transaction processing)
router.post('/monitor', async (req, res) => {
  try {
    const result = await monitorTransaction(req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error monitoring transaction:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DASHBOARD
// ============================================

// Get compliance dashboard summary
router.get('/dashboard', async (req, res) => {
  try {
    const dashboard = await getComplianceDashboard();
    res.json({ success: true, dashboard });
  } catch (error) {
    console.error('Error getting compliance dashboard:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
