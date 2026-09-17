import { useEffect, useMemo, useState } from 'react';
import client from '../api/client';

// Send the free 12-minute call to customers as a push + in-app notification.
// Works whether the public offer is on or off: the invite itself lets these
// customers book (backend: /api/admin/free-call-invites/*). Anyone without a live
// free-call booking can be invited; people who already booked are skipped.

const DEFAULT_TITLE = 'A free 12-minute call is waiting for you';
const DEFAULT_BODY = 'Talk to a verified astrologer for 12 minutes, free. Tap to pick a time, and our astrologer will call you.';

const customerLabel = (c) => `${c.name || 'Customer'} (${c.mobile || c.phone || '—'})`;

export default function FreeCallInviteCard() {
  const [open, setOpen] = useState(false);
  const [audience, setAudience] = useState('all_not_booked');
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [validDays, setValidDays] = useState(7);
  const [customers, setCustomers] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [filter, setFilter] = useState('');
  const [preview, setPreview] = useState(null);
  const [summary, setSummary] = useState(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const loadSummary = () => {
    client.get('/api/admin/free-call-invites/summary')
      .then(({ data }) => setSummary(data))
      .catch(() => {});
  };
  useEffect(loadSummary, []);

  useEffect(() => {
    if (open && audience === 'customers' && customers.length === 0) {
      client.get('/api/admin/customers').then(({ data }) => setCustomers(data.data || [])).catch(() => {});
    }
  }, [open, audience, customers.length]);

  // Live recipient count so the admin knows how many people a send reaches.
  useEffect(() => {
    if (!open) return undefined;
    setPreview(null);
    if (audience === 'customers' && selectedIds.length === 0) return undefined;
    let cancelled = false;
    client.post('/api/admin/free-call-invites/preview', { audience, targetIds: audience === 'customers' ? selectedIds : undefined })
      .then(({ data }) => { if (!cancelled) setPreview(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, audience, selectedIds]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q ? customers.filter((c) => customerLabel(c).toLowerCase().includes(q)) : customers;
    return list.slice(0, 200);
  }, [customers, filter]);

  const toggle = (id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const send = async () => {
    setError('');
    setResult(null);
    if (!title.trim() || !body.trim()) { setError('Title and message are both required.'); return; }
    if (audience === 'customers' && !selectedIds.length) { setError('Pick at least one customer.'); return; }
    const who = audience === 'customers'
      ? `${selectedIds.length} selected customer(s)`
      : `${preview?.recipientCount ?? 'all'} customers who have not booked a free call`;
    if (!window.confirm(`Send the free call invite to ${who}? It stays valid for ${validDays} day(s).`)) return;
    setSending(true);
    try {
      const { data } = await client.post('/api/admin/free-call-invites/send', {
        audience,
        targetIds: audience === 'customers' ? selectedIds : undefined,
        title,
        body,
        validDays,
      });
      setResult(data);
      setSelectedIds([]);
      loadSummary();
    } catch (e) {
      setError(e.response?.data?.message || 'Could not send the invite.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0 }}>🎁 Invite customers to a free call</h3>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Sends a notification that opens the booking (birth details, then time slot). Works even
            while the offer is switched off. Only people without a free call booked can be invited.
            {summary && !summary.tableMissing && (
              <> · <strong>{summary.active}</strong> active invites · <strong>{summary.bookedFromInvites}</strong> booked after an invite</>
            )}
          </p>
        </div>
        <button className="btn secondary sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Close' : 'Send invite'}
        </button>
      </div>

      {summary?.tableMissing && (
        <p style={{ color: '#c0392b', margin: '10px 0 0' }}>
          Run <code>astrowani-backend/sql/free_call_invites.sql</code> first.
        </p>
      )}

      {open && (
        <div style={{ marginTop: 16 }}>
          <div className="btn-group" style={{ marginBottom: 12 }}>
            <button className={`btn sm ${audience === 'all_not_booked' ? '' : 'ghost'}`} onClick={() => setAudience('all_not_booked')}>
              Everyone who hasn't booked
            </button>
            <button className={`btn sm ${audience === 'customers' ? '' : 'ghost'}`} onClick={() => setAudience('customers')}>
              Specific customers
            </button>
          </div>

          {audience === 'customers' && (
            <div style={{ marginBottom: 12 }}>
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search customers by name or phone…"
                style={{ width: '100%', marginBottom: 8 }}
              />
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, maxHeight: 200, overflowY: 'auto' }}>
                {filtered.map((c) => (
                  <label key={c.id} style={{ display: 'flex', gap: 8, padding: '6px 10px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => toggle(c.id)} />
                    {customerLabel(c)}
                  </label>
                ))}
                {!filtered.length && <div className="muted" style={{ padding: 10 }}>No customers found.</div>}
              </div>
              <div className="muted" style={{ marginTop: 6 }}>{selectedIds.length} selected</div>
            </div>
          )}

          <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Title</label>
          <input type="text" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Message</label>
          <textarea value={body} maxLength={500} rows={3} onChange={(e) => setBody(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Invite valid for (days)</label>
          <input
            type="number"
            min={1}
            max={60}
            value={validDays}
            onChange={(e) => setValidDays(Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 1)))}
            style={{ width: 100, marginBottom: 12 }}
          />

          {preview && (
            <p className="muted" style={{ margin: '0 0 12px' }}>
              Will reach <strong>{preview.recipientCount}</strong> customer(s)
              ({preview.withPushToken} can get a push; everyone gets it in their in-app notifications).
              {preview.skippedBooked > 0 && <> {preview.skippedBooked} skipped: already booked.</>}
            </p>
          )}

          {error && <p style={{ color: '#c0392b', margin: '0 0 10px' }}>{error}</p>}
          {result && (
            <p style={{ color: '#1e8449', margin: '0 0 10px' }}>
              Sent to {result.recipientCount} customer(s). Push delivered {result.pushSuccess}, failed {result.pushFailure},
              no push token {result.noPushToken}. Valid until {new Date(result.expiresAt).toLocaleString()}.
            </p>
          )}

          <button className="btn" onClick={send} disabled={sending}>
            {sending ? 'Sending…' : 'Send invite'}
          </button>
        </div>
      )}
    </div>
  );
}
