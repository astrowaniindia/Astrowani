import FreeCallSettings from './FreeCallSettings';
import FreeCallAnalytics from '../components/FreeCallAnalytics';
import MetroCampaignPanel from '../components/MetroCampaignPanel';

/**
 * The "ring an astrologer now" offer.
 *
 * Its own page rather than a card on the booking page, because the two offers are
 * marketed to different audiences (Audience Targeting gates them separately as
 * `free_call` and `free_call_instant`) and are switched on and off independently of
 * each other by whoever is running that campaign.
 *
 * There is no list of calls underneath it on purpose: an instant call writes a row to
 * the table NAMED free_call_bookings (with kind = 'instant' — the name is historical, it
 * predates the instant flow and does NOT mean a slot was booked), so those rows already
 * show in the list on the Free Call Booking Offer page. Duplicating that list here would
 * mean two places showing the same rows and disagreeing the moment one is filtered.
 *
 * The ANALYTICS below are a different thing and are instant-only: they read the
 * per-ring attempt log, which only the instant ring endpoint ever writes to.
 */
export default function FreeCallInstant() {
  return (
    <div style={{ maxWidth: 1320 }}>
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
            <span>⚡</span> INSTANT CALL OFFER
          </div>
          <h1 className="page-title" style={{ margin: '0 0 6px' }}>Free Instant Call Offer</h1>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>
            The customer picks an astrologer who is free right now and their phone rings
            immediately for {' '}
            <strong>11 free minutes</strong>. Nothing here is scheduled and nothing is booked
            for later &mdash; the analytics at the bottom of this page cover this instant offer
            only.
          </p>
        </div>
      </div>

      <FreeCallSettings flow="instant" />

      {/* The offer's analytics live HERE, under its own settings, rather than on the
          Analytics page (owner, 2026-10-05): this is read while tuning the offer, and
          having to walk to another page to see the result is how a setting gets changed
          and never checked. */}
      <FreeCallAnalytics />

      {/* The Metro campaign is a DIFFERENT offer wearing the same plumbing — one chosen
          astrologer instead of a picker — so it gets its own section with its own switch
          and its own numbers rather than being averaged into the analytics above. */}
      <MetroCampaignPanel />
    </div>
  );
}
