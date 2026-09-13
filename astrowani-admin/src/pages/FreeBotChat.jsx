import { useEffect, useState } from 'react';
import client from '../api/client';
import ImageField from '../components/ImageField';

// Persona/card shown in the customer app's free 5-minute bot-chat welcome
// popup and in the chat screen's header. Stored as one JSON string under the
// app_settings key `free_bot_chat_persona` (same key/value table already used
// for the banner interval and session-replay toggle) — read by the customer
// app via GET /api/free-bot-chat/persona, no new schema needed.
const DEFAULTS = {
  enabled: true,
  name: 'Acharya Priya',
  image: '',
  experience: '12 years',
  specialities: 'Love & Relationship, Career, Vedic Astrology',
  headerText: "🎁 Here's your free chat for 5 minutes with an astrologer!",
  ctaText: 'Start Free Chat Now',
};

export default function FreeBotChat() {
  const [form, setForm] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/api/admin/settings');
      const raw = data.settings?.free_bot_chat_persona;
      if (raw) setForm({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch (e) {
      console.error('load free_bot_chat_persona failed:', e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      await client.patch('/api/admin/settings', {
        key: 'free_bot_chat_persona',
        value: JSON.stringify(form),
      });
      alert('Saved. New signups will see this on their next app refresh.');
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <div>
      <h1 className="page-title">5 Minute Free Chat</h1>
      <p className="muted" style={{ marginTop: -8, marginBottom: 18 }}>
        The free 5-minute welcome chat shown once to brand-new customers on Home. No real
        astrologer is on the other end: replies come from the AI below when it is on, and
        from the built-in scripted chat otherwise (or whenever the AI is unavailable).
      </p>

      <div className="card" style={{ maxWidth: 520 }}>
        <div className="field checkbox-row">
          <input id="fbc-enabled" type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />
          <label htmlFor="fbc-enabled" style={{ margin: 0 }}>Enabled (show this offer to eligible new customers)</label>
        </div>

        <div className="field"><label>Popup header text</label>
          <input type="text" value={form.headerText} onChange={(e) => set('headerText', e.target.value)} /></div>

        <ImageField label="Persona photo (URL or upload)" value={form.image} onChange={(v) => set('image', v)} />

        <div className="field"><label>Persona name</label>
          <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} /></div>

        <div className="field"><label>Experience text</label>
          <input type="text" value={form.experience} onChange={(e) => set('experience', e.target.value)} placeholder="e.g. 12 years" /></div>

        <div className="field"><label>Specialities text</label>
          <input type="text" value={form.specialities} onChange={(e) => set('specialities', e.target.value)} placeholder="e.g. Love & Relationship, Career, Vedic Astrology" /></div>

        <div className="field"><label>Start button text</label>
          <input type="text" value={form.ctaText} onChange={(e) => set('ctaText', e.target.value)} /></div>

        <div className="actions">
          <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      <AiReplies />
    </div>
  );
}

// Gemini replies for the chat (backend: src/freeChatAi.js, app_settings key
// `free_bot_chat_ai`). Saved separately from the persona card above.
function AiReplies() {
  const [form, setForm] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [status, setStatus] = useState(null);
  const [savedJson, setSavedJson] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [testInput, setTestInput] = useState('');
  const [testLog, setTestLog] = useState([]);
  const [testBusy, setTestBusy] = useState(false);

  const load = async () => {
    try {
      const { data } = await client.get('/api/admin/free-bot-chat/ai');
      setForm(data.config);
      setSavedJson(JSON.stringify(data.config));
      setDefaults(data.defaults);
      setStatus(data.status);
      setLoadError('');
    } catch (e) {
      setLoadError(e.response?.data?.message || e.message);
    }
  };
  useEffect(() => { load(); }, []);

  if (loadError) return <div className="card" style={{ maxWidth: 720, marginTop: 20 }}><p className="error-text">Could not load AI settings: {loadError}</p></div>;
  if (!form) return <p className="muted" style={{ marginTop: 20 }}>Loading AI settings…</p>;

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const dirty = JSON.stringify(form) !== savedJson;

  const save = async () => {
    if (form.enabled && !status?.apiKeyConfigured && !window.confirm('No GEMINI_API_KEY is set on the server, so customers will keep getting the scripted chat. Save anyway?')) return;
    setBusy(true);
    try {
      const { data } = await client.put('/api/admin/free-bot-chat/ai', form);
      setForm(data.config);
      setSavedJson(JSON.stringify(data.config));
      alert('Saved. The next customer message uses these settings.');
      load();
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  const runTest = async (opening) => {
    const text = testInput.trim();
    if (!opening && !text) return;
    const history = opening ? [] : [...testLog.filter((m) => m.sender !== 'error'), { sender: 'me', message: text }];
    if (!opening) setTestLog(history);
    setTestInput('');
    setTestBusy(true);
    try {
      const { data } = await client.post('/api/admin/free-bot-chat/ai/test', {
        instructions: form.instructions,
        model: form.model,
        sendProfile: form.sendProfile,
        history,
        opening,
      });
      const next = opening ? [] : history;
      setTestLog(data.reply
        ? [...next, { sender: 'bot', message: data.reply, ms: data.ms }]
        : [...next, { sender: 'error', message: `No AI reply (${data.reason}${data.detail ? `: ${data.detail}` : ''}). A customer would get the scripted chat here.`, ms: data.ms }]);
    } catch (e) {
      setTestLog((l) => [...l, { sender: 'error', message: e.response?.data?.message || e.message }]);
    } finally {
      setTestBusy(false);
    }
  };

  const today = status?.today || {};
  const fallbackTotal = Object.values(today.fallbacks || {}).reduce((a, b) => a + b, 0);

  return (
    <div className="card" style={{ maxWidth: 720, marginTop: 20 }}>
      <h2 style={{ marginTop: 0 }}>AI replies (Gemini)</h2>
      <p className="muted" style={{ marginTop: -6 }}>
        Replies slower than 13 seconds count as failed, and the customer gets the scripted chat. Aim for 2–5 seconds in "Try it".
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <span className={`badge ${status?.apiKeyConfigured ? 'green' : 'red'}`}>
          <span className="badge-dot" />API key {status?.apiKeyConfigured ? 'set on server' : 'NOT set on server'}
        </span>
        <span className="badge blue"><span className="badge-dot" />Today: {today.aiReplies || 0} AI replies</span>
        <span className="badge gray"><span className="badge-dot" />{fallbackTotal} scripted fallbacks</span>
        {status?.quotaBlockedUntil && (
          <span className="badge amber">
            <span className="badge-dot" />Gemini {status.quotaBlockReason} reached — scripted chat until {new Date(status.quotaBlockedUntil).toLocaleString('en-IN')}
          </span>
        )}
      </div>
      {fallbackTotal > 0 && (
        <p className="muted" style={{ marginTop: -6 }}>
          Fallback reasons today: {Object.entries(today.fallbacks).map(([k, v]) => `${k} ${v}`).join(', ')}
          {status?.lastError ? ` · last error: ${status.lastError.detail}` : ''}
        </p>
      )}

      <div className="field checkbox-row">
        <input id="ai-enabled" type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />
        <label htmlFor="ai-enabled" style={{ margin: 0 }}>Use AI replies (when off, or when Gemini fails or hits its limit, customers get the scripted chat)</label>
      </div>

      <div className="field">
        <label>Instructions — how the astrologer should speak and behave</label>
        <textarea rows={14} value={form.instructions} onChange={(e) => set('instructions', e.target.value)} />
        <div className="muted" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span>{form.instructions.length.toLocaleString()} / 12,000 characters</span>
          {defaults && form.instructions !== defaults.instructions && (
            <button type="button" className="btn ghost sm" onClick={() => window.confirm('Replace your instructions with the default text?') && set('instructions', defaults.instructions)}>Reset to default</button>
          )}
        </div>
        <p className="muted" style={{ marginTop: 6 }}>
          Always added after your text and not editable here: short plain-text replies in the customer's language,
          no guaranteed outcomes or death/illness predictions, no medical/legal/financial instructions, the Tele-MANAS
          helpline (14416) if someone is in distress, never claiming to be human if sincerely asked, and never asking
          for OTPs or payment details.
        </p>
      </div>

      <div className="field checkbox-row">
        <input id="ai-profile" type="checkbox" checked={form.sendProfile} onChange={(e) => set('sendProfile', e.target.checked)} />
        <label htmlFor="ai-profile" style={{ margin: 0 }}>Send the customer's saved name and birth details to the AI</label>
      </div>
      {form.sendProfile && (
        <p className="muted" style={{ marginTop: -6 }}>
          ⚠ On Gemini's free tier, Google may use chats to improve its products and people may review them.
          Google's terms ask you not to send personal information on the free tier.
        </p>
      )}

      <div className="field">
        <label>Gemini model</label>
        <input type="text" value={form.model} onChange={(e) => set('model', e.target.value)} placeholder={defaults?.model} />
      </div>

      <div className="actions">
        <button className="btn" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : dirty ? 'Save AI settings' : 'Saved'}</button>
      </div>

      <hr style={{ margin: '22px 0' }} />

      <h3 style={{ marginTop: 0 }}>Try it</h3>
      <p className="muted" style={{ marginTop: -6 }}>
        Uses the instructions and model above even before you save, with a sample customer (Rahul, born
        14 Aug 1995, 6:30 am, Jaipur). Test messages count against the same Gemini daily limit.
      </p>
      <div style={{ border: '1px solid #e5e5e5', borderRadius: 10, padding: 12, minHeight: 80, maxHeight: 360, overflowY: 'auto', marginBottom: 10, background: '#fafafa' }}>
        {testLog.length === 0 && <p className="muted" style={{ margin: 0 }}>Start with the AI's greeting, or type a message as the customer.</p>}
        {testLog.map((m, i) => (
          <div key={i} style={{ textAlign: m.sender === 'me' ? 'right' : 'left', margin: '6px 0' }}>
            <span style={{
              display: 'inline-block', maxWidth: '80%', padding: '8px 12px', borderRadius: 14, whiteSpace: 'pre-wrap', textAlign: 'left',
              background: m.sender === 'me' ? '#592a19' : m.sender === 'error' ? '#fdecea' : '#fff',
              color: m.sender === 'me' ? '#fff' : m.sender === 'error' ? '#8a1c12' : '#222',
              border: m.sender === 'me' ? 'none' : '1px solid #e5e5e5',
            }}>{m.message}</span>
            {m.ms != null && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{(m.ms / 1000).toFixed(1)}s</div>}
          </div>
        ))}
        {testBusy && <p className="muted" style={{ margin: '6px 0' }}>Typing…</p>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          style={{ flex: 1 }}
          value={testInput}
          onChange={(e) => setTestInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !testBusy) runTest(false); }}
          placeholder="Type as the customer, e.g. Meri shaadi kab hogi?"
        />
        <button className="btn" onClick={() => runTest(false)} disabled={testBusy || !testInput.trim()}>Send</button>
        <button className="btn secondary" onClick={() => runTest(true)} disabled={testBusy}>Greeting</button>
        <button className="btn ghost" onClick={() => setTestLog([])} disabled={testBusy || !testLog.length}>Clear</button>
      </div>
    </div>
  );
}
