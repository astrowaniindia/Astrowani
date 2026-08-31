// Per-weight pricing for one shop item.
//
// A gemstone does not have a single price: a 5 ratti Neelam and an 8 ratti Neelam
// are the same stone at very different money. These rows are what the WhatsApp
// assistant quotes from, and it is forbidden to state a price it has not read —
// so a weight that is not entered here simply cannot be sold.
//
// An item with no rows keeps its single price on the parent form, which is what
// every puja and vastu item wants. Nothing here is required.
import { useCallback, useEffect, useState } from 'react';
import client from '../api/client';

const EMPTY = { label: '', ratti: '', price: '', mrp: '', stock: '', is_active: true };

export default function VariantEditor({ itemId, itemTitle }) {
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tableMissing, setTableMissing] = useState(false);

  const load = useCallback(async () => {
    if (!itemId) return;
    try {
      const { data } = await client.get(`/api/admin/remedies/${itemId}/variants`);
      setRows(data.variants || []);
      setTableMissing(!!data.tableMissing);
    } catch (e) {
      setError(e.response?.data?.message || e.message);
    }
  }, [itemId]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    setError('');
    if (!draft.label.trim()) { setError('Give the weight a name, e.g. "5 ratti".'); return; }
    if (draft.price === '' || Number.isNaN(Number(draft.price))) { setError('Enter a price.'); return; }
    setBusy(true);
    try {
      await client.post(`/api/admin/remedies/${itemId}/variants`, {
        ...draft,
        // Nudge each new row to the end; the admin can reorder by editing.
        sort_order: rows.length,
      });
      setDraft({ ...EMPTY });
      load();
    } catch (e) {
      setError(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  const patch = async (id, field, value) => {
    try {
      await client.patch(`/api/admin/remedy-variants/${id}`, { [field]: value });
      load();
    } catch (e) {
      setError(e.response?.data?.message || e.message);
      load(); // put the row back to what the server actually holds
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Remove "${row.label}" from ${itemTitle}?`)) return;
    try {
      await client.delete(`/api/admin/remedy-variants/${row.id}`);
      load();
    } catch (e) {
      setError(e.response?.data?.message || e.message);
    }
  };

  if (!itemId) {
    return (
      <div className="muted" style={{ fontSize: 13 }}>
        Save the item first, then you can add its weights.
      </div>
    );
  }

  return (
    <div className="field" style={{ marginTop: 8 }}>
      <label>Weights &amp; prices</label>

      {tableMissing && (
        <div className="card" style={{ borderLeft: '4px solid #e67e22', marginBottom: 10 }}>
          <strong>Not set up yet.</strong>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Run <code>sql/whatsapp_shop_schema.sql</code> in Supabase to enable per-weight pricing.
          </p>
        </div>
      )}

      <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
        Leave this empty if the item has one price. Add a row per ratti for a gemstone —
        the WhatsApp assistant can only quote weights that are listed here.
      </div>

      {error && <div className="muted" style={{ color: '#c0392b', marginBottom: 8 }}>{error}</div>}

      {rows.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Weight</th><th>Ratti</th><th>Price</th><th>MRP</th><th>Stock</th><th>Live</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input
                      defaultValue={r.label}
                      onBlur={(e) => e.target.value !== r.label && patch(r.id, 'label', e.target.value)}
                      style={{ width: 110 }}
                    />
                  </td>
                  <td>
                    <input
                      type="number" step="0.25" defaultValue={r.ratti ?? ''}
                      onBlur={(e) => patch(r.id, 'ratti', e.target.value)}
                      style={{ width: 80 }}
                    />
                  </td>
                  <td>
                    <input
                      type="number" defaultValue={r.price}
                      onBlur={(e) => Number(e.target.value) !== Number(r.price) && patch(r.id, 'price', e.target.value)}
                      style={{ width: 100 }}
                    />
                  </td>
                  <td>
                    <input
                      type="number" defaultValue={r.mrp ?? ''}
                      onBlur={(e) => patch(r.id, 'mrp', e.target.value)}
                      style={{ width: 100 }}
                    />
                  </td>
                  <td>
                    <input
                      type="number" defaultValue={r.stock ?? ''} placeholder="∞"
                      onBlur={(e) => patch(r.id, 'stock', e.target.value)}
                      style={{ width: 80 }}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox" checked={r.is_active !== false}
                      onChange={(e) => patch(r.id, 'is_active', e.target.checked)}
                    />
                  </td>
                  <td>
                    <button className="btn secondary sm" onClick={() => remove(r)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="two-col" style={{ marginTop: 10, alignItems: 'end' }}>
        <div className="field" style={{ margin: 0 }}>
          <label>Weight</label>
          <input
            value={draft.label} placeholder="5 ratti"
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
          />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Price (Rs.)</label>
          <input
            type="number" value={draft.price} placeholder="11000"
            onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
          />
        </div>
      </div>
      <div className="two-col" style={{ marginTop: 8, alignItems: 'end' }}>
        <div className="field" style={{ margin: 0 }}>
          <label>Ratti (number, optional)</label>
          <input
            type="number" step="0.25" value={draft.ratti} placeholder="5"
            onChange={(e) => setDraft((d) => ({ ...d, ratti: e.target.value }))}
          />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Stock (blank = unlimited)</label>
          <input
            type="number" value={draft.stock} placeholder="∞"
            onChange={(e) => setDraft((d) => ({ ...d, stock: e.target.value }))}
          />
        </div>
      </div>
      <button className="btn sm" style={{ marginTop: 10 }} disabled={busy} onClick={add}>
        {busy ? 'Adding…' : '+ Add this weight'}
      </button>
    </div>
  );
}
