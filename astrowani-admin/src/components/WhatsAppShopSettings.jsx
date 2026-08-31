// The switches that turn the WhatsApp shop assistant on, and decide who answers
// when it hands a customer over.
//
// Two independent things live here on purpose:
//   - the handoff: does the app send shoppers to WhatsApp at all
//   - the duty roster: which astrologers pick up an escalated conversation
//
// The second matters more than it looks. The assistant tells a customer "I'm
// connecting you to an astrologer" — if nobody is on the roster, that promise is
// made to an empty room. The card says so out loud rather than letting it be
// discovered by a customer.
import { useEffect, useState } from 'react';
import client from '../api/client';

export default function WhatsAppShopSettings() {
  const [enabled, setEnabled] = useState(false);
  const [number, setNumber] = useState('');
  const [greeting, setGreeting] = useState('');
  const [cta, setCta] = useState('');
  const [pool, setPool] = useState([]);
  const [astrologers, setAstrologers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [s, a] = await Promise.all([
          client.get('/api/admin/settings'),
          client.get('/api/admin/astrologers'),
        ]);
        const map = {};
        (s.data?.settings || s.data || []).forEach?.((r) => { map[r.key] = r.value; });
        // The endpoint has returned both shapes over time; tolerate either.
        if (!Object.keys(map).length && s.data && typeof s.data === 'object') {
          Object.assign(map, s.data);
        }
        setEnabled(map.whatsapp_shop_enabled === 'true');
        setNumber(map.whatsapp_shop_number || '');
        setGreeting(map.whatsapp_shop_greeting || '');
        setCta(map.whatsapp_shop_cta || '');
        try {
          const ids = map.whatsapp_support_astrologer_ids
            ? JSON.parse(map.whatsapp_support_astrologer_ids)
            : [];
          setPool(Array.isArray(ids) ? ids : []);
        } catch (_) { setPool([]); }

        const rows = a.data?.astrologers || a.data || [];
        setAstrologers(
          (Array.isArray(rows) ? rows : []).filter(
            (x) => x.approval_status === 'approved' && !x.is_suspended,
          ),
        );
      } catch (e) {
        setMsg(e.response?.data?.message || e.message);
      }
    })();
  }, []);

  const digits = String(number).replace(/[^\d]/g, '');
  const numberLooksUsable = digits.length >= 10;
  const togglePool = (id) =>
    setPool((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const save = async () => {
    setBusy(true); setMsg('');
    try {
      await Promise.all([
        client.patch('/api/admin/settings', { key: 'whatsapp_shop_number', value: digits }),
        client.patch('/api/admin/settings', { key: 'whatsapp_shop_greeting', value: greeting }),
        client.patch('/api/admin/settings', { key: 'whatsapp_shop_cta', value: cta }),
        client.patch('/api/admin/settings', {
          key: 'whatsapp_support_astrologer_ids', value: JSON.stringify(pool),
        }),
        // Saved last, and forced off without a usable number — turning the
        // handoff on while the number is blank would send every shopper nowhere.
        client.patch('/api/admin/settings', {
          key: 'whatsapp_shop_enabled',
          value: String(enabled && numberLooksUsable),
        }),
      ]);
      if (enabled && !numberLooksUsable) {
        setEnabled(false);
        setMsg('Saved, but left OFF — add the WhatsApp number first.');
      } else {
        setMsg('Saved.');
      }
    } catch (e) {
      setMsg(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (a) =>
    (a.name || [a.first_name, a.last_name].filter(Boolean).join(' ') || 'Astrologer').trim();

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <h3 style={{ marginTop: 0 }}>WhatsApp shop assistant</h3>
      <p className="muted" style={{ marginTop: -4 }}>
        When this is on, tapping a product in the app opens WhatsApp about that item instead of
        adding it to the cart. An assistant answers from the live catalogue and hands over to an
        astrologer when the customer needs advice.
      </p>

      {enabled && !pool.length && (
        <div className="card" style={{ borderLeft: '4px solid #c0392b', marginBottom: 12 }}>
          <strong>Nobody is on WhatsApp support duty.</strong>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            The assistant tells customers it is connecting them to an astrologer. With an empty
            roster below, those conversations will sit unread. Pick at least one person.
          </p>
        </div>
      )}

      <div className="field checkbox-row">
        <label>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {' '}Send shoppers to WhatsApp instead of the in-app cart
        </label>
      </div>

      <div className="two-col">
        <div className="field">
          <label>WhatsApp business number</label>
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="919876543210"
          />
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            Country code first, digits only. This is the number customers message.
          </div>
        </div>
        <div className="field">
          <label>Button label in the shop</label>
          <input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Enquire on WhatsApp" />
        </div>
      </div>

      <div className="field">
        <label>The customer's first message</label>
        <input
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
          placeholder="Hi! I'd like to know more about {item}."
        />
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          <code>{'{item}'}</code> is replaced with the product name. Keep it short — the customer
          sends this, so it should sound like them, not like us.
        </div>
      </div>

      <div className="field">
        <label>Who answers when the assistant hands over</label>
        <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
          Each escalation goes to whoever has the fewest open conversations. If nobody replies
          within 10 minutes it moves to the next person automatically. They read and reply in the
          vendor app under “WhatsApp Customers”.
        </div>
        {astrologers.length === 0 && <div className="muted">No approved astrologers found.</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {astrologers.map((a) => (
            <label key={a.id} className="badge gray" style={{ cursor: 'pointer', padding: '6px 10px' }}>
              <input
                type="checkbox"
                checked={pool.includes(a.id)}
                onChange={() => togglePool(a.id)}
                style={{ marginRight: 6 }}
              />
              {nameOf(a)}
            </label>
          ))}
        </div>
      </div>

      <button className="btn" onClick={save} disabled={busy}>
        {busy ? 'Saving…' : 'Save WhatsApp settings'}
      </button>
      {msg && <span className="muted" style={{ marginLeft: 12 }}>{msg}</span>}
    </div>
  );
}
