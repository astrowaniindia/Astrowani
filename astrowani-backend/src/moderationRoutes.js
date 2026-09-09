// Vendor-facing moderation endpoints: report a customer, block, unblock, list.
//
// Registered from index.js alongside the other route modules. Kept in its own file
// rather than added to index.js because index.js is already ~5k lines and this is a
// self-contained feature with a single dependency (src/customerModeration.js).
//
// THE ONE RULE, same as accountRoutes.js: the astrologer id comes from the VERIFIED
// JWT and never from the body or a path param. There is deliberately no
// /:astrologerId anywhere here — an endpoint that accepts one is a typo away from
// letting any astrologer block or report on another's behalf.
const jwt = require('jsonwebtoken');
const moderation = require('./customerModeration');

const JWT_SECRET = process.env.JWT_SECRET;

// Kept short and specific so the admin can group complaints; free text goes in note.
const REASONS = ['abusive', 'harassment', 'sexual', 'threat', 'spam', 'fraud', 'other'];

function vendorFromReq(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  try {
    const decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
    const id = decoded.astroId || decoded.vendorId || decoded.id;
    // A customer token carries an id too, so require the astrologer-shaped claim.
    if (!id || !String(id).includes('-')) return null;
    return String(id);
  } catch (_) {
    return null;
  }
}

module.exports = function registerModerationRoutes(app) {
  /**
   * Report a customer for admin review.
   *
   * Reporting does NOT block — they are separate on purpose. An astrologer may want
   * to flag someone without cutting off a paying customer, and may want to block
   * without filing a formal complaint. The app offers both together but the server
   * keeps them independent.
   */
  app.post('/api/vendor/customers/report', async (req, res) => {
    const astrologerId = vendorFromReq(req);
    if (!astrologerId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { customerId, reason, note, alsoBlock } = req.body || {};
    if (!customerId || !reason) {
      return res.status(400).json({ success: false, message: 'customerId and reason are required' });
    }
    if (!REASONS.includes(String(reason))) {
      return res.status(400).json({ success: false, message: 'Unknown reason' });
    }

    const r = await moderation.reportCustomer(astrologerId, customerId, String(reason), note);
    if (!r.ok) {
      return res.status(r.reason === 'NOT_CONFIGURED' ? 503 : 500).json({
        success: false,
        message: r.reason === 'NOT_CONFIGURED'
          ? 'Reporting is not available yet. Please contact support.'
          : 'Could not submit the report',
      });
    }

    // Blocking alongside a report is best-effort: the report is the record that
    // matters and must not be lost because the block failed.
    let blocked = false;
    if (alsoBlock) {
      const b = await moderation.blockCustomer(astrologerId, customerId, String(reason));
      blocked = !!b.ok;
    }
    return res.json({ success: true, blocked });
  });

  app.post('/api/vendor/customers/block', async (req, res) => {
    const astrologerId = vendorFromReq(req);
    if (!astrologerId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { customerId, reason } = req.body || {};
    if (!customerId) return res.status(400).json({ success: false, message: 'customerId is required' });

    const r = await moderation.blockCustomer(astrologerId, customerId, reason);
    if (!r.ok) {
      return res.status(r.reason === 'NOT_CONFIGURED' ? 503 : 500).json({
        success: false,
        message: r.reason === 'NOT_CONFIGURED'
          ? 'Blocking is not available yet. Please contact support.'
          : 'Could not block this customer',
      });
    }
    return res.json({ success: true, alreadyBlocked: !!r.alreadyBlocked });
  });

  app.post('/api/vendor/customers/unblock', async (req, res) => {
    const astrologerId = vendorFromReq(req);
    if (!astrologerId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { customerId } = req.body || {};
    if (!customerId) return res.status(400).json({ success: false, message: 'customerId is required' });

    const r = await moderation.unblockCustomer(astrologerId, customerId);
    if (!r.ok) {
      return res.status(r.reason === 'NOT_CONFIGURED' ? 503 : 500).json({
        success: false, message: 'Could not unblock this customer',
      });
    }
    return res.json({ success: true });
  });

  /** The astrologer's own blocked list — scoped by the JWT, never a query param. */
  app.get('/api/vendor/customers/blocked', async (req, res) => {
    const astrologerId = vendorFromReq(req);
    if (!astrologerId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const list = await moderation.listBlocked(astrologerId);
    return res.json({ success: true, blocked: list, reasons: REASONS });
  });
};

module.exports.REASONS = REASONS;
