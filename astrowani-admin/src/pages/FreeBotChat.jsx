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
  // '' = walk the whole list exactly like a customer; otherwise one model only.
  const [testModel, setTestModel] = useState('');

  const [available, setAvailable] = useState(null);
  const [availableBusy, setAvailableBusy] = useState(false);
  const [newModel, setNewModel] = useState('');

  const checkAvailable = async () => {
    setAvailableBusy(true);
    try {
      const { data } = await client.get('/api/admin/free-bot-chat/ai/models');
      setAvailable(data.models);
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    } finally {
      setAvailableBusy(false);
    }
  };

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

  const models = form.models || [];
  const setModels = (next) => set('models', next);
  const moveModel = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= models.length) return;
    const next = [...models];
    [next[i], next[j]] = [next[j], next[i]];
    setModels(next);
  };
  const addModel = (name) => {
    const n = String(name || '').trim();
    if (!n) return;
    if (!/^[a-z0-9.\-]+$/i.test(n)) { alert('Model names only contain letters, numbers, dots and dashes.'); return; }
    if (models.includes(n)) return;
    if (models.length >= 8) { alert('At most 8 models.'); return; }
    setModels([...models, n]);
    setNewModel('');
  };

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
        models,
        typing: form.typing,
        ...(testModel ? { model: testModel } : {}),
        sendProfile: form.sendProfile,
        history,
        opening,
      });
      // Wait like the app does, so "Try it" feels like the real chat.
      if (data.reply && data.typingMs > data.ms) {
        await new Promise((r) => setTimeout(r, data.typingMs - data.ms));
      }
      const next = opening ? [] : history;
      const tried = (data.attempts || [])
        .map((a) => (a.ok ? `${a.model} ✓ ${(a.ms / 1000).toFixed(1)}s`
          : a.skipped ? `${a.model} skipped (${a.skipped})`
            : `${a.model} ✗ ${a.reason}${a.ms != null ? ` ${(a.ms / 1000).toFixed(1)}s` : ''}`))
        .join(' → ');
      setTestLog(data.reply
        ? [...next, { sender: 'bot', message: data.reply, ms: data.ms, meta: `shown after ${(Math.max(data.ms, data.typingMs || 0) / 1000).toFixed(1)}s · ${tried}` }]
        : [...next, { sender: 'error', message: `No AI reply (${data.reason}${data.detail ? `: ${data.detail}` : ''}). A customer would get the scripted chat here.`, ms: data.ms, meta: tried }]);
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
        Models are tried in order. Each gets about 6 seconds; if it is slow, busy, retired or out of its free limit,
        the next one answers instead. Only when every model fails does the customer get the scripted chat.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <span className={`badge ${status?.apiKeyConfigured ? 'green' : 'red'}`}>
          <span className="badge-dot" />API key {status?.apiKeyConfigured ? 'set on server' : 'NOT set on server'}
        </span>
        <span className="badge blue"><span className="badge-dot" />Today: {today.aiReplies || 0} AI replies</span>
        <span className="badge gray"><span className="badge-dot" />{fallbackTotal} scripted fallbacks</span>
      </div>
      {fallbackTotal > 0 && (
        <p className="muted" style={{ marginTop: -6 }}>
          Fallback reasons today: {Object.entries(today.fallbacks).map(([k, v]) => `${k} ${v}`).join(', ')}
          {status?.lastError?.detail ? ` · last error: ${status.lastError.detail}` : ''}
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
        <label>Models, in the order they are tried</label>
        <div style={{ border: '1px solid #e5e5e5', borderRadius: 10, overflow: 'hidden' }}>
          {models.map((m, i) => {
            const usage = today.byModel?.[m];
            const blocked = (status?.modelBlocks || []).find((b) => b.model === m);
            const failures = usage ? Object.entries(usage.failures).map(([k, v]) => `${k} ${v}`).join(', ') : '';
            return (
              <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderTop: i ? '1px solid #eee' : 'none' }}>
                <strong style={{ width: 20 }}>{i + 1}.</strong>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'monospace' }}>{m}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Today: {usage?.replies || 0} replies{failures ? ` · failed: ${failures}` : ''}
                    {blocked ? ` · skipped (${blocked.reason}) until ${new Date(blocked.until).toLocaleTimeString('en-IN')}` : ''}
                  </div>
                </div>
                <button type="button" className="btn ghost sm" onClick={() => moveModel(i, -1)} disabled={i === 0} title="Move up">↑</button>
                <button type="button" className="btn ghost sm" onClick={() => moveModel(i, 1)} disabled={i === models.length - 1} title="Move down">↓</button>
                <button type="button" className="btn ghost sm" onClick={() => setModels(models.filter((x) => x !== m))} disabled={models.length === 1} title="Remove">✕</button>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input type="text" style={{ flex: 1 }} value={newModel} onChange={(e) => setNewModel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addModel(newModel); }} placeholder="Add a model name, e.g. gemma-4-31b-it" />
          <button type="button" className="btn secondary" onClick={() => addModel(newModel)} disabled={!newModel.trim()}>Add</button>
          <button type="button" className="btn ghost" onClick={checkAvailable} disabled={availableBusy}>{availableBusy ? 'Checking…' : 'Check available models'}</button>
          {defaults?.models && JSON.stringify(models) !== JSON.stringify(defaults.models) && (
            <button type="button" className="btn ghost" onClick={() => window.confirm('Replace the list with the default order?') && setModels(defaults.models)}>Default list</button>
          )}
        </div>
        {available && (
          <div style={{ marginTop: 10, border: '1px dashed #ddd', borderRadius: 10, padding: 10 }}>
            <div className="muted" style={{ marginBottom: 6 }}>
              Chat models this API key can call ({available.length}). Each has its own free limit — see aistudio.google.com/rate-limit.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {available.map((m) => (
                <button key={m.name} type="button" className="btn ghost sm" disabled={models.includes(m.name)} onClick={() => addModel(m.name)} title={m.displayName}>
                  {models.includes(m.name) ? '✓ ' : '+ '}{m.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="field">
        <label>Typing feel</label>
        <p className="muted" style={{ marginTop: 0 }}>
          So replies don't appear instantly, the chat shows "typing…" first — longer for longer replies. The time the AI
          itself took counts toward it.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            ['minSeconds', 'Shortest wait (seconds)', 0, 20, 0.5],
            ['maxSeconds', 'Longest wait (seconds)', 0, 30, 0.5],
            ['charsPerSecond', 'Typing speed (characters per second)', 1, 100, 1],
          ].map(([k, label, min, max, step]) => (
            <div key={k} style={{ flex: '1 1 180px' }}>
              <label style={{ fontWeight: 400 }}>{label}</label>
              <input
                type="number"
                min={min}
                max={max}
                step={step}
                value={form.typing?.[k] ?? ''}
                onChange={(e) => set('typing', { ...form.typing, [k]: e.target.value === '' ? '' : Number(e.target.value) })}
              />
            </div>
          ))}
        </div>
        {form.typing && (
          <p className="muted" style={{ marginTop: 6 }}>
            A 40-character reply waits {Math.min(form.typing.maxSeconds, Math.max(form.typing.minSeconds, 40 / (form.typing.charsPerSecond || 1))).toFixed(1)}s;
            a 150-character reply waits {Math.min(form.typing.maxSeconds, Math.max(form.typing.minSeconds, 150 / (form.typing.charsPerSecond || 1))).toFixed(1)}s.
          </p>
        )}
      </div>

      <div className="actions">
        <button className="btn" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : dirty ? 'Save AI settings' : 'Saved'}</button>
      </div>

      <hr style={{ margin: '22px 0' }} />

      <h3 style={{ marginTop: 0 }}>Try it</h3>
      <p className="muted" style={{ marginTop: -6 }}>
        Uses the instructions and models above even before you save, with a sample customer (Rahul, born
        14 Aug 1995, 6:30 am, Jaipur). Test messages count against the same Gemini daily limits.
      </p>
      <div className="field" style={{ maxWidth: 420 }}>
        <label>Test with</label>
        <select value={testModel} onChange={(e) => setTestModel(e.target.value)}>
          <option value="">The whole list, in order (what customers get)</option>
          {models.map((m) => <option key={m} value={m}>Only {m}</option>)}
        </select>
      </div>
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
            {m.ms != null && (
              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                AI took {(m.ms / 1000).toFixed(1)}s{m.meta ? ` · ${m.meta}` : ''}
              </div>
            )}
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
