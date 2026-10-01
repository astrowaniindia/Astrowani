import { useEffect, useState, useMemo } from 'react';
import client from '../api/client';
import Modal from '../components/Modal';

// Date-range filter options. `week` and `month` keep their original keys because the
// stat cards above the table toggle them by key; everything else here is additive.
// `custom` is not in this list — it is rendered separately, because it is the only one
// that needs two date inputs and it must not appear in the per-chip counts.
const DATE_FILTERS = [
  { key: 'all', label: 'Any Time' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'Last 7 Days' },
  { key: 'last30', label: 'Last 30 Days' },
  { key: 'last90', label: 'Last 90 Days' },
  { key: 'month', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
];

const EMPTY_RANGE = { from: '', to: '' };

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

// `range` is only consulted for the 'custom' key. A custom range with neither end set
// filters nothing rather than everything — picking "Custom" and then typing a date
// should narrow the list, never blank it out before you have finished typing.
function inRange(created, filter, range) {
  if (filter === 'all') return true;
  if (!created) return false;
  const c = new Date(created);

  if (filter === 'custom') {
    const from = range?.from ? startOfDay(new Date(range.from)) : null;
    const to = range?.to ? endOfDay(new Date(range.to)) : null;
    if (!from && !to) return true;
    if (from && c < from) return false;
    if (to && c > to) return false;
    return true;
  }

  const now = new Date();
  const today = startOfDay(now);
  const daysAgo = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d;
  };

  if (filter === 'today') return c >= today;
  if (filter === 'yesterday') return c >= daysAgo(1) && c < today;
  if (filter === 'week') return c >= daysAgo(6); // last 7 days incl. today
  if (filter === 'last30') return c >= daysAgo(29);
  if (filter === 'last90') return c >= daysAgo(89);
  if (filter === 'month') return c >= new Date(now.getFullYear(), now.getMonth(), 1);
  if (filter === 'lastMonth') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    return c >= start && c < end;
  }
  return true;
}

const chipStyle = (active) => ({
  borderRadius: 20,
  fontWeight: active ? 700 : 500,
  background: active ? 'var(--maroon)' : undefined,
  color: active ? '#fff' : undefined,
});

const dateInputStyle = { padding: '4px 8px', borderRadius: 8, fontSize: 12.5 };
const numInputStyle = { width: 94, padding: '5px 8px', borderRadius: 8, fontSize: 12.5 };

// One row of mutually-exclusive chips. Used for every yes/no-ish filter on this page so
// they all look and behave the same way.
function ChipGroup({ label, options, value, onChange, counts }) {
  return (
    <>
      {label && <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>}
      <div className="btn-group" style={{ flexWrap: 'wrap' }}>
        {options.map((o) => (
          <button
            key={o.key}
            className={`btn sm ${value === o.key ? '' : 'ghost'}`}
            style={chipStyle(value === o.key)}
            onClick={() => onChange(o.key)}
            title={o.title || undefined}
          >
            {o.label}{counts ? ` (${(counts[o.key] ?? 0).toLocaleString('en-IN')})` : ''}
          </button>
        ))}
      </div>
    </>
  );
}

// Date chips + the custom from/to pair. `counts` is optional.
function DateRangeChips({ value, onChange, range, onRangeChange, counts }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
      <div className="btn-group" style={{ flexWrap: 'wrap' }}>
        {DATE_FILTERS.map((f) => (
          <button
            key={f.key}
            className={`btn sm ${value === f.key ? '' : 'ghost'}`}
            style={chipStyle(value === f.key)}
            onClick={() => onChange(f.key)}
          >
            {f.label}{counts ? ` (${(counts[f.key] ?? 0).toLocaleString('en-IN')})` : ''}
          </button>
        ))}
        <button
          className={`btn sm ${value === 'custom' ? '' : 'ghost'}`}
          style={chipStyle(value === 'custom')}
          onClick={() => onChange('custom')}
          title="Pick an exact date range"
        >
          📅 Custom
        </button>
      </div>

      {value === 'custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <input
            type="date"
            value={range.from || ''}
            max={range.to || undefined}
            onChange={(e) => onRangeChange({ ...range, from: e.target.value })}
            style={dateInputStyle}
            title="From (inclusive)"
          />
          <span className="muted" style={{ fontSize: 12 }}>to</span>
          <input
            type="date"
            value={range.to || ''}
            min={range.from || undefined}
            onChange={(e) => onRangeChange({ ...range, to: e.target.value })}
            style={dateInputStyle}
            title="To (inclusive)"
          />
          {(range.from || range.to) && (
            <button className="btn ghost sm" onClick={() => onRangeChange({ ...EMPTY_RANGE })}>Clear dates</button>
          )}
        </div>
      )}
    </div>
  );
}

