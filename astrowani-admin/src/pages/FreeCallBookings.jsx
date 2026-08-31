import { useCallback, useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import Modal from '../components/Modal';
import ImageField from '../components/ImageField';

// The free 12-minute introductory call: the offer's settings, and every booking
// made against it. Replaces the free 5-minute bot chat (Free Bot Chat page,
// switched off 2026-08-31).
//
// Settings live in one JSON blob under the app_settings key `free_call_offer`,
// saved through the existing generic /api/admin/settings PATCH — same approach as
// the Free Bot Chat persona, so this page needed no new settings endpoint.
//
// Rescheduling goes through PATCH /api/admin/free-call-bookings/:id, which shares
// the customer booking path's unique index. An admin therefore CANNOT move a call
// onto a slot someone else already holds; the server answers 409 and this page
// says so rather than silently appearing to succeed.

const OFFER_DEFAULTS = {
  enabled: false,
  durationMinutes: 12,
  slotMinutes: 30,
  openHour: 10,
  closeHour: 20,
  daysAhead: 7,
  minLeadMinutes: 60,
  // Who takes a NEW booking: 'single' auto-assigns to assignedAstrologerId,
  // 'manual' leaves it unassigned for an admin to hand out. Either way any
  // booking can be reassigned from the table below at any time.
  assignmentMode: 'manual',
  assignedAstrologerId: '',
  poolAstrologerIds: [],
  astrologerName: '',
  astrologerImage: '',
  astrologerExperience: '',
  astrologerSpecialities: '',
  headerText: '',
  bodyText: '',
  ctaText: '',
  successText: '',
};

const STATUSES = ['booked', 'completed', 'missed', 'cancelled'];
const STATUS_LABEL = {
  booked: 'booked', completed: 'done', missed: 'missed', cancelled: 'cancelled',
};

function statusBadge(s) {
  const cls = s === 'completed' ? 'green'
    : s === 'cancelled' ? 'gray'
      : s === 'missed' ? 'red' : 'blue';
  return <span className={`badge ${cls}`}>{STATUS_LABEL[s] || s}</span>;
}

// Slot times come back as real instants. They are always displayed in the offer's
// business timezone (IST), never the admin's browser timezone — an admin working
// from anywhere must read the same clock time the customer was shown.
const IST_FMT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  hour: 'numeric', minute: '2-digit', hour12: true,
});
const fmtSlot = (iso) => (iso ? IST_FMT.format(new Date(iso)) : '—');

const IST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
const istDayKey = (iso) => IST_DAY.format(new Date(iso));

