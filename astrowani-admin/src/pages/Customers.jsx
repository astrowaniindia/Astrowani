import { useEffect, useState, useMemo } from 'react';
import client from '../api/client';
import Modal from '../components/Modal';

// Date-range filter options
const DATE_FILTERS = [
  { key: 'all', label: 'All Customers' },
  { key: 'today', label: 'Joined Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function inRange(created, filter) {
  if (filter === 'all') return true;
  if (!created) return false;
  const c = new Date(created);
  const now = new Date();
  const today = startOfDay(now);
  if (filter === 'today') return c >= today;
  if (filter === 'yesterday') {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    return c >= y && c < today;
  }
  if (filter === 'week') {
    const w = new Date(today);
    w.setDate(w.getDate() - 6); // last 7 days incl. today
    return c >= w;
  }
  if (filter === 'month') {
    const m = new Date(now.getFullYear(), now.getMonth(), 1);
    return c >= m;
  }
  return true;
}

function isRecent(created, hours = 48) {
  if (!created) return false;
  const diffMs = new Date() - new Date(created);
  return diffMs >= 0 && diffMs < hours * 60 * 60 * 1000;
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return diffHour === 1 ? '1 hour ago' : `${diffHour}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getInitials(name) {
  if (!name || typeof name !== 'string') return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Customers() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [timeFilter, setTimeFilter] = useState('all');
  const [topup, setTopup] = useState(null); // customer being topped up
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletedCount, setDeletedCount] = useState(0);
  const [inspecting, setInspecting] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const load = async (withDeleted = showDeleted) => {
    setLoading(true);
    try {
      const { data } = await client.get('/api/admin/customers', {
        params: withDeleted ? { includeDeleted: '1' } : {},
      });
      setRows(data.data || []);
      setDeletedCount(data.deletedCount || 0);
    } catch (e) {
      console.error('Failed to load customers:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(showDeleted);
  }, [showDeleted]);

  const copyText = (txt, id) => {
    if (!txt || txt === '—') return;
    navigator.clipboard.writeText(txt);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const metrics = useMemo(() => {
    const active = rows.filter((r) => !r.isDeleted);
    const today = active.filter((r) => inRange(r.created_at, 'today')).length;
    const week = active.filter((r) => inRange(r.created_at, 'week')).length;
    const month = active.filter((r) => inRange(r.created_at, 'month')).length;
    return {
      total: active.length,
      today,
      week,
      month,
    };
  }, [rows]);

  const tabCounts = useMemo(() => {
    const counts = {};
    const list = showDeleted ? rows : rows.filter((r) => !r.isDeleted);
    for (const f of DATE_FILTERS) {
      counts[f.key] = list.filter((r) => inRange(r.created_at, f.key)).length;
    }
    return counts;
  }, [rows, showDeleted]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (!inRange(r.created_at, timeFilter)) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase().trim();
      const name = (r.name || '').toLowerCase();
      const mobile = (r.mobile || '').toLowerCase();
      const email = (r.email || '').toLowerCase();
      const id = String(r.id || '').toLowerCase();
      return name.includes(q) || mobile.includes(q) || email.includes(q) || id.includes(q);
    });
  }, [rows, timeFilter, search]);

  const submitTopup = async () => {
    const amt = Number(amount);
    if (!amt) return;
    setBusy(true);
    try {
      await client.post(`/api/admin/customers/${topup.id}/wallet`, { amount: amt });
      setTopup(null);
      setAmount('');
      await load();
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r) => {
    const label = r.name || r.mobile;
    if (
      !confirm(
        `Delete ${label}? This cannot be undone.\n\nIf they have session or wallet history, the database won't allow permanently deleting them — instead their phone number will be freed up (so it can be used to sign up again) and the account hidden everywhere in the app.`
      )
    )
      return;
    setBusy(true);
    try {
      const { data } = await client.delete(`/api/admin/customers/${r.id}`);
      if (data.mode === 'deleted') {
        alert(`${label} was permanently deleted.`);
      } else {
        alert(
          `${label} has session or wallet history, so the account could not be permanently deleted — the money trail has to survive.\n\nIt has been removed from this list and its phone number freed up for re-signup. Tick "Show deleted accounts" if you ever need to find it again.`
        );
      }
      await load();
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  const exportCSV = () => {
    const headers = ['ID', 'Name', 'Mobile', 'Email', 'Wallet Balance (INR)', 'Joined At', 'Status'];
    const lines = filteredRows.map((r) => [
      r.id,
      `"${(r.name || '').replace(/"/g, '""')}"`,
      `"${r.isDeleted ? 'Freed' : r.mobile || ''}"`,
      `"${(r.email || '').replace(/"/g, '""')}"`,
      r.wallet_balance ?? 0,
      r.created_at ? new Date(r.created_at).toISOString() : '',
      r.isDeleted ? 'Deleted' : 'Active',
    ]);
    const csv = [headers.join(','), ...lines.map((l) => l.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `astrowani-customers-${timeFilter}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div style={{ maxWidth: 1320 }}>
      {/* ── Page Header ── */}
      <div className="page-header">
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: 'var(--maroon)', background: 'var(--maroon-50)', padding: '3px 10px', borderRadius: 20, marginBottom: 8 }}>
            <span>👥</span> USER MANAGEMENT & ONBOARDING
          </div>
          <h1 className="page-title" style={{ margin: '0 0 6px' }}>Customer Tracking</h1>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>
            Real-time tracking of new customer app signups, wallet balances, and contact details.
          </p>
        </div>
        <div className="btn-group">
          <button className="btn secondary sm" onClick={() => load()} title="Reload customer list">
            <span>🔄</span> Refresh
          </button>
          <button className="btn ghost sm" onClick={exportCSV} title="Export filtered customers to CSV">
            <span>📥</span> Export CSV
          </button>
        </div>
      </div>

      {/* ── Real-Time Signup KPIs ── */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', marginBottom: 24 }}>
        <div className="stat" style={{ cursor: 'pointer' }} onClick={() => setTimeFilter('all')}>
          <div className="stat-header">
            <span className="label">Total Customers</span>
            <div className="stat-icon-wrap" style={{ background: 'var(--maroon-50)', color: 'var(--maroon)' }}>👥</div>
          </div>
          <div className="value">{loading ? '…' : metrics.total.toLocaleString('en-IN')}</div>
          <div className="stat-footer">
            <span className="muted">Active registered accounts</span>
          </div>
        </div>

        <div className="stat" style={{ cursor: 'pointer', borderColor: timeFilter === 'today' ? 'var(--emerald)' : undefined }} onClick={() => setTimeFilter('today')}>
          <div className="stat-header">
            <span className="label" style={{ color: 'var(--emerald)', fontWeight: 700 }}>Joined Today</span>
            <div className="stat-icon-wrap" style={{ background: '#ecfdf5', color: '#059669' }}>
              <span className="pulse-dot" style={{ display: 'inline-block' }} />
            </div>
          </div>
          <div className="value" style={{ color: 'var(--emerald)' }}>
            {loading ? '…' : `+${metrics.today}`}
          </div>
          <div className="stat-footer">
            <span className="pill-badge green">✨ New Signups Today</span>
          </div>
        </div>

        <div className="stat" style={{ cursor: 'pointer', borderColor: timeFilter === 'week' ? 'var(--maroon)' : undefined }} onClick={() => setTimeFilter('week')}>
          <div className="stat-header">
            <span className="label">Joined This Week</span>
            <div className="stat-icon-wrap" style={{ background: '#eff6ff', color: '#1d4ed8' }}>📅</div>
          </div>
          <div className="value">{loading ? '…' : `+${metrics.week}`}</div>
          <div className="stat-footer">
            <span className="muted">Past 7 days onboarded</span>
          </div>
        </div>

        <div className="stat" style={{ cursor: 'pointer', borderColor: timeFilter === 'month' ? 'var(--maroon)' : undefined }} onClick={() => setTimeFilter('month')}>
          <div className="stat-header">
            <span className="label">Joined This Month</span>
            <div className="stat-icon-wrap" style={{ background: '#faf5ff', color: '#7e22ce' }}>🗓️</div>
          </div>
          <div className="value">{loading ? '…' : `+${metrics.month}`}</div>
          <div className="stat-footer">
            <span className="muted">Current calendar month</span>
          </div>
        </div>
      </div>

      {/* ── Filter Bar & Search ── */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Time filter chips */}
          <div className="btn-group" style={{ flexWrap: 'wrap' }}>
            {DATE_FILTERS.map((f) => (
              <button
                key={f.key}
                className={`btn sm ${timeFilter === f.key ? '' : 'ghost'}`}
                style={{
                  borderRadius: 20,
                  fontWeight: timeFilter === f.key ? 700 : 500,
                  background: timeFilter === f.key ? 'var(--maroon)' : undefined,
                  color: timeFilter === f.key ? '#fff' : undefined,
                }}
                onClick={() => setTimeFilter(f.key)}
              >
                {f.label} ({tabCounts[f.key] ?? 0})
              </button>
            ))}
          </div>

          {/* Search box */}
          <div className="search-bar-wrap">
            <span className="search-bar-icon">🔍</span>
            <input
              type="text"
              placeholder="Search by name, phone (+91), email, or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-light)',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Deleted accounts toggle */}
        {(deletedCount > 0 || showDeleted) && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end' }}>
            <label className="checkbox-row" style={{ fontSize: 12.5, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => setShowDeleted(e.target.checked)}
              />
              {' '}Show deleted accounts ({deletedCount})
            </label>
          </div>
        )}
      </div>

      {/* ── Customers Data Table ── */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Mobile</th>
              <th>Email</th>
              <th>Wallet</th>
              <th>Joined Date</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="empty" style={{ padding: '36px 20px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <span className="pulse-dot" /> Loading customer records…
                  </div>
                </td>
              </tr>
            )}

            {!loading && filteredRows.length === 0 && (
              <tr>
                <td colSpan={6} className="empty" style={{ padding: '48px 20px', textAlign: 'center' }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🔍</div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 4 }}>
                    No customers found
                  </div>
                  <div className="muted" style={{ fontSize: 13, maxWidth: 380, margin: '0 auto' }}>
                    {search
                      ? `No customer matches the search term "${search}". Try checking the spelling or selecting "All Customers".`
                      : `No customer signups recorded for the selected period (${DATE_FILTERS.find((f) => f.key === timeFilter)?.label}).`}
                  </div>
                </td>
              </tr>
            )}

            {!loading &&
              filteredRows.map((r) => {
                const recent = isRecent(r.created_at);
                const wallet = Number(r.wallet_balance || 0);

                return (
                  <tr key={r.id}>
                    {/* Customer Info & Avatar */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className="customer-avatar">
                          {getInitials(r.name)}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span
                              style={{ fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }}
                              onClick={() => setInspecting(r)}
                              title="Click to view details"
                            >
                              {r.name || 'Anonymous User'}
                            </span>
                            {recent && !r.isDeleted && (
                              <span className="pill-badge green" title="Signed up recently">
                                ✨ NEW
                              </span>
                            )}
                            {r.fcm_token && !r.isDeleted && (
                              <span className="pill-badge blue" title="Customer App Installed with Push Notifications Active">
                                📱 App Active
                              </span>
                            )}
                            {r.isDeleted && (
                              <span className="badge red">Deleted</span>
                            )}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-light)', fontFamily: 'monospace' }}>
                            ID: {r.id.slice(0, 8)}…
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Mobile */}
                    <td>
                      {r.isDeleted ? (
                        <span className="muted" style={{ fontStyle: 'italic' }}>— (freed for re-signup)</span>
                      ) : r.mobile ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.mobile}</span>
                          <button
                            className="btn ghost sm"
                            style={{ padding: '2px 6px', fontSize: 11 }}
                            onClick={() => copyText(r.mobile, `phone-${r.id}`)}
                            title="Copy phone number"
                          >
                            {copiedId === `phone-${r.id}` ? '✓' : '📋'}
                          </button>
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>

                    {/* Email */}
                    <td>
                      {r.email ? (
                        <a
                          href={`mailto:${r.email}`}
                          style={{ color: 'var(--maroon)', textDecoration: 'none' }}
                          title={`Send email to ${r.email}`}
                        >
                          {r.email}
                        </a>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>

                    {/* Wallet Balance */}
                    <td>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: 14,
                          color: wallet > 0 ? '#059669' : 'var(--text-primary)',
                        }}
                      >
                        ₹{wallet.toLocaleString('en-IN')}
                      </span>
                    </td>

                    {/* Joined Date & Relative Time */}
                    <td>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 12.5 }}>
                          {formatRelativeTime(r.created_at)}
                        </div>
                        <div className="muted" style={{ fontSize: 11.5 }}>
                          {r.created_at ? new Date(r.created_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </div>
                      </div>
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                        <button
                          className="btn ghost sm"
                          onClick={() => setInspecting(r)}
                          title="View customer details"
                        >
                          Details
                        </button>
                        {!r.isDeleted && (
                          <button
                            className="btn secondary sm"
                            onClick={() => {
                              setTopup(r);
                              setAmount('');
                            }}
                            title="Credit or debit wallet"
                          >
                            Wallet
                          </button>
                        )}
                        {!r.isDeleted && (
                          <button
                            className="btn danger sm"
                            disabled={busy}
                            onClick={() => remove(r)}
                            title="Delete customer"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* ── Wallet Top-up / Adjustment Modal ── */}
      {topup && (
        <Modal title={`Adjust Wallet — ${topup.name || topup.mobile || 'Customer'}`} onClose={() => setTopup(null)}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Current Balance:</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--maroon)' }}>
              ₹{Number(topup.wallet_balance || 0).toLocaleString('en-IN')}
            </div>
          </div>

          <div className="field">
            <label>Amount to Add (₹)</label>
            <input
              type="number"
              placeholder="e.g. 500"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
            <span className="muted" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
              Amount will be credited directly to the customer's wallet balance.
            </span>
          </div>

          <div className="btn-group" style={{ margin: '14px 0' }}>
            {[100, 250, 500, 1000].map((quick) => (
              <button
                key={quick}
                type="button"
                className="btn ghost sm"
                onClick={() => setAmount(String(quick))}
              >
                +₹{quick}
              </button>
            ))}
          </div>

          <div className="actions">
            <button className="btn secondary" onClick={() => setTopup(null)}>
              Cancel
            </button>
            <button className="btn" disabled={busy || !amount || Number(amount) <= 0} onClick={submitTopup}>
              {busy ? 'Crediting…' : `Credit ₹${amount || 0}`}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Customer Details Modal ── */}
      {inspecting && (
        <Modal title={`Customer Profile — ${inspecting.name || 'User'}`} onClose={() => setInspecting(null)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid var(--border-light)' }}>
            <div className="customer-avatar" style={{ width: 50, height: 50, fontSize: 18 }}>
              {getInitials(inspecting.name)}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{inspecting.name || 'Anonymous User'}</h3>
              <span className="muted" style={{ fontSize: 12 }}>Customer ID: {inspecting.id}</span>
            </div>
          </div>

          <div className="two-col">
            <div className="field">
              <label>Mobile Number</label>
              <div>{inspecting.isDeleted ? 'Freed for re-signup' : inspecting.mobile || '—'}</div>
            </div>
            <div className="field">
              <label>Email Address</label>
              <div>{inspecting.email || '—'}</div>
            </div>
          </div>

          <div className="two-col">
            <div className="field">
              <label>Wallet Balance</label>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--maroon)' }}>
                ₹{Number(inspecting.wallet_balance || 0).toLocaleString('en-IN')}
              </div>
            </div>
            <div className="field">
              <label>Account Status</label>
              <div>
                {inspecting.isDeleted ? (
                  <span className="badge red">Deleted / Inactive</span>
                ) : (
                  <span className="pill-badge green">Active App Customer</span>
                )}
              </div>
            </div>
          </div>

          <div className="field">
            <label>Registration Date</label>
            <div>
              {inspecting.created_at ? new Date(inspecting.created_at).toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'medium' }) : '—'}
              {' '}<span className="muted">({formatRelativeTime(inspecting.created_at)})</span>
            </div>
          </div>

          <div className="field">
            <label>Push Notification Token (FCM)</label>
            <div style={{ wordBreak: 'break-all', fontSize: 11, fontFamily: 'monospace', color: inspecting.fcm_token ? 'var(--emerald)' : 'var(--text-light)' }}>
              {inspecting.fcm_token ? 'Active on Android / iOS Device' : 'No push token registered'}
            </div>
          </div>

          <div className="actions" style={{ marginTop: 20 }}>
            <button className="btn secondary" onClick={() => setInspecting(null)}>
              Close
            </button>
            {!inspecting.isDeleted && (
              <button
                className="btn"
                onClick={() => {
                  const cust = inspecting;
                  setInspecting(null);
                  setTopup(cust);
                  setAmount('');
                }}
              >
                Top-up Wallet
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
