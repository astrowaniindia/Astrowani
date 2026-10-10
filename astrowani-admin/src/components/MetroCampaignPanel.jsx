import { useCallback, useEffect, useState } from 'react';
import client from '../api/client';

/**
 * The Metro campaign, as its own section at the bottom of the Free Instant Call Offer
 * page (owner, 2026-10-10).
 *
 * DELIBERATELY NOT MERGED with the analytics above it. That panel reports the ordinary
 * offer — organic, QR posters and every other campaign, all of whom pick from a grid of
 * whichever astrologers are free. This campaign shows ONE astrologer, chosen for the
 * customer, on a screen written to sell that one person. Blending the two produces an
 * "answer rate" that is half a pool of eight and half a single name, and the only
 * question worth asking — did hand-picking somebody make people call — vanishes into
 * the average.
 *
 * The switch at the top is the campaign's master control:
 *   ON  → a customer who arrived from this campaign goes straight to the chosen
 *         astrologer and sees nobody else.
 *   OFF → the campaign behaves like every other campaign: its customers get the
 *         ordinary astrologer picker. Nothing is deleted — the astrologer stays
 *         configured and switching back on restores it immediately.
 */

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

const fmtSeconds = (s) => {
  const n = Number(s) || 0;
  if (n < 60) return `${n}s`;
  const m = Math.floor(n / 60);
  const rem = n % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
};
const rupees = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;

function Stat({ label, value, sub, tone }) {
  return (
    <div
      style={{
        background: 'var(--surface, #fff)',
        border: '1px solid var(--border, #e8e0d6)',
        borderRadius: 10,
        padding: '12px 14px',
        minWidth: 0,
      }}
    >
      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: tone || 'var(--maroon)' }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function EventRow({ e }) {
  return (
    <tr>
      <td style={{ padding: '7px 10px', fontSize: 12.5 }}>
        <span style={{ color: e.drop ? '#A33' : 'inherit' }}>{e.drop ? '↘ ' : ''}{e.label}</span>
        <div className="muted" style={{ fontSize: 10.5, marginTop: 1 }}>{e.event}</div>
      </td>
      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700 }}>{e.people}</td>
      <td style={{ padding: '7px 10px', textAlign: 'right' }}>{e.total}</td>
    </tr>
  );
}

