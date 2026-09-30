import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import ImageField from '../components/ImageField';

import { clockToMinutes, minutesToClock, prettyClock } from '../utils/freeCallClock';

// Visibility of the astrologer's own "Free Introductory Calls" card. Its own key, NOT a
// field inside free_call_offer: the offer form below rewrites that blob wholesale, so a
// flag living in there could be wiped by an unrelated save. Read by the backend in
// src/freeCallRoutes.js (loadIntroVisibility).
const VISIBILITY_KEY = 'free_intro_call_visibility';

const OFFER_DEFAULTS = {
  enabled: false,
  durationMinutes: 12,
  slotMinutes: 30,
  openTime: '10:00',
  closeTime: '20:00',
  daysAhead: 7,
  minLeadMinutes: 60,
  assignmentMode: 'manual', // 'manual' | 'single' | 'pool'
  assignedAstrologerId: '',
  poolAstrologerIds: [],
  displayAstrologerIds: [],
  enabledPlatforms: { android: true, ios: true },
  displayFeaturedAstrologerId: '',
  astrologerName: '',
  astrologerImage: '',
  astrologerExperience: '',
  astrologerSpecialities: '',
  headerText: '',
  bodyText: '',
  ctaText: '',
  successText: '',

  // ── Instant mode ──────────────────────────────────────────────────────────
  // 'scheduled' is the slot-booking flow every field above configures.
  // 'instant'   lets the customer ring whoever is free right now.
  // 'off'       shows nothing, without deleting either configuration.
  mode: 'scheduled',
  instantPoolAstrologerIds: [],
  // Marks reached, not minutes elapsed — see the card in the form for why.
  payoutMilestones: [{ minutes: 3, amount: 5 }, { minutes: 9, amount: 5 }],
  minFreeCallsBeforeOptOut: 10,
  holdDecisionSeconds: 90,
  holdPaymentSeconds: 180,
  ringTimeoutSeconds: 60,
  continueOptions: [5, 10, 15],
  maxRingAttempts: 10,
  instantHeaderText: '',
  instantBodyText: '',
};

