import { useEffect, useState } from 'react';
import client from '../api/client';

// The customer app's "guide avatar" hint — an animated mascot with a speech
// bubble nudging new users toward the next action, shown on Login (pointing
// at Register) and as a static label above the photo-upload on Register.
// Stored as one JSON string under the app_settings key `guide_avatar_config`
// (same key/value table already used for the free-bot-chat persona and
// banner interval) — read by the customer app via GET /api/guide-avatar/config.
// Only enabled/text is editable here — position/animation stay hardcoded per
// screen, since raw pixel offsets aren't sensible to expose to an admin form.
const DEFAULTS = {
  login: {
    enabled: true,
    textEn: 'First time here? Tap Register to sign up!',
    textHi: 'पहली बार यहाँ आए हैं? पंजीकरण करने के लिए टैप करें!',
  },
  register: {
    enabled: true,
    textEn: 'Fill the Information for Astrologer',
    textHi: 'ज्योतिषी के लिए जानकारी भरें',
  },
};

export default function GuideAvatar() {
  const [form, setForm] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/api/admin/settings');
      const raw = data.settings?.guide_avatar_config;
      if (raw) {
        const parsed = JSON.parse(raw);
        setForm({
          login: { ...DEFAULTS.login, ...parsed.login },
          register: { ...DEFAULTS.register, ...parsed.register },
        });
      }
    } catch (e) {
      console.error('load guide_avatar_config failed:', e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const set = (screen, k, v) => setForm((p) => ({ ...p, [screen]: { ...p[screen], [k]: v } }));

  const save = async () => {
    setBusy(true);
    try {
      await client.patch('/api/admin/settings', {
        key: 'guide_avatar_config',
        value: JSON.stringify(form),
      });
      alert('Saved. Both apps pick this up the next time the Login/Register screen loads.');
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <div>
      <h1 className="page-title">Guide Avatar</h1>
      <p className="muted" style={{ marginTop: -8, marginBottom: 18 }}>
        The animated mascot hint shown to new customers on Login and Register. Toggle each
        screen on/off and edit its message in English and Hindi.
      </p>

      <div className="card" style={{ maxWidth: 520, marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>Login Screen</h3>
        <div className="field checkbox-row">
          <input
            id="ga-login-enabled" type="checkbox" checked={form.login.enabled}
            onChange={(e) => set('login', 'enabled', e.target.checked)} />
          <label htmlFor="ga-login-enabled" style={{ margin: 0 }}>Show on Login screen</label>
        </div>
        <div className="field"><label>Message (English)</label>
          <input type="text" value={form.login.textEn} onChange={(e) => set('login', 'textEn', e.target.value)} /></div>
        <div className="field"><label>Message (Hindi)</label>
          <input type="text" value={form.login.textHi} onChange={(e) => set('login', 'textHi', e.target.value)} placeholder="हिंदी में संदेश" /></div>
      </div>

      <div className="card" style={{ maxWidth: 520, marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>Register Screen</h3>
        <div className="field checkbox-row">
          <input
            id="ga-register-enabled" type="checkbox" checked={form.register.enabled}
            onChange={(e) => set('register', 'enabled', e.target.checked)} />
          <label htmlFor="ga-register-enabled" style={{ margin: 0 }}>Show on Register screen</label>
        </div>
        <div className="field"><label>Message (English)</label>
          <input type="text" value={form.register.textEn} onChange={(e) => set('register', 'textEn', e.target.value)} /></div>
        <div className="field"><label>Message (Hindi)</label>
          <input type="text" value={form.register.textHi} onChange={(e) => set('register', 'textHi', e.target.value)} placeholder="हिंदी में संदेश" /></div>
      </div>

      <div className="actions">
        <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}