export default function MetroCampaignPanel() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await client.get(`/api/admin/metro-campaign/analytics?days=${days}`);
      setData(res.data);
    } catch (e) {
      setErr(e?.response?.data?.message || 'Could not load the Metro campaign panel');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const config = data?.config;

  const toggle = async () => {
    if (!config) return;
    const next = !config.enabled;
    // Asked before turning it ON as well as off: switching it on changes what real
    // customers from a paying campaign see on their first screen.
    const msg = next
      ? 'Switch the Metro campaign ON?\n\nCustomers who arrive from this campaign will be '
        + `shown ONLY ${config.astrologer?.name || 'the chosen astrologer'} for their free 11-minute call.`
      : 'Switch the Metro campaign OFF?\n\nIts customers will go back to the ordinary astrologer '
        + 'picker, exactly like organic and every other campaign. Nothing is deleted — the chosen '
        + 'astrologer stays configured and you can switch this back on at any time.';
    // eslint-disable-next-line no-alert
    if (!window.confirm(msg)) return;
    setSaving(true);
    setErr('');
    try {
      await client.patch('/api/admin/metro-campaign', { enabled: next });
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || 'Could not change the switch');
    } finally {
      setSaving(false);
    }
  };

  const on = !!config?.enabled;
  const t = data?.totals || {};
  const r = data?.rates || {};

  return (
    <div className="card" style={{ marginBottom: 24, borderTop: '3px solid var(--maroon)' }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 280 }}>
          <div
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700,
              color: 'var(--maroon)', background: 'var(--maroon-50)', padding: '3px 10px',
              borderRadius: 20, marginBottom: 8,
            }}
          >
            <span>🏙️</span> METRO CAMPAIGN — SEPARATE OFFER
          </div>
          <h2 style={{ margin: '0 0 6px', fontSize: 19 }}>Metro Campaign (one chosen astrologer)</h2>
          <p className="muted" style={{ margin: 0, fontSize: 13, maxWidth: 620 }}>
            Everything on this card is <strong>only</strong> about customers who installed from the
            Metro ad campaign. They are the only ones who see the gift-box reveal and the single
            &ldquo;chosen for you&rdquo; astrologer. Organic, QR posters and every other campaign are
            in the analytics above, never mixed in here.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {RANGES.map((x) => (
            <button
              key={x.days}
              className="btn sm"
              onClick={() => setDays(x.days)}
              style={days === x.days ? { background: 'var(--maroon)', color: '#fff' } : undefined}
            >
              {x.label}
            </button>
          ))}
          <button className="btn sm" onClick={load} disabled={loading}>↻</button>
        </div>
      </div>

      {err && (
        <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 8, background: '#FDECEA', color: '#A33', fontSize: 13 }}>
          {err}
        </div>
      )}

      {/* ── The switch ─────────────────────────────────────────────────────── */}
      <div
        style={{
          marginTop: 18,
          padding: 16,
          borderRadius: 12,
          border: `2px solid ${on ? '#1E6B45' : 'var(--border, #e8e0d6)'}`,
          background: on ? '#F1F9F4' : '#FAF7F3',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 280, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span
              style={{
                fontSize: 11, fontWeight: 800, letterSpacing: 0.5, padding: '3px 10px', borderRadius: 20,
                background: on ? '#1E6B45' : '#8a8178', color: '#fff',
              }}
            >
              {on ? 'ON' : 'OFF'}
            </span>
            <strong style={{ fontSize: 15 }}>
              {on ? 'Campaign customers see one chosen astrologer' : 'Campaign is running as a normal campaign'}
            </strong>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55 }}>
            {on ? (
              <>
                A customer who installed from this campaign goes straight to{' '}
                <strong>{config?.astrologer?.name || '—'}</strong> and sees nobody else for their free
                11-minute call. Everything after that — busy handling, the 11-minute timer, the Shagun
                pop-up and the rest — is exactly the same as any other free call.
              </>
            ) : (
              <>
                Campaign customers are getting the <strong>ordinary astrologer picker</strong>, the same
                as organic and every other campaign. Nothing has been deleted:{' '}
                <strong>{config?.astrologer?.name || 'the chosen astrologer'}</strong> stays configured
                and switching this back on takes effect immediately.
              </>
            )}
          </p>
          {config?.configured && (
            <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
              Campaign source <code>{config.source}</code>
              {config.astrologer && (
                <>
                  {' · '}Astrologer <strong>{config.astrologer.name}</strong>
                  {config.astrologer.hidden && <span style={{ color: '#A33' }}> · hidden from customers</span>}
                  {!config.astrologer.isOnline && <span style={{ color: '#A33' }}> · currently offline</span>}
                </>
              )}
              {!!config.testMobiles?.length && (
                <> · test numbers: {config.testMobiles.join(', ')}</>
              )}
            </div>
          )}
        </div>

        <button
          className="btn"
          onClick={toggle}
          disabled={saving || loading || !config?.configured}
          style={{
            background: on ? '#8a8178' : '#1E6B45',
            color: '#fff',
            minWidth: 200,
            fontWeight: 700,
          }}
        >
          {saving ? 'Saving…' : on ? 'Switch campaign OFF' : 'Switch campaign ON'}
        </button>
      </div>

      {!config?.configured && !loading && (
        <p className="muted" style={{ marginTop: 14, fontSize: 12.5 }}>
          No campaign astrologer is configured yet, so there is nothing to switch on or report.
        </p>
      )}

      {loading && <p className="muted" style={{ marginTop: 16 }}>Loading…</p>}

      {!loading && data?.ready && (
        <>
          {/* ── Measured: the database ───────────────────────────────────────── */}
          <h3 style={{ margin: '24px 0 4px', fontSize: 15 }}>Measured — what actually happened</h3>
          <p className="muted" style={{ margin: '0 0 12px', fontSize: 12 }}>
            From the database. Exact, and only counting customers whose account carries this
            campaign&rsquo;s source. Test numbers are never included here.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <Stat label="Signed up (in range)" value={t.signupsInRange ?? 0} sub={`${t.customersTotal ?? 0} from this campaign all-time`} />
            <Stat label="Rang an astrologer" value={t.customersWhoRang ?? 0} sub={`${t.rings ?? 0} rings total`} />
            <Stat label="Claim rate" value={`${r.claimRate ?? 0}%`} sub="of this range's signups" />
            <Stat label="Picked up" value={t.answered ?? 0} sub={`${r.answerRate ?? 0}% of rings`} />
            <Stat label="Actually talked" value={t.connected ?? 0} />
            <Stat label="Completed" value={t.completed ?? 0} sub={`${r.completionRate ?? 0}% of answered`} />
            <Stat label="Average talk time" value={fmtSeconds(data.talk?.avgSeconds)} sub={`${fmtSeconds(data.talk?.totalSeconds)} in total`} />
            <Stat
              label="Rings to the chosen astrologer"
              value={t.ringsToChosenAstrologer ?? 0}
              sub={t.rings ? `of ${t.rings} — the rest went to the normal pool` : undefined}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 10 }}>
            <Stat label="Paid out to astrologers" value={rupees(data.money?.payout)} tone="#A33" />
            <Stat label="Shagun received" value={rupees(data.money?.shagunAmount)} sub={`${data.money?.shagunCount ?? 0} payments`} tone="#1E6B45" />
            <Stat
              label="Net"
              value={rupees(data.money?.net)}
              sub="Shagun minus payout — not profit"
              tone={(data.money?.net ?? 0) >= 0 ? '#1E6B45' : '#A33'}
            />
          </div>

          {/* ── Tracked: PostHog ─────────────────────────────────────────────── */}
          <h3 style={{ margin: '24px 0 4px', fontSize: 15 }}>Tracked — the journey, tap by tap</h3>
          <p className="muted" style={{ margin: '0 0 12px', fontSize: 12 }}>
            From PostHog. These are the taps that happen before any row exists — the gift box, the
            ✕, the &ldquo;Yes! I want my free call&rdquo; button, and what people do on the chosen
            astrologer&rsquo;s screen. Subject to analytics consent, so never added to a measured
            number above. Rows marked <span style={{ color: '#A33' }}>↘</span> are drop-offs.
          </p>

          {data.reveal?.available ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border, #e8e0d6)' }}>
                    <th style={{ textAlign: 'left', padding: '7px 10px', fontSize: 11.5 }}>What happened</th>
                    <th style={{ textAlign: 'right', padding: '7px 10px', fontSize: 11.5 }}>People</th>
                    <th style={{ textAlign: 'right', padding: '7px 10px', fontSize: 11.5 }}>Times</th>
                  </tr>
                </thead>
                <tbody>
                  {['reveal', 'bubble', 'chosen'].map((step) => {
                    const rows = (data.reveal.events || []).filter((e) => e.step === step);
                    if (!rows.length) return null;
                    const title = step === 'reveal'
                      ? 'First screen after install — the gift box'
                      : step === 'bubble'
                        ? 'The gift bubble in the corner (after pressing ✕)'
                        : 'The chosen astrologer\'s screen';
                    return (
                      <tr key={step} style={{ background: 'transparent' }}>
                        <td colSpan={3} style={{ padding: 0 }}>
                          <div
                            className="muted"
                            style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, padding: '12px 10px 4px', textTransform: 'uppercase' }}
                          >
                            {title}
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <tbody>
                              {rows.map((e) => <EventRow key={e.event} e={e} />)}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted" style={{ fontSize: 12.5 }}>
              Not available — {data.reveal?.reason || 'PostHog is not reachable'}. Every measured
              number above is unaffected.
            </p>
          )}
        </>
      )}

      {!loading && data && !data.ready && data.message && (
        <p className="muted" style={{ marginTop: 16, fontSize: 13 }}>{data.message}</p>
      )}
    </div>
  );
}
