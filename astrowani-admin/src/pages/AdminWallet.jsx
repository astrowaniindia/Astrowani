import { useEffect, useState } from 'react';
import client from '../api/client';

// The ONE ledger every platform-revenue path lands in: the 50% platform share of
// chat/call/video billing and gifts, plus the 100% platform revenue on astro reports,
// free services and remedy orders (minus referral-commission payouts). Every row here
// is a real admin_wallet_transactions insert — nothing on this page is computed only
// for display, it mirrors exactly what src/wallet.js's adjustAdminWallet wrote.

const SOURCE_LABEL = {
  session_billing: 'Chat / Call / Video billing (50%)',
  gift: 'Gifts (50%)',
  free_call_payout: 'Free intro call payouts',
  free_service: 'Free services (₹1)',
  remedy_order: 'Wani Shop orders',
  'remedy-commission': 'Astrologer referral commission',
  other: 'Other / unlabelled',
};

// Astro reports are tagged with the service's OWN key (kundli, dosh, panchang,
// janam-kundali, horoscope, kundali-match, …) because astroRoutes.js passes the
// catalogue key straight through, and an admin can add a new service at any time.
// So there is no fixed list to map — an unknown key is shown as-is rather than
// hidden behind a wrong label.
const sourceLabel = (k) => SOURCE_LABEL[k] || k || '—';

const fmtMoney = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleString() : '—');

export default function AdminWallet() {
  const [balance, setBalance] = useState(0);
  const [breakdown, setBreakdown] = useState([]);
  // The unfiltered source list, kept so the picker below still offers every source
  // once a filter has narrowed `breakdown` down to the single matching one.
  const [allSources, setAllSources] = useState([]);
  const [truncated, setTruncated] = useState(false);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [type, setType] = useState('');
  const [serviceKey, setServiceKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await client.get('/api/admin/wallet', {
        params: { page, pageSize, type: type || undefined, serviceKey: serviceKey || undefined },
      });
      setBalance(data.balance);
      setBreakdown(data.breakdown || []);
      if (!type && !serviceKey) setAllSources((data.breakdown || []).map((b) => b.serviceKey));
      setTruncated(!!data.truncated);
      setRows(data.transactions || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Failed to load the platform wallet.');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [page, type, serviceKey]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // For a FOLDED consultation row (id "session:<uuid>") this deletes every real
  // admin_wallet_transactions row behind it, not just the one line shown — the backend
  // resolves that (sql/hardening_22_admin_wallet_delete_transactions.sql). Removes the row
  // AND reverses its effect on the balance in one atomic step, so the two can never drift
  // apart. Meant for clearing out test charges, not for disputing a real customer/
  // astrologer transaction — hence the confirm naming the exact amount every time.
  const deleteRow = async (r) => {
    const label = r.folded
      ? `this consultation (${fmtMoney(Math.abs(r.amount))}, every billed minute behind it)`
      : `this ${r.type} of ${fmtMoney(Math.abs(r.amount))}`;
    if (!window.confirm(`Delete ${label} from the Platform Wallet ledger?\n\n"${r.description || '—'}"\n\nThis also reverses it from the balance. This cannot be undone.`)) {
      return;
    }
    setDeletingId(r.id);
    try {
      const { data } = await client.delete(`/api/admin/wallet/${encodeURIComponent(r.id)}`);
      setBalance(data.newBalance ?? balance);
      await load();
    } catch (e) {
      window.alert(e.response?.data?.message || e.message || 'Failed to delete this entry.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <h1 className="page-title">Platform Wallet</h1>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        The platform's own revenue — its 50% share of every chat, call and video-call minute
        billed, plus its 50% share of gifts, and its full share of astro reports, ₹1 free
        services and remedy orders. This is a real, separate ledger (<code>admin_wallet</code> /
        <code> admin_wallet_transactions</code>), not a derived number — every row below is an
        actual credit or debit the backend wrote.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, opacity: 0.7 }}>Current platform balance</div>
        <div style={{ fontSize: 32, fontWeight: 700 }}>{fmtMoney(balance)}</div>
      </div>

      {truncated && (
        <div className="card" style={{ marginBottom: 12, color: '#c0392b' }}>
          The breakdown below is truncated (more than 200,000 matching rows) — totals may
          under-report. Narrow the date range to get an exact figure.
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <b>Revenue by source</b>{' '}
        <span className="muted">(within the filters below, if any are set)</span>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr><th>Source</th><th>Credits</th><th>Debits</th><th>Net</th><th>Count</th></tr>
            </thead>
            <tbody>
              {breakdown.length === 0 && <tr><td colSpan={5} className="empty">Nothing yet.</td></tr>}
              {breakdown.map((b) => (
                <tr key={b.serviceKey}>
                  <td>
                    <button
                      className="btn secondary"
                      style={{ padding: '2px 8px', fontSize: 13 }}
                      onClick={() => { setServiceKey(b.serviceKey === serviceKey ? '' : b.serviceKey); setPage(1); }}
                      title="Filter the ledger below to this source"
                    >
                      {sourceLabel(b.serviceKey)}
                    </button>
                  </td>
                  <td>{fmtMoney(b.credit)}</td>
                  <td>{fmtMoney(b.debit)}</td>
                  <td style={{ fontWeight: 600 }}>{fmtMoney(b.net)}</td>
                  <td>{b.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
          <option value="">Any type</option>
          <option value="credit">Credit</option>
          <option value="debit">Debit</option>
        </select>
        {/* A picker, not a text box. As free text this refetched on EVERY keystroke —
            and each load does a full pagedSelect over admin_wallet_transactions plus
            the session/astrologer lookups, so typing "session_billing" cost 15 full
            scans. Worse, the backend matches the source exactly (.eq), so every
            partial word returned zero rows and the filter looked broken while typing. */}
        <select value={serviceKey} onChange={(e) => { setServiceKey(e.target.value); setPage(1); }}>
          <option value="">Any source</option>
          {allSources.map((k) => (
            <option key={k} value={k}>{sourceLabel(k)}</option>
          ))}
        </select>
        {(type || serviceKey) && (
          <button className="btn secondary" onClick={() => { setType(''); setServiceKey(''); setPage(1); }}>
            Clear filters
          </button>
        )}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>When</th><th>Type</th><th>Source</th><th>Amount</th><th>Customer</th><th>Description</th><th></th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="empty">Loading…</td></tr>}
            {!loading && error && <tr><td colSpan={7} className="empty" style={{ color: '#c0392b' }}>{error}</td></tr>}
            {!loading && !error && rows.length === 0 && <tr><td colSpan={7} className="empty">No transactions match these filters.</td></tr>}
            {!loading && !error && rows.map((r) => (
              <tr key={r.id}>
                <td className="muted">{fmtDate(r.created_at)}</td>
                <td><span className={`badge ${r.type === 'credit' ? 'green' : 'red'}`}>{r.type}</span></td>
                <td>{sourceLabel(r.service_key)}</td>
                <td style={{ fontWeight: 600 }}>{fmtMoney(r.amount)}</td>
                <td>{r.customerName || '—'}</td>
                <td style={{ maxWidth: 380 }}>{r.description || '—'}</td>
                <td>
                  <button
                    className="btn secondary"
                    style={{ padding: '2px 8px', fontSize: 13, color: '#c0392b' }}
                    disabled={deletingId === r.id}
                    onClick={() => deleteRow(r)}
                    title="Delete this entry and reverse it from the balance"
                  >
                    {deletingId === r.id ? '…' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <button className="btn secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="muted">Page {page} of {totalPages} ({total} total)</span>
          <button className="btn secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