// Clickable column header. Clicking an inactive column starts it in its natural
// direction (biggest-first for numbers and dates, A-Z for text); clicking the active
// one flips it.
function SortableTh({ label, sortKey, sort, setSort, numeric, align, title }) {
  const active = sort.key === sortKey;
  const toggle = () =>
    setSort(
      active
        ? { key: sortKey, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
        : { key: sortKey, dir: numeric ? 'desc' : 'asc' },
    );
  return (
    <th
      onClick={toggle}
      style={{ textAlign: align || 'left', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
      title={title || `Sort by ${label}`}
    >
      {label}{' '}
      <span style={{ opacity: active ? 1 : 0.32, fontSize: 10 }}>
        {active ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}
      </span>
    </th>
  );
}

// Blanks sort last whichever way the column is pointing — a row with no last-recharge
// date is "no answer", not "the smallest date", and floating those to the top of an
// ascending sort buries the rows you actually asked for.
function sortRows(rows, sort, accessors) {
  const acc = accessors[sort.key];
  if (!acc) return rows;
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = acc(a);
    const vb = acc(b);
    const aEmpty = va === null || va === undefined || va === '';
    const bEmpty = vb === null || vb === undefined || vb === '';
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * dir;
    return (va - vb) * dir;
  });
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

function formatDob(d) {
  if (!d) return null;
  const [y, m, day] = String(d).split('-').map(Number);
  if (!y || !m || !day) return String(d);
  return new Date(y, m - 1, day).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTob(t) {
  if (!t) return null;
  const [h, min] = String(t).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(min)) return String(t);
  const d = new Date(2000, 0, 1, h, min);
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

const WALLET_FILTERS = [
  { key: 'all', label: 'Any Balance' },
  { key: 'has', label: 'Has Balance' },
  { key: 'zero', label: 'Zero Balance' },
];

// "Unknown" rather than "still installed": a customer with no push token cannot be
// reached, so there is no way to learn whether they removed the app. Labelling that
// group as installed would invent a fact, and it is the LARGER group (471 of 1,267 on
// 2026-09-28), so the invented fact would dominate any churn figure read off this page.
const APP_FILTERS = [
  { key: 'all', label: 'Everyone' },
  { key: 'removed', label: '🚫 App removed' },
  { key: 'push', label: '🔔 Push on' },
  { key: 'nopush', label: 'Unknown (no push)' },
];

const LIST_SORT = {
  name: (r) => (r.name || '').toLowerCase(),
  mobile: (r) => (r.mobile || '').toLowerCase(),
  email: (r) => (r.email || '').toLowerCase(),
  wallet_balance: (r) => Number(r.wallet_balance || 0),
  created_at: (r) => (r.created_at ? new Date(r.created_at).getTime() : null),
};

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const RECHARGE_COUNT_FILTERS = [
  { key: 'all', label: 'Any' },
  { key: 'one', label: 'First-timers (1)', title: 'Recharged exactly once' },
  { key: 'few', label: 'Repeat (2-4)' },
  { key: 'many', label: 'Loyal (5+)' },
];

const SPEND_FILTERS = [
  { key: 'all', label: 'Any' },
  { key: 'spent', label: 'Has spent' },
  { key: 'unspent', label: 'Spent nothing', title: 'Recharged but never used the money' },
];

// Which date the date chips apply to. "Last recharge" is the default because the usual
// question on this tab is "who paid us recently", but "who did we acquire in October"
// needs the signup date and "when did they first convert" needs the first recharge.
const RECHARGE_DATE_BASIS = [
  { key: 'last', label: 'Last recharge' },
  { key: 'first', label: 'First recharge' },
  { key: 'joined', label: 'Signup date' },
];

const RECHARGE_SORT = {
  name: (r) => (r.name || '').toLowerCase(),
  totalRecharged: (r) => r.totalRecharged,
  rechargeCount: (r) => r.rechargeCount,
  lastRechargeAt: (r) => (r.lastRechargeAt ? new Date(r.lastRechargeAt).getTime() : null),
  walletBalance: (r) => r.walletBalance,
  totalSpent: (r) => r.totalSpent,
};

// "Recharge Activity" section: customers who have ever completed a paid recharge,
// with a running total of what they've actually spent since, broken down by category.
function RechargeActivitySection() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryLabels, setCategoryLabels] = useState({});
  const [truncated, setTruncated] = useState(false);
  const [timeline, setTimeline] = useState(null); // { customer, loading, error, events }
  const [rechargeTimeFilter, setRechargeTimeFilter] = useState('all');
  const [rechargeRange, setRechargeRange] = useState({ ...EMPTY_RANGE }); // used when the filter is 'custom'
  const [dateBasis, setDateBasis] = useState('last'); // which date the chips above apply to
  const [rechargeWalletFilter, setRechargeWalletFilter] = useState('all'); // reuses WALLET_FILTERS
  const [categoryFilter, setCategoryFilter] = useState('all'); // 'all' or a spend category key
  const [countFilter, setCountFilter] = useState('all'); // how many times they recharged
  const [spendFilter, setSpendFilter] = useState('all'); // have they spent any of it
  const [minRecharged, setMinRecharged] = useState('');
  const [maxRecharged, setMaxRecharged] = useState('');
  const [sort, setSort] = useState({ key: 'totalRecharged', dir: 'desc' });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/api/admin/customers/recharge-activity');
      setRows(data.data || []);
      setCategoryLabels(data.categoryLabels || {});
      setTruncated(!!data.truncated);
    } catch (e) {
      console.error('Failed to load recharge activity:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Only categories actually present in the loaded data — no point offering a
  // "Coin purchases" chip when nobody in this dataset has bought coins.
  const categoriesPresent = useMemo(() => {
    const set = new Set();
    for (const r of rows) {
      for (const cat of Object.keys(r.spend || {})) set.add(cat);
    }
    return [...set].sort((a, b) => (categoryLabels[a] || a).localeCompare(categoryLabels[b] || b));
  }, [rows, categoryLabels]);

  const filtered = useMemo(() => {
    // Blank or non-numeric bounds are simply absent bounds, so a half-typed "1" in the
    // max box narrows the list instead of emptying it the moment it is cleared again.
    const min = minRecharged.trim() === '' ? null : Number(minRecharged);
    const max = maxRecharged.trim() === '' ? null : Number(maxRecharged);
    const q = search.trim().toLowerCase();

    return rows.filter((r) => {
      const basisDate = dateBasis === 'joined' ? r.createdAt : dateBasis === 'first' ? r.firstRechargeAt : r.lastRechargeAt;
      if (!inRange(basisDate, rechargeTimeFilter, rechargeRange)) return false;

      const wallet = Number(r.walletBalance || 0);
      if (rechargeWalletFilter === 'has' && !(wallet > 0)) return false;
      if (rechargeWalletFilter === 'zero' && !(wallet <= 0)) return false;

      if (categoryFilter !== 'all' && !((r.spend || {})[categoryFilter] > 0)) return false;

      const n = Number(r.rechargeCount || 0);
      if (countFilter === 'one' && n !== 1) return false;
      if (countFilter === 'few' && !(n >= 2 && n <= 4)) return false;
      if (countFilter === 'many' && !(n >= 5)) return false;

      if (spendFilter === 'spent' && !(r.totalSpent > 0)) return false;
      if (spendFilter === 'unspent' && r.totalSpent > 0) return false;

      if (min !== null && Number.isFinite(min) && r.totalRecharged < min) return false;
      if (max !== null && Number.isFinite(max) && r.totalRecharged > max) return false;

      if (!q) return true;
      return (
        (r.name || '').toLowerCase().includes(q) ||
        (r.mobile || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, rechargeTimeFilter, rechargeRange, dateBasis, rechargeWalletFilter, categoryFilter, countFilter, spendFilter, minRecharged, maxRecharged]);

  const sorted = useMemo(() => sortRows(filtered, sort, RECHARGE_SORT), [filtered, sort]);

  const filtersActive =
    rechargeTimeFilter !== 'all' || dateBasis !== 'last' || rechargeWalletFilter !== 'all' ||
    categoryFilter !== 'all' || countFilter !== 'all' || spendFilter !== 'all' ||
    minRecharged !== '' || maxRecharged !== '' || search !== '';

  const clearFilters = () => {
    setRechargeTimeFilter('all');
    setRechargeRange({ ...EMPTY_RANGE });
    setDateBasis('last');
    setRechargeWalletFilter('all');
    setCategoryFilter('all');
    setCountFilter('all');
    setSpendFilter('all');
    setMinRecharged('');
    setMaxRecharged('');
    setSearch('');
  };

  // Exports exactly what is on screen, in the order it is on screen — an export that
  // silently ignored the filters would be the one number nobody could reconcile.
  const exportCSV = () => {
    const cats = categoriesPresent;
    const headers = ['Name', 'Mobile', 'Email', 'Total Recharged (INR)', 'Recharges', 'First Recharge', 'Last Recharge', 'Current Balance (INR)', 'Total Spent (INR)', ...cats.map((c) => `${categoryLabels[c] || c} (INR)`)];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = sorted.map((r) => [
      esc(r.name || ''),
      esc(r.isDeleted ? 'Freed' : r.mobile || ''),
      esc(r.email || ''),
      r.totalRecharged,
      r.rechargeCount,
      r.firstRechargeAt || '',
      r.lastRechargeAt || '',
      r.walletBalance,
      r.totalSpent,
      ...cats.map((c) => (r.spend || {})[c] || 0),
    ].join(','));
    const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `astrowani-recharges-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Reset to a sane state whenever the underlying dataset changes shape so a stale
  // category filter (e.g. picked before a reload) can't silently hide everything.
  useEffect(() => {
    if (categoryFilter !== 'all' && !categoriesPresent.includes(categoryFilter)) {
      setCategoryFilter('all');
    }
  }, [categoriesPresent, categoryFilter]);

  const totals = useMemo(() => {
    // Totals track the FILTERED set, so the stat cards move with the chips/search
    // instead of always describing the whole unfiltered table.
    const totalRecharged = filtered.reduce((s, r) => s + r.totalRecharged, 0);
    const totalSpent = filtered.reduce((s, r) => s + r.totalSpent, 0);
    return { customers: filtered.length, totalRecharged, totalSpent };
  }, [filtered]);

  const openTimeline = async (customer) => {
    setTimeline({ customer, loading: true });
    try {
      const { data } = await client.get(`/api/admin/customers/${customer.id}/wallet-timeline`);
      setTimeline({ customer, events: data.data || [], categoryLabels: data.categoryLabels || {} });
    } catch (e) {
      setTimeline({ customer, error: e.response?.data?.message || e.message });
    }
  };

  return (
    <div>
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', marginBottom: 20 }}>
        <div className="stat">
          <div className="stat-header"><span className="label">Customers Who Recharged</span></div>
          <div className="value">{loading ? '…' : totals.customers.toLocaleString('en-IN')}</div>
        </div>
        <div className="stat">
          <div className="stat-header"><span className="label">Total Recharged</span></div>
          <div className="value" style={{ color: 'var(--emerald)' }}>{loading ? '…' : `₹${totals.totalRecharged.toLocaleString('en-IN')}`}</div>
        </div>
        <div className="stat">
          <div className="stat-header"><span className="label">Total Spent Since</span></div>
          <div className="value">{loading ? '…' : `₹${totals.totalSpent.toLocaleString('en-IN')}`}</div>
          <div className="stat-footer"><span className="muted">Across sessions, reports, shop, gifts…</span></div>
        </div>
      </div>

      <div className="card" style={{ padding: '14px 18px', marginBottom: 20 }}>
        {/* Row 1 — date range + what the dates mean + search */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
          <DateRangeChips
            value={rechargeTimeFilter}
            onChange={setRechargeTimeFilter}
            range={rechargeRange}
            onRangeChange={setRechargeRange}
          />

          <div className="search-bar-wrap">
            <span className="search-bar-icon">&#128269;</span>
            <input
              type="text"
              placeholder="Search recharged customers by name, phone, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', fontSize: 14 }}
              >
                &#10005;
              </button>
            )}
          </div>
        </div>

        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Dates above apply to:</span>
          <ChipGroup options={RECHARGE_DATE_BASIS} value={dateBasis} onChange={setDateBasis} />
        </div>

        {/* Row 2 — how often they recharged, how much, and what they did with it */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <ChipGroup label="Recharges:" options={RECHARGE_COUNT_FILTERS} value={countFilter} onChange={setCountFilter} />

          <span className="muted" style={{ fontSize: 12, fontWeight: 600, marginLeft: 6 }}>Recharged &#8377;:</span>
          <input
            type="number"
            min="0"
            placeholder="min"
            value={minRecharged}
            onChange={(e) => setMinRecharged(e.target.value)}
            style={numInputStyle}
            title="Lowest total recharged"
          />
          <span className="muted" style={{ fontSize: 12 }}>&ndash;</span>
          <input
            type="number"
            min="0"
            placeholder="max"
            value={maxRecharged}
            onChange={(e) => setMaxRecharged(e.target.value)}
            style={numInputStyle}
            title="Highest total recharged"
          />
        </div>

        {/* Row 3 — wallet state and spending */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <ChipGroup label="Wallet:" options={WALLET_FILTERS} value={rechargeWalletFilter} onChange={setRechargeWalletFilter} />

          <ChipGroup label="Spending:" options={SPEND_FILTERS} value={spendFilter} onChange={setSpendFilter} />

          <span className="muted" style={{ fontSize: 12, fontWeight: 600, marginLeft: 6 }}>Spent on:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ padding: '5px 10px', borderRadius: 20, fontSize: 12.5, maxWidth: 240 }}
          >
            <option value="all">Any category</option>
            {categoriesPresent.map((cat) => (
              <option key={cat} value={cat}>{categoryLabels[cat] || cat}</option>
            ))}
          </select>
        </div>

        {/* Row 4 — what the filters left, and the way back out of them */}
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <span className="muted" style={{ fontSize: 12.5 }}>
            Showing <strong style={{ color: 'var(--text-primary)' }}>{filtered.length.toLocaleString('en-IN')}</strong>
            {filtered.length !== rows.length ? ` of ${rows.length.toLocaleString('en-IN')}` : ''} customers
          </span>
          <div className="btn-group">
            {filtersActive && (
              <button className="btn ghost sm" onClick={clearFilters} title="Reset every filter on this tab">
                &#10005; Clear filters
              </button>
            )}
            <button className="btn ghost sm" onClick={exportCSV} disabled={!filtered.length} title="Download the rows currently shown">
              &#128229; Export CSV
            </button>
          </div>
        </div>

        {truncated && (
          <div className="muted" style={{ marginTop: 10, fontSize: 12, color: 'var(--red, #c0392b)' }}>
            &#9888;&#65039; This dataset is large enough that some rows may be missing from the totals above &mdash; treat these as a lower bound.
          </div>
        )}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortableTh label="Customer" sortKey="name" sort={sort} setSort={setSort} />
              <SortableTh label="Recharged" sortKey="totalRecharged" sort={sort} setSort={setSort} numeric />
              <SortableTh label="Recharges" sortKey="rechargeCount" sort={sort} setSort={setSort} numeric />
              <SortableTh label="Last Recharge" sortKey="lastRechargeAt" sort={sort} setSort={setSort} numeric />
              <SortableTh label="Current Balance" sortKey="walletBalance" sort={sort} setSort={setSort} numeric />
              <SortableTh label="Spent Since (by category)" sortKey="totalSpent" sort={sort} setSort={setSort} numeric title="Sort by total spent" />
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="empty" style={{ padding: '36px 20px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><span className="pulse-dot" /> Loading recharge activity…</div>
              </td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="empty" style={{ padding: '48px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>💳</div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>
                  {rows.length ? 'No customer matches these filters' : 'No customers have recharged their wallet yet'}
                </div>
                {rows.length > 0 && (
                  <button className="btn ghost sm" style={{ marginTop: 12 }} onClick={clearFilters}>Clear filters</button>
                )}
              </td></tr>
            )}
            {!loading && sorted.map((r) => (
              <tr key={r.id}>
                <td>
                  <div style={{ fontWeight: 700 }}>{r.name || 'Anonymous User'}{r.isDeleted ? ' (deleted)' : ''}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{r.mobile || r.email || '—'}</div>
                </td>
                <td>
                  <span style={{ fontWeight: 700, color: 'var(--emerald)' }}>₹{r.totalRecharged.toLocaleString('en-IN')}</span>
                </td>
                <td>{r.rechargeCount}</td>
                <td style={{ fontSize: 12.5 }}>{formatDateTime(r.lastRechargeAt)}</td>
                <td>
                  <span style={{ fontWeight: 700, color: r.walletBalance > 0 ? '#059669' : 'var(--text-primary)' }}>
                    ₹{r.walletBalance.toLocaleString('en-IN')}
                  </span>
                </td>
                <td>
                  {Object.keys(r.spend || {}).length === 0 ? (
                    <span className="muted" style={{ fontSize: 12 }}>Nothing spent yet</span>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 320 }}>
                      {Object.entries(r.spend)
                        .sort((a, b) => b[1] - a[1])
                        .map(([cat, amt]) => (
                          <span key={cat} className="pill-badge" style={{ fontSize: 10.5 }} title={categoryLabels[cat] || cat}>
                            {categoryLabels[cat] || cat}: ₹{amt.toLocaleString('en-IN')}
                          </span>
                        ))}
                    </div>
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn ghost sm" onClick={() => openTimeline(r)}>View Timeline</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {timeline && (
        <Modal title={`Wallet Timeline — ${timeline.customer.name || timeline.customer.mobile || 'Customer'}`} onClose={() => setTimeline(null)}>
          {timeline.loading && <div className="muted">Loading…</div>}
          {timeline.error && <div style={{ color: 'var(--red, #c0392b)' }}>{timeline.error}</div>}
          {timeline.events && (
            timeline.events.length === 0 ? (
              <div className="muted">No wallet activity recorded.</div>
            ) : (
              <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                {timeline.events.map((e, i) => {
                  const isCredit = e.kind === 'credit' || (e.kind === 'recharge' && e.status === 'paid');
                  // For a session-billing debit, show the specific kind (chat/audio/video)
                  // and who it was with instead of the generic "Chat / call / video sessions"
                  // bucket label — that bucket is still fine for the summary table, but a
                  // per-event timeline should say which one this actually was.
                  const label = e.kind === 'recharge'
                    ? (e.status === 'paid' ? 'Recharge' : `Recharge (${e.status})`)
                    : (e.kind === 'debit'
                      ? (e.sessionType || (timeline.categoryLabels[e.category] || 'Debit'))
                      : 'Credit');
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
                        {e.astrologerName && (
                          <div className="muted" style={{ fontSize: 11.5 }}>with {e.astrologerName}</div>
                        )}
                        <div className="muted" style={{ fontSize: 11.5 }}>{e.description}</div>
                        <div className="muted" style={{ fontSize: 11 }}>{formatDateTime(e.at)}</div>
                      </div>
                      <div style={{ fontWeight: 700, color: isCredit ? '#059669' : 'var(--maroon)', whiteSpace: 'nowrap' }}>
                        {isCredit ? '+' : '−'}₹{e.amount.toLocaleString('en-IN')}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
          <div className="actions" style={{ marginTop: 16 }}>
            <button className="btn secondary" onClick={() => setTimeline(null)}>Close</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// "Profile details" block of the customer popup: every field the customer can fill,
// showing the value or a dash, plus a filled-count so gaps are obvious at a glance.
function ProfileDetails({ profile }) {
  const box = { marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border-light)' };
  const heading = <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800 }}>Profile details</h4>;

  if (!profile || profile.loading) {
    return <div style={box}>{heading}<div className="muted">Loading…</div></div>;
  }
  if (profile.error) {
    return <div style={box}>{heading}<div style={{ color: 'var(--red, #c0392b)' }}>{profile.error}</div></div>;
  }

  const p = profile.data || {};
  const photo = (src, alt) => (src
    ? <a href={src} target="_blank" rel="noreferrer"><img src={src} alt={alt} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border-light)' }} /></a>
    : null);

  const fields = [
    ['Name', p.name],
    ['Gender', p.gender],
    ['Date of Birth', formatDob(p.dob)],
    ['Time of Birth', formatTob(p.time_of_birth)],
    ['Place of Birth', p.place_of_birth],
    ['State', p.state],
    ['Marital Status', p.marital_status],
    ['Email', p.email],
    ['Profile Photo', photo(p.profile_image, 'Profile')],
    ['Palm Photo', photo(p.hand_image, 'Palm')],
  ];
  const filled = fields.filter(([, v]) => v != null && v !== '').length;

  const extras = [
    ['Referral Code', p.referral_code],
    ['Coin Balance', p.coin_balance != null ? String(p.coin_balance) : null],
    ['Terms Accepted', p.terms_accepted_at ? `${new Date(p.terms_accepted_at).toLocaleString('en-IN')}${p.terms_version ? ` (v${p.terms_version})` : ''}` : null],
    ['Free Chat Used', p.free_bot_chat_credited_at ? new Date(p.free_bot_chat_credited_at).toLocaleString('en-IN') : null],
  ];

  const cell = ([label, value]) => (
    <div className="field" key={label} style={{ marginBottom: 10 }}>
      <label>
        {label}{' '}
        {fields.some(([l]) => l === label) && (
          <span className={`pill-badge ${value ? 'green' : ''}`} style={{ fontSize: 10, marginLeft: 4, ...(value ? {} : { background: 'var(--border-light)', color: 'var(--text-light)' }) }}>
            {value ? 'Filled' : 'Not filled'}
          </span>
        )}
      </label>
      <div>{value || '—'}</div>
    </div>
  );

  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        {heading}
        <span className="muted" style={{ fontSize: 12 }}>{filled} of {fields.length} filled</span>
      </div>
      <div className="two-col">{fields.slice(0, 2).map(cell)}</div>
      <div className="two-col">{fields.slice(2, 4).map(cell)}</div>
      <div className="two-col">{fields.slice(4, 6).map(cell)}</div>
      <div className="two-col">{fields.slice(6, 8).map(cell)}</div>
      <div className="two-col">{fields.slice(8, 10).map(cell)}</div>
      <div className="two-col">{extras.slice(0, 2).map(cell)}</div>
      <div className="two-col">{extras.slice(2, 4).map(cell)}</div>
    </div>
  );
}

// Page numbers to render: always first and last, plus a window around the current
// page, with ellipses for the gaps. At 1,200+ customers a naive 1..N row of buttons
// would be 25 buttons wide and wrap onto three lines.
function pageWindow(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out = [1];
  const from = Math.max(2, current - 1);
  const to = Math.min(total - 1, current + 1);
  if (from > 2) out.push('...');
  for (let i = from; i <= to; i++) out.push(i);
  if (to < total - 1) out.push('...');
  out.push(total);
  return out;
}

export default function Customers() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [timeFilter, setTimeFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ ...EMPTY_RANGE }); // used when timeFilter is 'custom'
  const [walletFilter, setWalletFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'created_at', dir: 'desc' });
  const [appFilter, setAppFilter] = useState('all'); // 'all' | 'removed' | 'push' | 'nopush'
  const [view, setView] = useState('list'); // 'list' | 'recharges'
  const [topup, setTopup] = useState(null); // customer being topped up
  const [amount, setAmount] = useState('');
  const [walletMode, setWalletMode] = useState('add'); // 'add' | 'remove'
  const [walletReason, setWalletReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletedCount, setDeletedCount] = useState(0);
  const [inspecting, setInspecting] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [profile, setProfile] = useState(null); // { loading } | { error } | { data }
  // Paging is CLIENT-side: the route already returns every customer in one response
  // (it has to, because the four stat cards and the tab counts are computed from the
  // whole set). This only limits how many rows are RENDERED — 1,200+ <tr>s made the
  // page scroll forever and re-render slowly on every keystroke in the search box.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Load everything the customer has filled in whenever the details popup opens.
  useEffect(() => {
    if (!inspecting?.id) { setProfile(null); return; }
    let cancelled = false;
    setProfile({ loading: true });
    client.get(`/api/admin/customers/${inspecting.id}/profile`)
      .then(({ data }) => { if (!cancelled) setProfile({ data: data?.data || {} }); })
      .catch((e) => { if (!cancelled) setProfile({ error: e?.response?.data?.message || 'Could not load profile details' }); });
    return () => { cancelled = true; };
  }, [inspecting?.id]);

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
    // `appRemoved` counts customers Firebase has told us no longer have the app. It is
    // deliberately NOT presented as a churn rate: the denominator would have to be the
    // push-enabled population, because a customer who never granted notification
    // permission can never be detected either way. `pushOff` is that blind spot, shown
    // beside it so the removed figure is never read as the whole story.
    const appRemoved = active.filter((r) => r.app_removed_at).length;
    const pushOn = active.filter((r) => !r.app_removed_at && r.fcm_token).length;
    return {
      total: active.length,
      today,
      week,
      month,
      appRemoved,
      pushOn,
      pushOff: active.length - appRemoved - pushOn,
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
      if (!inRange(r.created_at, timeFilter, dateRange)) return false;
      const wallet = Number(r.wallet_balance || 0);
      if (walletFilter === 'has' && !(wallet > 0)) return false;
      if (walletFilter === 'zero' && !(wallet <= 0)) return false;
      if (appFilter === 'removed' && !r.app_removed_at) return false;
      if (appFilter === 'push' && !(r.fcm_token && !r.app_removed_at)) return false;
      if (appFilter === 'nopush' && (r.fcm_token || r.app_removed_at)) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase().trim();
      const name = (r.name || '').toLowerCase();
      const mobile = (r.mobile || '').toLowerCase();
      const email = (r.email || '').toLowerCase();
      const id = String(r.id || '').toLowerCase();
      return name.includes(q) || mobile.includes(q) || email.includes(q) || id.includes(q);
    });
  }, [rows, timeFilter, dateRange, walletFilter, appFilter, search]);

  const sortedRows = useMemo(() => sortRows(filteredRows, sort, LIST_SORT), [filteredRows, sort]);

  const filtersActive =
    timeFilter !== 'all' || walletFilter !== 'all' || appFilter !== 'all' || search !== '';

  const clearFilters = () => {
    setTimeFilter('all');
    setDateRange({ ...EMPTY_RANGE });
    setWalletFilter('all');
    setAppFilter('all');
    setSearch('');
  };

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));

  // Any change to what is being filtered puts you back on page 1. Without this you can
  // search from page 9 and land on an empty table that looks like "no results" when the
  // matches are all sitting on page 1.
  useEffect(() => { setPage(1); }, [timeFilter, dateRange, walletFilter, appFilter, search, showDeleted, pageSize, sort]);

  // Clamped at RENDER time, not in an effect. A clamping effect raced the reset above:
  // both run in the same commit, the clamp still sees the pre-reset `page`, and its
  // setPage wins — so switching to "Joined Today" from page 25 landed on page 3 of 3
  // ("Showing 101-115 of 115") instead of page 1. Deriving it has no such ordering
  // hazard, and it still covers the other case (deleting the last row on the final
  // page steps back instead of showing an empty table).
  const safePage = Math.min(page, totalPages);

  const pageStart = (safePage - 1) * pageSize;
  const pagedRows = useMemo(
    () => sortedRows.slice(pageStart, pageStart + pageSize),
    [sortedRows, pageStart, pageSize],
  );

  const closeTopup = () => {
    setTopup(null);
    setAmount('');
    setWalletMode('add');
    setWalletReason('');
  };

  const submitTopup = async () => {
    const amt = Math.abs(Number(amount));
    if (!amt) return;
    const removing = walletMode === 'remove';
    const balance = Number(topup.wallet_balance || 0);
    if (removing && amt > balance) {
      alert(`You can remove at most ₹${balance.toLocaleString('en-IN')} — that is this customer's whole balance.`);
      return;
    }
    const label = topup.name || topup.mobile || 'this customer';
    if (removing && !window.confirm(`Remove ₹${amt.toLocaleString('en-IN')} from ${label}'s wallet?`)) return;
    setBusy(true);
    try {
      await client.post(`/api/admin/customers/${topup.id}/wallet`, {
        amount: removing ? -amt : amt,
        description: walletReason.trim() || (removing ? 'Admin wallet deduction' : 'Admin wallet credit'),
      });
      closeTopup();
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
    const lines = sortedRows.map((r) => [
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
        {view === 'list' && (
          <div className="btn-group">
            <button className="btn secondary sm" onClick={() => load()} title="Reload customer list">
              <span>🔄</span> Refresh
            </button>
            <button className="btn ghost sm" onClick={exportCSV} title="Export filtered customers to CSV">
              <span>📥</span> Export CSV
            </button>
          </div>
        )}
      </div>

      {/* ── View switcher ── */}
      <div className="btn-group" style={{ marginBottom: 20 }}>
        <button
          className={`btn sm ${view === 'list' ? '' : 'secondary'}`}
          onClick={() => setView('list')}
        >
          👥 All Customers
        </button>
        <button
          className={`btn sm ${view === 'recharges' ? '' : 'secondary'}`}
          onClick={() => setView('recharges')}
        >
          💳 Recharge Activity
        </button>
      </div>

      {view === 'recharges' ? (
        <RechargeActivitySection />
      ) : (
        <>
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

        <div
          className="stat"
          style={{ cursor: 'pointer', borderColor: appFilter === 'removed' ? 'var(--crimson)' : undefined }}
          onClick={() => { setAppFilter(appFilter === 'removed' ? 'all' : 'removed'); setTimeFilter('all'); }}
          title="Customers whose push token Firebase rejected as belonging to an uninstalled app. Only customers who had notifications enabled can ever be detected — see the note below the number."
        >
          <div className="stat-header">
            <span className="label">App Removed</span>
            <div className="stat-icon-wrap" style={{ background: 'var(--crimson-bg)', color: 'var(--crimson)' }}>🚫</div>
          </div>
          <div className="value" style={{ color: metrics.appRemoved ? 'var(--crimson)' : undefined }}>
            {loading ? '…' : metrics.appRemoved.toLocaleString('en-IN')}
          </div>
          <div className="stat-footer">
            {/* The blind spot is stated ON the card, not buried in a tooltip. Without it
                this number reads as total churn, when it can only ever describe the
                push-enabled slice — and the undetectable group is currently the bigger
                one, so the omission would mislead by a wide margin. */}
            <span className="muted">
              {loading ? ' ' : `of ${metrics.pushOn + metrics.appRemoved} detectable · ${metrics.pushOff} unknown`}
            </span>
          </div>
        </div>
      </div>

      {/* ── Filter Bar & Search ── */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Signup-date filter chips, each carrying how many customers it would show */}
          <DateRangeChips
            value={timeFilter}
            onChange={setTimeFilter}
            range={dateRange}
            onRangeChange={setDateRange}
            counts={tabCounts}
          />

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

        {/* Wallet balance filter chips */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <ChipGroup label="Wallet:" options={WALLET_FILTERS} value={walletFilter} onChange={setWalletFilter} />

          <ChipGroup label="App:" options={APP_FILTERS} value={appFilter} onChange={setAppFilter} />

          {filtersActive && (
            <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={clearFilters} title="Reset every filter on this tab">
              &#10005; Clear filters
            </button>
          )}
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
              <SortableTh label="Customer" sortKey="name" sort={sort} setSort={setSort} />
              <SortableTh label="Mobile" sortKey="mobile" sort={sort} setSort={setSort} />
              <SortableTh label="Email" sortKey="email" sort={sort} setSort={setSort} />
              <SortableTh label="Wallet" sortKey="wallet_balance" sort={sort} setSort={setSort} numeric />
              <SortableTh label="Joined Date" sortKey="created_at" sort={sort} setSort={setSort} numeric />
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
                      : `No customer signups recorded for the selected period (${DATE_FILTERS.find((f) => f.key === timeFilter)?.label || 'custom range'}).`}
                  </div>
                </td>
              </tr>
            )}

            {!loading &&
              pagedRows.map((r) => {
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
                            {/* This is "we hold a push token for them", NOT "they are on the
                                app now" and NOT "they still have it installed". A missing
                                badge usually just means notification permission was never
                                granted — on Android 13+ the app deliberately skips asking at
                                signup (see VerifyOtp.getFcmToken) — and plenty of customers
                                without it have consulted and paid. It can also be stale in
                                the other direction: nothing clears the token on logout or
                                uninstall, only on account deletion. */}
                            {!r.isDeleted && r.app_removed_at && (
                              <span
                                className="pill-badge red"
                                title={`Firebase rejected this customer's push token on ${formatDateTime(r.app_removed_at)}, which means the app is no longer installed on that device. Note the same rejection also happens if they cleared the app's data or moved to a new phone.`}
                              >
                                🚫 App removed
                              </span>
                            )}
                            {!r.isDeleted && !r.app_removed_at && r.fcm_token && (
                              <span
                                className="pill-badge blue"
                                title="Notifications are enabled — we hold a push token for this customer, so broadcasts and reminders can reach them. This is not a sign that they are using the app right now, and it is not cleared when they log out."
                              >
                                🔔 Push on
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

      {/* Pager. Sits OUTSIDE .table-wrap so it stays put instead of scrolling
          sideways with a wide table. Hidden when everything already fits. */}
      {!loading && filteredRows.length > 0 && (
        <div className="customer-pager">
          <div className="muted" style={{ fontSize: 13 }}>
            Showing <strong style={{ color: 'var(--text-primary)' }}>{pageStart + 1}</strong>
            {'–'}
            <strong style={{ color: 'var(--text-primary)' }}>{Math.min(pageStart + pageSize, filteredRows.length)}</strong>
            {' of '}
            <strong style={{ color: 'var(--text-primary)' }}>{filteredRows.length.toLocaleString('en-IN')}</strong>
            {filteredRows.length !== rows.length ? ' matching' : ''}
            {' customers'}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }} className="muted">
              Rows
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                style={{ width: 78, padding: '5px 8px' }}
              >
                {[25, 50, 100, 250].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>

            {totalPages > 1 && (
              <div className="btn-group">
                <button className="btn ghost sm" disabled={safePage === 1} onClick={() => setPage(1)} title="First page">{'«'}</button>
                <button className="btn ghost sm" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>Prev</button>
                {pageWindow(safePage, totalPages).map((n, i) => (
                  n === '...'
                    ? <span key={`gap${i}`} className="muted" style={{ padding: '0 4px', alignSelf: 'center' }}>{'…'}</span>
                    : (
                      <button
                        key={n}
                        className={`btn sm ${n === safePage ? '' : 'ghost'}`}
                        onClick={() => setPage(n)}
                        style={{ minWidth: 34 }}
                      >
                        {n}
                      </button>
                    )
                ))}
                <button className="btn ghost sm" disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)}>Next</button>
                <button className="btn ghost sm" disabled={safePage === totalPages} onClick={() => setPage(totalPages)} title="Last page">{'»'}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Wallet Top-up / Adjustment Modal ── */}
      {topup && (
        <Modal title={`Adjust Wallet — ${topup.name || topup.mobile || 'Customer'}`} onClose={closeTopup}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Current Balance:</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--maroon)' }}>
              ₹{Number(topup.wallet_balance || 0).toLocaleString('en-IN')}
            </div>
          </div>

          <div className="btn-group" style={{ marginBottom: 14 }}>
            <button
              type="button"
              className={`btn sm ${walletMode === 'add' ? '' : 'secondary'}`}
              onClick={() => setWalletMode('add')}
            >
              Add money
            </button>
            <button
              type="button"
              className={`btn sm ${walletMode === 'remove' ? 'danger' : 'secondary'}`}
              onClick={() => setWalletMode('remove')}
            >
              Remove money
            </button>
          </div>

          <div className="field">
            <label>{walletMode === 'remove' ? 'Amount to Remove (₹)' : 'Amount to Add (₹)'}</label>
            <input
              type="number"
              min="0"
              placeholder="e.g. 500"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace('-', ''))}
              autoFocus
            />
            <span className="muted" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
              {walletMode === 'remove'
                ? `Will be deducted from the wallet. Up to ₹${Number(topup.wallet_balance || 0).toLocaleString('en-IN')}.`
                : "Amount will be credited directly to the customer's wallet balance."}
            </span>
          </div>

          <div className="field">
            <label>Reason (shown in the wallet history)</label>
            <input
              type="text"
              placeholder={walletMode === 'remove' ? 'e.g. Test recharge reversed' : 'e.g. Refund for disconnected call'}
              value={walletReason}
              onChange={(e) => setWalletReason(e.target.value)}
            />
          </div>

          {walletMode === 'add' && (
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
          )}

          <div className="actions">
            <button className="btn secondary" onClick={closeTopup}>
              Cancel
            </button>
            <button
              className={`btn ${walletMode === 'remove' ? 'danger' : ''}`}
              disabled={busy || !amount || Number(amount) <= 0}
              onClick={submitTopup}
            >
              {busy
                ? (walletMode === 'remove' ? 'Removing…' : 'Crediting…')
                : (walletMode === 'remove' ? `Remove ₹${amount || 0}` : `Credit ₹${amount || 0}`)}
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
                {/* "Active account", not "Active App Customer". This field only knows
                    whether the row was soft-deleted — it has never known anything about
                    the app — and claiming app presence here directly contradicted the
                    "App removed" state in the field below it. Whether they still have
                    the app is answered there, where the evidence actually is. */}
                {inspecting.isDeleted ? (
                  <span className="badge red">Deleted / Inactive</span>
                ) : (
                  <span className="pill-badge green">Active account</span>
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
            <label>App &amp; Notifications</label>
            {inspecting.app_removed_at ? (
              <>
                <div style={{ fontSize: 12.5, color: 'var(--crimson)', fontWeight: 600 }}>
                  App removed — {formatDateTime(inspecting.app_removed_at)}
                </div>
                <div className="muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>
                  Firebase rejected this customer&apos;s push token, which means the app is no longer
                  installed on that device. The same rejection also occurs if they cleared the app&apos;s
                  data or moved to a new phone. They cannot be reached by notification until they
                  reinstall and sign in.
                </div>
              </>
            ) : inspecting.fcm_token ? (
              <>
                <div style={{ fontSize: 12.5, color: 'var(--emerald)' }}>Enabled — a push token is stored</div>
                <div className="muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>
                  Broadcasts and reminders can be delivered. If they remove the app, this turns into
                  &ldquo;App removed&rdquo; the next time a notification is sent to them.
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12.5, color: 'var(--text-light)' }}>Not enabled — no push token stored</div>
                <div className="muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>
                  Usually means notification permission was never granted, not that the app was removed.
                  Because there is no way to reach this device, we can never tell whether they still
                  have the app.
                </div>
              </>
            )}
          </div>

          <ProfileDetails profile={profile} />

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
        </>
      )}
    </div>
  );
}
