import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import client from '../api/client';
import Modal from '../components/Modal';

// The free introductory call: list and management of bookings.
// Offer configuration has been separated into its own section at /free-call-settings.

const STATUSES = ['booked', 'completed', 'missed', 'cancelled'];
const STATUS_LABEL = {
  booked: 'Upcoming / Booked',
  completed: 'Completed',
  missed: 'Missed Call',
  cancelled: 'Cancelled',
};

function statusBadge(s) {
  const cls = s === 'completed' ? 'green'
    : s === 'cancelled' ? 'gray'
      : s === 'missed' ? 'red' : 'blue';
  return <span className={`badge ${cls}`}>{STATUS_LABEL[s] || s}</span>;
}

// Slot times come back as real instants. They are always displayed in the offer's
// business timezone (IST), never the admin's browser timezone.
const IST_FMT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  hour: 'numeric', minute: '2-digit', hour12: true,
});
const fmtSlot = (iso) => (iso ? IST_FMT.format(new Date(iso)) : '—');

function formatDob(d) {
  if (!d) return null;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) {
    const [y, m, day] = d.slice(0, 10).split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mon = months[parseInt(m, 10) - 1] || m;
    return `${day} ${mon} ${y}`;
  }
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return String(d);
  }
}

const IST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
const istDayKey = (iso) => (iso ? IST_DAY.format(new Date(iso)) : '');

function formatRelativeTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const isFuture = diffMs < 0;
  const absDiffSec = Math.floor(Math.abs(diffMs) / 1000);
  const diffMin = Math.floor(absDiffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHour / 24);

  if (isFuture) {
    if (absDiffSec < 60) return 'In a few seconds';
    if (diffMin < 60) return `In ${diffMin}m`;
    if (diffHour < 24) return diffHour === 1 ? 'In 1 hour' : `In ${diffHour} hours`;
    if (diffDays === 1) return 'Tomorrow';
    return `In ${diffDays} days`;
  } else {
    if (absDiffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return diffHour === 1 ? '1 hour ago' : `${diffHour}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}

export default function FreeCallBookings() {
  const navigate = useNavigate();
  const [offer, setOffer] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [datePreset, setDatePreset] = useState('all'); // 'all' | 'today' | 'tomorrow' | 'week' | 'past'
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [upcomingFirst, setUpcomingFirst] = useState(true);
  const [assigneeFilter, setAssigneeFilter] = useState('');

  const [astrologers, setAstrologers] = useState([]);
  const [rescheduling, setRescheduling] = useState(null);
  const [noting, setNoting] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  /* ── offer settings read-only for pool distribution & quick metrics ────────── */
  const loadOffer = useCallback(async () => {
    try {
      const { data } = await client.get('/api/admin/settings');
      const raw = data.settings?.free_call_offer;
      if (raw) setOffer(JSON.parse(raw));
    } catch (e) {
      console.error('load free_call_offer failed:', e.message);
    }
  }, []);

  /* ── bookings ───────────────────────────────────────────────────────────── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (from) params.from = from;
      if (to) params.to = to;
      if (search.trim()) params.q = search.trim();
      if (assigneeFilter) params.astrologerId = assigneeFilter;
      const { data } = await client.get('/api/admin/free-call-bookings', { params });
      setRows(data.bookings || []);
      setTableMissing(!!data.tableMissing);
    } catch (e) {
      console.error('load free-call bookings failed:', e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, from, to, search, assigneeFilter]);

  // Only approved, unsuspended astrologers can be given bookings — the backend
  // refuses the rest, so they are filtered out of the dropdowns too rather than
  // being offered and then rejected.
  useEffect(() => {
    (async () => {
      try {
        const { data } = await client.get('/api/admin/astrologers');
        setAstrologers((data.data || []).filter(
          (a) => !a.is_suspended && (!a.approval_status || a.approval_status === 'approved'),
        ));
      } catch (e) {
        console.error('load astrologers failed:', e.message);
      }
    })();
  }, []);

  useEffect(() => { loadOffer(); }, [loadOffer]);

  // Debounced so typing in the search box doesn't fire a request per keystroke —
  // search runs server-side because the endpoint caps the page, so filtering only
  // what was already fetched would quietly miss older bookings.
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const patchBooking = async (id, patch, okMsg) => {
    setBusy(true);
    try {
      const { data } = await client.patch(`/api/admin/free-call-bookings/${id}`, patch);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...data.booking } : r)));
      if (okMsg) alert(okMsg);
      return true;
    } catch (e) {
      alert(e.response?.data?.message || e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const astroName = (a) => [a.first_name, a.last_name].filter(Boolean).join(' ').trim() || a.email || a.id;

  const assign = (row, astrologerId) => {
    const current = row.astrologer_id || '';
    if (astrologerId === current) return;
    const who = astrologerId
      ? astroName(astrologers.find((a) => a.id === astrologerId) || {})
      : 'nobody (unassigned)';
    if (!window.confirm(`Give this call to ${who}?`)) return;
    patchBooking(row.id, { astrologerId: astrologerId || null });
  };

  // Switching to pool mode only changes what happens to NEW bookings, so anything
  // already sitting unassigned would stay that way. This hands out the backlog on
  // the same least-loaded rule, so nobody has to work through them one at a time.
  const distribute = async () => {
    const pool = (offer.poolAstrologerIds || []).filter((id) => astrologers.some((a) => a.id === id));
    const ids = offer.assignmentMode === 'pool' && pool.length
      ? pool
      : offer.assignmentMode === 'single' && offer.assignedAstrologerId
        ? [offer.assignedAstrologerId]
        : [];
    if (!ids.length) {
      alert('Pick who shares the calls first — open Free Call Settings and choose an assignment mode.');
      navigate('/free-call-settings');
      return;
    }
    const names = ids.map((id) => astroName(astrologers.find((a) => a.id === id) || {})).join(', ');
    if (!window.confirm(`Share every unassigned booking between ${names}?`)) return;

    setBusy(true);
    try {
      const { data } = await client.post('/api/admin/free-call-bookings/distribute', { astrologerIds: ids });
      const lines = (data.perAstrologer || []).map((a) => `  ${a.name}: ${a.total}`).join('\n');
      alert(
        `Assigned ${data.assigned} booking${data.assigned === 1 ? '' : 's'}.` +
        (data.skipped ? `\n${data.skipped} left unassigned — everyone was already busy at that time.` : '') +
        (lines ? `\n\nUpcoming calls each:\n${lines}` : ''),
      );
      load();
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = (row, status) => {
    if (status === row.status) return;
    const verb = STATUS_LABEL[status];
    if (!window.confirm(`Mark ${row.customer_name || 'this booking'} as ${verb}?`)) return;
    patchBooking(row.id, { status });
  };

  const copyText = (txt, id) => {
    if (!txt) return;
    navigator.clipboard.writeText(txt);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const todayKey = IST_DAY.format(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowKey = IST_DAY.format(tomorrowDate);

  // Filter by date preset (client-side fast filter)
  const filteredByDatePreset = useMemo(() => {
    if (datePreset === 'all') return rows;
    const nowMs = Date.now();
    return rows.filter((r) => {
      const slotDay = istDayKey(r.slot_start);
      const slotTime = new Date(r.slot_start).getTime();
      if (datePreset === 'today') return slotDay === todayKey;
      if (datePreset === 'tomorrow') return slotDay === tomorrowKey;
      if (datePreset === 'week') {
        const diffDays = (slotTime - nowMs) / (1000 * 60 * 60 * 24);
        return diffDays >= 0 && diffDays <= 7;
      }
      if (datePreset === 'past') return slotTime < nowMs;
      return true;
    });
  }, [rows, datePreset, todayKey, tomorrowKey]);

  // Sorting: upcoming first or newest slot first
  const sorted = useMemo(() => {
    const now = Date.now();
    const copy = [...filteredByDatePreset];
    if (!upcomingFirst) {
      return copy.sort((a, b) => new Date(b.slot_start) - new Date(a.slot_start));
    }
    const future = copy.filter((r) => new Date(r.slot_start).getTime() >= now)
      .sort((a, b) => new Date(a.slot_start) - new Date(b.slot_start));
    const past = copy.filter((r) => new Date(r.slot_start).getTime() < now)
      .sort((a, b) => new Date(b.slot_start) - new Date(a.slot_start));
    return [...future, ...past];
  }, [filteredByDatePreset, upcomingFirst]);

  const counts = useMemo(() => {
    const c = { booked: 0, completed: 0, missed: 0, cancelled: 0, unassigned: 0, today: 0 };
    rows.forEach((r) => {
      if (c[r.status] !== undefined) c[r.status] += 1;
      if (!r.astrologer_id && r.status === 'booked') c.unassigned += 1;
      if (istDayKey(r.slot_start) === todayKey) c.today += 1;
    });
    return c;
  }, [rows, todayKey]);

  const exportCSV = () => {
    const headers = ['ID', 'Scheduled Slot (IST)', 'Booked On', 'Customer Name', 'Customer Phone', 'Customer DOB', 'Customer Birth Time', 'Customer Birth Place', 'Assigned Astrologer', 'Status', 'Note'];
    const lines = sorted.map((r) => [
      r.id,
      `"${fmtSlot(r.slot_start)}"`,
      `"${r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : ''}"`,
      `"${(r.customer_name || '').replace(/"/g, '""')}"`,
      `"${r.customer_phone || ''}"`,
      `"${r.customer_dob ? formatDob(r.customer_dob) : ''}"`,
      `"${r.customer_time_of_birth || ''}"`,
      `"${(r.customer_place_of_birth || '').replace(/"/g, '""')}"`,
      `"${(r.assigneeName || r.astrologer_name || '').replace(/"/g, '""')}"`,
      r.status,
      `"${(r.admin_note || '').replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...lines.map((l) => l.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `free-call-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
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
            <span>📞</span> INTRODUCTORY CALL SESSIONS
          </div>
          <h1 className="page-title" style={{ margin: '0 0 6px' }}>Free Call Bookings</h1>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>
            Track and manage all scheduled introductory consultation calls booked by new app customers.
          </p>
        </div>
        <div className="btn-group">
          <Link to="/free-call-settings" className="btn secondary sm" title="Configure offer settings, duration, and astrologer pool">
            <span>⚙️</span> Free Call Settings
          </Link>
          <button className="btn ghost sm" onClick={exportCSV} title="Export current bookings to CSV">
            <span>📥</span> Export CSV
          </button>
          <button className="btn secondary sm" onClick={load} title="Reload bookings list">
            <span>🔄</span> Refresh
          </button>
        </div>
      </div>

      {tableMissing && (
        <div className="card" style={{ marginBottom: 18, borderLeft: '4px solid #c0392b' }}>
          <strong>Bookings table not created yet.</strong>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Run <code>astrowani-backend/sql/free_call_booking_schema.sql</code> in the Supabase
            SQL editor. Until then the offer stays off and customers see nothing.
          </p>
        </div>
      )}

      {/* ── Offer Quick Info Banner ── */}
      {offer && (
        <div className="card" style={{ marginBottom: 20, padding: '12px 18px', background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {offer.enabled ? (
                <span className="pill-badge green">● Offer Live</span>
              ) : (
                <span className="pill-badge" style={{ background: '#f1f5f9', color: '#64748b' }}>○ Offer Disabled</span>
              )}
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                <strong>{offer.durationMinutes || 12} min</strong> calls · Slots {String(offer.openHour || 10).padStart(2, '0')}:00–{String(offer.closeHour || 20).padStart(2, '0')}:00 IST ·
                {' '}{offer.assignmentMode === 'pool' ? `Smart Pool (${(offer.poolAstrologerIds || []).length} astrologers)` : offer.assignmentMode === 'single' ? 'Single Astrologer' : 'Manual Assignment'}
              </span>
            </div>
            <Link to="/free-call-settings" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--maroon)', textDecoration: 'none' }}>
              Edit Offer Settings →
            </Link>
          </div>
        </div>
      )}

      {/* ── KPI Summary Cards ── */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: 22 }}>
        <div className="stat" style={{ cursor: 'pointer', borderColor: statusFilter === 'booked' ? 'var(--sky)' : undefined }} onClick={() => setStatusFilter(statusFilter === 'booked' ? '' : 'booked')}>
          <div className="stat-header">
            <span className="label">Upcoming / Booked</span>
            <div className="stat-icon-wrap" style={{ background: '#f0f9ff', color: '#0284c7' }}>📅</div>
          </div>
          <div className="value" style={{ color: '#0284c7' }}>{counts.booked}</div>
          <div className="stat-footer">
            <span className="muted">Confirmed future slots</span>
          </div>
        </div>

        <div className="stat" style={{ cursor: 'pointer', borderColor: datePreset === 'today' ? 'var(--emerald)' : undefined }} onClick={() => setDatePreset(datePreset === 'today' ? 'all' : 'today')}>
          <div className="stat-header">
            <span className="label" style={{ color: 'var(--emerald)', fontWeight: 700 }}>Today's Scheduled</span>
            <div className="stat-icon-wrap" style={{ background: '#ecfdf5', color: '#059669' }}>
              <span className="pulse-dot" style={{ display: 'inline-block' }} />
            </div>
          </div>
          <div className="value" style={{ color: 'var(--emerald)' }}>{counts.today}</div>
          <div className="stat-footer">
            <span className="pill-badge green">Scheduled for today</span>
          </div>
        </div>

        <div className="stat" style={{ cursor: 'pointer', borderColor: statusFilter === 'completed' ? 'var(--emerald)' : undefined }} onClick={() => setStatusFilter(statusFilter === 'completed' ? '' : 'completed')}>
          <div className="stat-header">
            <span className="label">Completed</span>
            <div className="stat-icon-wrap" style={{ background: '#ecfdf5', color: '#059669' }}>✓</div>
          </div>
          <div className="value">{counts.completed}</div>
          <div className="stat-footer">
            <span className="muted">Calls conducted</span>
          </div>
        </div>

        <div className="stat" style={{ cursor: 'pointer', borderColor: statusFilter === 'missed' ? 'var(--crimson)' : undefined }} onClick={() => setStatusFilter(statusFilter === 'missed' ? '' : 'missed')}>
          <div className="stat-header">
            <span className="label">Missed Calls</span>
            <div className="stat-icon-wrap" style={{ background: '#fef2f2', color: '#dc2626' }}>⚠️</div>
          </div>
          <div className="value" style={{ color: counts.missed > 0 ? '#dc2626' : undefined }}>{counts.missed}</div>
          <div className="stat-footer">
            <span className="muted">Customer did not answer</span>
          </div>
        </div>

        <div className="stat" style={{ borderColor: counts.unassigned > 0 ? 'var(--crimson)' : undefined }}>
          <div className="stat-header">
            <span className="label" style={{ color: counts.unassigned > 0 ? '#dc2626' : undefined, fontWeight: 700 }}>
              Needs Astrologer
            </span>
            <div className="stat-icon-wrap" style={{ background: counts.unassigned > 0 ? '#fef2f2' : '#f1f5f9', color: counts.unassigned > 0 ? '#dc2626' : '#64748b' }}>
              👤
            </div>
          </div>
          <div className="value" style={{ color: counts.unassigned > 0 ? '#dc2626' : undefined }}>
            {counts.unassigned}
          </div>
          <div className="stat-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="muted">Unassigned calls</span>
            {counts.unassigned > 0 && (
              <button
                className="btn sm"
                style={{ padding: '3px 8px', fontSize: 11, background: 'var(--maroon)' }}
                disabled={busy}
                onClick={distribute}
                title="Auto-assign unassigned calls among active pool astrologers"
              >
                {busy ? 'Sharing…' : 'Distribute'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Filter Controls Bar ── */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
        {/* Row 1: Quick Date Presets + Search */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          {/* Quick Date Presets */}
          <div className="btn-group" style={{ flexWrap: 'wrap' }}>
            {[
              { key: 'all', label: 'All Slots' },
              { key: 'today', label: "Today's Calls" },
              { key: 'tomorrow', label: 'Tomorrow' },
              { key: 'week', label: 'Next 7 Days' },
              { key: 'past', label: 'Past Calls' },
            ].map((p) => (
              <button
                key={p.key}
                className={`btn sm ${datePreset === p.key ? '' : 'ghost'}`}
                style={{
                  borderRadius: 20,
                  fontWeight: datePreset === p.key ? 700 : 500,
                  background: datePreset === p.key ? 'var(--maroon)' : undefined,
                  color: datePreset === p.key ? '#fff' : undefined,
                }}
                onClick={() => setDatePreset(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div className="search-bar-wrap">
            <span className="search-bar-icon">🔍</span>
            <input
              type="text"
              placeholder="Search customer, phone, astrologer, notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', fontSize: 14,
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Secondary Dropdowns & Custom Range */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', paddingTop: 12, borderTop: '1px solid var(--border-light)' }}>
          {/* Status Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)' }}>Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
            >
              <option value="">All Statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>

          {/* Astrologer Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)' }}>Astrologer:</label>
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
            >
              <option value="">All Astrologers</option>
              <option value="unassigned">⚠️ Unassigned Only</option>
              {astrologers.map((a) => (
                <option key={a.id} value={a.id}>{astroName(a)}</option>
              ))}
            </select>
          </div>

          {/* Custom Date Inputs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)' }}>From:</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5 }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)' }}>To:</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5 }}
            />
          </div>

          {/* Upcoming first checkbox */}
          <label className="checkbox-row" style={{ marginLeft: 'auto', fontSize: 12.5, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={upcomingFirst}
              onChange={(e) => setUpcomingFirst(e.target.checked)}
            />
            {' '}Sort upcoming calls first
          </label>

          {(search || statusFilter || from || to || assigneeFilter || datePreset !== 'all') && (
            <button
              className="btn ghost sm"
              onClick={() => {
                setSearch('');
                setStatusFilter('');
                setFrom('');
                setTo('');
                setAssigneeFilter('');
                setDatePreset('all');
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* ── Bookings Data Table ── */}
      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)' }}>
            <span className="pulse-dot" /> Loading introductory call bookings…
          </div>
        </div>
      ) : sorted.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '54px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
          <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 800 }}>No bookings found</h3>
          <p className="muted" style={{ maxWidth: 420, margin: '0 auto', fontSize: 13 }}>
            {search || statusFilter || from || to || assigneeFilter || datePreset !== 'all'
              ? 'No call bookings match the selected filters. Try resetting the filters.'
              : 'No free call bookings have been made yet.'}
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Scheduled Slot (IST)</th>
                <th style={{ minWidth: 155 }}>Booked On</th>
                <th style={{ minWidth: 240 }}>Customer</th>
                <th style={{ minWidth: 180 }}>Assigned Astrologer</th>
                <th>Status</th>
                <th>Internal Note</th>
                <th style={{ textAlign: 'right', minWidth: 210 }}>Manage</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const isToday = istDayKey(r.slot_start) === todayKey;
                const isPast = new Date(r.slot_start).getTime() < Date.now();

                return (
                  <tr key={r.id}>
                    {/* 1. Scheduled Slot */}
                    <td>
                      <div>
                        <div style={{ fontWeight: isToday ? 800 : 700, fontSize: 13.5, color: 'var(--text-primary)' }}>
                          {fmtSlot(r.slot_start)}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                          {isToday && (
                            <span className="pill-badge green" style={{ fontWeight: 700 }}>
                              ● TODAY
                            </span>
                          )}
                          <span className="muted" style={{ fontSize: 11.5 }}>
                            {formatRelativeTime(r.slot_start)} · {r.duration_minutes || 12} min
                          </span>
                          {isPast && r.status === 'booked' && (
                            <span className="pill-badge amber" style={{ fontSize: 10 }}>
                              Slot Passed
                            </span>
                          )}
                        </div>
                        {r.rescheduled_from && (
                          <div className="muted" style={{ fontSize: 11, marginTop: 2, color: 'var(--amber)' }}>
                            Rescheduled from {fmtSlot(r.rescheduled_from)} {r.reschedule_count > 1 ? `(${r.reschedule_count}×)` : ''}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* 2. When Did They Book (created_at) */}
                    <td>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                          {r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </div>
                        <div className="muted" style={{ fontSize: 11.5 }}>
                          {r.created_at ? new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
                          {' '}({formatRelativeTime(r.created_at)})
                        </div>
                      </div>
                    </td>

                    {/* 3. Customer */}
                    <td>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                          {r.customer_name || <span className="muted">Anonymous</span>}
                        </div>
                        {r.customer_phone ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                            <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>
                              {r.customer_phone}
                            </span>
                            <button
                              className="btn ghost sm"
                              style={{ padding: '1px 5px', fontSize: 10 }}
                              onClick={() => copyText(r.customer_phone, `p-${r.id}`)}
                              title="Copy number"
                            >
                              {copiedId === `p-${r.id}` ? '✓' : '📋'}
                            </button>
                          </div>
                        ) : (
                          <span className="muted" style={{ fontSize: 11 }}>No phone</span>
                        )}
                        {/* Birth Details (DOB + Time + Full Place) */}
                        <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <div style={{
                            fontSize: 11.5,
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: r.customer_dob ? '#fef3c7' : '#f1f5f9',
                            color: r.customer_dob ? '#92400e' : 'var(--text-muted)',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            width: 'fit-content',
                            whiteSpace: 'nowrap'
                          }}>
                            <span>🎂</span>
                            {r.customer_dob ? (
                              <span>
                                DOB: <strong>{formatDob(r.customer_dob)}</strong>
                                {r.customer_time_of_birth ? ` (${r.customer_time_of_birth.slice(0, 5)})` : ''}
                              </span>
                            ) : (
                              <span>DOB: Not set</span>
                            )}
                          </div>

                          {r.customer_place_of_birth && (
                            <div style={{
                              fontSize: 11.5,
                              color: 'var(--text-secondary)',
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 4,
                              lineHeight: 1.35,
                              marginTop: 1
                            }}>
                              <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}>📍</span>
                              <span style={{ wordBreak: 'break-word', fontWeight: 500 }}>
                                {r.customer_place_of_birth}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* 4. Assigned Astrologer */}
                    <td>
                      <div>
                        <select
                          value={r.astrologer_id || ''}
                          disabled={busy}
                          onChange={(e) => assign(r, e.target.value)}
                          style={{
                            width: '100%',
                            padding: '6px 8px',
                            borderRadius: 8,
                            fontSize: 12.5,
                            fontWeight: 600,
                            borderColor: !r.astrologer_id && r.status === 'booked' ? '#ef4444' : undefined,
                            background: !r.astrologer_id && r.status === 'booked' ? '#fef2f2' : undefined,
                          }}
                        >
                          <option value="">— Unassigned —</option>
                          {astrologers.map((a) => (
                            <option key={a.id} value={a.id}>{astroName(a)}</option>
                          ))}
                          {r.astrologer_id && !astrologers.some((a) => a.id === r.astrologer_id) && (
                            <option value={r.astrologer_id}>{r.assigneeName || 'Assigned (Inactive)'}</option>
                          )}
                        </select>
                        {!r.astrologer_id && r.status === 'booked' && (
                          <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, marginTop: 3 }}>
                            ⚠️ Needs Astrologer
                          </div>
                        )}
                        {r.astrologer_name && (
                          <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                            Promised face: {r.astrologer_name}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* 5. Status */}
                    <td>
                      {statusBadge(r.status)}
                    </td>

                    {/* 6. Admin Note */}
                    <td style={{ maxWidth: 180 }}>
                      {r.admin_note ? (
                        <span
                          style={{ fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}
                          onClick={() => { setNoting(r); setNoteText(r.admin_note || ''); }}
                          title="Click to edit note"
                        >
                          {r.admin_note}
                        </span>
                      ) : (
                        <span
                          className="muted"
                          style={{ fontSize: 12, cursor: 'pointer' }}
                          onClick={() => { setNoting(r); setNoteText(''); }}
                          title="Click to add note"
                        >
                          + Add note
                        </span>
                      )}
                    </td>

                    {/* 7. Manage / Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <div className="btn-group" style={{ justifyContent: 'flex-end', gap: 6 }}>
                        <select
                          value={r.status}
                          disabled={busy}
                          onChange={(e) => changeStatus(r, e.target.value)}
                          style={{ padding: '4px 6px', fontSize: 12, borderRadius: 6 }}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                          ))}
                        </select>
                        <button
                          className="btn secondary sm"
                          disabled={busy}
                          onClick={() => setRescheduling(r)}
                          title="Move call to a different slot"
                        >
                          Reschedule
                        </button>
                        <button
                          className="btn ghost sm"
                          disabled={busy}
                          onClick={() => { setNoting(r); setNoteText(r.admin_note || ''); }}
                          title="Internal admin note"
                        >
                          Note
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

      {rescheduling && (
        <RescheduleModal
          booking={rescheduling}
          busy={busy}
          onClose={() => setRescheduling(null)}
          onPick={async (slotStart) => {
            const ok = await patchBooking(rescheduling.id, { slotStart });
            if (ok) setRescheduling(null);
          }}
        />
      )}

      {noting && (
        <Modal title={`Note — ${noting.customer_name || 'booking'}`} onClose={() => setNoting(null)}>
          <div className="field">
            <label>Internal note (not shown to the customer)</label>
            <textarea rows="4" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
          </div>
          <div className="actions">
            <button className="btn secondary" onClick={() => setNoting(null)}>Cancel</button>
            <button className="btn" disabled={busy} onClick={async () => {
              const ok = await patchBooking(noting.id, { adminNote: noteText });
              if (ok) setNoting(null);
            }}>Save note</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * Reschedule picker. Reads the same slot grid the customer app does, so a slot
 * another customer holds is shown as taken and cannot be picked. The server
 * enforces this regardless — this is only so the admin can see it before clicking.
 */
function RescheduleModal({ booking, busy, onClose, onPick }) {
  const [dates, setDates] = useState([]);
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState([]);
  const [capacity, setCapacity] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await client.get('/api/admin/free-call-slots', {
          params: date ? { date } : {},
        });
        if (cancelled) return;
        setDates(data.dates || []);
        setDate(data.date);
        setCapacity(data.capacity || 1);
        setSlots(data.slots || []);
      } catch (e) {
        if (!cancelled) setSlots([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [date]);

  const currentIso = booking.slot_start;

  return (
    <Modal title={`Reschedule — ${booking.customer_name || 'booking'}`} onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>
        Currently <strong>{fmtSlot(currentIso)}</strong>. Pick a new slot after agreeing it
        with the customer — they are not notified automatically.
      </p>

      <div className="field">
        <label>Date</label>
        <select value={date} onChange={(e) => setDate(e.target.value)}>
          {dates.map((d) => (
            <option key={d.key} value={d.key}>{d.label.day} {d.label.date} {d.label.month}</option>
          ))}
        </select>
      </div>

      {loading ? <p className="muted">Loading slots…</p> : slots.length === 0 ? (
        <p className="muted">No slots on this date.</p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {slots.map((s) => {
            const isCurrent = new Date(s.start).getTime() === new Date(currentIso).getTime();
            // A slot held by SOMEBODY ELSE is unpickable. This booking's own slot
            // reads as taken too, so it is excluded from that check.
            const blocked = s.taken && !isCurrent;
            return (
              <button
                key={s.start}
                className={`btn ${isCurrent ? '' : 'secondary'} sm`}
                disabled={blocked || busy || isCurrent}
                title={blocked
                  ? `Full — ${s.used}/${capacity} places taken`
                  : s.past ? 'In the past' : `${s.used || 0}/${capacity} taken`}
                style={{
                  opacity: blocked ? 0.45 : 1,
                  textDecoration: blocked ? 'line-through' : 'none',
                }}
                onClick={() => {
                  if (window.confirm(`Move this call to ${s.label} on ${date}?`)) onPick(s.start);
                }}
              >
                {s.label}{isCurrent ? ' (now)' : ''}{s.past && !blocked ? ' ·past' : ''}
              </button>
            );
          })}
        </div>
      )}

      <div className="actions">
        <button className="btn secondary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
