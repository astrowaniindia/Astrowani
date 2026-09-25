import { Fragment, useEffect, useState } from 'react';
import client from '../api/client';

// Off-platform contact flags: chat messages where a phone number, email, UPI id, link or
// messaging handle appeared (or someone asked for one). Nothing is blocked -- this is the
// review queue. "High" = contact details are actually present; "Low" = wording only.

const fullName = (a) => (a ? `${a.first_name || ''} ${a.last_name || ''}`.trim() : '');
const KIND_LABEL = {
  phone: 'Phone number', email: 'Email', upi: 'UPI id', link: 'Link', handle: 'Social handle',
  channel: 'Mentions WhatsApp/Telegram/etc.', contact_request: 'Asks for a number',
};

function statusBadge(s) {
  const cls = s === 'actioned' ? 'red' : s === 'reviewed' ? 'green' : s === 'dismissed' ? '' : 'amber';
  return <span className={`badge ${cls}`}>{s}</span>;
}

export default function SessionFlags() {
  const [rows, setRows] = useState([]);
  const [repeat, setRepeat] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tableMissing, setTableMissing] = useState(false);
  const [status, setStatus] = useState('pending');
  const [severity, setSeverity] = useState('high');
  const [role, setRole] = useState('astrologer');
  const [open, setOpen] = useState(null); // flag id whose conversation is showing
  const [context, setContext] = useState(null); // proof for the open flag
  const [rec, setRec] = useState(null); // call-recording status { storageConfigured, enabled, transcriptionKey }
  const [audioUrls, setAudioUrls] = useState({}); // recordingId -> short-lived playback url

  const loadRec = async () => {
    try { const { data } = await client.get('/api/admin/call-recordings/status'); setRec(data); } catch (_) { setRec(null); }
  };
  useEffect(() => { loadRec(); }, []);

  const toggleRecording = async () => {
    const next = !rec.enabled;
    if (next && !window.confirm(
      'Switch call recording ON?\n\nCalls in the updated apps will be recorded (each person\'s own microphone) and checked for phone numbers. ' +
      'Make sure your Terms and Privacy Policy already say calls may be recorded.',
    )) return;
    try {
      await client.patch('/api/admin/settings', { key: 'call_recording_enabled', value: next ? 'true' : 'false' });
      await loadRec();
    } catch (e) { window.alert(e.response?.data?.message || e.message || 'Failed to save.'); }
  };

  const playRecording = async (id) => {
    try {
      const { data } = await client.get(`/api/admin/call-recordings/${id}/audio`);
      setAudioUrls((u) => ({ ...u, [id]: data.url }));
    } catch (e) { window.alert(e.response?.data?.message || 'Could not load the recording.'); }
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await client.get('/api/admin/session-flags', { params: { status, severity, role } });
      setRows(data.data || []);
      setRepeat(data.repeat || []);
      setTableMissing(!!data.tableMissing);
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Failed to load flags.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status, severity, role]);

  const mark = async (r, next) => {
    const note = window.prompt(`Admin note for marking "${next}" (optional):`);
    if (note === null) return;
    try {
      await client.patch(`/api/admin/session-flags/${r.id}`, { status: next, admin_note: note });
      await load();
    } catch (e) {
      window.alert(e.response?.data?.message || e.message || 'Failed to update.');
    }
  };

  const toggleContext = async (r) => {
    if (open === r.id) { setOpen(null); return; }
    setOpen(r.id);
    setContext(null);
    try {
      const { data } = await client.get(`/api/admin/session-flags/${r.id}/context`);
      setContext(data.data || { messages: [] });
    } catch (e) {
      setContext({ error: e.response?.data?.message || 'Could not load the proof.', messages: [] });
    }
  };

  const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');

  // Plain-text version of the proof, for pasting into a warning email or a dispute.
  const copyProof = async (c) => {
    const lines = [
      `Off-platform contact flag ${c.flag.id}`,
      `Astrologer: ${c.astrologer.name} ${c.astrologer.phone || ''}`,
      `Customer: ${c.customer.name} ${c.customer.mobile || ''}`,
      `Session: ${fmt(c.session?.started_at)} to ${fmt(c.session?.ended_at)}`,
      '',
      ...c.messages.map((m) => `[${fmt(m.created_at)}] ${m.name}: ${m.message}${m.isFlagged ? '   <-- FLAGGED' : ''}`),
    ];
    try { await navigator.clipboard.writeText(lines.join('\n')); window.alert('Proof copied.'); }
    catch (_) { window.alert('Could not copy.'); }
  };

  return (
    <div>
      <h1 className="page-title">Off-platform contact flags</h1>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Chat messages that contained a phone number, email, UPI id, link or messaging handle. Messages are
        never blocked; each match lands here for review.
      </p>

      {tableMissing && (
        <div className="card" style={{ marginBottom: 12 }}>
          Run <code>sql/session_flags.sql</code> in the Supabase SQL editor to enable this page.
        </div>
      )}

      {rec && (
        <div className="card" style={{ marginBottom: 12 }}>
          <b>Call recording (audio)</b>{' '}
          <span className={`badge ${rec.enabled && rec.storageConfigured ? 'green' : 'amber'}`}>
            {rec.enabled && rec.storageConfigured ? 'ON' : 'OFF'}
          </span>
          <p className="muted" style={{ margin: '6px 0' }}>
            Each phone records its own microphone during a call (not while muted) and uploads it; the audio is
            transcribed and checked for spoken phone numbers. No notice is shown in the call. Only apps
            updated with the recording build take part.
          </p>
          {!rec.storageConfigured && (
            <p style={{ color: '#c0392b', margin: '6px 0' }}>
              Storage is not set up yet (R2_ENDPOINT, R2_CALL_BUCKET, R2_CALL_ACCESS_KEY_ID, R2_CALL_SECRET_ACCESS_KEY
              on the server), so nothing can be recorded even if switched on.
            </p>
          )}
          {!rec.transcriptionKey && <p style={{ color: '#c0392b', margin: '6px 0' }}>No Gemini key on the server, so recordings could not be transcribed.</p>}
          <button className="btn" onClick={toggleRecording}>{rec.enabled ? 'Switch OFF' : 'Switch ON'}</button>
        </div>
      )}

      {repeat.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <b>Most flagged astrologers (last 30 days, contact details shared)</b>
          <div style={{ marginTop: 6 }}>
            {repeat.map((r) => (
              <span key={r.astrologerId} className="badge red" style={{ marginRight: 6 }}>
                {r.name || 'Astrologer'} · {r.count}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">Pending</option><option value="reviewed">Reviewed</option>
          <option value="actioned">Actioned</option><option value="dismissed">Dismissed</option>
          <option value="all">Any status</option>
        </select>
        <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="high">Contact details shared</option>
          <option value="low">Wording only</option>
          <option value="all">Any severity</option>
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="astrologer">Sent by astrologer</option>
          <option value="customer">Sent by customer</option>
          <option value="all">Anyone</option>
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Message</th><th>What was found</th><th>Astrologer</th><th>Customer</th><th>Sent by</th>
              <th>Status</th><th>When</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="empty">Loading…</td></tr>}
            {!loading && error && <tr><td colSpan={8} className="empty" style={{ color: '#c0392b' }}>{error}</td></tr>}
            {!loading && !error && rows.length === 0 && <tr><td colSpan={8} className="empty">Nothing to review.</td></tr>}
            {!loading && !error && rows.map((r) => (
              <Fragment key={r.id}>
                <tr>
                  <td style={{ maxWidth: 300 }}>“{r.excerpt || '—'}”</td>
                  <td>{(r.kinds || []).map((k) => (
                    <span key={k} className={`badge ${r.severity === 'high' ? 'red' : 'amber'}`} style={{ marginRight: 4 }}>
                      {KIND_LABEL[k] || k}
                    </span>
                  ))}</td>
                  <td>{fullName(r.astrologers) || '—'}<br /><span className="muted">{r.astrologers?.phone_number || ''}</span></td>
                  <td>{r.customers?.name || '—'}<br /><span className="muted">{r.customers?.mobile || ''}</span></td>
                  <td>{r.sender_role}</td>
                  <td>{statusBadge(r.status)}{r.admin_note && <><br /><span className="muted">{r.admin_note}</span></>}</td>
                  <td className="muted">{new Date(r.created_at).toLocaleString()}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.session_id && (
                      <button className="btn secondary" style={{ marginRight: 6 }} onClick={() => toggleContext(r)}>
                        {open === r.id ? 'Hide proof' : 'View proof'}
                      </button>
                    )}
                    {r.status === 'pending' && (
                      <>
                        <button className="btn secondary" style={{ marginRight: 6 }} onClick={() => mark(r, 'dismissed')}>Not an issue</button>
                        <button className="btn" onClick={() => mark(r, 'actioned')}>Actioned</button>
                      </>
                    )}
                  </td>
                </tr>
                {open === r.id && (
                  <tr>
                    <td colSpan={8} style={{ background: 'rgba(0,0,0,0.03)' }}>
                      {!context && <span className="muted">Loading proof…</span>}
                      {context?.error && <span style={{ color: '#c0392b' }}>{context.error}</span>}
                      {context && !context.error && (
                        <div>
                          <div style={{ marginBottom: 8 }}>
                            <b>Astrologer:</b> {context.astrologer?.name} <span className="muted">{context.astrologer?.phone}</span>
                            {' · '}<b>Customer:</b> {context.customer?.name} <span className="muted">{context.customer?.mobile}</span>
                            {' · '}<b>Session:</b> <span className="muted">{fmt(context.session?.started_at)} → {fmt(context.session?.ended_at)}</span>
                            <button className="btn secondary" style={{ marginLeft: 12 }} onClick={() => copyProof(context)}>Copy proof</button>
                          </div>
                          {(context.recordings || []).map((rc) => (
                            <div
                              key={rc.id}
                              style={{
                                padding: '6px 8px', marginBottom: 6, borderRadius: 4,
                                background: rc.isFlagged ? 'rgba(192,57,43,0.12)' : 'rgba(0,0,0,0.04)',
                                borderLeft: rc.isFlagged ? '3px solid #c0392b' : '3px solid transparent',
                              }}
                            >
                              <b>Call recording · {rc.name} ({rc.role})</b>{' '}
                              <span className="muted">
                                {Math.round((rc.duration_ms || 0) / 1000)}s · {rc.status}{rc.error ? ` (${rc.error})` : ''}
                              </span>
                              {rc.hasAudio && !audioUrls[rc.id] && (
                                <button className="btn secondary" style={{ marginLeft: 10 }} onClick={() => playRecording(rc.id)}>Load audio</button>
                              )}
                              {audioUrls[rc.id] && <audio controls src={audioUrls[rc.id]} style={{ display: 'block', marginTop: 6 }} />}
                              {rc.transcript && <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{rc.transcript}</div>}
                              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                                This is what that person&apos;s own microphone picked up. If they were on speaker, the other person&apos;s voice can appear too.
                              </div>
                            </div>
                          ))}
                          {context.messages.length === 0 && !(context.recordings || []).length && (
                            <span className="muted">No saved conversation for this flag.</span>
                          )}
                          {context.messages.map((m) => (
                            <div
                              key={m.id}
                              style={{
                                padding: '4px 8px', marginBottom: 2, borderRadius: 4,
                                background: m.isFlagged ? 'rgba(192,57,43,0.12)' : 'transparent',
                                borderLeft: m.isFlagged ? '3px solid #c0392b' : '3px solid transparent',
                              }}
                            >
                              <span className="muted">{fmt(m.created_at)} · {m.name} ({m.from}):</span>{' '}
                              <span style={{ fontWeight: m.isFlagged ? 700 : 400 }}>{m.message}</span>
                              {m.isFlagged && (
                                <div className="muted" style={{ fontSize: 12 }}>
                                  ↑ as typed. The customer/astrologer actually saw: “{m.savedAs}”
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
