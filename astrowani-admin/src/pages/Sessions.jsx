import { useEffect, useState } from 'react';
import client from '../api/client';

export default function Sessions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // The prompt customers see at the top of every chat/call/video session.
  // Presentational only — it changes nothing about billing or session pricing.
  const [intro, setIntro] = useState({ enabled: false, text: '', textHi: '' });
  const [introBusy, setIntroBusy] = useState(false);

  useEffect(() => {
    client.get('/api/admin/sessions')
      .then(({ data }) => setRows(data.data || []))
      .finally(() => setLoading(false));

    // Independent of the session list — a failure here (e.g. session_intro_banner.sql not
    // yet run) must not stop the table rendering.
    client.get('/api/admin/settings')
      .then(({ data }) => {
        const st = data.settings || {};
        setIntro({
          enabled: st.session_intro_banner_enabled === 'true',
          text: st.session_intro_banner_text || '',
          textHi: st.session_intro_banner_text_hi || '',
        });
      })
      .catch(() => {});
  }, []);

  const saveIntro = async () => {
    setIntroBusy(true);
    try {
      await Promise.all([
        client.patch('/api/admin/settings', { key: 'session_intro_banner_enabled', value: intro.enabled ? 'true' : 'false' }),
        client.patch('/api/admin/settings', { key: 'session_intro_banner_text', value: intro.text }),
        client.patch('/api/admin/settings', { key: 'session_intro_banner_text_hi', value: intro.textHi }),
      ]);
      alert('Saved. New sessions show the updated message immediately.');
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setIntroBusy(false); }
  };

  const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');

  return (
    <div>
      <h1 className="page-title">Sessions</h1>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ margin: 0 }}>Session start message</h3>
        <p className="muted" style={{ marginTop: 4, marginBottom: 12 }}>
          Shown to the customer at the top of every chat, call and video session, then it
          fades away on its own. Use it to get the consult off to a productive start — asking
          them to share and re-check their birth details is what it's there for.
          <br />
          <b>This is wording only.</b> It does not change billing, pricing or the per-minute
          charge, and it grants nothing. For that reason, avoid promising a free minute here:
          the session is charged from the moment it connects, so a customer can check that
          claim against their wallet and it comes back as a refund request.
        </p>
        <div className="checkbox-row" style={{ marginBottom: 12 }}>
          <input
            id="intro-on"
            type="checkbox"
            checked={intro.enabled}
            onChange={(e) => setIntro((p) => ({ ...p, enabled: e.target.checked }))}
          />
          <label htmlFor="intro-on" style={{ margin: 0 }}>Show this message during sessions</label>
        </div>
        <div className="field">
          <label>Message (English)</label>
          <textarea
            rows={3}
            value={intro.text}
            onChange={(e) => setIntro((p) => ({ ...p, text: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>Message (Hindi) — falls back to English if left blank</label>
          <textarea
            rows={3}
            value={intro.textHi}
            onChange={(e) => setIntro((p) => ({ ...p, textHi: e.target.value }))}
          />
        </div>
        <button className="btn" onClick={saveIntro} disabled={introBusy}>
          {introBusy ? 'Saving…' : 'Save message'}
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>Type</th><th>Caller</th><th>Vendor</th><th>Active</th>
            <th>Started</th><th>Ended</th><th>₹/min</th><th>Charged</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="empty">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={8} className="empty">No sessions.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.call_type || '—'}</td>
                <td className="muted" title={r.caller_id}>{String(r.caller_id || '').slice(0, 8)}…</td>
                <td className="muted" title={r.vendor_id}>{String(r.vendor_id || '').slice(0, 8)}…</td>
                <td>{r.is_active ? <span className="badge green">Live</span> : <span className="badge gray">Ended</span>}</td>
                <td className="muted">{fmt(r.started_at)}</td>
                <td className="muted">{fmt(r.ended_at)}</td>
                <td>{r.per_minute_charge ?? '—'}</td>
                <td><b>{r.total_charged ?? 0}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
