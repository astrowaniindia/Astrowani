import { useCallback, useEffect, useMemo, useState } from 'react';
import client from '../api/client';

// Recharge bonus offers — "add ₹500, get ₹50 extra".
//
// Saves one app_settings key (recharge_offer) through the existing generic settings PATCH,
// so there is no bespoke backend route behind this page. The backend re-derives every
// figure from the same config when it credits, and clamps it again there: nothing typed
// here is trusted as-is. See astrowani-backend/src/rechargeOffer.js.
const SETTINGS_KEY = 'recharge_offer';
const MAX_SLABS = 10;

const blankSlab = () => ({ minAmount: '', type: 'percent', value: '', maxBonus: '' });

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export default function RechargeOffers() {
  const [enabled, setEnabled] = useState(false);
  const [slabs, setSlabs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await client.get('/api/admin/settings');
      const raw = data.settings?.[SETTINGS_KEY];
      const parsed = raw ? JSON.parse(raw) : {};
      setEnabled(parsed.enabled === true || parsed.enabled === 'true');
      setSlabs(
        (Array.isArray(parsed.slabs) ? parsed.slabs : [])
          .slice()
          .sort((a, b) => num(a.minAmount) - num(b.minAmount))
          .map((s) => ({
            minAmount: String(s.minAmount ?? ''),
            type: s.type === 'flat' ? 'flat' : 'percent',
            value: String(s.value ?? ''),
            maxBonus: s.maxBonus ? String(s.maxBonus) : '',
          })),
      );
      setLoaded(true);
    } catch (e) {
      console.error('load recharge_offer failed:', e.message);
      // Deliberately leaves `loaded` false — the Save button is disabled until we know
      // what is currently configured, so a failed load cannot overwrite a live offer
      // with this page's empty defaults.
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const cleanSlabs = useMemo(
    () => slabs
      .filter((s) => num(s.minAmount) >= 1 && num(s.value) > 0)
      .map((s) => ({
        minAmount: Math.floor(num(s.minAmount)),
        type: s.type === 'flat' ? 'flat' : 'percent',
        value: num(s.value),
        ...(num(s.maxBonus) > 0 ? { maxBonus: num(s.maxBonus) } : {}),
      })),
    [slabs],
  );

  // Mirrors resolveBonus() on the server so the preview cannot promise something the
  // backend would not actually credit.
  const previewBonus = (amount) => {
    const slab = cleanSlabs
      .slice()
      .sort((a, b) => b.minAmount - a.minAmount)
      .find((s) => amount >= s.minAmount);
    if (!slab) return 0;
    let b = slab.type === 'percent' ? (amount * Math.min(slab.value, 100)) / 100 : slab.value;
    if (slab.maxBonus > 0) b = Math.min(b, slab.maxBonus);
    b = Math.min(b, amount);
    return Math.round(b * 100) / 100;
  };

  const save = async () => {
    if (enabled && cleanSlabs.length === 0) {
      alert('Add at least one slab, or switch the offer off.');
      return;
    }
    const overlap = cleanSlabs.map((s) => s.minAmount);
    if (new Set(overlap).size !== overlap.length) {
      alert('Two slabs start at the same amount. Give each one a different "recharge at least".');
      return;
    }
    setSaving(true);
    setSaved(false);
    try {
      await client.patch('/api/admin/settings', {
        key: SETTINGS_KEY,
        value: JSON.stringify({ enabled, slabs: cleanSlabs }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    } finally {
      setSaving(false);
    }
  };

  const setSlab = (i, patch) =>
    setSlabs((p) => p.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  return (
    <div>
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700 }}>Recharge bonus offers</h3>
        <p className="muted" style={{ margin: '0 0 16px', fontSize: 13 }}>
          Give customers extra wallet credit when they top up. They still pay the full amount
          through Razorpay — we credit more than they paid, so the extra is only spendable
          inside the app. Takes effect immediately; no app update needed.
        </p>

        <label
          style={{
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
            fontSize: 15, fontWeight: 700, marginBottom: 4,
          }}
        >
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Offer is live
        </label>
        <p className="muted" style={{ margin: '0 0 8px 26px', fontSize: 12 }}>
          Switch this off to stop all recharge bonuses at once. Recharges already paid are
          unaffected — what a payment was worth is decided when it is made.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>Slabs</h3>
        <p className="muted" style={{ margin: '0 0 16px', fontSize: 13 }}>
          Only <strong>one</strong> slab applies to a recharge — the highest one the customer
          reaches. They do not stack. A ₹1,200 recharge with slabs at ₹500 and ₹1,000 gets the
          ₹1,000 one.
        </p>

        {slabs.length === 0 && (
          <p className="muted" style={{ fontSize: 13, margin: '0 0 12px' }}>
            No slabs yet. Add one below.
          </p>
        )}

        {slabs.map((s, i) => (
          <div
            key={i}
            style={{
              display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end',
              padding: 12, marginBottom: 10, border: '1px solid var(--border)', borderRadius: 8,
            }}
          >
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Recharge at least (₹)
              </label>
              <input
                type="number" min="1" value={s.minAmount} style={{ width: 130 }}
                onChange={(e) => setSlab(i, { minAmount: e.target.value })}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Bonus type
              </label>
              <select
                value={s.type} style={{ width: 150 }}
                onChange={(e) => setSlab(i, { type: e.target.value })}
              >
                <option value="percent">Percentage</option>
                <option value="flat">Fixed amount</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                {s.type === 'percent' ? 'Bonus %' : 'Bonus ₹'}
              </label>
              <input
                type="number" min="1" max={s.type === 'percent' ? 100 : undefined}
                value={s.value} style={{ width: 110 }}
                onChange={(e) => setSlab(i, { value: e.target.value })}
              />
            </div>
            {s.type === 'percent' && (
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  Max bonus ₹ (optional)
                </label>
                <input
                  type="number" min="0" value={s.maxBonus} style={{ width: 150 }}
                  placeholder="no cap"
                  onChange={(e) => setSlab(i, { maxBonus: e.target.value })}
                />
              </div>
            )}
            <button
              className="btn secondary sm"
              onClick={() => setSlabs((p) => p.filter((_, idx) => idx !== i))}
            >
              Remove
            </button>
          </div>
        ))}

        <button
          className="btn secondary sm"
          disabled={slabs.length >= MAX_SLABS}
          onClick={() => setSlabs((p) => [...p, blankSlab()])}
        >
          + Add slab
        </button>
        {slabs.length >= MAX_SLABS && (
          <span className="muted" style={{ fontSize: 12, marginLeft: 10 }}>
            Maximum {MAX_SLABS} slabs.
          </span>
        )}

        <p className="muted" style={{ margin: '16px 0 0', fontSize: 12 }}>
          A bonus can never exceed the recharge itself, and a percentage is capped at 100%,
          whatever is typed here — so a slipped keystroke cannot hand out ten times the top-up.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>What customers get</h3>
        <p className="muted" style={{ margin: '0 0 14px', fontSize: 13 }}>
          Worked through the same rules the server uses when it credits.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>They pay</th><th>Bonus</th><th>Wallet gets</th></tr>
            </thead>
            <tbody>
              {[100, 200, 500, 1000, 2000, 5000].map((amt) => {
                const b = enabled ? previewBonus(amt) : 0;
                return (
                  <tr key={amt}>
                    <td>₹{amt}</td>
                    <td style={{ color: b > 0 ? '#16a34a' : 'inherit', fontWeight: b > 0 ? 600 : 400 }}>
                      {b > 0 ? `+₹${b}` : '—'}
                    </td>
                    <td><strong>₹{amt + b}</strong></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!enabled && (
          <p className="muted" style={{ margin: '12px 0 0', fontSize: 12 }}>
            The offer is switched off, so nobody is getting a bonus right now.
          </p>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          className="btn"
          disabled={saving || !loaded}
          onClick={save}
          style={{ minWidth: 170, fontWeight: 700 }}
        >
          {saving ? 'Saving…' : 'Save offer'}
        </button>
        {saved && <span style={{ color: '#16a34a', fontWeight: 600, fontSize: 13 }}>Saved</span>}
        {!loaded && <span className="muted" style={{ fontSize: 12 }}>Loading current offer…</span>}
      </div>
    </div>
  );
}
