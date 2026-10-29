import { useEffect, useState } from 'react';
import client from '../api/client';

/**
 * The blog agent's on/off switch.
 *
 * WHY IT IS A SWITCH AND NOT A "RUN NOW" BUTTON. The agent is driven by three
 * systemd timers on the VPS (03:30 / 09:30 / 17:30 IST, installed 2026-10-29).
 * They fire whatever this says and exit immediately while it is off, so turning
 * the agent on really is only this flag — and turning it off stops the next
 * article without anybody touching the server.
 *
 * It publishes to a live site with nobody reading first, which is why the
 * confirmation below is deliberate rather than polite: switching it ON is the
 * one action here that puts machine-written text in front of customers.
 */
export default function BlogAgentCard() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const r = await client.get('/api/admin/blog-agent');
      setState(r.data);
      setErr('');
    } catch (e) {
      setErr(e?.response?.data?.message || 'Could not read the agent status.');
    }
  };
  useEffect(() => { load(); }, []);

  const toggle = async (next) => {
    if (next && !window.confirm(
      'Turn the blog agent ON?\n\n'
      + 'It will publish three articles a day to the live website, automatically, '
      + 'with nobody reviewing them first.\n\n'
      + 'You can switch it off again here at any time.',
    )) return;
    setBusy(true);
    try {
      await client.patch('/api/admin/blog-agent', { enabled: next });
      await load();
      setErr('');
    } catch (e) {
      setErr(e?.response?.data?.message || 'Could not change the setting.');
    }
    setBusy(false);
  };

  if (!state && !err) return null;

  const on = !!(state && state.enabled);
  const runs = (state && state.runs) || [];

  return (
    <div style={{
      border: '1px solid #e5e7eb', borderRadius: 12, padding: 18, marginBottom: 20,
      background: on ? '#f0fdf4' : '#fafafa',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px' }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
            Blog agent
            <span style={{
              marginLeft: 10, fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
              background: on ? '#16a34a' : '#9ca3af', color: '#fff',
            }}>
              {on ? 'ON' : 'OFF'}
            </span>
          </div>
          <div style={{ fontSize: 13.5, color: '#4b5563', lineHeight: 1.6 }}>
            Writes three articles a day (03:30, 09:30 and 17:30 IST) and publishes them to the
            website automatically. {on
              ? 'It is running. Switch it off to stop the next one.'
              : 'It is installed and scheduled, but writes nothing while this is off.'}
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => toggle(!on)}
          style={{
            padding: '10px 20px', borderRadius: 8, border: 'none', cursor: busy ? 'wait' : 'pointer',
            fontWeight: 700, fontSize: 14, color: '#fff', background: on ? '#dc2626' : '#16a34a',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Saving…' : on ? 'Turn OFF' : 'Turn ON'}
        </button>
      </div>

      {err && <div style={{ marginTop: 12, color: '#b91c1c', fontSize: 13 }}>{err}</div>}

      {state && (
        <div style={{ marginTop: 14, fontSize: 13, color: '#374151' }}>
          <strong>{state.publishedLast24h || 0}</strong> published in the last 24 hours.
          {runs.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Recent runs</div>
              <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                {runs.map((r, i) => (
                  <div key={i} style={{ padding: '3px 0', borderBottom: '1px solid #f3f4f6' }}>
                    <span style={{
                      display: 'inline-block', minWidth: 74, fontWeight: 600,
                      color: r.status === 'published' ? '#16a34a' : r.status === 'rejected' ? '#b45309' : '#b91c1c',
                    }}>
                      {r.status}
                    </span>
                    <span style={{ color: '#6b7280' }}>
                      {new Date(r.started_at).toLocaleString()} · {r.topic_title || r.slug || '—'}
                      {r.word_count ? ` · ${r.word_count}w` : ''}
                      {r.error ? ` · ${String(r.error).slice(0, 70)}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {runs.length === 0 && (
            <div style={{ marginTop: 6, color: '#6b7280' }}>
              No runs recorded yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
