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
const { createClient } = require('@supabase/supabase-js');
const moderation = require('./customerModeration');
const { findCustomerByPhone } = require('./customerLookup');

const JWT_SECRET = process.env.JWT_SECRET;

// Only used to resolve the caller's own customer row from their JWT's phone claim.
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Kept short and specific so the admin can group complaints; free text goes in note.
const REASONS = ['abusive', 'harassment', 'sexual', 'threat', 'spam', 'fraud', 'other'];

/**
 * The customer behind a request, or null.
 *
 * REFUSES AN ASTROLOGER TOKEN OUTRIGHT, before any lookup. One phone number can be
 * both a customer and an astrologer — the store-reviewer account 9999999999 is
 * exactly that — and the lookup below works by phone, so an astrologer's token
 * would otherwise resolve to the customer sharing the number and let them block or
 * unblock in that person's name. Same trap, and the same fix, as
 * /api/requests/:kind/:id/status and /api/notifications/read.
 *
 * The phone claim is preferred over `decoded.userId` for the reason documented on
 * index.js's resolveCustomerFromReq: on older tokens `userId` is a legacy
 * "user_<timestamp>" string rather than a uuid, so every .eq('id', ...) built from
 * it matches nothing.
 */
async function customerFromReq(req) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return null;
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (_) {
    return null;
  }
  if (!decoded) return null;
  if (decoded.role === 'astrologer' || decoded.astroId || decoded.vendorId) return null;

  if (decoded.phone) {
    try {
      const row = await findCustomerByPhone(db, decoded.phone, 'id');
      if (row && row.id) return String(row.id);
    } catch (_) { /* fall through to the id claim */ }
  }
  const id = decoded.userId || decoded.id;
  // A legacy "user_<timestamp>" claim is not a uuid and would match no row.
  return id && String(id).includes('-') ? String(id) : null;
}

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
    // Same as the customer-side block: the consultation ends now, not later.
    const ended = await endLiveSessionBetween(astrologerId, customerId);
    return res.json({ success: true, alreadyBlocked: !!r.alreadyBlocked, sessionEnded: ended > 0 });
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

  // ── Customer-facing: block / unblock an ASTROLOGER ────────────────────────
  //
  // Reporting an astrologer already existed (POST /api/reports -> astrologer_reports).
  // Blocking one did not, anywhere in the app, which is the half Apple's Guideline
  // 1.2 asks for and the half that matters now astrologers can send photographs
  // into a consultation chat.
  //
  // Same one rule as above: the customer id comes from the VERIFIED JWT and never
  // from the body. There is deliberately no /:customerId.


/**
 * End any consultation the two are in RIGHT NOW, because a block was just set.
 *
 * Owner's instruction, 2026-10-26, and it reverses the call made on 2026-10-23. The
 * reasoning then was that a customer might want to finish minutes they had already
 * paid for, so a block governed only FUTURE contact. In practice someone who blocks
 * mid-conversation wants out of THAT conversation, and leaving it open read as the
 * block not working -- which is how it was reported.
 *
 * Best-effort and never throws: the block itself is already written and confirmed to
 * the user by the time this runs, so a failure here must not turn a successful block
 * into an error. The guard added to /api/chat/message, /api/chat/image and
 * /api/vendor/voice-notes refuses anything further regardless, so the worst case is a
 * session that stays open but silent until somebody taps End.
 */
async function endLiveSessionBetween(astrologerId, customerId) {
  try {
    const sessionManager = require('./sessionManager');
    const { data } = await db
      .from('chat_sessions')
      .select('id')
      .eq('vendor_id', astrologerId)
      .eq('caller_id', customerId)
      .is('ended_at', null)
      .eq('is_active', true);
    for (const row of data || []) {
      await sessionManager.terminateSession(row.id, 'Blocked by the other participant');
    }
    return (data || []).length;
  } catch (e) {
    console.error('[moderation] could not end live session after block:', e.message);
    return 0;
  }
}

  app.post('/api/astrologers/block', async (req, res) => {
    const customerId = await customerFromReq(req);
    if (!customerId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { astrologerId, reason } = req.body || {};
    if (!astrologerId) return res.status(400).json({ success: false, message: 'astrologerId is required' });
    if (reason && !REASONS.includes(String(reason))) {
      return res.status(400).json({ success: false, message: 'Unknown reason' });
    }

    const r = await moderation.blockAstrologer(customerId, astrologerId, reason ? String(reason) : null);
    if (!r.ok) {
      return res.status(r.reason === 'NOT_CONFIGURED' ? 503 : 500).json({
        success: false,
        message: r.reason === 'NOT_CONFIGURED'
          ? 'Blocking is not available yet. Please contact support.'
          : 'Could not block this astrologer',
      });
    }
    const ended = await endLiveSessionBetween(astrologerId, customerId);
    return res.json({ success: true, alreadyBlocked: !!r.alreadyBlocked, sessionEnded: ended > 0 });
  });

  app.post('/api/astrologers/unblock', async (req, res) => {
    const customerId = await customerFromReq(req);
    if (!customerId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { astrologerId } = req.body || {};
    if (!astrologerId) return res.status(400).json({ success: false, message: 'astrologerId is required' });

    const r = await moderation.unblockAstrologer(customerId, astrologerId);
    if (!r.ok) {
      return res.status(r.reason === 'NOT_CONFIGURED' ? 503 : 500).json({
        success: false, message: 'Could not unblock this astrologer',
      });
    }
    return res.json({ success: true });
  });

  /** The customer's own blocked list — scoped by the JWT, never a query param. */
  app.get('/api/astrologers/blocked', async (req, res) => {
    const customerId = await customerFromReq(req);
    if (!customerId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const list = await moderation.listBlockedAstrologers(customerId);
    return res.json({ success: true, blocked: list, reasons: REASONS });
  });
};

module.exports.REASONS = REASONS;
