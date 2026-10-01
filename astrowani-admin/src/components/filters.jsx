// Shared filter toolkit for admin list pages: date-range chips with a custom from/to
// range, mutually-exclusive chip groups, sortable table headers and the sort itself.
// Lives here rather than in one page because Customer Tracking and the consultation
// record must filter and sort identically -- two copies drift, and a date chip that
// means "last 7 days" on one page and "this week" on another is a reporting bug.

// Date-range filter options. `week` and `month` keep their original keys because the
// stat cards above the table toggle them by key; everything else here is additive.
// `custom` is not in this list — it is rendered separately, because it is the only one
// that needs two date inputs and it must not appear in the per-chip counts.
export const DATE_FILTERS = [
  { key: 'all', label: 'Any Time' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'Last 7 Days' },
  { key: 'last30', label: 'Last 30 Days' },
  { key: 'last90', label: 'Last 90 Days' },
  { key: 'month', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
];

export const EMPTY_RANGE = { from: '', to: '' };

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

// `range` is only consulted for the 'custom' key. A custom range with neither end set
// filters nothing rather than everything — picking "Custom" and then typing a date
// should narrow the list, never blank it out before you have finished typing.
export function inRange(created, filter, range) {
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

export const chipStyle = (active) => ({
  borderRadius: 20,
  fontWeight: active ? 700 : 500,
  background: active ? 'var(--maroon)' : undefined,
  color: active ? '#fff' : undefined,
});

export const dateInputStyle = { padding: '4px 8px', borderRadius: 8, fontSize: 12.5 };
export const numInputStyle = { width: 94, padding: '5px 8px', borderRadius: 8, fontSize: 12.5 };

// One row of mutually-exclusive chips. Used for every yes/no-ish filter on this page so
// they all look and behave the same way.
export function ChipGroup({ label, options, value, onChange, counts }) {
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
export function DateRangeChips({ value, onChange, range, onRangeChange, counts }) {
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
export function SortableTh({ label, sortKey, sort, setSort, numeric, align, title }) {
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
export function sortRows(rows, sort, accessors) {
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
