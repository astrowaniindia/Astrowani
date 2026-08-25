/* Local dev harness for astrowani-shop.
   Serves the static storefront with the SAME try_files fallback nginx uses, and mounts the
   real order routes so /api/store/config, /quote and /checkout answer for real.
   Deliberately does NOT require astrowani-backend/index.js — that boots sessionManager's
   billing worker and checkEarningsResets() against the LIVE database. */
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

// Node 20 has no global WebSocket, and @supabase/realtime-js throws at import time without
// one. The VPS runs Node 22 where this is native; locally the shim is what lets any script
// that requires a Supabase client boot at all. See the local-backend-bills-production note.
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = require(path.join(ROOT, 'astrowani-backend/node_modules/ws'));
}
const fs = require('fs');
const express = require(path.join(ROOT, 'astrowani-backend/node_modules/express'));

const SHOP = path.join(ROOT, 'astrowani-shop');
const app = express();
app.use(express.json());

/* Dev-only ordering override.
   The per-category ordering gate lives in app_settings, which is PRODUCTION data - the
   same row the live shop reads. Flipping it to test the puja checkout locally would turn
   pujas on for real customers for as long as the test ran. This intercepts the config
   response instead, so the local page can be told "pujas are orderable" without anything
   in the database changing.
     SHOP_DEV_FORCE_ORDERING=puja,specific_puja node --env-file=... shop-dev-server.js
   Never set on the VPS; this file is not deployed. */
const FORCE_ORDERING = (process.env.SHOP_DEV_FORCE_ORDERING || '').split(',').map(s => s.trim()).filter(Boolean);
if (FORCE_ORDERING.length) {
  app.use('/api/store/config', (req, res, next) => {
    const send = res.json.bind(res);
    res.json = (body) => {
      if (body && body.ordering) FORCE_ORDERING.forEach((t) => { body.ordering[t] = true; });
      console.log('[dev] forcing ordering on for:', FORCE_ORDERING.join(', '));
      return send(body);
    };
    next();
  });
}

process.chdir(path.join(ROOT, 'astrowani-backend'));
require(path.join(ROOT, 'astrowani-backend/src/orderRoutes'))(app);

// Read-only catalogue straight from remedy_items, same shape as index.js's /api/remedies.
const { createClient } = require(path.join(ROOT, 'astrowani-backend/node_modules/@supabase/supabase-js'));
const db = createClient(process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY);
app.get('/api/remedies', async (req, res) => {
  const { data, error } = await db.from('remedy_items').select('*').eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) return res.status(200).json({ data: [] });
  const mapped = (data || []).map((r) => ({
    _id: r.id, type: r.type, title: r.title, description: r.description, price: r.price,
    image: r.image, mrp: r.mrp, unitLabel: r.unit_label,
    inStock: r.stock == null ? true : r.stock > 0,
  }));
  res.json({ data: FAKE_VASTU ? mapped.concat(FAKE_VASTU_ROWS) : mapped });
});

/* Dev-only synthetic catalogue rows.
   A brand-new product type has no rows in production yet, so the listing that renders it
   cannot be proved by looking at the live catalogue - the grid is empty either because it
   works and there is nothing to show, or because it is broken. This injects a few rows into
   the /api/remedies response ONLY, changing nothing in the database.
     SHOP_DEV_FAKE_VASTU=1 node --env-file=... shop-dev-server.js
   Never set on the VPS; this file is not deployed. */
const FAKE_VASTU = process.env.SHOP_DEV_FAKE_VASTU === '1';
const FAKE_VASTU_ROWS = [
  { _id: 'dev-vastu-1', type: 'vastu', title: 'Clear Quartz Crystal Cluster', description: 'A raw cluster for the north-east.', price: 1450, mrp: 1999, image: null, unitLabel: '4 inch', inStock: true },
  { _id: 'dev-vastu-2', type: 'vastu', title: 'Copper Helix for South-East Vastu Dosh', description: 'Three-piece set with a placement guide.', price: 1800, mrp: 2999, image: null, unitLabel: '3 pcs', inStock: true },
  { _id: 'dev-vastu-3', type: 'vastu', title: 'Zinc Pyramid for North-East Corner Cut', description: 'Ishanya correction.', price: 500, mrp: 999, image: null, unitLabel: '2 inch', inStock: true },
  { _id: 'dev-vastu-4', type: 'vastu', title: 'Laughing Buddha Feng Shui Showpiece', description: 'For the entrance.', price: 899, mrp: null, image: null, unitLabel: null, inStock: true },
  { _id: 'dev-vastu-5', type: 'vastu', title: 'Brass Tortoise Handicraft Gift Set', description: 'Handmade brass.', price: 1200, mrp: null, image: null, unitLabel: null, inStock: true },
];

app.use(express.static(SHOP, { extensions: [] }));
app.get('*', (req, res) => {
  const direct = path.join(SHOP, req.path);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return res.sendFile(direct);
  const asDir = path.join(SHOP, req.path, 'index.html');
  if (fs.existsSync(asDir)) return res.sendFile(asDir);
  res.sendFile(path.join(SHOP, 'index.html'));   // try_files ... /index.html
});

app.listen(4599, () => console.log('shop dev server on http://localhost:4599'));
