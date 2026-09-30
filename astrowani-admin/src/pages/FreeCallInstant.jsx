import FreeCallSettings from './FreeCallSettings';

/**
 * The "ring an astrologer now" offer.
 *
 * Its own page rather than a card on the booking page, because the two offers are
 * marketed to different audiences (Audience Targeting gates them separately as
 * `free_call` and `free_call_instant`) and are switched on and off independently of
 * each other by whoever is running that campaign.
 *
 * There is no list underneath it on purpose: an instant call produces the same
 * free_call_bookings row as a booked one, so every instant call already appears in the
 * list on the Free Call Booking Offer page. Duplicating it here would mean two places
 * showing the same rows and disagreeing the moment one of them is filtered.
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
            immediately. Calls placed on this offer appear in the list on Free Call Booking Offer.
          </p>
        </div>
      </div>

      <FreeCallSettings flow="instant" />
    </div>
  );
}
