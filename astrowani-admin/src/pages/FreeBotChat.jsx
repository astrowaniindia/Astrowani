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
      <h1 className="page-title">Free Bot Chat</h1>
      <p className="muted" style={{ marginTop: -8, marginBottom: 18 }}>
        The free 5-minute welcome chat shown once to brand-new customers on Home. This is a
        scripted demo chat (no real astrologer), not a live conversation — this page only
        controls what card/persona is shown, not the reply script.
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
    </div>
  );
}
