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
  res.json({ data: (data || []).map((r) => ({
    _id: r.id, type: r.type, title: r.title, description: r.description, price: r.price,
    image: r.image, mrp: r.mrp, unitLabel: r.unit_label,
    inStock: r.stock == null ? true : r.stock > 0,
  })) });
});

app.use(express.static(SHOP, { extensions: [] }));
app.get('*', (req, res) => {
  const direct = path.join(SHOP, req.path);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return res.sendFile(direct);
  const asDir = path.join(SHOP, req.path, 'index.html');
  if (fs.existsSync(asDir)) return res.sendFile(asDir);
  res.sendFile(path.join(SHOP, 'index.html'));   // try_files ... /index.html
});

app.listen(4599, () => console.log('shop dev server on http://localhost:4599'));
