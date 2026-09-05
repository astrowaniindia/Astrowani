import { useCallback, useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import Modal from '../components/Modal';

// Date-range filter chips for the created_at column.
const FILTERS = [
  { key: 'all', label: 'All Pending' },
  { key: 'today', label: 'Applied Today' },
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

const fullName = (r) => `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Astrologer';

function getInitials(r) {
  const f = (r.first_name || '').trim();
  const l = (r.last_name || '').trim();
  if (f && l) return (f[0] + l[0]).toUpperCase();
  if (f) return f.slice(0, 2).toUpperCase();
  return 'A';
}

export default function NewEntries() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'
  const [busyId, setBusyId] = useState(null);
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/api/admin/new-entries');
      setRows(data.data || []);
    } catch (e) {
      console.error('Error loading new astrologers:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000); // auto-refresh so new signups appear live
    return () => clearInterval(t);
  }, [load]);

  const moderate = async (id, approval_status, name) => {
    if (approval_status === 'rejected') {
      if (!confirm(`Are you sure you want to reject the application for ${name || 'this astrologer'}?`)) {
        return;
      }
    }
    setBusyId(id);
    try {
      await client.patch(`/api/admin/astrologers/${id}`, { approval_status });
      setViewing(null);
      await load(); // row leaves the pending list once decided
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (!inRange(r.created_at, filter)) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase().trim();
      const name = fullName(r).toLowerCase();
      const phone = (r.phone_number || '').toLowerCase();
      const email = (r.email || '').toLowerCase();
      const langs = (Array.isArray(r.languages) ? r.languages.join(' ') : String(r.languages || '')).toLowerCase();
      const specs = (Array.isArray(r.specialties) ? r.specialties.join(' ') : String(r.specialties || '')).toLowerCase();
      return name.includes(q) || phone.includes(q) || email.includes(q) || langs.includes(q) || specs.includes(q);
    });
  }, [rows, filter, search]);

  const counts = useMemo(() => {
    const c = {};
    for (const f of FILTERS) c[f.key] = rows.filter((r) => inRange(r.created_at, f.key)).length;
    return c;
  }, [rows]);

  return (
    <div style={{ maxWidth: 1320 }}>
      {/* ── Page Header ── */}
      <div className="page-header">
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: 'var(--maroon)', background: 'var(--maroon-50)', padding: '3px 10px', borderRadius: 20, marginBottom: 8 }}>
            <span>⭐</span> ASTROLOGER ONBOARDING PIPELINE
          </div>
          <h1 className="page-title" style={{ margin: '0 0 6px' }}>New Astrologers</h1>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>
            Review, vet, and approve incoming astrologer applications before they are granted portal access.
          </p>
        </div>
        <div className="btn-group">
          {/* View Switcher */}
          <div className="btn-group" style={{ background: 'var(--surface-muted)', padding: 3, borderRadius: 10 }}>
            <button
              className={`btn sm ${viewMode === 'cards' ? '' : 'ghost'}`}
              style={{
                borderRadius: 8,
                padding: '5px 12px',
                background: viewMode === 'cards' ? 'var(--surface)' : 'transparent',
                boxShadow: viewMode === 'cards' ? 'var(--shadow-xs)' : 'none',
                color: viewMode === 'cards' ? 'var(--maroon)' : 'var(--text-muted)',
                fontWeight: 600,
              }}
              onClick={() => setViewMode('cards')}
              title="Cards Grid View"
            >
              <span>🗂️</span> Cards
            </button>
            <button
              className={`btn sm ${viewMode === 'table' ? '' : 'ghost'}`}
              style={{
                borderRadius: 8,
                padding: '5px 12px',
                background: viewMode === 'table' ? 'var(--surface)' : 'transparent',
                boxShadow: viewMode === 'table' ? 'var(--shadow-xs)' : 'none',
                color: viewMode === 'table' ? 'var(--maroon)' : 'var(--text-muted)',
                fontWeight: 600,
              }}
              onClick={() => setViewMode('table')}
              title="Table View"
            >
              <span>📋</span> Table
            </button>
          </div>

          <button className="btn secondary sm" onClick={load} title="Check for new submissions">
            <span>🔄</span> Refresh
          </button>
        </div>
      </div>

      {/* ── KPI Summary Cards ── */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', marginBottom: 24 }}>
        <div className="stat" style={{ cursor: 'pointer', borderColor: filter === 'all' ? 'var(--maroon)' : undefined }} onClick={() => setFilter('all')}>
          <div className="stat-header">
            <span className="label" style={{ color: rows.length > 0 ? 'var(--amber)' : undefined, fontWeight: 700 }}>
              Pending Review
            </span>
            <div className="stat-icon-wrap" style={{ background: '#fffbeb', color: '#b45309' }}>⏳</div>
          </div>
          <div className="value" style={{ color: rows.length > 0 ? '#b45309' : 'var(--text-primary)' }}>
            {loading ? '…' : rows.length}
          </div>
          <div className="stat-footer">
            <span className="muted">Applications awaiting vetting</span>
          </div>
        </div>

        <div className="stat" style={{ cursor: 'pointer', borderColor: filter === 'today' ? 'var(--emerald)' : undefined }} onClick={() => setFilter('today')}>
          <div className="stat-header">
            <span className="label" style={{ color: 'var(--emerald)', fontWeight: 700 }}>Applied Today</span>
            <div className="stat-icon-wrap" style={{ background: '#ecfdf5', color: '#059669' }}>
              <span className="pulse-dot" style={{ display: 'inline-block' }} />
            </div>
          </div>
          <div className="value" style={{ color: 'var(--emerald)' }}>
            {loading ? '…' : `+${counts.today ?? 0}`}
          </div>
          <div className="stat-footer">
            <span className="pill-badge green">✨ Today's Inflow</span>
          </div>
        </div>

        <div className="stat" style={{ cursor: 'pointer', borderColor: filter === 'week' ? 'var(--maroon)' : undefined }} onClick={() => setFilter('week')}>
          <div className="stat-header">
            <span className="label">Applied This Week</span>
            <div className="stat-icon-wrap" style={{ background: '#eff6ff', color: '#1d4ed8' }}>📅</div>
          </div>
          <div className="value">{loading ? '…' : `+${counts.week ?? 0}`}</div>
          <div className="stat-footer">
            <span className="muted">Past 7 days candidates</span>
          </div>
        </div>

        <div className="stat" style={{ cursor: 'pointer', borderColor: filter === 'month' ? 'var(--maroon)' : undefined }} onClick={() => setFilter('month')}>
          <div className="stat-header">
            <span className="label">Applied This Month</span>
            <div className="stat-icon-wrap" style={{ background: '#faf5ff', color: '#7e22ce' }}>🗓️</div>
          </div>
          <div className="value">{loading ? '…' : `+${counts.month ?? 0}`}</div>
          <div className="stat-footer">
            <span className="muted">Current month total</span>
          </div>
        </div>
      </div>

      {/* ── Search & Filter Controls ── */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Time filter chips */}
          <div className="btn-group" style={{ flexWrap: 'wrap' }}>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={`btn sm ${filter === f.key ? '' : 'ghost'}`}
                style={{
                  borderRadius: 20,
                  fontWeight: filter === f.key ? 700 : 500,
                  background: filter === f.key ? 'var(--maroon)' : undefined,
                  color: filter === f.key ? '#fff' : undefined,
                }}
                onClick={() => setFilter(f.key)}
              >
                {f.label} ({counts[f.key] ?? 0})
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div className="search-bar-wrap">
            <span className="search-bar-icon">🔍</span>
            <input
              type="text"
              placeholder="Search by name, phone, language, specialty..."
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
      </div>

      {/* ── Loading State ── */}
      {loading && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)' }}>
            <span className="pulse-dot" /> Checking for incoming astrologer applications…
          </div>
        </div>
      )}

      {/* ── Empty State ── */}
      {!loading && filtered.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '54px 20px' }}>
          <div style={{ fontSize: 42, marginBottom: 12 }}>🎉</div>
          <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800 }}>No Pending Applications</h3>
          <p className="muted" style={{ maxWidth: 460, margin: '0 auto', fontSize: 13.5 }}>
            {search
              ? `No applicants match "${search}". Try adjusting your search query or selecting "All Pending".`
              : `All incoming astrologer signups have been reviewed! New submissions will automatically appear here via the 20-second live sync.`}
          </p>
        </div>
      )}

      {/* ── CARDS GRID VIEW ── */}
      {!loading && filtered.length > 0 && viewMode === 'cards' && (
        <div className="applicant-grid">
          {filtered.map((r) => {
            const name = fullName(r);
            const isBusy = busyId === r.id;

            return (
              <div className="applicant-card" key={r.id}>
                <div>
                  {/* Top Row: Avatar + Name + Experience */}
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}>
                    {r.profile_pic_url ? (
                      <img
                        src={r.profile_pic_url}
                        alt=""
                        className="applicant-thumb"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="applicant-thumb-placeholder">{getInitials(r)}</div>
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <h4
                        style={{
                          margin: '0 0 2px',
                          fontSize: 15,
                          fontWeight: 800,
                          color: 'var(--text-primary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {name}
                      </h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {r.experience != null && (
                          <span className="pill-badge amber">
                            ⭐ {r.experience} yr{r.experience === 1 ? '' : 's'} exp
                          </span>
                        )}
                        {r.gender && (
                          <span className="pill-badge blue" style={{ textTransform: 'capitalize' }}>
                            {r.gender}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Contact Details */}
                  <div style={{ fontSize: 12.5, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                      <span style={{ fontSize: 14 }}>📞</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.phone_number || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                      <span style={{ fontSize: 14 }}>✉️</span>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.email || '—'}
                      </span>
                    </div>
                  </div>

                  {/* Languages & Specialties */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--text-light)', fontWeight: 600, marginBottom: 4 }}>
                      LANGUAGES & SPECIALTIES
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {Array.isArray(r.languages) && r.languages.length > 0 ? (
                        r.languages.map((l, i) => (
                          <span key={i} className="pill-badge" style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)' }}>
                            {l}
                          </span>
                        ))
                      ) : r.languages ? (
                        <span className="pill-badge" style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)' }}>
                          {String(r.languages)}
                        </span>
                      ) : (
                        <span className="muted" style={{ fontSize: 11.5 }}>Not specified</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Footer: Timestamp + Actions */}
                <div style={{ paddingTop: 12, borderTop: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, fontSize: 11.5 }}>
                    <span className="muted">Applied:</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {formatRelativeTime(r.created_at)}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                    <button
                      className="btn ghost sm"
                      style={{ padding: '6px 4px', fontSize: 12 }}
                      onClick={() => setViewing(r)}
                    >
                      View
                    </button>
                    <button
                      className="btn sm"
                      style={{ padding: '6px 4px', fontSize: 12, background: 'var(--emerald)', borderColor: 'var(--emerald)' }}
                      disabled={isBusy}
                      onClick={() => moderate(r.id, 'approved', name)}
                    >
                      {isBusy ? '…' : '✓ Accept'}
                    </button>
                    <button
                      className="btn danger sm"
                      style={{ padding: '6px 4px', fontSize: 12 }}
                      disabled={isBusy}
                      onClick={() => moderate(r.id, 'rejected', name)}
                    >
                      ✕ Reject
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── TABLE VIEW ── */}
      {!loading && filtered.length > 0 && viewMode === 'table' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Applicant</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Experience</th>
                <th>Languages</th>
                <th>Applied</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const name = fullName(r);
                const isBusy = busyId === r.id;

                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {r.profile_pic_url ? (
                          <img
                            src={r.profile_pic_url}
                            alt=""
                            className="applicant-thumb"
                            style={{ width: 38, height: 38 }}
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="applicant-thumb-placeholder" style={{ width: 38, height: 38, fontSize: 14 }}>
                            {getInitials(r)}
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-light)' }}>
                            {r.gender ? `${r.gender} • ` : ''}ID: {r.id.slice(0, 8)}…
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="muted" style={{ fontFamily: 'monospace' }}>
                      {r.phone_number || '—'}
                    </td>
                    <td className="muted">{r.email || '—'}</td>
                    <td>
                      {r.experience != null ? (
                        <span className="pill-badge amber">⭐ {r.experience} yr{r.experience === 1 ? '' : 's'}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {Array.isArray(r.languages) ? r.languages.slice(0, 2).join(', ') : (r.languages || '—')}
                      </span>
                    </td>
                    <td>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>{formatRelativeTime(r.created_at)}</div>
                        <div className="muted" style={{ fontSize: 11 }}>
                          {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn ghost sm" onClick={() => setViewing(r)}>
                          View
                        </button>
                        <button
                          className="btn sm"
                          style={{ background: 'var(--emerald)', borderColor: 'var(--emerald)' }}
                          disabled={isBusy}
                          onClick={() => moderate(r.id, 'approved', name)}
                        >
                          {isBusy ? '…' : 'Accept'}
                        </button>
                        <button
                          className="btn danger sm"
                          disabled={isBusy}
                          onClick={() => moderate(r.id, 'rejected', name)}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Detail Application Modal ── */}
      {viewing && (
        <Modal title={`Application — ${fullName(viewing)}`} onClose={() => setViewing(null)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid var(--border-light)' }}>
            {viewing.profile_pic_url ? (
              <img
                src={viewing.profile_pic_url}
                alt=""
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '3px solid var(--maroon)',
                }}
              />
            ) : (
              <div
                className="applicant-thumb-placeholder"
                style={{ width: 80, height: 80, fontSize: 28 }}
              >
                {getInitials(viewing)}
              </div>
            )}
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800 }}>{fullName(viewing)}</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="pill-badge amber">
                  ⭐ {viewing.experience != null ? `${viewing.experience} Years Experience` : 'Fresh Applicant'}
                </span>
                {viewing.gender && (
                  <span className="pill-badge blue" style={{ textTransform: 'capitalize' }}>
                    {viewing.gender}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="two-col">
            <div className="field">
              <label>Phone Number</label>
              <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>{viewing.phone_number || '—'}</div>
            </div>
            <div className="field">
              <label>Email Address</label>
              <div>{viewing.email || '—'}</div>
            </div>
          </div>

          <div className="two-col">
            <div className="field">
              <label>Languages Spoken</label>
              <div>
                {Array.isArray(viewing.languages)
                  ? viewing.languages.join(', ') || '—'
                  : viewing.languages || '—'}
              </div>
            </div>
            <div className="field">
              <label>Specialties / Expertise</label>
              <div>
                {Array.isArray(viewing.specialties)
                  ? viewing.specialties.join(', ') || '—'
                  : viewing.specialties || '—'}
              </div>
            </div>
          </div>

          <div className="field">
            <label>Application Timestamp</label>
            <div>
              {viewing.created_at
                ? `${new Date(viewing.created_at).toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'medium' })} (${formatRelativeTime(viewing.created_at)})`
                : '—'}
            </div>
          </div>

          {viewing.admin_notes && (
            <div className="field">
              <label>Applicant Notes</label>
              <div style={{ background: 'var(--surface-muted)', padding: 10, borderRadius: 8, fontSize: 13 }}>
                {viewing.admin_notes}
              </div>
            </div>
          )}

          <div className="actions" style={{ marginTop: 24 }}>
            <button
              className="btn danger"
              disabled={busyId === viewing.id}
              onClick={() => moderate(viewing.id, 'rejected', fullName(viewing))}
            >
              ✕ Reject Application
            </button>
            <button
              className="btn"
              style={{ background: 'var(--emerald)', borderColor: 'var(--emerald)' }}
              disabled={busyId === viewing.id}
              onClick={() => moderate(viewing.id, 'approved', fullName(viewing))}
            >
              {busyId === viewing.id ? 'Approving…' : '✓ Approve & Grant Access'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