const num = (v, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

export default function FreeCallBookings() {
  const [offer, setOffer] = useState(OFFER_DEFAULTS);
  const [offerLoaded, setOfferLoaded] = useState(false);
  const [savingOffer, setSavingOffer] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [upcomingFirst, setUpcomingFirst] = useState(true);

  const [astrologers, setAstrologers] = useState([]);
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [rescheduling, setRescheduling] = useState(null);
  const [noting, setNoting] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [busy, setBusy] = useState(false);

  /* ── offer settings ─────────────────────────────────────────────────────── */
  const loadOffer = useCallback(async () => {
    try {
      const { data } = await client.get('/api/admin/settings');
      const raw = data.settings?.free_call_offer;
      if (raw) setOffer({ ...OFFER_DEFAULTS, ...JSON.parse(raw) });
    } catch (e) {
      console.error('load free_call_offer failed:', e.message);
    } finally {
      setOfferLoaded(true);
    }
  }, []);

  const saveOffer = async (next) => {
    setSavingOffer(true);
    try {
      const payload = {
        ...next,
        durationMinutes: num(next.durationMinutes, 12),
        slotMinutes: num(next.slotMinutes, 30),
        openHour: num(next.openHour, 10),
        closeHour: num(next.closeHour, 20),
        daysAhead: num(next.daysAhead, 7),
        minLeadMinutes: num(next.minLeadMinutes, 60),
      };
      if (payload.closeHour <= payload.openHour) {
        alert('Closing hour must be later than opening hour.');
        return;
      }
      await client.patch('/api/admin/settings', {
        key: 'free_call_offer',
        value: JSON.stringify(payload),
      });
      setOffer(payload);
      alert('Saved. Customers see this the next time the app loads the offer.');
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    } finally {
      setSavingOffer(false);
    }
  };

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

  const changeStatus = (row, status) => {
    if (status === row.status) return;
    const verb = STATUS_LABEL[status];
    if (!window.confirm(`Mark ${row.customer_name || 'this booking'} as ${verb}?`)) return;
    patchBooking(row.id, { status });
  };

  // Sorting is done here rather than server-side so the toggle is instant. The
  // server always returns newest-slot-first; "upcoming first" re-sorts the
  // still-to-happen calls into ascending order and pushes past ones below, which
  // is the order an admin actually works in.
  const sorted = useMemo(() => {
    const now = Date.now();
    const copy = [...rows];
    if (!upcomingFirst) {
      return copy.sort((a, b) => new Date(b.slot_start) - new Date(a.slot_start));
    }
    const future = copy.filter((r) => new Date(r.slot_start).getTime() >= now)
      .sort((a, b) => new Date(a.slot_start) - new Date(b.slot_start));
    const past = copy.filter((r) => new Date(r.slot_start).getTime() < now)
      .sort((a, b) => new Date(b.slot_start) - new Date(a.slot_start));
    return [...future, ...past];
  }, [rows, upcomingFirst]);

  const counts = useMemo(() => {
    const c = { booked: 0, completed: 0, missed: 0, cancelled: 0, unassigned: 0 };
    rows.forEach((r) => {
      if (c[r.status] !== undefined) c[r.status] += 1;
      // Only still-live calls count as needing an astrologer; a missed or
      // cancelled one that nobody was assigned is not outstanding work.
      if (!r.astrologer_id && r.status === 'booked') c.unassigned += 1;
    });
    return c;
  }, [rows]);

  // Only astrologers still in the approved list count: someone suspended after
  // being added to the pool no longer takes calls, and no longer adds capacity.
  const poolCount = useMemo(
    () => (offer.poolAstrologerIds || []).filter((id) => astrologers.some((a) => a.id === id)).length,
    [offer.poolAstrologerIds, astrologers],
  );

  const todayKey = IST_DAY.format(new Date());

  return (
    <div>
      <h1 className="page-title">Free Call Bookings</h1>
      <p className="muted" style={{ marginTop: -8, marginBottom: 18 }}>
        The free {offer.durationMinutes || 12}-minute introductory call offered to brand-new
        customers. The customer picks a slot; the astrologer rings them directly — there is no
        session, wallet or billing attached to this. All times shown in IST.
      </p>

      {tableMissing && (
        <div className="card" style={{ marginBottom: 18, borderLeft: '4px solid #c0392b' }}>
          <strong>Bookings table not created yet.</strong>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Run <code>astrowani-backend/sql/free_call_booking_schema.sql</code> in the Supabase
            SQL editor. Until then the offer stays off and customers see nothing.
          </p>
        </div>
      )}

      {/* ── Offer settings ─────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="row-between">
          <h3 style={{ margin: 0 }}>
            The offer{' '}
            {offerLoaded && (offer.enabled
              ? <span className="badge green">live</span>
              : <span className="badge gray">off</span>)}
          </h3>
          <button className="btn secondary sm" onClick={() => setShowSettings((v) => !v)}>
            {showSettings ? 'Hide' : 'Edit offer'}
          </button>
        </div>

        {!showSettings && offerLoaded && (
          <p className="muted" style={{ margin: '8px 0 0' }}>
            {offer.assignmentMode === 'single'
              ? `All calls to ${astroName(astrologers.find((a) => a.id === offer.assignedAstrologerId) || {}) || '— not chosen —'}`
              : offer.assignmentMode === 'pool'
                ? `Split across ${(offer.poolAstrologerIds || []).length} astrologers`
                : 'Assigned by hand per booking'} ·
            {' '}{offer.astrologerName || 'No astrologer set'} · {offer.durationMinutes}&nbsp;min ·
            {' '}{String(offer.openHour).padStart(2, '0')}:00–{String(offer.closeHour).padStart(2, '0')}:00 ·
            {' '}{offer.slotMinutes}&nbsp;min slots · booking up to {offer.daysAhead} days ahead
          </p>
        )}

        {showSettings && (
          <div style={{ marginTop: 14 }}>
            <div className="field checkbox-row">
              <input
                id="fc-enabled" type="checkbox" checked={!!offer.enabled}
                onChange={(e) => setOffer((p) => ({ ...p, enabled: e.target.checked }))}
              />
              <label htmlFor="fc-enabled" style={{ margin: 0 }}>
                Offer is live (shown to eligible new customers)
              </label>
            </div>

            <h4 style={{ margin: '18px 0 8px' }}>Who takes the call</h4>
            <p className="muted" style={{ marginTop: -4 }}>
              This decides what happens the moment a customer books. You can always reassign
              any individual booking from the table below, whichever mode this is set to.
            </p>
            <div className="field">
              <label>Assignment</label>
              <select
                value={offer.assignmentMode}
                onChange={(e) => setOffer((p) => ({ ...p, assignmentMode: e.target.value }))}>
                <option value="manual">Assign by hand — bookings arrive unassigned</option>
                <option value="single">One astrologer takes them all, automatically</option>
                <option value="pool">Split automatically across several astrologers</option>
              </select>
            </div>
            {offer.assignmentMode === 'single' && (
              <div className="field">
                <label>Astrologer</label>
                <select
                  value={offer.assignedAstrologerId || ''}
                  onChange={(e) => setOffer((p) => ({ ...p, assignedAstrologerId: e.target.value }))}>
                  <option value="">— choose an astrologer —</option>
                  {astrologers.map((a) => (
                    <option key={a.id} value={a.id}>{astroName(a)}</option>
                  ))}
                </select>
                {!offer.assignedAstrologerId && (
                  <p className="muted" style={{ margin: '4px 0 0', color: '#c0392b' }}>
                    Nobody chosen yet, so bookings will still arrive unassigned.
                  </p>
                )}
              </div>
            )}

            {offer.assignmentMode === 'pool' && (
              <div className="field">
                <label>Astrologers sharing the calls</label>
                <p className="muted" style={{ margin: '0 0 8px' }}>
                  Each new booking goes to whoever currently has the fewest upcoming calls,
                  so the load evens out on its own — 100 bookings across two astrologers
                  lands at roughly 50 each. This also multiplies capacity: with{' '}
                  {poolCount || 'N'} astrologers, {poolCount || 'N'} different customers can
                  book the same time, one with each of them.
                </p>
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220,
                  overflowY: 'auto', border: '1px solid var(--line, #ddd)', borderRadius: 8, padding: 10,
                }}>
                  {astrologers.length === 0 && <span className="muted">No approved astrologers.</span>}
                  {astrologers.map((a) => {
                    const on = (offer.poolAstrologerIds || []).includes(a.id);
                    return (
                      <label key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) => setOffer((p) => {
                            const cur = p.poolAstrologerIds || [];
                            return {
                              ...p,
                              poolAstrologerIds: e.target.checked
                                ? [...cur, a.id]
                                : cur.filter((id) => id !== a.id),
                            };
                          })}
                        />
                        <span>{astroName(a)}</span>
                      </label>
                    );
                  })}
                </div>
                {poolCount === 0 && (
                  <p className="muted" style={{ margin: '6px 0 0', color: '#c0392b' }}>
                    Nobody selected. Bookings will arrive unassigned until you pick at least one.
                  </p>
                )}
                {poolCount === 1 && (
                  <p className="muted" style={{ margin: '6px 0 0' }}>
                    With one astrologer selected this behaves exactly like "one astrologer
                    takes them all".
                  </p>
                )}
              </div>
            )}

            <h4 style={{ margin: '18px 0 8px' }}>The astrologer shown to the customer</h4>
            <p className="muted" style={{ marginTop: -4 }}>
              This is only the face on the offer card. It is separate from who actually
              takes the call above — in "assign by hand" mode nobody is assigned yet when
              the customer is looking at this card.
            </p>
            <ImageField
              label="Astrologer photo (URL or upload)"
              value={offer.astrologerImage}
              onChange={(v) => setOffer((p) => ({ ...p, astrologerImage: v }))}
            />
            <div className="two-col">
              <div className="field"><label>Name</label>
                <input type="text" value={offer.astrologerName}
                  onChange={(e) => setOffer((p) => ({ ...p, astrologerName: e.target.value }))} /></div>
              <div className="field"><label>Experience</label>
                <input type="text" value={offer.astrologerExperience} placeholder="e.g. 15 years"
                  onChange={(e) => setOffer((p) => ({ ...p, astrologerExperience: e.target.value }))} /></div>
            </div>
            <div className="field"><label>Specialities</label>
              <input type="text" value={offer.astrologerSpecialities} placeholder="e.g. Vedic Astrology, Career, Marriage"
                onChange={(e) => setOffer((p) => ({ ...p, astrologerSpecialities: e.target.value }))} /></div>

            <h4 style={{ margin: '18px 0 8px' }}>Scheduling</h4>
            <p className="muted" style={{ marginTop: -4 }}>
              Slots are generated from these. A slot is only offered if the whole call fits
              inside the working hours, so a {offer.durationMinutes || 12}-minute call will not
              be offered in the last few minutes before closing.
            </p>
            <div className="two-col">
              <div className="field"><label>Call length (minutes)</label>
                <input type="number" min="1" max="180" value={offer.durationMinutes}
                  onChange={(e) => setOffer((p) => ({ ...p, durationMinutes: e.target.value }))} /></div>
              <div className="field"><label>Slot spacing (minutes)</label>
                <input type="number" min="5" max="240" value={offer.slotMinutes}
                  onChange={(e) => setOffer((p) => ({ ...p, slotMinutes: e.target.value }))} /></div>
            </div>
            <div className="two-col">
              <div className="field"><label>Opens at (hour, IST)</label>
                <input type="number" min="0" max="23" value={offer.openHour}
                  onChange={(e) => setOffer((p) => ({ ...p, openHour: e.target.value }))} /></div>
              <div className="field"><label>Closes at (hour, IST)</label>
                <input type="number" min="1" max="24" value={offer.closeHour}
                  onChange={(e) => setOffer((p) => ({ ...p, closeHour: e.target.value }))} /></div>
            </div>
            <div className="two-col">
              <div className="field"><label>Bookable days ahead</label>
                <input type="number" min="1" max="60" value={offer.daysAhead}
                  onChange={(e) => setOffer((p) => ({ ...p, daysAhead: e.target.value }))} /></div>
              <div className="field"><label>Minimum notice (minutes)</label>
                <input type="number" min="0" max="10080" value={offer.minLeadMinutes}
                  onChange={(e) => setOffer((p) => ({ ...p, minLeadMinutes: e.target.value }))} /></div>
            </div>

            <h4 style={{ margin: '18px 0 8px' }}>What the customer reads</h4>
            <div className="field"><label>Popup heading</label>
              <input type="text" value={offer.headerText}
                onChange={(e) => setOffer((p) => ({ ...p, headerText: e.target.value }))} /></div>
            <div className="field"><label>Popup body</label>
              <textarea rows="2" value={offer.bodyText}
                onChange={(e) => setOffer((p) => ({ ...p, bodyText: e.target.value }))} /></div>
            <div className="two-col">
              <div className="field"><label>Button text</label>
                <input type="text" value={offer.ctaText}
                  onChange={(e) => setOffer((p) => ({ ...p, ctaText: e.target.value }))} /></div>
              <div className="field"><label>Confirmation message</label>
                <input type="text" value={offer.successText}
                  onChange={(e) => setOffer((p) => ({ ...p, successText: e.target.value }))} /></div>
            </div>

            <div className="actions">
              <button className="btn" disabled={savingOffer} onClick={() => saveOffer(offer)}>
                {savingOffer ? 'Saving…' : 'Save offer'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div className="field" style={{ margin: 0, minWidth: 220 }}>
          <label>Search</label>
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Customer name, phone, astrologer, note"
          />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Astrologer</label>
          <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
            <option value="">All</option>
            <option value="unassigned">Unassigned</option>
            {astrologers.map((a) => (
              <option key={a.id} value={a.id}>{astroName(a)}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Slot from</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Slot to</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="checkbox-row">
          <input id="fc-upcoming" type="checkbox" checked={upcomingFirst}
            onChange={(e) => setUpcomingFirst(e.target.checked)} />
          <label htmlFor="fc-upcoming" style={{ margin: 0 }}>Upcoming first</label>
        </div>
        <button className="btn secondary sm" onClick={load}>Refresh</button>
        {(search || statusFilter || from || to || assigneeFilter) && (
          <button className="btn secondary sm" onClick={() => {
            setSearch(''); setStatusFilter(''); setFrom(''); setTo(''); setAssigneeFilter('');
          }}>Clear</button>
        )}
      </div>

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat"><h3>{counts.booked}</h3><p>Upcoming / booked</p></div>
        <div className="stat"><h3>{counts.completed}</h3><p>Done</p></div>
        <div className="stat"><h3>{counts.missed}</h3><p>Missed</p></div>
        <div className="stat"><h3>{counts.cancelled}</h3><p>Cancelled</p></div>
        <div className="stat">
          <h3 style={{ color: counts.unassigned ? '#c0392b' : undefined }}>{counts.unassigned}</h3>
          <p>Need an astrologer</p>
        </div>
      </div>

      {loading ? <p className="muted">Loading…</p> : sorted.length === 0 ? (
        <div className="empty">No bookings match these filters.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Slot (IST)</th>
                <th>Customer</th>
                <th>Phone</th>
                <th style={{ minWidth: 170 }}>Assigned to</th>
                <th>Status</th>
                <th>Note</th>
                <th style={{ minWidth: 230 }}>Manage</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const isToday = istDayKey(r.slot_start) === todayKey;
                const isPast = new Date(r.slot_start).getTime() < Date.now();
                return (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: isToday ? 700 : 500 }}>{fmtSlot(r.slot_start)}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {isToday && <strong>Today · </strong>}
                        {r.duration_minutes} min
                        {isPast && r.status === 'booked' && <span style={{ color: '#c0392b' }}> · time passed</span>}
                      </div>
                      {r.rescheduled_from && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          moved from {fmtSlot(r.rescheduled_from)}
                          {r.reschedule_count > 1 ? ` (${r.reschedule_count}×)` : ''}
                        </div>
                      )}
                    </td>
                    <td>{r.customer_name || <span className="muted">—</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.customer_phone || <span className="muted">—</span>}</td>
                    <td>
                      <select
                        value={r.astrologer_id || ''}
                        disabled={busy}
                        onChange={(e) => assign(r, e.target.value)}
                      >
                        <option value="">— unassigned —</option>
                        {astrologers.map((a) => (
                          <option key={a.id} value={a.id}>{astroName(a)}</option>
                        ))}
                        {/* An assignee who has since been suspended is no longer in
                            the list above, so show them explicitly rather than
                            letting the select fall back to "unassigned" and imply
                            nobody is on it. */}
                        {r.astrologer_id && !astrologers.some((a) => a.id === r.astrologer_id) && (
                          <option value={r.astrologer_id}>{r.assigneeName || 'Assigned (inactive)'}</option>
                        )}
                      </select>
                      {!r.astrologer_id && r.status === 'booked' && (
                        <div style={{ fontSize: 12, color: '#c0392b', marginTop: 2 }}>Nobody assigned</div>
                      )}
                      {r.astrologer_name && (
                        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                          shown to customer as {r.astrologer_name}
                        </div>
                      )}
                    </td>
                    <td>{statusBadge(r.status)}</td>
                    <td style={{ maxWidth: 220 }}>
                      {r.admin_note
                        ? <span style={{ fontSize: 13 }}>{r.admin_note}</span>
                        : <span className="muted">—</span>}
                    </td>
                    <td>
                      <div className="btn-group" style={{ flexWrap: 'wrap', gap: 6 }}>
                        <select
                          value={r.status}
                          disabled={busy}
                          onChange={(e) => changeStatus(r, e.target.value)}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                          ))}
                        </select>
                        <button className="btn secondary sm" disabled={busy}
                          onClick={() => setRescheduling(r)}>Reschedule</button>
                        <button className="btn secondary sm" disabled={busy}
                          onClick={() => { setNoting(r); setNoteText(r.admin_note || ''); }}>Note</button>
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
