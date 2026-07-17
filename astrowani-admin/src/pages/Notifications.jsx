import { useEffect, useMemo, useState } from 'react';
import client from '../api/client';

const AUDIENCES = [
  { value: 'all_customers', label: 'All Customers' },
  { value: 'all_astrologers', label: 'All Astrologers' },
  { value: 'customer', label: 'Specific Customer' },
  { value: 'astrologer', label: 'Specific Astrologer' },
];

function personLabel(p, isAstrologer) {
  const name = isAstrologer
    ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Astrologer'
    : (p.name || 'Customer');
  const phone = p.phone_number || p.mobile || '—';
  return `${name} (${phone})`;
}

export default function Notifications() {
  const [audience, setAudience] = useState('all_customers');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const [customers, setCustomers] = useState([]);
  const [astrologers, setAstrologers] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [personFilter, setPersonFilter] = useState('');

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const isPersonal = audience === 'customer' || audience === 'astrologer';
  const isAstrologer = audience === 'astrologer';
  const people = isAstrologer ? astrologers : customers;

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data } = await client.get('/api/admin/notifications/history');
      setHistory(data.data || []);
    } catch (_) { /* leave history as-is */ }
    setHistoryLoading(false);
  };

  useEffect(() => { loadHistory(); }, []);

  useEffect(() => {
    if (audience === 'customer' && customers.length === 0) {
      client.get('/api/admin/customers').then(({ data }) => setCustomers(data.data || []));
    }
    if (audience === 'astrologer' && astrologers.length === 0) {
      client.get('/api/admin/astrologers').then(({ data }) => setAstrologers(data.data || []));
    }
    setSelectedIds([]);
    setPersonFilter('');
  }, [audience]);

  const filteredPeople = useMemo(() => {
    const q = personFilter.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => personLabel(p, isAstrologer).toLowerCase().includes(q));
  }, [isAstrologer, people, personFilter]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectedPeople = useMemo(
    () => selectedIds.map((id) => people.find((p) => p.id === id)).filter(Boolean),
    [selectedIds, people],
  );

  const send = async () => {
    if (!title.trim() || !body.trim()) {
      setError('Title and message are both required.');
      return;
    }
    if (isPersonal && selectedIds.length === 0) {
      setError('Pick at least one person to send this to.');
      return;
    }
    setError('');
    setResult(null);
    setSending(true);
    try {
      const { data } = await client.post('/api/admin/notifications/send', {
        audience,
        targetIds: isPersonal ? selectedIds : undefined,
        title,
        body,
      });
      setResult(data);
      setTitle('');
      setBody('');
      setSelectedIds([]);
      loadHistory();
    } catch (e) {
      setError(e.response?.data?.message || 'Could not send notification.');
    } finally {
      setSending(false);
    }
  };

  const audienceLabel = (a) => AUDIENCES.find((x) => x.value === a)?.label || a;

  return (
    <div>
      <h1 className="page-title">Notifications</h1>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Send an in-app + push notification to all customers, all astrologers, or specific people.
      </p>

      <div className="card" style={{ maxWidth: 560, padding: 20, marginBottom: 24 }}>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Audience</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
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

        {isPersonal && (
          <>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
              Search {isAstrologer ? 'astrologers' : 'customers'} by name or phone — click to add, click again to remove
            </label>
            <input
              type="text"
              value={personFilter}
              onChange={(e) => setPersonFilter(e.target.value)}
              placeholder="Type to filter…"
              style={{ width: '100%', marginBottom: 8 }}
            />

            {selectedPeople.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {selectedPeople.map((p) => (
                  <span
                    key={p.id}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      background: '#fdecea', color: '#7d1f1f', border: '1px solid #f3c8c4',
                      borderRadius: 999, padding: '4px 6px 4px 10px', fontSize: 13,
                    }}
                  >
                    {personLabel(p, isAstrologer)}
                    <button
                      type="button"
                      onClick={() => toggleSelect(p.id)}
                      aria-label={`Remove ${personLabel(p, isAstrologer)}`}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', color: '#7d1f1f',
                        fontWeight: 700, lineHeight: 1, padding: '0 2px', fontSize: 15,
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div style={{ border: '1px solid #ddd', borderRadius: 8, maxHeight: 190, overflowY: 'auto', marginBottom: 14 }}>
              {filteredPeople.map((p) => {
                const checked = selectedIds.includes(p.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => toggleSelect(p.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px', cursor: 'pointer',
                      background: checked ? '#fdecea' : 'transparent',
                      borderBottom: '1px solid #f1f1f1',
                    }}
                  >
                    <input type="checkbox" checked={checked} readOnly style={{ pointerEvents: 'none' }} />
                    <span>{personLabel(p, isAstrologer)}</span>
                  </div>
                );
              })}
              {filteredPeople.length === 0 && (
                <div style={{ padding: 12, color: '#999' }}>No matches</div>
              )}
            </div>
          </>
        )}

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
            Sent to {result.recipientCount} recipient(s)
            {result.targetNames?.length ? ` (${result.targetNames.join(', ')})` : ''} —
            {' '}{result.pushSuccess} push delivered, {result.pushFailure} failed
            {result.pushSuccess === 0 && result.pushFailure === 0 ? ' (push disabled until Firebase is configured — in-app notification still sent).' : '.'}
          </p>
        )}

        <button className="btn" onClick={send} disabled={sending}>
          {sending ? 'Sending…' : 'Send Notification'}
        </button>
      </div>

      <h2 className="page-title" style={{ fontSize: 18 }}>History</h2>
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>Sent</th><th>Audience</th><th>Target</th><th>Title</th><th>Recipients</th><th>Push (ok/fail)</th>
          </tr></thead>
          <tbody>
            {historyLoading && <tr><td colSpan={6} className="empty">Loading…</td></tr>}
            {!historyLoading && history.length === 0 && <tr><td colSpan={6} className="empty">No notifications sent yet.</td></tr>}
            {history.map((row) => (
              <tr key={row.id}>
                <td className="muted">{new Date(row.created_at).toLocaleString()}</td>
                <td>{audienceLabel(row.audience)}</td>
                <td className="muted">{row.target_name || '—'}</td>
                <td>{row.title}</td>
                <td className="muted">{row.recipient_count}</td>
                <td className="muted">{row.push_success} / {row.push_failure}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
