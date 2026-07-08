import { useEffect, useState } from 'react';
import client from '../api/client';

const AUDIENCES = [
  { value: 'all', label: 'All Users' },
  { value: 'new', label: 'New Users' },
  { value: 'old', label: 'Old Users' },
];

export default function Push() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('all');
  const [days, setDays] = useState(30);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setPreviewLoading(true);
    client
      .get('/api/admin/customers/segment-count', { params: { audience, days } })
      .then(({ data }) => { if (!cancelled) setPreview(data); })
      .catch(() => { if (!cancelled) setPreview(null); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [audience, days]);

  const send = async () => {
    if (!title.trim() || !body.trim()) {
      setError('Title and message are both required.');
      return;
    }
    setError('');
    setResult(null);
    setSending(true);
    try {
      const { data } = await client.post('/api/admin/push/broadcast', { title, body, audience, days });
      setResult(data);
      setTitle('');
      setBody('');
    } catch (e) {
      setError(e.response?.data?.message || 'Could not send broadcast.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Push Notifications</h1>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Send an announcement or promotion to a segment of customers.
      </p>

      <div className="card" style={{ maxWidth: 520, padding: 20 }}>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Audience</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {AUDIENCES.map((a) => (
            <button
              key={a.value}
              className={`btn ${audience === a.value ? '' : 'secondary'}`}
              onClick={() => setAudience(a.value)}
              type="button"
            >
              {a.label}
            </button>
          ))}
        </div>

        {audience !== 'all' && (
          <>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
              {audience === 'new' ? 'Joined within the last (days)' : 'Joined more than (days) ago'}
            </label>
            <input
              type="number"
              min={1}
              value={days}
              onChange={(e) => setDays(Number(e.target.value) || 1)}
              style={{ width: '100%', marginBottom: 14 }}
            />
          </>
        )}

        <p className="muted" style={{ marginBottom: 14 }}>
          {previewLoading
            ? 'Loading audience size…'
            : preview
              ? `${preview.total} user(s) match this filter — ${preview.withToken} have notifications enabled.`
              : 'Could not load audience size.'}
        </p>

        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Diwali Offer"
          style={{ width: '100%', marginBottom: 14 }}
        />

        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Message</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="e.g. Get 20% off your first consultation today!"
          rows={4}
          style={{ width: '100%', marginBottom: 14 }}
        />

        {error && <p style={{ color: '#dc2626', marginBottom: 12 }}>{error}</p>}
        {result && (
          <p className="muted" style={{ marginBottom: 12 }}>
            Sent to {result.targeted} device(s) — {result.successCount} delivered, {result.failureCount} failed.
          </p>
        )}

        <button className="btn" onClick={send} disabled={sending}>
          {sending ? 'Sending…' : 'Send Broadcast'}
        </button>
      </div>
    </div>
  );
}
