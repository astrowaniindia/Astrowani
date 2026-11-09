import { useEffect, useState } from 'react';
import client from '../api/client';

/**
 * The Lal Kitab assistant's switch, persona and limits.
 *
 * WHY THE SWITCH IS THE FIRST THING ON THE CARD. This feature puts an AI that
 * sounds like an astrologer in front of customers, talking about their own chart,
 * with nobody reviewing what it says. It ships OFF
 * (app_settings.lal_kitab_assistant) and the backend routes answer 503 until this
 * is turned on, so the apps can carry the screen with nothing reaching anybody.
 * The confirmation below is deliberate rather than polite.
 *
 * THE INSTRUCTIONS BOX DOES NOT CONTROL EVERYTHING, and that is on purpose. The
 * backend appends a block of fixed rules AFTER this text which cannot be edited
 * from here: remedies must be quoted from the customer's own chart and never
 * invented, nothing outside Lal Kitab gets answered, no outcome is guaranteed, no
 * medical or death predictions, and the self-harm helpline. Anything typed here
 * that contradicts those loses.
 */
export default function LalKitabAssistantCard() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);

  const load = async () => {
    try {
      const r = await client.get('/api/admin/lal-kitab-assistant');
      setState(r.data);
      setDraft({
        instructions: r.data?.config?.instructions || '',
        models: (r.data?.config?.models || []).join(', '),
        temperature: r.data?.config?.temperature ?? 0.75,
        dailyCapPerCustomer: r.data?.config?.dailyCapPerCustomer ?? 60,
        maxHistory: r.data?.config?.maxHistory ?? 24,
      });
      setErr('');
    } catch (e) {
      setErr(e?.response?.data?.message || 'Could not read the assistant status.');
    }
  };
  useEffect(() => { load(); }, []);

  const toggle = async (next) => {
    if (next && !window.confirm(
      'Turn the Lal Kitab assistant ON?\n\n'
      + 'Customers will be able to chat with an AI astrologer about their own Lal Kitab '
      + 'chart. Nobody reviews what it says before they read it.\n\n'
      + 'It only gives remedies that came back from Lal Kitab for that chart, and it '
      + 'falls back to a scripted reply if the AI is unavailable.\n\n'
      + 'You can switch it off again here at any time.',
    )) return;
    setBusy(true);
    try {
      await client.put('/api/admin/lal-kitab-assistant', { enabled: next });
      await load();
      setErr('');
    } catch (e) {
      setErr(e?.response?.data?.message || 'Could not change the setting.');
    }
    setBusy(false);
  };

  const save = async () => {
    setBusy(true);
    try {
      await client.put('/api/admin/lal-kitab-assistant', {
        instructions: draft.instructions,
        models: String(draft.models || '').split(',').map((m) => m.trim()).filter(Boolean),
        temperature: Number(draft.temperature),
        dailyCapPerCustomer: Number(draft.dailyCapPerCustomer),
        maxHistory: Number(draft.maxHistory),
      });
      await load();
      setErr('');
    } catch (e) {
      setErr(e?.response?.data?.message || 'Could not save.');
    }
    setBusy(false);
  };

  if (!state && !err) return null;

  const on = !!(state && state.config && state.config.enabled);
  const status = (state && state.status) || {};
  const today = status.today || {};

  const label = { display: 'block', fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 4 };
  const input = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13.5 };

  return (
    <div style={{
      border: '1px solid #e5e7eb', borderRadius: 12, padding: 18, marginBottom: 20,
      background: on ? '#f0fdf4' : '#fafafa',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px' }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
            Lal Kitab assistant
            <span style={{
              marginLeft: 10, fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
              background: on ? '#16a34a' : '#9ca3af', color: '#fff',
            }}>
              {on ? 'ON' : 'OFF'}
            </span>
          </div>
          <div style={{ fontSize: 13.5, color: '#4b5563', lineHeight: 1.6 }}>
            An AI astrologer that reads a customer&apos;s Lal Kitab chart and gives the remedies
            written in it. {on
              ? 'Customers can use it now.'
              : 'The screen is in the app but the server refuses every request while this is off.'}
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

      <div style={{ marginTop: 14, fontSize: 13, color: '#374151', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <span><strong>{today.turns || 0}</strong> messages today</span>
        <span><strong>{today.ai || 0}</strong> answered by AI</span>
        <span><strong>{today.fallbacks || 0}</strong> scripted</span>
        <span><strong>{today.guardHits || 0}</strong> blocked by the guard</span>
        <span><strong>{status.charts ?? '—'}</strong> charts cached</span>
        <span><strong>{status.conversations ?? '—'}</strong> conversations</span>
      </div>

      {/* A chart fetched is five Jyotisham calls; a cache hit is none. This ratio is
          the number that says whether the store is doing its job. */}
      {(today.charts || 0) > 0 && (
        <div style={{ marginTop: 6, fontSize: 12.5, color: '#6b7280' }}>
          Charts fetched today: {today.charts} ({today.chartHits || 0} served from the cache,
          so {Math.max(0, (today.charts || 0) - (today.chartHits || 0)) * 5} Jyotisham calls were spent).
        </div>
      )}

      {Array.isArray(status.keysConfigured) && (
        <div style={{ marginTop: 6, fontSize: 12.5, color: '#6b7280' }}>
          Gemini keys available: {status.keysConfigured.length ? status.keysConfigured.join(' → ') : 'none — every reply will be scripted'}
        </div>
      )}
      {status.lastError && (
        <div style={{ marginTop: 6, fontSize: 12.5, color: '#b45309' }}>
          Last problem: {status.lastError.message} ({new Date(status.lastError.at).toLocaleString()})
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          marginTop: 14, width: '100%', padding: '10px 14px', borderRadius: 8,
          border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer',
          fontWeight: 600, fontSize: 13.5, textAlign: 'left',
        }}
      >
        {open ? '▾' : '▸'} How it speaks, and its limits — click to {open ? 'hide' : 'change'}
      </button>

      {open && draft && (
        <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
          <div style={{
            fontSize: 12.5, color: '#4b5563', background: '#fff', border: '1px solid #e5e7eb',
            borderRadius: 8, padding: 10, lineHeight: 1.6,
          }}>
            The server adds its own rules <strong>after</strong> whatever you write here, and those
            cannot be edited: remedies must be quoted from the customer&apos;s own chart and never
            invented, questions outside Lal Kitab are declined, no outcome is guaranteed, nothing
            about death, illness or an unborn child&apos;s sex, and the self-harm helpline. Anything
            here that contradicts them loses.
          </div>

          <div>
            <label style={label}>Instructions (the persona)</label>
            <textarea
              rows={10}
              value={draft.instructions}
              onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
              style={{ ...input, fontFamily: 'inherit', lineHeight: 1.5 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <div>
              <label style={label}>Models, in order</label>
              <input
                value={draft.models}
                onChange={(e) => setDraft({ ...draft, models: e.target.value })}
                style={input}
              />
            </div>
            <div>
              <label style={label}>Temperature (0–2)</label>
              <input
                type="number" step="0.05" min="0" max="2"
                value={draft.temperature}
                onChange={(e) => setDraft({ ...draft, temperature: e.target.value })}
                style={input}
              />
            </div>
            <div>
              <label style={label}>Messages per customer per day</label>
              <input
                type="number" min="1" max="500"
                value={draft.dailyCapPerCustomer}
                onChange={(e) => setDraft({ ...draft, dailyCapPerCustomer: e.target.value })}
                style={input}
              />
            </div>
            <div>
              <label style={label}>History sent to the model</label>
              <input
                type="number" min="4" max="60"
                value={draft.maxHistory}
                onChange={(e) => setDraft({ ...draft, maxHistory: e.target.value })}
                style={input}
              />
            </div>
          </div>

          {Array.isArray(status.modelBlocks) && status.modelBlocks.length > 0 && (
            <div style={{ fontSize: 12.5, color: '#b45309' }}>
              Temporarily skipped: {status.modelBlocks.map((b) => `${b.slot} (${b.reason}, ${b.secondsLeft}s)`).join(', ')}
            </div>
          )}

          <div>
            <button
              type="button"
              disabled={busy}
              onClick={save}
              style={{
                padding: '10px 20px', borderRadius: 8, border: 'none', cursor: busy ? 'wait' : 'pointer',
                fontWeight: 700, fontSize: 14, color: '#fff', background: '#1f2937', opacity: busy ? 0.6 : 1,
              }}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
