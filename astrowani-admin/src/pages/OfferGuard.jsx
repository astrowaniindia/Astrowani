import { useEffect, useState } from 'react';
import client from '../api/client';

// Offer abuse guard: stops "delete the account, sign up again, claim the new-customer offer
// again". When an account is deleted, the phone number's offer history is remembered (as a
// scrambled fingerprint, never the number) and later accounts on that number are refused
// the same offers. This page shows how many numbers are remembered and what was blocked.

const OFFER_LABEL = {
  free_call: 'Free 12-minute call',
  free_chat: 'Free 5-minute chat',
  welcome_session: 'Already a real customer (no new-customer offers)',
};

export default function OfferGuard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/api/admin/offer-guard')
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.message || e.message || 'Failed to load.'));
  }, []);

  if (error) return <div className="card" style={{ color: '#c0392b' }}>{error}</div>;
  if (!data) return <div className="muted">Loading…</div>;

  const keys = Object.keys(data.byOffer || {});

  return (
    <div>
      <h1 className="page-title">Offer abuse guard</h1>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        A number that used an offer and then deleted its account cannot use that offer again on a new account.
        Only a scrambled fingerprint of the number is kept, plus the last 4 digits so you can recognise it.
      </p>

      {data.tableMissing && (
        <div className="card" style={{ marginBottom: 12 }}>
          Run <code>sql/offer_guard.sql</code> in the Supabase SQL editor to enable this.
        </div>
      )}

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        {keys.length === 0 && <div className="card muted">No remembered numbers yet.</div>}
        {keys.map((k) => (
          <div key={k} className="card">
            <div className="muted">{OFFER_LABEL[k] || k}</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{data.byOffer[k]}</div>
            <div className="muted">numbers remembered</div>
          </div>
        ))}
        <div className="card">
          <div className="muted">Attempts blocked (30 days)</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{data.blocked30}</div>
        </div>
      </div>

      <h3>Blocked attempts</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>When</th><th>Offer</th><th>New account</th><th>Number ends</th><th>Why</th></tr></thead>
          <tbody>
            {data.blocks.length === 0 && <tr><td colSpan={5} className="empty">Nothing blocked yet.</td></tr>}
            {data.blocks.map((b) => (
              <tr key={b.id}>
                <td className="muted">{new Date(b.created_at).toLocaleString()}</td>
                <td>{OFFER_LABEL[b.offer_key] || b.offer_key}</td>
                <td>{b.customers?.name || '—'}<br /><span className="muted">{b.customers?.mobile || ''}</span></td>
                <td>{b.last4 ? `••••${b.last4}` : '—'}</td>
                <td className="muted">{b.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
