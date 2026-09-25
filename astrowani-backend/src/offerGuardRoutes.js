// astrowani-backend/src/offerGuardRoutes.js
//
// Admin view of the offer abuse guard (src/offerGuard.js): how many phone numbers are
// remembered per offer, and the attempts that were stopped. Read-only.

const { createClient } = require('@supabase/supabase-js');

const db = createClient(
  process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const isMissingTable = (e) => ['PGRST205', '42P01'].includes(String(e?.code || ''));

module.exports = function registerOfferGuardRoutes(app) {
  const { requireAdmin } = require('./adminRoutes');

  app.get('/api/admin/offer-guard', requireAdmin, async (req, res) => {
    try {
      const { data: claims, error } = await db.from('offer_claims')
        .select('offer_key, last4, source, created_at').order('created_at', { ascending: false }).limit(5000);
      if (error) {
        if (isMissingTable(error)) return res.json({ success: true, tableMissing: true, byOffer: {}, blocks: [], recentClaims: [] });
        throw error;
      }
      const byOffer = {};
      for (const c of claims || []) byOffer[c.offer_key] = (byOffer[c.offer_key] || 0) + 1;

      const { data: blocks } = await db.from('offer_blocks')
        .select('id, offer_key, reason, last4, created_at, customers(name, mobile)')
        .order('created_at', { ascending: false }).limit(100);

      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const { count: blocked30 } = await db.from('offer_blocks')
        .select('id', { count: 'exact', head: true }).gte('created_at', since);

      return res.json({
        success: true,
        byOffer,
        blocked30: blocked30 || 0,
        blocks: blocks || [],
        recentClaims: (claims || []).slice(0, 30),
      });
    } catch (e) {
      console.error('[offer-guard] admin list failed:', e.message);
      return res.status(500).json({ success: false, message: 'Request failed' });
    }
  });
};
