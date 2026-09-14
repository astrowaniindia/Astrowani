import { useEffect, useState } from 'react';
import client from '../api/client';

// The customer app's "guide avatar" — the Astrowani mascot.
//
// Stored as one JSON string under the app_settings key `guide_avatar_config`
// (read by the customer app via GET /api/guide-avatar/config):
//   login / register — the hint on the Login and Register screens
//   tips             — the guide mascot's tips elsewhere in the app, by tip id
//                      (customer app: src/utils/mascotTips.js)
//
// Blank text means "use the app's own built-in wording" (Hinglish in English mode,
// Devanagari in Hindi), so an admin only types something to change it. Only
// enabled/text is editable here — when a tip appears is decided in the app.
const DEFAULTS = {
  login: { enabled: true, textEn: '', textHi: '' },
  register: { enabled: true, textEn: '', textHi: '' },
  tips: {},
};

// Keep in step with TIP_IDS in the customer app's src/utils/mascotTips.js and
// GUIDE_TIP_IDS in the backend.
const TIPS = [
  {
    id: 'home_free_chat',
    title: 'Home — free chat not used yet',
    when: 'Once per customer, only if they have not used the free 5-minute chat, and only after the free call popup has been closed or booked. Button starts the free chat.',
    placeholder: 'Pehli baar aaye hain? Shuruaat 5 minute ki free chat se kariye, bilkul muft!',
  },
  {
    id: 'low_balance',
    title: 'Not enough balance',
    when: 'Every time a chat/call/video is blocked for low balance. Recharge opens the Wallet with a top-up already filled in. You can use {{amount}}, {{balance}} and {{shortfall}}.',
    placeholder: 'Baat shuru karne ke liye wallet mein kam se kam ₹{{amount}} chahiye, abhi ₹{{balance}} hai. Bas ₹{{shortfall}} ka recharge kariye aur turant baat shuru!',
  },
  {
    id: 'waiting_astrologer',
    title: 'Waiting for the astrologer to answer',
    when: 'Inside the "Request sent" popup. Earlier messages are built in; this is the one shown after 25 seconds, with a "see other astrologers" button.',
    placeholder: 'Lagta hai jyotishi ji abhi vyast hain. Chahein to doosre online jyotishi ji se turant baat kar sakte hain.',
  },
  {
    id: 'recharge_help',
    title: 'Wallet / recharge screen',
    when: 'On the Wallet screen until the customer closes it or completes a recharge.',
    placeholder: 'UPI, card ya net banking se paise turant wallet mein aa jayenge, aur puri tarah safe hain.',
  },
];

const tipDefaults = () => ({ enabled: true, textEn: '', textHi: '' });

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
          tips: parsed.tips && typeof parsed.tips === 'object' ? parsed.tips : {},
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
  const tip = (id) => ({ ...tipDefaults(), ...(form.tips?.[id] || {}) });
  const setTip = (id, k, v) =>
    setForm((p) => ({ ...p, tips: { ...(p.tips || {}), [id]: { ...tip(id), [k]: v } } }));

  const save = async () => {
    setBusy(true);
    try {
      await client.patch('/api/admin/settings', {
        key: 'guide_avatar_config',
        value: JSON.stringify(form),
      });
      alert('Saved. The app picks this up the next time it is opened.');
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <div>
      <h1 className="page-title">Guide Avatar</h1>
      <p className="muted" style={{ marginTop: -8, marginBottom: 18 }}>
        The Astrowani mascot that guides customers. Switch each message on or off and change its
        wording in English and Hindi. <b>Leave a message blank to use the app's own wording.</b>
      </p>

      <h3 style={{ margin: '4px 0 10px' }}>Login & Register</h3>
      <div className="card" style={{ maxWidth: 620, marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>Login Screen</h3>
        <div className="field checkbox-row">
          <input
            id="ga-login-enabled" type="checkbox" checked={form.login.enabled}
            onChange={(e) => set('login', 'enabled', e.target.checked)} />
          <label htmlFor="ga-login-enabled" style={{ margin: 0 }}>Show on Login screen</label>
        </div>
        <div className="field"><label>Message (English / Hinglish)</label>
          <input type="text" value={form.login.textEn} onChange={(e) => set('login', 'textEn', e.target.value)} placeholder="Blank = app's own wording" /></div>
        <div className="field"><label>Message (Hindi)</label>
          <input type="text" value={form.login.textHi} onChange={(e) => set('login', 'textHi', e.target.value)} placeholder="खाली = ऐप का अपना संदेश" /></div>
      </div>

      <div className="card" style={{ maxWidth: 620, marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>Register Screen</h3>
        <div className="field checkbox-row">
          <input
            id="ga-register-enabled" type="checkbox" checked={form.register.enabled}
            onChange={(e) => set('register', 'enabled', e.target.checked)} />
          <label htmlFor="ga-register-enabled" style={{ margin: 0 }}>Show on Register screen</label>
        </div>
        <div className="field"><label>Message (English / Hinglish)</label>
          <input type="text" value={form.register.textEn} onChange={(e) => set('register', 'textEn', e.target.value)} placeholder="Blank = app's own wording" /></div>
        <div className="field"><label>Message (Hindi)</label>
          <input type="text" value={form.register.textHi} onChange={(e) => set('register', 'textHi', e.target.value)} placeholder="खाली = ऐप का अपना संदेश" /></div>
      </div>

      <h3 style={{ margin: '22px 0 4px' }}>Guide mascot tips</h3>
      <p className="muted" style={{ marginTop: 0, marginBottom: 12, maxWidth: 620 }}>
        Short tips at the moments customers usually get stuck. Customers can close any tip, and
        can turn the Home and Wallet tips off for themselves.
      </p>
      {TIPS.map((d) => {
        const v = tip(d.id);
        return (
          <div key={d.id} className="card" style={{ maxWidth: 620, marginBottom: 14 }}>
            <div className="row-between" style={{ gap: 10 }}>
              <h3 style={{ margin: 0 }}>{d.title}</h3>
              <span className={`badge ${v.enabled ? 'green' : 'gray'}`}>{v.enabled ? 'On' : 'Off'}</span>
            </div>
            <p className="muted" style={{ margin: '6px 0 10px', fontSize: 13 }}>{d.when}</p>
            <div className="field checkbox-row">
              <input
                id={`tip-${d.id}`} type="checkbox" checked={v.enabled}
                onChange={(e) => setTip(d.id, 'enabled', e.target.checked)} />
              <label htmlFor={`tip-${d.id}`} style={{ margin: 0 }}>Show this tip</label>
            </div>
            <div className="field"><label>Message (English / Hinglish)</label>
              <textarea rows={2} value={v.textEn} onChange={(e) => setTip(d.id, 'textEn', e.target.value)} placeholder={d.placeholder} /></div>
            <div className="field"><label>Message (Hindi)</label>
              <textarea rows={2} value={v.textHi} onChange={(e) => setTip(d.id, 'textHi', e.target.value)} placeholder="खाली = ऐप का अपना संदेश" /></div>
          </div>
        );
      })}

      <div className="actions">
        <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}
