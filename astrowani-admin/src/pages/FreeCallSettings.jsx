import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import ImageField from '../components/ImageField';

const OFFER_DEFAULTS = {
  enabled: false,
  durationMinutes: 12,
  slotMinutes: 30,
  openHour: 10,
  closeHour: 20,
  daysAhead: 7,
  minLeadMinutes: 60,
  assignmentMode: 'manual', // 'manual' | 'single' | 'pool'
  assignedAstrologerId: '',
  poolAstrologerIds: [],
  displayAstrologerIds: [],
  displayFeaturedAstrologerId: '',
  astrologerName: '',
  astrologerImage: '',
  astrologerExperience: '',
  astrologerSpecialities: '',
  headerText: '',
  bodyText: '',
  ctaText: '',
  successText: '',
};

const num = (v, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

export default function FreeCallSettings() {
  const [offer, setOffer] = useState(OFFER_DEFAULTS);
  const [offerLoaded, setOfferLoaded] = useState(false);
  const [savingOffer, setSavingOffer] = useState(false);
  const [astrologers, setAstrologers] = useState([]);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const astroName = (a) =>
    [a.first_name, a.last_name].filter(Boolean).join(' ').trim() || a.email || a.id;

  // Load current offer settings from app_settings
  const loadOffer = useCallback(async () => {
    try {
      const { data } = await client.get('/api/admin/settings');
      const raw = data.settings?.free_call_offer;
      if (raw) {
        setOffer({ ...OFFER_DEFAULTS, ...JSON.parse(raw) });
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

  const saveOffer = async (next) => {
    setSavingOffer(true);
    setSavedSuccess(false);
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
        setSavingOffer(false);
        return;
      }
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

  const shownAstrologerName = useMemo(() => {
    if (offer.displayFeaturedAstrologerId) {
      const a = astrologers.find((x) => x.id === offer.displayFeaturedAstrologerId);
      if (a) return astroName(a);
    }
    return offer.astrologerName || '';
  }, [offer.displayFeaturedAstrologerId, offer.astrologerName, astrologers]);

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto' }}>
      {/* ── Page Header ── */}
      <div className="page-header">
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11.5,
              fontWeight: 700,
              color: 'var(--maroon)',
              background: 'var(--maroon-50)',
              padding: '3px 10px',
              borderRadius: 20,
              marginBottom: 8,
            }}
          >
            <span>⚙️</span> PROMOTION CONFIGURATION
          </div>
          <h1 className="page-title" style={{ margin: '0 0 6px' }}>
            Free Call Settings
          </h1>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>
            Control the introductory free call promotion, operating hours, slot generation, and astrologer assignment.
          </p>
        </div>
        <div className="btn-group">
          <Link to="/free-call-bookings" className="btn secondary sm" title="View customer bookings">
            <span>📅</span> View Bookings
          </Link>
          <button
            className="btn sm"
            disabled={savingOffer || !offerLoaded}
            onClick={() => saveOffer(offer)}
            style={{ minWidth: 140 }}
          >
            {savingOffer ? 'Saving…' : 'Save Offer Settings'}
          </button>
        </div>
      </div>

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
            <label>Operating Hours Open (Hour, 0–23 IST)</label>
            <input
              type="number"
              min="0"
              max="23"
              value={offer.openHour}
              onChange={(e) => setOffer((p) => ({ ...p, openHour: e.target.value }))}
            />
            <span className="muted" style={{ fontSize: 11.5, display: 'block', marginTop: 4 }}>
              First slots start at {String(offer.openHour || 10).padStart(2, '0')}:00 IST.
            </span>
          </div>

          <div className="field">
            <label>Operating Hours Close (Hour, 1–24 IST)</label>
            <input
              type="number"
              min="1"
              max="24"
              value={offer.closeHour}
              onChange={(e) => setOffer((p) => ({ ...p, closeHour: e.target.value }))}
            />
            <span className="muted" style={{ fontSize: 11.5, display: 'block', marginTop: 4 }}>
              Last slots end by {String(offer.closeHour || 20).padStart(2, '0')}:00 IST.
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
    </div>
  );
}