const num = (v, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

/** "₹5 at 3 min, then ₹10 total at 9 min" — so the admin reads the cumulative figure. */
const milestoneSummary = (list) => {
  const steps = [...(list || [])]
    .filter((m) => Number(m?.minutes) > 0 && Number(m?.amount) > 0)
    .sort((a, b) => a.minutes - b.minutes);
  if (!steps.length) return 'nothing is paid.';
  let running = 0;
  return `${steps.map((m) => {
    running += Number(m.amount);
    return `₹${running} once the call reaches ${m.minutes} min`;
  }).join(', then ')}.`;
};

/**
 * The settings panel for ONE of the two free-call offers.
 *
 * `flow` picks which offer this instance is presenting:
 *   'booking' — the scheduled "book a slot, we call you later" offer
 *   'instant' — the "ring an astrologer now" offer
 *
 * Both edit the SAME underlying free_call_offer blob, because the two flows are
 * mutually exclusive (offer.mode decides which one customers actually reach) and the
 * backend reads one config. So a setting that applies to both is deliberately shown in
 * BOTH panels rather than parked in a third place — you should never have to leave the
 * offer you are editing to finish a change. Only the slot/operating-hours card is
 * hidden from instant, which genuinely has no slots, lead time or calendar.
 *
 * Collapsed by default: this panel sits on top of the bookings list, and the list is
 * what an admin opens that page to look at day to day.
 */
export default function FreeCallSettings({ flow = 'booking' }) {
  const isInstant = flow === 'instant';
  const [panelOpen, setPanelOpen] = useState(false);

  const [offer, setOffer] = useState(OFFER_DEFAULTS);
  const [offerLoaded, setOfferLoaded] = useState(false);
  const [savingOffer, setSavingOffer] = useState(false);
  const [astrologers, setAstrologers] = useState([]);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Who can SEE the "Free Introductory Calls" card on their vendor dashboard. Its own
  // app_settings key and its own Save button, deliberately kept off the offer form's
  // payload above — the two are unrelated and that form rewrites its blob wholesale.
  const [visibility, setVisibility] = useState({ hiddenForAll: false, hiddenAstrologerIds: [] });
  const [visibilityLoaded, setVisibilityLoaded] = useState(false);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [visibilitySaved, setVisibilitySaved] = useState(false);

  const astroName = (a) =>
    [a.first_name, a.last_name].filter(Boolean).join(' ').trim() || a.email || a.id;

  // Load current offer settings from app_settings
  const loadOffer = useCallback(async () => {
    try {
      const { data } = await client.get('/api/admin/settings');

      // Same response, so no second round trip. An absent key means nothing is hidden —
      // that is the state this feature had before the control existed.
      try {
        const vis = data.settings?.[VISIBILITY_KEY];
        const parsed = vis ? JSON.parse(vis) : {};
        setVisibility({
          hiddenForAll: parsed.hiddenForAll === true || parsed.hiddenForAll === 'true',
          hiddenAstrologerIds: Array.isArray(parsed.hiddenAstrologerIds)
            ? parsed.hiddenAstrologerIds.filter((id) => typeof id === 'string' && id)
            : [],
        });
      } catch (_) {
        setVisibility({ hiddenForAll: false, hiddenAstrologerIds: [] });
      }
      setVisibilityLoaded(true);

      const raw = data.settings?.free_call_offer;
      if (raw) {
        const saved = JSON.parse(raw);
        // Older configs stored whole hours (or "1130"); show them as HH:MM.
        const toClock = (v, d) => { const t = clockToMinutes(v); return t === null ? d : minutesToClock(t); };
        setOffer({
          ...OFFER_DEFAULTS,
          ...saved,
          openTime: toClock(saved.openTime ?? saved.openHour, OFFER_DEFAULTS.openTime),
          closeTime: toClock(saved.closeTime ?? saved.closeHour, OFFER_DEFAULTS.closeTime),
          // Field-by-field so a blob saved before this existed, or one that only ever
          // turned off one platform, still defaults the other one to true.
          enabledPlatforms: {
            android: saved.enabledPlatforms?.android !== false,
            ios: saved.enabledPlatforms?.ios !== false,
          },
        });
      }
    } catch (e) {
      console.error('load free_call_offer failed:', e.message);
    } finally {
      setOfferLoaded(true);
    }
  }, []);

  // Load approved, unsuspended astrologers
  useEffect(() => {
    (async () => {
      try {
        const { data } = await client.get('/api/admin/astrologers');
        setAstrologers(
          (data.data || []).filter(
            (a) => !a.is_suspended && (!a.approval_status || a.approval_status === 'approved'),
          ),
        );
      } catch (e) {
        console.error('load astrologers failed:', e.message);
      }
    })();
  }, []);

  useEffect(() => {
    loadOffer();
  }, [loadOffer]);

  // Writes only VISIBILITY_KEY. Guarded on visibilityLoaded by the button, so a failed
  // load can never save the empty default over a real setting.
  const saveVisibility = async () => {
    setSavingVisibility(true);
    setVisibilitySaved(false);
    try {
      await client.patch('/api/admin/settings', {
        key: VISIBILITY_KEY,
        value: JSON.stringify({
          hiddenForAll: !!visibility.hiddenForAll,
          // Kept even while "hide from everyone" is on, so unticking that restores the
          // per-astrologer choices instead of silently clearing them.
          hiddenAstrologerIds: (visibility.hiddenAstrologerIds || []).filter(Boolean),
        }),
      });
      setVisibilitySaved(true);
      setTimeout(() => setVisibilitySaved(false), 4000);
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    } finally {
      setSavingVisibility(false);
    }
  };

  const saveOffer = async (next) => {
    setSavingOffer(true);
    setSavedSuccess(false);
    try {
      const payload = {
        ...next,
        durationMinutes: num(next.durationMinutes, 12),
        slotMinutes: num(next.slotMinutes, 30),
        daysAhead: num(next.daysAhead, 7),
        minLeadMinutes: num(next.minLeadMinutes, 60),
      };

      // Times with minutes ("11:30", "24:00" for midnight). The old whole-hour
      // fields are dropped so the server reads these.
      const openMin = clockToMinutes(next.openTime);
      const closeMin = clockToMinutes(next.closeTime);
      if (openMin === null || openMin >= 1440 || closeMin === null || closeMin < 1) {
        alert('Enter times as HH:MM in 24-hour IST, e.g. 11:30 to open and 24:00 to close at midnight.');
        setSavingOffer(false);
        return;
      }
      if (closeMin <= openMin) {
        alert('Closing time must be later than opening time.');
        setSavingOffer(false);
        return;
      }
      payload.openTime = minutesToClock(openMin);
      payload.closeTime = minutesToClock(closeMin);
      delete payload.openHour;
      delete payload.closeHour;
      if (payload.durationMinutes <= 0 || payload.slotMinutes <= 0) {
        alert('Duration and slot spacing must be greater than 0.');
        setSavingOffer(false);
        return;
      }

      await client.patch('/api/admin/settings', {
        key: 'free_call_offer',
        value: JSON.stringify(payload),
      });

      setOffer(payload);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
      alert('Offer settings saved successfully! Customer apps will reflect this immediately.');
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    } finally {
      setSavingOffer(false);
    }
  };

  const poolCount = useMemo(
    () => (offer.poolAstrologerIds || []).filter((id) => astrologers.some((a) => a.id === id)).length,
    [offer.poolAstrologerIds, astrologers],
  );

  // An empty instant pool falls back to the scheduled Smart Pool server-side, so the
  // warning must only fire when BOTH are empty — otherwise it would nag an admin who
  // has deliberately curated one list for both flows.
  // The milestone list is edited in place. The server re-sorts, de-duplicates and clamps
  // it on save (freeCallPayout.normaliseMilestones), so the form does not have to fight
  // the admin mid-keystroke — an out-of-order pair here is corrected, not rejected.
  const setMilestone = (index, patch) => setOffer((p) => ({
    ...p,
    payoutMilestones: (p.payoutMilestones || []).map((m, i) => (i === index ? { ...m, ...patch } : m)),
  }));
  const addMilestone = () => setOffer((p) => {
    const list = p.payoutMilestones || [];
    const last = list[list.length - 1];
    return { ...p, payoutMilestones: [...list, { minutes: (last?.minutes || 0) + 3, amount: 5 }] };
  });
  const removeMilestone = (index) => setOffer((p) => ({
    ...p,
    payoutMilestones: (p.payoutMilestones || []).filter((_, i) => i !== index),
  }));

  const instantPoolCount = useMemo(() => {
    const explicit = (offer.instantPoolAstrologerIds || []).filter((id) => astrologers.some((a) => a.id === id));
    return explicit.length || poolCount;
  }, [offer.instantPoolAstrologerIds, astrologers, poolCount]);

  const shownAstrologerName = useMemo(() => {
    if (offer.displayFeaturedAstrologerId) {
      const a = astrologers.find((x) => x.id === offer.displayFeaturedAstrologerId);
      if (a) return astroName(a);
    }
    return offer.astrologerName || '';
  }, [offer.displayFeaturedAstrologerId, offer.astrologerName, astrologers]);

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto' }}>
      {/* ── The big button. Everything below it is hidden until it is pressed. ── */}
      <button
        type="button"
        onClick={() => setPanelOpen((v) => !v)}
        className="card"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: panelOpen ? 20 : 0,
          padding: '20px 24px',
          cursor: 'pointer',
          textAlign: 'left',
          border: '2px solid var(--maroon)',
          background: panelOpen ? 'var(--maroon-50)' : 'var(--surface)',
        }}
      >
        <span>
          <span
            style={{
              display: 'block',
              fontSize: 20,
              fontWeight: 800,
              color: 'var(--maroon)',
              letterSpacing: '-0.01em',
            }}
          >
            ⚙️ {isInstant ? 'Free Instant Call Offer Settings' : 'Free Call Booking Offer Settings'}
          </span>
          <span style={{ display: 'block', marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>
            {panelOpen
              ? 'Change what you need, then press Save Offer Settings at the bottom.'
              : 'Click here to change the settings for this offer.'}
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span
            className="badge"
            style={{
              background: offer.enabled ? '#dcfce7' : '#f1f5f9',
              color: offer.enabled ? '#166534' : '#475569',
              fontWeight: 700,
            }}
          >
            {offer.enabled ? 'LIVE' : 'OFF'}
          </span>
          <span style={{ fontSize: 22, color: 'var(--maroon)' }}>{panelOpen ? '▲' : '▼'}</span>
        </span>
      </button>

      {!panelOpen ? null : (
       <>
      {savedSuccess && (
        <div
          className="card"
          style={{
            marginBottom: 20,
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 18px',
          }}
        >
          <span style={{ fontSize: 18, fontWeight: 700 }}>✓</span>
          <span>
            <strong>Settings saved successfully!</strong> Changes are live on the customer mobile app.
          </span>
        </div>
      )}

      {/* ── Card 1: Offer Status & Visibility ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Offer Status & Visibility</h3>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
              When enabled, eligible first-time customers will see the promotional banner and slot booking modal in the mobile app.
            </p>
          </div>
          {offerLoaded && (
            <span
              className={`badge ${offer.enabled ? 'green' : 'gray'}`}
              style={{ fontSize: 13, padding: '5px 14px', borderRadius: 20, fontWeight: 700 }}
            >
              {offer.enabled ? '● ACTIVE / LIVE' : '○ DISABLED'}
            </span>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '14px 18px',
            background: offer.enabled ? '#f0fdf4' : 'var(--surface-muted)',
            borderRadius: 10,
            border: `1px solid ${offer.enabled ? '#bbf7d0' : 'var(--border)'}`,
          }}
        >
          <input
            type="checkbox"
            id="offer-enabled-toggle"
            checked={!!offer.enabled}
            onChange={(e) => setOffer((p) => ({ ...p, enabled: e.target.checked }))}
            style={{ width: 20, height: 20, cursor: 'pointer' }}
          />
          <label htmlFor="offer-enabled-toggle" style={{ margin: 0, cursor: 'pointer', flex: 1 }}>
            <strong style={{ fontSize: 14, display: 'block', color: offer.enabled ? '#15803d' : 'inherit' }}>
              {offer.enabled ? 'Free Call Offer is ENABLED' : 'Free Call Offer is DISABLED'}
            </strong>
            <span className="muted" style={{ fontSize: 12.5 }}>
              {offer.enabled
                ? 'Customers who open the app and have never used their introductory call can book free consultation slots.'
                : 'Offer banner and scheduling cards are completely hidden in the customer app.'}
            </span>
          </label>
        </div>

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: 12.5 }}>
            Independent per-platform switch — turn the offer off for one app while it
            keeps running on the other (e.g. paused on Android, still live for the
            first App Store submission). This wins over the master toggle above and
            over an active invite: a platform switched off here is off for everyone
            on that platform.
          </p>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[
              { key: 'android', label: 'Available on Android' },
              { key: 'ios', label: 'Available on iOS' },
            ].map(({ key, label }) => {
              const on = offer.enabledPlatforms?.[key] !== false;
              return (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) =>
                      setOffer((p) => ({
                        ...p,
                        enabledPlatforms: { ...p.enabledPlatforms, [key]: e.target.checked },
                      }))
                    }
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 13.5, fontWeight: on ? 600 : 400, color: on ? 'inherit' : '#c0392b' }}>
                    {label}{!on ? ' — OFF' : ''}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Card 2: Assignment Mode ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>
          Astrologer Assignment Strategy
        </h3>
        <p className="muted" style={{ margin: '0 0 16px', fontSize: 13 }}>
          Determine how incoming free consultation bookings are assigned to your astrologers.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 18 }}>
          {[
            {
              mode: 'manual',
              title: 'Manual Assignment',
              desc: 'Bookings land unassigned. Admin assigns an astrologer by hand from the Free Call Bookings list.',
              icon: '👤',
            },
            {
              mode: 'single',
              title: 'Single Astrologer',
              desc: 'All incoming free calls are automatically assigned to one dedicated astrologer.',
              icon: '⭐',
            },
            {
              mode: 'pool',
              title: 'Smart Astrologer Pool',
              desc: 'Calls are automatically distributed among a team of astrologers using least-loaded round robin.',
              icon: '👥',
            },
          ].map((item) => {
            const isSelected = offer.assignmentMode === item.mode;
            return (
              <div
                key={item.mode}
                onClick={() => setOffer((p) => ({ ...p, assignmentMode: item.mode }))}
                style={{
                  padding: 16,
                  borderRadius: 10,
                  border: `2px solid ${isSelected ? 'var(--maroon)' : 'var(--border)'}`,
                  background: isSelected ? 'var(--maroon-50)' : 'var(--surface)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 18 }}>{item.icon}</span>
                  <strong style={{ fontSize: 14, color: isSelected ? 'var(--maroon)' : 'inherit' }}>
                    {item.title}
                  </strong>
                </div>
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {item.desc}
                </p>
              </div>
            );
          })}
        </div>

        {/* Single Astrologer Selector */}
        {offer.assignmentMode === 'single' && (
          <div style={{ padding: 16, background: 'var(--surface-muted)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div className="field" style={{ margin: 0 }}>
              <label style={{ fontWeight: 600 }}>Select Dedicated Astrologer</label>
              <select
                value={offer.assignedAstrologerId || ''}
                onChange={(e) => setOffer((p) => ({ ...p, assignedAstrologerId: e.target.value }))}
                style={{ maxWidth: 420 }}
              >
                <option value="">— Choose an astrologer —</option>
                {astrologers.map((a) => (
                  <option key={a.id} value={a.id}>
                    {astroName(a)}
                  </option>
                ))}
              </select>
              {!offer.assignedAstrologerId && (
                <p className="muted" style={{ margin: '6px 0 0', color: '#c0392b', fontSize: 12 }}>
                  ⚠️ No astrologer selected yet. New bookings will arrive unassigned until one is chosen.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Pool Astrologers Checkboxes */}
        {offer.assignmentMode === 'pool' && (
          <div style={{ padding: 16, background: 'var(--surface-muted)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ fontWeight: 700, margin: 0 }}>
                Pool Members ({poolCount} Selected)
              </label>
              <span className="muted" style={{ fontSize: 12 }}>
                Multiplies concurrent slot capacity: {poolCount || 1} customer(s) per slot.
              </span>
            </div>
            <p className="muted" style={{ margin: '0 0 10px', fontSize: 12.5 }}>
              Each new booking is automatically routed to whoever currently has the fewest upcoming calls.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 8,
                maxHeight: 220,
                overflowY: 'auto',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 12,
                background: 'var(--surface)',
              }}
            >
              {astrologers.length === 0 && (
                <span className="muted" style={{ fontSize: 12 }}>No approved astrologers found.</span>
              )}
              {astrologers.map((a) => {
                const on = (offer.poolAstrologerIds || []).includes(a.id);
                return (
                  <label
                    key={a.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      margin: 0,
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) =>
                        setOffer((p) => {
                          const cur = p.poolAstrologerIds || [];
                          return {
                            ...p,
                            poolAstrologerIds: e.target.checked
                              ? [...cur, a.id]
                              : cur.filter((id) => id !== a.id),
                          };
                        })
                      }
                    />
                    <span style={{ fontWeight: on ? 600 : 400 }}>{astroName(a)}</span>
                  </label>
                );
              })}
            </div>
            {poolCount === 0 && (
              <p className="muted" style={{ margin: '8px 0 0', color: '#c0392b', fontSize: 12 }}>
                ⚠️ Nobody selected in pool. Bookings will arrive unassigned until you select at least one astrologer.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Card 2b: Instant calls ──
          Kept in its own card rather than mixed into the slot settings above, because
          the two flows share almost nothing: instant has no slots, no lead time and no
          calendar. Switching `mode` is what decides which set actually applies. */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>Instant calls</h3>
        <p className="muted" style={{ margin: '0 0 16px', fontSize: 13 }}>
          Instead of booking a slot for later, the customer picks an astrologer who is free
          right now and their phone rings immediately — exactly like a paid call.
        </p>

        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
          Which flow customers see
        </label>
        <select
          value={offer.mode || 'scheduled'}
          onChange={(e) => setOffer((p) => ({ ...p, mode: e.target.value }))}
          style={{ maxWidth: 320 }}
        >
          <option value="scheduled">Scheduled — book a slot, we call later</option>
          <option value="instant">Instant — call an available astrologer now</option>
          <option value="off">Off — hide the free call entirely</option>
        </select>

        {offer.mode === 'instant' && (
          <>
            <div style={{ marginTop: 20 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
                Always include these astrologers
              </label>
              <p className="muted" style={{ margin: '0 0 10px', fontSize: 12.5 }}>
                Astrologers now <strong>opt themselves in</strong> from a toggle on their own
                dashboard, and anyone who switches it on appears on the free-call screen.
                Ticking someone here <strong>pins</strong> them into the pool whether they
                switched it on or not — their own toggle then shows as locked, with a note to
                contact support. Leave this empty to let supply be entirely opt-in.
                Everyone else is completely unaffected and keeps taking paid calls only.
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: 8,
                  maxHeight: 220,
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 12,
                  background: 'var(--surface)',
                }}
              >
                {astrologers.length === 0 && (
                  <span className="muted" style={{ fontSize: 12 }}>No approved astrologers found.</span>
                )}
                {astrologers.map((a) => {
                  const on = (offer.instantPoolAstrologerIds || []).includes(a.id);
                  return (
                    <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, cursor: 'pointer', fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) =>
                          setOffer((p) => {
                            const cur = p.instantPoolAstrologerIds || [];
                            return {
                              ...p,
                              instantPoolAstrologerIds: e.target.checked
                                ? [...cur, a.id]
                                : cur.filter((id) => id !== a.id),
                            };
                          })
                        }
                      />
                      <span style={{ fontWeight: on ? 600 : 400 }}>{astroName(a)}</span>
                    </label>
                  );
                })}
              </div>
              {instantPoolCount === 0 && (
                <p className="muted" style={{ margin: '8px 0 0', color: '#c0392b', fontSize: 12 }}>
                  ⚠️ Nobody selected, and the Smart Pool above is empty too. Instant mode cannot
                  run without at least one astrologer, so the app will fall back to the scheduled flow.
                </p>
              )}
            </div>

            <div style={{ marginTop: 20 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
                What the astrologer earns
              </label>
              <p className="muted" style={{ margin: '0 0 10px', fontSize: 12.5 }}>
                Paid by Astrowani when the call ends, not by the customer — and paid for
                <strong> reaching a mark</strong>, not per minute. A call that ends before the
                first mark pays nothing, so an astrologer earns for holding a real
                conversation rather than for picking up. Milestones are cumulative:
                {' '}{milestoneSummary(offer.payoutMilestones)}
              </p>
              {(offer.payoutMilestones || []).map((m, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>When the call reaches (min)</label>
                    <input type="number" min="1" max="600" style={{ width: 170 }}
                      value={m.minutes}
                      onChange={(e) => setMilestone(i, { minutes: num(e.target.value, 1) })} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>pay a further (₹)</label>
                    <input type="number" min="1" max="1000" style={{ width: 140 }}
                      value={m.amount}
                      onChange={(e) => setMilestone(i, { amount: num(e.target.value, 1) })} />
                  </div>
                  <button type="button" className="btn-sm" onClick={() => removeMilestone(i)}>Remove</button>
                </div>
              ))}
              <button type="button" className="btn-sm" onClick={addMilestone}>+ Add a milestone</button>

              <div style={{ marginTop: 16 }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block' }}>
                  Calls required before an astrologer may switch this off
                </label>
                <input type="number" min="0" max="500" style={{ width: 140 }}
                  value={offer.minFreeCallsBeforeOptOut ?? 10}
                  onChange={(e) => setOffer((p) => ({ ...p, minFreeCallsBeforeOptOut: num(e.target.value, 10) }))} />
                <p className="muted" style={{ margin: '6px 0 0', fontSize: 12.5 }}>
                  Switching the toggle ON is always allowed; switching it OFF is refused until
                  they have completed this many free calls, and the app tells them so on the way
                  in. It stops the pool draining on the first busy evening and leaving new
                  customers on a screen with nobody on it. Set to 0 to let anyone opt out at any
                  time. Pinned astrologers above are never able to opt out from the app.
                </p>
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
                Holding the astrologer after the free call
              </label>
              <p className="muted" style={{ margin: '0 0 10px', fontSize: 12.5 }}>
                When a free call ends, the customer is offered more minutes with the same
                astrologer. During that time nobody else can be given a free call with them —
                and once the customer starts paying, nobody else can reach them at all.
                Longer is friendlier to the customer and costs the astrologer idle time.
                {' '}<strong>&ldquo;Time to decide&rdquo; is the countdown the customer watches</strong>{' '}
                on the offer, and exactly how long the astrologer shows as busy. Closing the
                offer releases them immediately, whatever is left on the clock.
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Time to decide (sec)</label>
                  <input type="number" min="10" max="600" style={{ width: 150 }}
                    value={offer.holdDecisionSeconds ?? 90}
                    onChange={(e) => setOffer((p) => ({ ...p, holdDecisionSeconds: num(e.target.value, 90) }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Time to pay (sec)</label>
                  <input type="number" min="30" max="900" style={{ width: 150 }}
                    value={offer.holdPaymentSeconds ?? 180}
                    onChange={(e) => setOffer((p) => ({ ...p, holdPaymentSeconds: num(e.target.value, 180) }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Ring for (sec)</label>
                  <input type="number" min="15" max="300" style={{ width: 130 }}
                    value={offer.ringTimeoutSeconds ?? 60}
                    onChange={(e) => setOffer((p) => ({ ...p, ringTimeoutSeconds: num(e.target.value, 60) }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Astrologers one customer may try</label>
                  <input type="number" min="1" max="50" style={{ width: 200 }}
                    value={offer.maxRingAttempts ?? 10}
                    onChange={(e) => setOffer((p) => ({ ...p, maxRingAttempts: num(e.target.value, 10) }))} />
                </div>
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
                &ldquo;More minutes&rdquo; buttons
              </label>
              <p className="muted" style={{ margin: '0 0 8px', fontSize: 12.5 }}>
                Offered when the free call ends. Priced automatically at that astrologer&rsquo;s own
                per-minute rate — you set the minutes, not the price. Up to four, comma separated.
              </p>
              <input
                type="text"
                style={{ maxWidth: 260 }}
                value={(offer.continueOptions || []).join(', ')}
                onChange={(e) =>
                  setOffer((p) => ({
                    ...p,
                    continueOptions: e.target.value
                      .split(',')
                      .map((x) => parseInt(x.trim(), 10))
                      .filter((x) => Number.isFinite(x) && x > 0),
                  }))
                }
                placeholder="5, 10, 15"
              />
            </div>

            <div style={{ marginTop: 20 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
                Heading on the offer card
              </label>
              <input type="text" value={offer.instantHeaderText || ''}
                placeholder="Talk to an astrologer free, right now"
                onChange={(e) => setOffer((p) => ({ ...p, instantHeaderText: e.target.value }))} />
              <label style={{ display: 'block', margin: '12px 0 6px', fontWeight: 600, fontSize: 13 }}>
                Supporting line
              </label>
              <input type="text" value={offer.instantBodyText || ''}
                placeholder="Pick anyone who is free and we will connect you straight away."
                onChange={(e) => setOffer((p) => ({ ...p, instantBodyText: e.target.value }))} />
            </div>
          </>
        )}
      </div>

      {/* ── Card 3: Featured Astrologer (Shown to Customer) ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>
          Featured Astrologer (Customer Popup Face)
        </h3>
        <p className="muted" style={{ margin: '0 0 16px', fontSize: 13 }}>
          The mobile popup shuffles astrologer faces and stops on this profile. This is visual only — who actually takes the call is determined by the assignment strategy above.
        </p>

        <div className="field">
          <label style={{ fontWeight: 600 }}>Pick from Approved Astrologers</label>
          <select
            value={offer.displayFeaturedAstrologerId || ''}
            onChange={(e) => setOffer((p) => ({ ...p, displayFeaturedAstrologerId: e.target.value }))}
            style={{ maxWidth: 450 }}
          >
            <option value="">— Enter a custom name and photo by hand instead —</option>
            {astrologers.map((a) => (
              <option key={a.id} value={a.id}>
                {astroName(a)}
              </option>
            ))}
          </select>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
            Their name and photo are read directly from their profile, keeping it automatically up to date.
          </p>
        </div>

        {offer.displayFeaturedAstrologerId ? (
          <div
            style={{
              padding: '12px 16px',
              background: 'var(--surface-muted)',
              borderRadius: 8,
              border: '1px solid var(--border)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 4,
            }}
          >
            <span style={{ fontSize: 18 }}>⭐</span>
            <span style={{ fontSize: 13 }}>
              Currently featured: <strong>{shownAstrologerName}</strong>
            </span>
          </div>
        ) : (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <ImageField
              label="Custom Astrologer Photo (URL or upload)"
              value={offer.astrologerImage || ''}
              onChange={(v) => setOffer((p) => ({ ...p, astrologerImage: v }))}
            />
            <div className="two-col" style={{ marginTop: 12 }}>
              <div className="field">
                <label>Custom Name</label>
                <input
                  type="text"
                  value={offer.astrologerName || ''}
                  onChange={(e) => setOffer((p) => ({ ...p, astrologerName: e.target.value }))}
                  placeholder="e.g. Acharya Sharma"
                />
              </div>
              <div className="field">
                <label>Experience</label>
                <input
                  type="text"
                  value={offer.astrologerExperience || ''}
                  placeholder="e.g. 15+ years"
                  onChange={(e) => setOffer((p) => ({ ...p, astrologerExperience: e.target.value }))}
                />
              </div>
            </div>
            <div className="field">
              <label>Specialities</label>
              <input
                type="text"
                value={offer.astrologerSpecialities || ''}
                placeholder="e.g. Vedic Astrology, Kundali, Marriage"
                onChange={(e) => setOffer((p) => ({ ...p, astrologerSpecialities: e.target.value }))}
              />
            </div>
          </div>
        )}

        {/* Faces shown on the popup carousel */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <h4 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700 }}>
            Companion Faces Shown on the Card
          </h4>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: 12.5 }}>
            The customer popup shuffles a small set of avatars before landing on the featured astrologer. Leave empty to automatically use all approved astrologers.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 8,
              maxHeight: 180,
              overflowY: 'auto',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 10,
              background: 'var(--surface-muted)',
            }}
          >
            {astrologers.length === 0 && (
              <span className="muted" style={{ fontSize: 12 }}>No approved astrologers found.</span>
            )}
            {astrologers.map((a) => {
              const on = (offer.displayAstrologerIds || []).includes(a.id);
              return (
                <label key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', margin: 0, cursor: 'pointer', fontSize: 12.5 }}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) =>
                      setOffer((p) => {
                        const cur = p.displayAstrologerIds || [];
                        return {
                          ...p,
                          displayAstrologerIds: e.target.checked
                            ? [...cur, a.id]
                            : cur.filter((id) => id !== a.id),
                        };
                      })
                    }
                  />
                  <span>{astroName(a)}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Card 4: Slot Generation & Operating Hours (IST) ── */}
      {/* Instant has no slots, no lead time and no calendar, so this card is the one
          thing that genuinely does not belong in that panel. */}
      {isInstant ? null : (
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>
          Scheduling & Slot Generation (IST)
        </h3>
        <p className="muted" style={{ margin: '0 0 16px', fontSize: 13 }}>
          Available appointment slots are generated dynamically in Indian Standard Time (Asia/Kolkata).
        </p>

        <div className="two-col">
          <div className="field">
            <label>Call Duration (minutes)</label>
            <input
              type="number"
              min="1"
              max="120"
              value={offer.durationMinutes}
              onChange={(e) => setOffer((p) => ({ ...p, durationMinutes: e.target.value }))}
            />
            <span className="muted" style={{ fontSize: 11.5, display: 'block', marginTop: 4 }}>
              How long the free introductory consultation lasts (e.g. 12 minutes).
            </span>
          </div>

          <div className="field">
            <label>Slot Spacing / Interval (minutes)</label>
            <input
              type="number"
              min="5"
              max="240"
              value={offer.slotMinutes}
              onChange={(e) => setOffer((p) => ({ ...p, slotMinutes: e.target.value }))}
            />
            <span className="muted" style={{ fontSize: 11.5, display: 'block', marginTop: 4 }}>
              Step between offered start times (e.g. every 30 minutes).
            </span>
          </div>
        </div>

        <div className="two-col">
          <div className="field">
            <label>First call at (HH:MM, 24-hour IST)</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="11:30"
              value={offer.openTime}
              onChange={(e) => setOffer((p) => ({ ...p, openTime: e.target.value }))}
            />
            <span className="muted" style={{ fontSize: 11.5, display: 'block', marginTop: 4 }}>
              First slot: {prettyClock(offer.openTime)} IST.
            </span>
          </div>

          <div className="field">
            <label>Calls end by (HH:MM, 24-hour IST, 24:00 = midnight)</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="24:00"
              value={offer.closeTime}
              onChange={(e) => setOffer((p) => ({ ...p, closeTime: e.target.value }))}
            />
            <span className="muted" style={{ fontSize: 11.5, display: 'block', marginTop: 4 }}>
              Every call finishes by {prettyClock(offer.closeTime)} IST.
            </span>
          </div>
        </div>

        <div className="two-col">
          <div className="field">
            <label>Bookable Days Ahead</label>
            <input
              type="number"
              min="1"
              max="60"
              value={offer.daysAhead}
              onChange={(e) => setOffer((p) => ({ ...p, daysAhead: e.target.value }))}
            />
            <span className="muted" style={{ fontSize: 11.5, display: 'block', marginTop: 4 }}>
              How many days into the future customers can see and pick slots (e.g. 7 days).
            </span>
          </div>

          <div className="field">
            <label>Minimum Lead Notice (minutes)</label>
            <input
              type="number"
              min="0"
              max="1440"
              value={offer.minLeadMinutes}
              onChange={(e) => setOffer((p) => ({ ...p, minLeadMinutes: e.target.value }))}
            />
            <span className="muted" style={{ fontSize: 11.5, display: 'block', marginTop: 4 }}>
              Shortest notice a slot can be booked before its start time (e.g. 60 mins).
            </span>
          </div>
        </div>
      </div>

      )}

      {/* ── Card 5: Marketing & Customer Copy ── */}
      <div className="card" style={{ marginBottom: 28 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>
          Marketing & Customer App Copy
        </h3>
        <p className="muted" style={{ margin: '0 0 16px', fontSize: 13 }}>
          Customize the text shown to customers on the introductory call prompt and confirmation.
        </p>

        <div className="field">
          <label>Popup Heading</label>
          <input
            type="text"
            value={offer.headerText || ''}
            placeholder="e.g. Claim Your 1st Free Consultation"
            onChange={(e) => setOffer((p) => ({ ...p, headerText: e.target.value }))}
          />
        </div>

        <div className="field">
          <label>Popup Body Text</label>
          <textarea
            rows="2"
            value={offer.bodyText || ''}
            placeholder="e.g. Experience authentic Vedic astrology guidance with our verified expert."
            onChange={(e) => setOffer((p) => ({ ...p, bodyText: e.target.value }))}
          />
        </div>

        <div className="two-col">
          <div className="field">
            <label>Action Button (CTA)</label>
            <input
              type="text"
              value={offer.ctaText || ''}
              placeholder="e.g. Claim Free Call Now"
              onChange={(e) => setOffer((p) => ({ ...p, ctaText: e.target.value }))}
            />
          </div>

          <div className="field">
            <label>Confirmation Message</label>
            <input
              type="text"
              value={offer.successText || ''}
              placeholder="e.g. Your free consultation is confirmed! We will notify you when it starts."
              onChange={(e) => setOffer((p) => ({ ...p, successText: e.target.value }))}
            />
          </div>
        </div>
      </div>

      {/* ── Card: who sees the astrologer's own Free Introductory Calls card ──
          Separate Save button on purpose — this writes a different app_settings key from
          the offer form, and one button saving two unrelated settings is how you change
          something you did not mean to. */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>
          Astrologer&apos;s &ldquo;Free Introductory Calls&rdquo; card
        </h3>
        <p className="muted" style={{ margin: '0 0 16px', fontSize: 13 }}>
          Controls whether astrologers see the opt-in card on their dashboard. Hiding it
          takes effect the next time they open the app — no app update needed.
        </p>

        <label
          style={{
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
            fontSize: 14, fontWeight: 600, marginBottom: 4,
          }}
        >
          <input
            type="checkbox"
            checked={!!visibility.hiddenForAll}
            onChange={(e) => setVisibility((p) => ({ ...p, hiddenForAll: e.target.checked }))}
          />
          Hide it from every astrologer
        </label>
        <p className="muted" style={{ margin: '0 0 18px 26px', fontSize: 12 }}>
          Use this to switch the card off across the board while the feature is being worked on.
        </p>

        <div style={{ opacity: visibility.hiddenForAll ? 0.45 : 1 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
            Or hide it only for specific astrologers
          </label>
          <div
            style={{
              display: 'flex', flexWrap: 'wrap', gap: '10px 18px', padding: 12,
              border: '1px solid var(--border)', borderRadius: 8, maxHeight: 220, overflowY: 'auto',
            }}
          >
            {astrologers.length === 0 && (
              <span className="muted" style={{ fontSize: 12 }}>No approved astrologers found.</span>
            )}
            {astrologers.map((a) => {
              const on = (visibility.hiddenAstrologerIds || []).includes(a.id);
              return (
                <label
                  key={a.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, margin: 0,
                    cursor: visibility.hiddenForAll ? 'not-allowed' : 'pointer', fontSize: 13,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!!visibility.hiddenForAll}
                    onChange={(e) =>
                      setVisibility((p) => {
                        const cur = p.hiddenAstrologerIds || [];
                        return {
                          ...p,
                          hiddenAstrologerIds: e.target.checked
                            ? [...cur, a.id]
                            : cur.filter((id) => id !== a.id),
                        };
                      })
                    }
                  />
                  <span style={{ fontWeight: on ? 600 : 400 }}>{astroName(a)}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Says plainly what this does not do, because the obvious reading of "hidden" is
            "switched off", and it is not. */}
        <p className="muted" style={{ margin: '14px 0 0', fontSize: 12 }}>
          This hides the switch only. An astrologer who already opted in keeps receiving free
          intro calls — they just cannot see or change the setting. To stop the calls
          themselves, turn the offer off at the top of this page.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <button
            className="btn sm"
            disabled={savingVisibility || !visibilityLoaded}
            onClick={saveVisibility}
            style={{ minWidth: 150, fontWeight: 700 }}
          >
            {savingVisibility ? 'Saving…' : 'Save card visibility'}
          </button>
          {visibilitySaved && (
            <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>Saved</span>
          )}
          {!visibilityLoaded && (
            <span className="muted" style={{ fontSize: 12 }}>Loading current setting…</span>
          )}
        </div>
      </div>

      {/* ── Sticky Bottom Action Bar ── */}
      <div
        style={{
          position: 'sticky',
          bottom: 16,
          background: 'var(--surface)',
          padding: '14px 20px',
          borderRadius: 12,
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Status:{' '}
            <strong style={{ color: offer.enabled ? '#16a34a' : '#64748b' }}>
              {offer.enabled ? 'Live & Accepting Bookings' : 'Offer Disabled'}
            </strong>
          </span>
        </div>
        <div className="btn-group">
          <Link to="/free-call-bookings" className="btn secondary sm">
            Cancel / Back to Bookings
          </Link>
          <button
            className="btn sm"
            disabled={savingOffer || !offerLoaded}
            onClick={() => saveOffer(offer)}
            style={{ minWidth: 160, fontWeight: 700 }}
          >
            {savingOffer ? 'Saving…' : 'Save Offer Settings'}
          </button>
        </div>
      </div>
       </>
      )}
    </div>
  );
}