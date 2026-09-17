import { useEffect, useMemo, useState } from 'react';
import client from '../api/client';

// "Excluded from analytics" — customers (team phones, testers, the store-reviewer login)
// whose activity every card on the Analytics page leaves out. Stored as a JSON list of
// customer ids in app_settings.analytics_excluded_customers and applied server-side by
// astrowani-backend/src/analyticsExclusions.js. Nothing is deleted: it covers past data
// too, and removing someone brings their numbers back.
const KEY = 'analytics_excluded_customers';

function parseList(raw) {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v.map(String) : [];
  } catch (_) {
    return [];
  }
}

export default function AnalyticsExclusionsCard({ onChanged }) {
  const [ids, setIds] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      client.get('/api/admin/settings'),
      client.get('/api/admin/customers'),
    ])
      .then(([s, c]) => {
        if (cancelled) return;
        setIds(parseList(s.data?.settings?.[KEY]));
        const list = c.data?.data ?? c.data?.customers ?? c.data;
        setCustomers(Array.isArray(list) ? list : []);
      })
      .catch((e) => console.error('load analytics exclusions failed:', e.message))
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  const byId = useMemo(() => new Map(customers.map((c) => [String(c.id), c])), [customers]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    const digits = q.replace(/\D/g, '');
    return customers
      .filter((c) => !ids.includes(String(c.id)))
      .filter((c) => (c.name || '').toLowerCase().includes(q)
        || (digits.length >= 3 && String(c.mobile || '').includes(digits))
        || String(c.id).toLowerCase() === q)
      .slice(0, 8);
  }, [search, customers, ids]);

  const save = async (next) => {
    setBusy(true);
    try {
      await client.patch('/api/admin/settings', { key: KEY, value: JSON.stringify(next) });
      setIds(next);
      setSearch('');
      if (onChanged) await onChanged();
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="row-between">
        <h3 style={{ margin: 0 }}>Excluded from analytics</h3>
        <span className="muted">{ids.length} customer{ids.length === 1 ? '' : 's'}</span>
      </div>
      <p className="muted" style={{ margin: '6px 0 12px' }}>
        Leave your own phones, testers and the store-reviewer login out of every card on this page,
        past data included. Nothing is deleted — remove someone and their numbers come back.
      </p>

      <div style={{ position: 'relative', maxWidth: 420 }}>
        <input
          type="text"
          placeholder={loaded ? 'Search customer by name or mobile…' : 'Loading customers…'}
          value={search}
          disabled={!loaded || busy}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%' }}
        />
        {matches.length > 0 && (
          <div
            style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
              boxShadow: 'var(--shadow-xl)', overflow: 'hidden',
            }}
          >
            {matches.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={busy}
                onClick={() => save([...ids, String(c.id)])}
                style={{
                  display: 'flex', justifyContent: 'space-between', width: '100%', gap: 10,
                  padding: '9px 12px', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span>{c.name || 'Unnamed'}</span>
                <span className="muted">{c.mobile || '—'} · Exclude</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {ids.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          {ids.map((id) => {
            const c = byId.get(id);
            return (
              <span
                key={id}
                className="pill-badge"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 10px' }}
                title={id}
              >
                {c ? `${c.name || 'Unnamed'} · ${c.mobile || '—'}` : `Deleted customer ${id.slice(0, 8)}`}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => save(ids.filter((x) => x !== id))}
                  aria-label="Remove from exclusions"
                  style={{ border: 0, background: 'transparent', cursor: 'pointer', fontWeight: 700, padding: 0 }}
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
