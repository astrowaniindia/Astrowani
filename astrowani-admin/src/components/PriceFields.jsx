// Three linked price inputs: MRP, discount %, and the selling price. Edit any one and the
// others follow, because the natural way to think about this is "give 20% off" while the
// DB stores what the customer actually pays.
//
// The discount is NOT stored. It is always derived from mrp vs price, so there is exactly
// one source of truth — a stored percentage would silently drift out of step the moment
// someone edited either price directly, and then the card and the admin would disagree
// about the same item.
//
// Shared by Remedies.jsx and StoreProducts.jsx — both manage rows in the same
// `remedy_items` table, just filtered to different `type` values.
export default function PriceFields({ price, mrp, onChange }) {
  const p = Number(price) || 0;
  const m = Number(mrp) || 0;
  const hasDiscount = m > p && p > 0;
  const pct = hasDiscount ? Math.round(((m - p) / m) * 100) : 0;

  // Typing a discount % sets the SELLING price from the MRP (rather than raising the MRP),
  // because MRP is the fixed, printed number and the sale price is the lever being pulled.
  const applyPct = (raw) => {
    const next = Math.max(0, Math.min(99, Number(raw) || 0));
    if (!m) return; // No MRP to discount from — leave price alone rather than zero it.
    onChange({ price: Math.round(m * (1 - next / 100)) });
  };

  return (
    <>
      <div className="two-col">
        <div className="field">
          <label>MRP (₹) — the struck-through "was" price</label>
          <input
            type="number"
            value={mrp ?? ''}
            onChange={(e) => onChange({ mrp: e.target.value })}
            placeholder="Blank = no discount badge"
          />
        </div>
        <div className="field">
          <label>Discount %</label>
          <input
            type="number"
            value={hasDiscount ? pct : ''}
            onChange={(e) => applyPct(e.target.value)}
            placeholder={m ? 'e.g. 20' : 'Set an MRP first'}
            disabled={!m}
          />
        </div>
      </div>

      <div className="field">
        <label>Selling price (₹) — what the customer actually pays</label>
        <input type="number" value={price} onChange={(e) => onChange({ price: e.target.value })} />
      </div>

      {/* Live preview of the exact three figures the app will render, so a mistake is
          obvious here instead of on a customer's phone. */}
      <div className="card" style={{ margin: '0 0 12px', padding: 12, background: 'rgba(0,0,0,0.03)' }}>
        {p <= 0 ? (
          <span className="muted">Enter a selling price to see how the card will look.</span>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="muted">Customer sees:</span>
            <b style={{ fontSize: 17 }}>₹{p}</b>
            {hasDiscount ? (
              <>
                <span className="muted" style={{ textDecoration: 'line-through' }}>₹{m}</span>
                <span className="badge green">{pct}% OFF</span>
                <span style={{ color: '#2E7D32', fontWeight: 600 }}>Save ₹{m - p}</span>
              </>
            ) : (
              <span className="muted">no discount badge</span>
            )}
          </div>
        )}
        {m > 0 && m <= p ? (
          <div style={{ marginTop: 8 }}>
            <span className="badge red">MRP is not above the selling price</span>{' '}
            <span className="muted">— no badge will show. Raise the MRP or lower the price.</span>
          </div>
        ) : null}
      </div>
    </>
  );
}

// Blank / missing / non-numeric → null, so an empty box clears the column rather than
// writing 0 (which would mean something quite different for both mrp and stock).
export function numOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
