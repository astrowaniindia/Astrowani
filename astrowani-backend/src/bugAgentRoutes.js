// ─────────────────────────────────────────────────────────────────────────────
// Single read-only endpoint for the autonomous bug-scanning agent. Deliberately
// NOT gated by requireAdmin (adminRoutes.js) — that JWT can reach wallet/billing
// writes, and the scanning agent should never hold a credential capable of that,
// even indirectly. This route only ever reads the error log.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const { LOG_FILE } = require('./errorLogger');

function requireBugAgentToken(req, res, next) {
  const expected = process.env.BUG_AGENT_TOKEN;
  if (!expected) {
    return res.status(503).json({ success: false, message: 'Bug agent access not configured' });
  }
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (token !== expected) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  next();
}

module.exports = function registerBugAgentRoutes(app) {
  app.get('/api/bug-agent/errors', requireBugAgentToken, (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
    let lines = [];
    try {
      lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter(Boolean);
    } catch (_) {
      lines = [];
    }
    const entries = lines.slice(-limit).map((l) => {
      try { return JSON.parse(l); } catch (_) { return { raw: l }; }
    }).reverse();
    return res.json({ success: true, entries });
  });
};
