/**
 * Click-map overlay — runs ONLY when a page is opened with ?aw_heatmap=1 inside
 * the admin's Website Analytics -> Click map (astrowani-admin/src/pages/
 * WebsiteHeatmap.jsx). Loaded by boot.js on that condition alone, and analytics
 * is switched off for such a page (analytics.js), so looking at the map never
 * counts as a visit.
 *
 * How it works: the admin fetches the click data with its own login and sends it
 * here with postMessage. This page never asks the backend for anything and never
 * sees a token. Each click group carries the CSS selector analytics.js recorded
 * (ids, classes and positions only), so the marker is pinned to the SAME element
 * at whatever width this frame is — which is why one data set works for the
 * desktop and the phone column alike.
 *
 * Only messages from the admin's own origins are accepted, and every piece of
 * text is set with textContent: nothing received is ever parsed as HTML.
 */

const ADMIN_ORIGINS = ['https://manu.astrowani.com', 'http://localhost:5173', 'http://127.0.0.1:5173'];

const layer = document.createElement('div');
layer.setAttribute('data-aw-heatmap', '');
layer.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:0;pointer-events:none;z-index:2147483000;';

const style = document.createElement('style');
style.textContent = `
  [data-aw-heatmap] .hm-dot { position:absolute; transform:translate(-50%,-50%); border-radius:50%;
    background:radial-gradient(circle, rgba(255,40,40,.55) 0%, rgba(255,140,0,.35) 45%, rgba(255,200,0,0) 70%); }
  [data-aw-heatmap] .hm-tag { position:absolute; transform:translate(-50%,-135%); white-space:nowrap;
    font:700 calc(12px * var(--hm-k, 1))/1.2 system-ui,-apple-system,Segoe UI,sans-serif; color:#fff; background:#b3001b;
    padding:calc(3px * var(--hm-k, 1)) calc(7px * var(--hm-k, 1)); border-radius:999px; box-shadow:0 2px 6px rgba(0,0,0,.35); }
  [data-aw-heatmap] .hm-line { position:absolute; left:0; right:0; border-top:calc(2px * var(--hm-k, 1)) dashed rgba(30,90,200,.85); }
  [data-aw-heatmap] .hm-line span { position:absolute; right:8px; top:calc(-22px * var(--hm-k, 1)); font:700 calc(12px * var(--hm-k, 1))/1.2 system-ui,sans-serif;
    color:#fff; background:rgba(30,90,200,.92); padding:calc(3px * var(--hm-k, 1)) calc(8px * var(--hm-k, 1)); border-radius:6px; }
  html.aw-heatmap-mode *, html.aw-heatmap-mode *::before, html.aw-heatmap-mode *::after { animation:none !important; transition:none !important; }
`;

let payload = null;

function mount() {
  if (!layer.isConnected) {
    document.documentElement.classList.add('aw-heatmap-mode');
    document.head.appendChild(style);
    document.body.appendChild(layer);
    if (getComputedStyle(document.body).position === 'static') document.body.style.position = 'relative';
  }
}

function docHeight() {
  return Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
}

function draw() {
  if (!payload) return;
  mount();
  layer.textContent = '';
  const H = docHeight();
  layer.style.height = `${H}px`;
  const bodyBox = document.body.getBoundingClientRect();
  const max = Math.max(1, ...payload.clicks.map((c) => c.clicks));
  let placed = 0;
  const missing = [];

  for (const c of payload.clicks) {
    let el = null;
    try { el = c.sel ? document.querySelector(c.sel) : null; } catch (_) { el = null; }
    const r = el ? el.getBoundingClientRect() : null;
    let x; let y;
    if (r && r.width > 0 && r.height > 0) {
      x = r.left - bodyBox.left + (c.rx ?? 0.5) * r.width;
      y = r.top - bodyBox.top + (c.ry ?? 0.5) * r.height;
    } else if (typeof c.pageY === 'number') {
      // The element is not on the page any more (or hidden at this width):
      // fall back to how far down the page it was, centred.
      x = document.documentElement.clientWidth / 2;
      y = c.pageY * H;
      missing.push(c);
    } else {
      missing.push(c);
      continue;
    }
    const size = Math.round((26 + 54 * Math.sqrt(c.clicks / max)) * Math.min(2.5, payload.uiScale || 1));
    const dot = document.createElement('div');
    dot.className = 'hm-dot';
    dot.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px;`;
    const tag = document.createElement('div');
    tag.className = 'hm-tag';
    tag.style.cssText = `left:${x}px;top:${y}px;`;
    tag.textContent = `${c.clicks} click${c.clicks === 1 ? '' : 's'}`;
    tag.title = c.label || '';
    layer.append(dot, tag);
    placed += 1;
  }

  // Scroll reach: "x% of visitors got this far". A visitor at depth d had the
  // bottom of their screen at d*(H - vh) + vh, with vh the screen height the
  // admin told us is typical for this column.
  const vh = payload.viewportHeight || window.innerHeight;
  for (const s of payload.scroll || []) {
    const yy = Math.min(H - 2, (s.depth / 100) * Math.max(0, H - vh) + vh);
    const line = document.createElement('div');
    line.className = 'hm-line';
    line.style.top = `${yy}px`;
    const lab = document.createElement('span');
    lab.textContent = `${s.percent}% of visitors scrolled to here (${s.depth}%)`;
    line.appendChild(lab);
    layer.appendChild(line);
  }

  window.parent.postMessage({ type: 'aw-heatmap-drawn', placed, missing: missing.length, height: H }, '*');
}

window.addEventListener('message', (e) => {
  if (!ADMIN_ORIGINS.includes(e.origin)) return;
  const d = e.data;
  if (!d || d.type !== 'aw-heatmap-data' || !Array.isArray(d.clicks)) return;
  payload = {
    clicks: d.clicks.slice(0, 400).map((c) => ({
      sel: typeof c.sel === 'string' ? c.sel.slice(0, 200) : '',
      clicks: Math.max(0, Number(c.clicks) || 0),
      rx: Number.isFinite(+c.rx) ? Math.min(1, Math.max(0, +c.rx)) : 0.5,
      ry: Number.isFinite(+c.ry) ? Math.min(1, Math.max(0, +c.ry)) : 0.5,
      pageY: Number.isFinite(+c.pageY) ? Math.min(1, Math.max(0, +c.pageY)) : null,
      label: typeof c.label === 'string' ? c.label.slice(0, 80) : '',
    })),
    scroll: Array.isArray(d.scroll) ? d.scroll.slice(0, 8).map((s) => ({ depth: +s.depth || 0, percent: +s.percent || 0 })) : [],
    viewportHeight: +d.viewportHeight || 0,
    // The admin shrinks this page to fit its column; labels grow by the same
    // factor so they stay readable. Bounded so a bad value cannot blow them up.
    uiScale: Math.min(4, Math.max(1, +d.uiScale || 1)),
  };
  layer.style.setProperty('--hm-k', String(payload.uiScale));
  draw();
});

// Lazy images, the roster and fonts change the layout after load; redraw on
// those so the markers follow their elements.
let pending = null;
const redraw = () => { clearTimeout(pending); pending = setTimeout(draw, 250); };
window.addEventListener('resize', redraw);
window.addEventListener('load', redraw);
try { new ResizeObserver(redraw).observe(document.body); } catch (_) {}

window.parent.postMessage({ type: 'aw-heatmap-ready' }, '*');
