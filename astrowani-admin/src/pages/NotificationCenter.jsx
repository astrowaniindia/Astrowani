import { useCallback, useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import ImageField from '../components/ImageField';
import { ChipGroup } from '../components/filters';

// The notification panel.
//
// It replaces nothing: /notifications (Quick Push) still works and is what every
// send before 2026-11-07 went through. This page is for everything that one could
// not do — scheduling, images, deep links, Hindi copy, real segmentation, A/B
// variants, recurring automations, and knowing afterwards whether anybody saw it.
//
// THE NUMBER THIS PAGE EXISTS TO PUT IN FRONT OF SOMEBODY: on 2026-11-07 a
// broadcast to "All Customers" reached 289 phones out of 4,857. The old page
// showed that honestly and nothing explained it, so every send read as "4,849
// recipients". The Reach tab is the first place the difference is stated, and the
// Compose preview states it again for the specific audience being written to —
// before the Send button is pressed, not after.

const TABS = ['Compose', 'Campaigns', 'Automations', 'Templates', 'Reach & limits'];

const CATEGORIES = [
  { value: 'promotional', label: 'Promotional', hint: 'Offers and marketing. Governed by quiet hours, the daily cap and opt-outs.' },
  { value: 'engagement', label: 'Engagement', hint: 'Horoscopes, win-backs, reminders. Governed, but on a separate allowance.' },
  { value: 'transactional', label: 'Transactional', hint: 'Order and session updates. NEVER held back — no quiet hours, no cap, no opt-out.' },
];

// `key`, not `value`: that is what the shared ChipGroup reads.
const AUDIENCES = [
  { key: 'all_customers', label: 'Customers' },
  { key: 'all_astrologers', label: 'Astrologers' },
  { key: 'customer', label: 'Specific customers' },
  { key: 'astrologer', label: 'Specific astrologers' },
];

// Every filter the audience engine understands, as fields. Grouped the way an
// admin thinks about people rather than the way the columns happen to sit.
const FILTER_GROUPS = [
  {
    title: 'Reachability',
    fields: [
      { key: 'hasDevice', type: 'bool', label: 'Only people a push can actually reach' },
      { key: 'platform', type: 'select', label: 'Platform', options: [['', 'Any'], ['android', 'Android'], ['ios', 'iPhone']] },
      { key: 'locale', type: 'select', label: 'App language', options: [['', 'Any'], ['en', 'English'], ['hi', 'Hindi']] },
      { key: 'appVersion', type: 'text', label: 'App version is exactly' },
    ],
  },
  {
    title: 'Money',
    fields: [
      { key: 'minWalletBalance', type: 'num', label: 'Wallet at least ₹' },
      { key: 'maxWalletBalance', type: 'num', label: 'Wallet at most ₹' },
      { key: 'minRecharges', type: 'num', label: 'Paid recharges at least' },
      { key: 'maxRecharges', type: 'num', label: 'Paid recharges at most' },
    ],
  },
  {
    title: 'Behaviour',
    fields: [
      { key: 'minConsultations', type: 'num', label: 'Consultations at least' },
      { key: 'maxConsultations', type: 'num', label: 'Consultations at most' },
      { key: 'minDaysSinceSession', type: 'num', label: 'Quiet for at least (days)' },
      { key: 'maxDaysSinceSession', type: 'num', label: 'Quiet for at most (days)' },
      { key: 'minDaysSinceSignup', type: 'num', label: 'Signed up at least (days) ago' },
      { key: 'maxDaysSinceSignup', type: 'num', label: 'Signed up at most (days) ago' },
      { key: 'freeCallUnused', type: 'bool', label: 'Holds an unused free call' },
    ],
  },
  {
    title: 'Who they are',
    fields: [
      { key: 'gender', type: 'text', label: 'Gender is' },
      { key: 'state', type: 'text', label: 'State is' },
      { key: 'minAge', type: 'num', label: 'Age at least' },
      { key: 'maxAge', type: 'num', label: 'Age at most' },
      { key: 'birthdayToday', type: 'bool', label: 'Birthday is today' },
    ],
  },
];

// The destinations the customer app can route a notification tap to. A free-text
// box here would produce taps that land nowhere, which is what the deep link is
// meant to fix — so it is a list, and it is the list the app actually handles.
// MUST stay in step with DEEP_LINK_SCREENS in the customer app's
// src/utils/notificationDevice.js, which is an ALLOWLIST: a name the navigator does
// not know produces a notification that opens the app and then sits there, which is
// the exact failure a deep link exists to fix.
const DEEP_LINKS = [
  ['', 'Notification list (default)'],
  ['Home', 'Home'],
  ['Wallet', 'Wallet / recharge'],
  ['Chat', 'Chat with astrologers'],
  ['Call', 'Talk to astrologers'],
  ['Video', 'Video consultations'],
  ['InstantAstrologers', 'Free call — pick an astrologer'],
  ['Live', 'Live streams'],
  ['Horoscope', 'Horoscope'],
  ['Store', 'Wani Shop'],
  ['Remedies', 'Remedies'],
  ['MyOrders', 'My orders'],
  ['CoinStore', 'Coin store'],
  ['FreeService', 'Free services'],
  ['GamificationHub', 'Rewards hub'],
  ['ReferFriend', 'Refer and earn'],
  ['BlogList', 'Articles'],
  ['FavoriteScreen', 'Favourites'],
  ['VoiceNotes', 'Voice notes'],
  ['SupportScreen', 'Help and support'],
  ['Settings', 'Settings'],
];

const SUPPRESSION_LABELS = {
  no_device: 'No reachable device',
  opted_out: 'Turned this category off',
  quiet_hours: 'Quiet hours right now',
  frequency_cap: 'Already had their limit today',
  cooldown: 'Inside this automation’s cooldown',
  token_dead: 'App removed',
  expired: 'Campaign expired',
  unknown: 'Unknown',
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : '—');
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN'));

function Stat({ label, value, hint, tone }) {
  return (
    <div style={{
      flex: '1 1 150px', minWidth: 140, padding: '12px 14px', borderRadius: 10,
      background: tone === 'good' ? '#eef9f1' : tone === 'bad' ? '#fdecea' : '#faf7f4',
      border: `1px solid ${tone === 'good' ? '#cde9d6' : tone === 'bad' ? '#f3c8c4' : '#eee3da'}`,
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 3 }}>{label}</div>
      {hint && <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

/** What the phone will actually show. Worth having: this is the first time an
 *  admin can see the image and the two-line truncation before sending. */
function PhonePreview({ title, body, imageUrl }) {
  return (
    <div style={{
      width: 300, borderRadius: 14, padding: 12, background: '#111',
      color: '#fff', fontFamily: 'system-ui, sans-serif', boxShadow: '0 4px 14px rgba(0,0,0,.18)',
    }}>
      <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
        <div style={{ width: 22, height: 22, borderRadius: 5, background: '#592a19', flex: '0 0 auto' }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 10.5, opacity: 0.6, marginBottom: 2 }}>ASTROWANI · now</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title || 'Title'}
          </div>
          <div style={{
            fontSize: 12.5, opacity: 0.85, marginTop: 2,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {body || 'Message body'}
          </div>
        </div>
      </div>
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          style={{ width: '100%', marginTop: 9, borderRadius: 8, display: 'block', maxHeight: 150, objectFit: 'cover' }}
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      )}
    </div>
  );
}

function CopyFields({ value, onChange, showImage = true }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <>
      <label className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>Title (English)</label>
      <input value={value.title || ''} onChange={set('title')} maxLength={65} style={{ width: '100%', marginBottom: 4 }} />
      <div className="muted" style={{ fontSize: 11, marginBottom: 10 }}>
        {(value.title || '').length}/65 — Android truncates a title past about 45 characters.
        {' '}<code>{'{name}'}</code> becomes their first name.
      </div>

      <label className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>Message (English)</label>
      <textarea value={value.body || ''} onChange={set('body')} rows={3} maxLength={240} style={{ width: '100%', marginBottom: 4 }} />
      <div className="muted" style={{ fontSize: 11, marginBottom: 12 }}>{(value.body || '').length}/240</div>

      <label className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>Title (Hindi) — optional</label>
      <input value={value.title_hi || ''} onChange={set('title_hi')} maxLength={65} style={{ width: '100%', marginBottom: 10 }} />
      <label className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>Message (Hindi) — optional</label>
      <textarea value={value.body_hi || ''} onChange={set('body_hi')} rows={3} maxLength={240} style={{ width: '100%', marginBottom: 4 }} />
      <div className="muted" style={{ fontSize: 11, marginBottom: 12 }}>
        Anyone whose app is in Hindi gets this instead. Leave it empty and they get the English copy —
        never nothing.
      </div>

      {showImage && (
        <div style={{ marginBottom: 12 }}>
          <ImageField
            value={value.image_url || ''}
            onChange={(url) => onChange({ ...value, image_url: url })}
            label="Picture — optional"
            recommendedWidth={1024}
            recommendedHeight={512}
          />
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            Under 1 MB (Firebase drops anything larger). Shows on Android and in the in-app list today;
            iPhones need the next store build before they can render it.
          </div>
        </div>
      )}

      <label className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>Tapping it opens</label>
      <select value={value.deep_link || ''} onChange={set('deep_link')} style={{ width: '100%', marginBottom: 12 }}>
        {DEEP_LINKS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────── COMPOSE ──

function Compose({ templates, onSent }) {
  const [category, setCategory] = useState('promotional');
  const [audience, setAudience] = useState('all_customers');
  const [filters, setFilters] = useState({ hasDevice: true });
  const [copy, setCopy] = useState({ title: '', body: '', title_hi: '', body_hi: '', image_url: '', deep_link: '' });
  const [segments, setSegments] = useState([]);
  const [allSegments, setAllSegments] = useState([]);
  const [respectQuiet, setRespectQuiet] = useState(true);
  const [respectCap, setRespectCap] = useState(true);
  const [when, setWhen] = useState('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [variants, setVariants] = useState([]);
  const [people, setPeople] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [personFilter, setPersonFilter] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const isPersonal = audience === 'customer' || audience === 'astrologer';
  const isAstrologer = audience === 'astrologer' || audience === 'all_astrologers';

  useEffect(() => {
    client.get('/api/admin/audience/rules')
      .then(({ data }) => setAllSegments(data.rules?.segments || data.defaultSegments || []))
      .catch(() => setAllSegments([]));
  }, []);

  useEffect(() => {
    if (!isPersonal) return;
    const url = audience === 'astrologer' ? '/api/admin/astrologers' : '/api/admin/customers';
    client.get(url).then(({ data }) => setPeople(data.data || [])).catch(() => setPeople([]));
    setSelectedIds([]);
  }, [audience, isPersonal]);

  // Debounced, because the filter fields are typed into and each preview is a real
  // audience resolution against the live database.
  useEffect(() => {
    const t = setTimeout(() => {
      setPreviewing(true);
      client.post('/api/admin/notifications/audience-preview', {
        audience,
        targetIds: isPersonal ? selectedIds : undefined,
        filters: isPersonal ? {} : filters,
        segments: audience === 'all_customers' && segments.length ? segments : undefined,
        category,
        respectQuietHours: respectQuiet,
        respectFrequencyCap: respectCap,
      })
        .then(({ data }) => setPreview(data))
        .catch(() => setPreview(null))
        .finally(() => setPreviewing(false));
    }, 450);
    return () => clearTimeout(t);
  }, [audience, filters, segments, category, respectQuiet, respectCap, isPersonal, selectedIds]);

  const setFilter = (key, raw, type) => {
    setFilters((cur) => {
      const next = { ...cur };
      if (type === 'bool') {
        if (raw) next[key] = true; else delete next[key];
      } else if (raw === '' || raw == null) {
        delete next[key];
      } else {
        next[key] = type === 'num' ? Number(raw) : raw;
      }
      return next;
    });
  };

  const filteredPeople = useMemo(() => {
    const q = personFilter.trim().toLowerCase();
    const label = (p) => `${isAstrologer ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : (p.name || '')} ${p.phone_number || p.mobile || ''}`.toLowerCase();
    return q ? people.filter((p) => label(p).includes(q)) : people.slice(0, 400);
  }, [people, personFilter, isAstrologer]);

  const submit = async (mode) => {
    if (!copy.title?.trim() || !copy.body?.trim()) { setError('A title and a message are both required.'); return; }
    if (isPersonal && !selectedIds.length) { setError('Pick at least one person.'); return; }
    if (mode === 'schedule' && !scheduledAt) { setError('Pick a date and time to schedule it for.'); return; }
    setError(''); setResult(null); setBusy(true);
    try {
      const { data } = await client.post('/api/admin/notifications/campaigns', {
        mode,
        name: copy.title.slice(0, 60),
        category,
        audience,
        target_ids: isPersonal ? selectedIds : undefined,
        filters: isPersonal ? {} : filters,
        segments: audience === 'all_customers' && segments.length ? segments : undefined,
        ...copy,
        variants: variants.length ? variants : undefined,
        scheduled_at: mode === 'schedule' ? new Date(scheduledAt).toISOString() : undefined,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        respect_quiet_hours: respectQuiet,
        respect_frequency_cap: respectCap,
      });
      setResult({ mode, ...data });
      if (mode !== 'draft') { setCopy({ title: '', body: '', title_hi: '', body_hi: '', image_url: '', deep_link: '' }); setVariants([]); }
      onSent?.();
    } catch (e) {
      setError(e.response?.data?.message || 'Could not save the campaign.');
    } finally { setBusy(false); }
  };

  const activeFilterCount = Object.keys(filters).filter((k) => k !== 'hasDevice').length;

  return (
    <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 520px', minWidth: 400 }}>
        <div className="card" style={{ padding: 18, marginBottom: 16 }}>
          <ChipGroup
            label="What kind of notification is this?"
            options={CATEGORIES.map((c) => ({ key: c.value, label: c.label, title: c.hint }))}
            value={category}
            onChange={setCategory}
          />
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            {CATEGORIES.find((c) => c.value === category)?.hint}
          </div>
        </div>

        <div className="card" style={{ padding: 18, marginBottom: 16 }}>
          <ChipGroup label="Send to" options={AUDIENCES} value={audience} onChange={setAudience} />

          {audience === 'all_customers' && !!allSegments.length && (
            <div style={{ marginTop: 14 }}>
              <label className="muted" style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                Limit to acquisition groups (optional)
              </label>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {allSegments.map((s) => (
                  <label key={s.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={segments.includes(s.id)}
                      onChange={() => setSegments((cur) => (cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id]))}
                    />
                    {s.label || s.id}
                  </label>
                ))}
              </div>
            </div>
          )}

          {isPersonal && (
            <div style={{ marginTop: 14 }}>
              <input
                value={personFilter}
                onChange={(e) => setPersonFilter(e.target.value)}
                placeholder="Search by name or phone…"
                style={{ width: '100%', marginBottom: 8 }}
              />
              <div style={{ border: '1px solid #e6ded6', borderRadius: 8, maxHeight: 190, overflowY: 'auto' }}>
                {filteredPeople.map((p) => {
                  const checked = selectedIds.includes(p.id);
                  const name = isAstrologer ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Astrologer' : (p.name || 'Customer');
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedIds((cur) => (checked ? cur.filter((x) => x !== p.id) : [...cur, p.id]))}
                      style={{ display: 'flex', gap: 8, padding: '7px 11px', cursor: 'pointer', background: checked ? '#fdecea' : 'transparent', borderBottom: '1px solid #f4efea' }}
                    >
                      <input type="checkbox" checked={checked} readOnly style={{ pointerEvents: 'none' }} />
                      <span style={{ fontSize: 13 }}>{name} · {p.phone_number || p.mobile || '—'}</span>
                    </div>
                  );
                })}
                {!filteredPeople.length && <div className="muted" style={{ padding: 11, fontSize: 13 }}>No matches</div>}
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 5 }}>
                {selectedIds.length} selected. Naming people by hand skips the filters below — that is deliberate.
              </div>
            </div>
          )}
        </div>

        {!isPersonal && (
          <div className="card" style={{ padding: 18, marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              Who exactly {activeFilterCount ? <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>· {activeFilterCount} filter(s) on</span> : null}
            </div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
              Leave a box empty to not filter on it. Everything here is checked against the live
              database the moment you type, and the count on the right is the count that gets sent to.
            </div>
            {FILTER_GROUPS.map((g) => (
              <div key={g.title} style={{ marginBottom: 14 }}>
                <div className="muted" style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 7 }}>{g.title}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {g.fields.map((f) => (
                    <div key={f.key} style={{ flex: f.type === 'bool' ? '1 1 100%' : '0 1 215px' }}>
                      {f.type === 'bool' ? (
                        <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 13 }}>
                          <input type="checkbox" checked={!!filters[f.key]} onChange={(e) => setFilter(f.key, e.target.checked, 'bool')} />
                          {f.label}
                        </label>
                      ) : (
                        <>
                          <label className="muted" style={{ fontSize: 11.5, display: 'block', marginBottom: 3 }}>{f.label}</label>
                          {f.type === 'select' ? (
                            <select value={filters[f.key] ?? ''} onChange={(e) => setFilter(f.key, e.target.value, 'select')} style={{ width: '100%' }}>
                              {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                          ) : (
                            <input
                              type={f.type === 'num' ? 'number' : 'text'}
                              value={filters[f.key] ?? ''}
                              onChange={(e) => setFilter(f.key, e.target.value, f.type)}
                              style={{ width: '100%' }}
                            />
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="card" style={{ padding: 18, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>What it says</div>
          {!!templates.length && (
            <div style={{ marginBottom: 12 }}>
              <label className="muted" style={{ fontSize: 12.5, display: 'block', marginBottom: 4 }}>Start from a saved template</label>
              <select
                defaultValue=""
                onChange={(e) => {
                  const t = templates.find((x) => x.id === e.target.value);
                  if (t) {
                    setCopy({ title: t.title, body: t.body, title_hi: t.title_hi || '', body_hi: t.body_hi || '', image_url: t.image_url || '', deep_link: t.deep_link || '' });
                    setCategory(t.category || 'promotional');
                  }
                }}
                style={{ width: '100%' }}
              >
                <option value="">—</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <CopyFields value={copy} onChange={setCopy} />
        </div>

        <div className="card" style={{ padding: 18, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>
            A/B test <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>· optional</span>
          </div>
          {!variants.length && (
            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              Add a second version and the audience is split between them. Which arm a person lands in
              is decided from their own id, so a resend puts them in the same arm — otherwise the result
              means nothing.
            </div>
          )}
          {variants.map((v, i) => (
            <div key={i} style={{ border: '1px solid #e6ded6', borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong style={{ fontSize: 13 }}>Variant {v.key}</strong>
                <button className="btn secondary" type="button" onClick={() => setVariants((c) => c.filter((_, j) => j !== i))}>Remove</button>
              </div>
              <CopyFields
                value={v}
                showImage={false}
                onChange={(next) => setVariants((c) => c.map((x, j) => (j === i ? { ...x, ...next } : x)))}
              />
            </div>
          ))}
          <button
            className="btn secondary"
            type="button"
            onClick={() => setVariants((c) => [...c, {
              key: String.fromCharCode(66 + c.length), weight: 1,
              title: copy.title, body: copy.body, title_hi: copy.title_hi, body_hi: copy.body_hi,
            }])}
          >
            Add a variant
          </button>
        </div>

        <div className="card" style={{ padding: 18, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>When, and the guard rails</div>

          <ChipGroup
            label="Send"
            options={[
              { key: 'now', label: 'Now' },
              { key: 'schedule', label: 'At a time' },
              { key: 'draft', label: 'Save as draft' },
            ]}
            value={when}
            onChange={setWhen}
          />

          {when === 'schedule' && (
            <div style={{ marginTop: 12 }}>
              <label className="muted" style={{ fontSize: 12.5, display: 'block', marginBottom: 4 }}>Send at (your local time)</label>
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              <div className="muted" style={{ fontSize: 11.5, marginTop: 5 }}>
                Checked once a minute. India’s best windows are 8–9am, 12–1pm and 8–10pm IST.
              </div>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <label className="muted" style={{ fontSize: 12.5, display: 'block', marginBottom: 4 }}>
              Expires at (optional)
            </label>
            <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            <div className="muted" style={{ fontSize: 11.5, marginTop: 5 }}>
              Past this, drop it rather than deliver it. A “₹75 = ₹101 today” push arriving tomorrow
              is worse than no push — and it disappears from the in-app list too.
            </div>
          </div>

          <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
              <input type="checkbox" checked={respectQuiet} onChange={(e) => setRespectQuiet(e.target.checked)} disabled={category === 'transactional'} />
              <span>Respect quiet hours{category === 'transactional' && <span className="muted"> — transactional ignores this either way</span>}</span>
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
              <input type="checkbox" checked={respectCap} onChange={(e) => setRespectCap(e.target.checked)} disabled={category === 'transactional'} />
              <span>Respect the daily cap per person</span>
            </label>
          </div>
        </div>

        {error && <p style={{ color: '#dc2626', marginBottom: 12 }}>{error}</p>}
        {result && (
          <div className="card" style={{ padding: 14, marginBottom: 14, background: '#eef9f1', border: '1px solid #cde9d6' }}>
            {result.mode === 'draft' && 'Saved as a draft. It is in the Campaigns tab.'}
            {result.mode === 'schedule' && `Scheduled. The worker will send it within a minute of ${new Date(result.campaign?.scheduled_at).toLocaleString()}.`}
            {result.mode === 'now' && (
              <>
                Sent. <strong>{fmt(result.stats?.sent)}</strong> reached
                {' '}· {fmt(result.stats?.suppressed)} held back · {fmt(result.stats?.failed)} failed
                {result.stats?.suppressionBreakdown && Object.keys(result.stats.suppressionBreakdown).length > 0 && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    {Object.entries(result.stats.suppressionBreakdown)
                      .map(([k, v]) => `${SUPPRESSION_LABELS[k] || k}: ${v}`).join(' · ')}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <button className="btn" disabled={busy} onClick={() => submit(when)}>
          {busy ? 'Working…' : when === 'now' ? `Send now to ${fmt(preview?.wouldReach ?? 0)} ${isAstrologer ? 'astrologers' : 'people'}` : when === 'schedule' ? 'Schedule it' : 'Save draft'}
        </button>
      </div>

      {/* ── the preview rail ── */}
      <div style={{ flex: '0 1 330px', minWidth: 300, position: 'sticky', top: 12 }}>
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>On the phone</div>
          <PhonePreview title={copy.title} body={copy.body} imageUrl={copy.image_url} />
          {(copy.title_hi || copy.body_hi) && (
            <div style={{ marginTop: 12 }}>
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>In Hindi</div>
              <PhonePreview title={copy.title_hi} body={copy.body_hi} imageUrl={copy.image_url} />
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>
            Who this reaches {previewing && <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>· checking…</span>}
          </div>
          {!preview && <div className="muted" style={{ fontSize: 13 }}>No preview yet.</div>}
          {preview && (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <Stat label="Would be reached" value={fmt(preview.wouldReach)} tone="good" />
                <Stat label="Matched the filters" value={fmt(preview.matched)} />
              </div>
              {preview.matched > 0 && preview.wouldReach / preview.matched < 0.5 && (
                <div style={{ fontSize: 12.5, padding: 10, borderRadius: 8, background: '#fdecea', border: '1px solid #f3c8c4', marginBottom: 12 }}>
                  Only <strong>{pct(preview.wouldReach, preview.matched)}</strong> of the people who match
                  can actually be reached. The rest are listed below — mostly people whose app has never
                  registered for notifications.
                </div>
              )}
              {!!preview.suppressed && (
                <div style={{ marginBottom: 12 }}>
                  <div className="muted" style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Held back</div>
                  {Object.entries(preview.breakdown || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0' }}>
                      <span>{SUPPRESSION_LABELS[k] || k}</span><strong>{fmt(v)}</strong>
                    </div>
                  ))}
                </div>
              )}
              <div className="muted" style={{ fontSize: 12 }}>
                <div>Android {fmt(preview.byPlatform?.android || 0)} · iPhone {fmt(preview.byPlatform?.ios || 0)} · unknown {fmt(preview.byPlatform?.unknown || 0)}</div>
                <div style={{ marginTop: 3 }}>
                  Hindi {fmt(preview.byLocale?.hi || 0)} · English {fmt(preview.byLocale?.en || 0)} · unknown {fmt(preview.byLocale?.unknown || 0)}
                </div>
                {!copy.title_hi && (preview.byLocale?.hi || 0) > 0 && (
                  <div style={{ marginTop: 6, color: '#92400e' }}>
                    {fmt(preview.byLocale.hi)} of these read the app in Hindi and there is no Hindi copy —
                    they will get the English.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────── CAMPAIGNS ──

function Campaigns({ reload }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    client.get('/api/admin/notifications/campaigns?limit=100')
      .then(({ data }) => setRows(data.data || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load, reload]);

  useEffect(() => {
    if (!open) { setDetail(null); return; }
    client.get(`/api/admin/notifications/campaigns/${open}`)
      .then(({ data }) => setDetail(data)).catch(() => setDetail(null));
  }, [open]);

  const act = async (id, path, body) => {
    try {
      await client.post(`/api/admin/notifications/campaigns/${id}/${path}`, body || {});
      load();
    } catch (e) { alert(e.response?.data?.message || 'Could not do that.'); }
  };

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>When</th><th>Campaign</th><th>Status</th><th>Matched</th><th>Reached</th>
            <th>Held back</th><th>Opened</th><th>Tapped</th><th />
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="empty">Loading…</td></tr>}
            {!loading && !rows.length && <tr><td colSpan={9} className="empty">Nothing yet.</td></tr>}
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="muted" style={{ fontSize: 12.5 }}>
                  {new Date(c.scheduled_at || c.created_at).toLocaleString()}
                  {c.automation_id && <div style={{ fontSize: 11 }}>automation</div>}
                </td>
                <td>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{c.title}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{c.category} · {c.audience}{c.image_url ? ' · image' : ''}{c.deep_link ? ` · → ${c.deep_link}` : ''}</div>
                </td>
                <td style={{ fontSize: 12.5 }}>
                  {c.status}
                  {c.error && <div style={{ color: '#dc2626', fontSize: 11 }}>{c.error}</div>}
                </td>
                <td className="muted">{fmt(c.recipient_count)}</td>
                <td><strong>{fmt(c.sent_count)}</strong></td>
                <td className="muted">{fmt(c.suppressed_count)}</td>
                <td className="muted">{fmt(c.opened_count)} <span style={{ fontSize: 11 }}>({pct(c.opened_count, c.sent_count)})</span></td>
                <td className="muted">{fmt(c.clicked_count)} <span style={{ fontSize: 11 }}>({pct(c.clicked_count, c.sent_count)})</span></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn secondary" onClick={() => setOpen(open === c.id ? null : c.id)}>Why</button>
                  {['draft', 'scheduled', 'paused'].includes(c.status) && (
                    <>
                      <button className="btn" style={{ marginLeft: 6 }} onClick={() => act(c.id, 'send')}>Send</button>
                      <button className="btn secondary" style={{ marginLeft: 6 }} onClick={() => act(c.id, 'cancel')}>Cancel</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="card" style={{ padding: 18, marginTop: 16 }}>
          {!detail && <div className="muted">Loading…</div>}
          {detail && (
            <>
              <h3 style={{ marginTop: 0 }}>{detail.campaign.title}</h3>
              <p className="muted" style={{ marginTop: -6 }}>{detail.campaign.body}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                <Stat label="Reached" value={fmt(detail.campaign.sent_count)} tone="good" />
                <Stat label="Delivered" value={fmt(detail.measured.delivered)} hint={pct(detail.measured.delivered, detail.campaign.sent_count)} />
                <Stat label="Opened" value={fmt(detail.measured.opened)} hint={pct(detail.measured.opened, detail.campaign.sent_count)} />
                <Stat label="Tapped through" value={fmt(detail.measured.clicked)} hint={pct(detail.measured.clicked, detail.campaign.sent_count)} />
                <Stat label="Held back" value={fmt(detail.campaign.suppressed_count)} tone={detail.campaign.suppressed_count ? 'bad' : undefined} />
              </div>

              {!!Object.keys(detail.breakdown).length && (
                <>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Why people were held back</div>
                  <div style={{ marginBottom: 16 }}>
                    {Object.entries(detail.breakdown).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 420, fontSize: 13, padding: '3px 0' }}>
                        <span>{SUPPRESSION_LABELS[k] || k}</span><strong>{fmt(v)}</strong>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {Object.keys(detail.byVariant).length > 1 && (
                <>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>A/B result</div>
                  <table style={{ maxWidth: 480 }}>
                    <thead><tr><th>Variant</th><th>Reached</th><th>Opened</th><th>Open rate</th></tr></thead>
                    <tbody>
                      {Object.entries(detail.byVariant).map(([k, v]) => (
                        <tr key={k}><td>{k}</td><td>{fmt(v.sent)}</td><td>{fmt(v.opened)}</td><td><strong>{pct(v.opened, v.sent)}</strong></td></tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {detail.campaign.sent_count > 0 && detail.measured.opened === 0 && (
                <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>
                  No opens recorded. Opens are reported by the app, so a build that predates the
                  tracking update cannot report one — this reads as zero until the apps are updated,
                  rather than meaning nobody looked.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────── AUTOMATIONS ──

function Automations() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});

  const load = useCallback(() => {
    setLoading(true);
    client.get('/api/admin/notifications/automations')
      .then(({ data }) => setRows(data.data || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const patch = async (id, body) => {
    try { await client.patch(`/api/admin/notifications/automations/${id}`, body); load(); }
    catch (e) { alert(e.response?.data?.message || 'Could not save.'); }
  };

  const toggle = async (a) => {
    if (!a.enabled) {
      const n = a.audienceNow;
      const ok = window.confirm(
        `Switch on “${a.name}”?\n\n`
        + (a.trigger_type === 'event'
          ? 'It fires for one person at a time, whenever the event happens.\n\n'
          : `Right now ${n == null ? 'an unknown number of' : n} people match it, and it will run `
            + `${a.schedule_days?.length ? `on ${a.schedule_days.map((d) => DAY_LABELS[d]).join(', ')}` : 'every day'} `
            + `at ${a.schedule_time || '10:00'} IST.\n\n`)
        + 'Switching it on does NOT send anything now — the first run is at the next scheduled time.',
      );
      if (!ok) return;
    }
    patch(a.id, { enabled: !a.enabled });
  };

  const runNow = async (a) => {
    if (!window.confirm(`Run “${a.name}” RIGHT NOW?\n\nThis sends to real customers immediately — up to ${a.max_per_run}.`)) return;
    try {
      const { data } = await client.post(`/api/admin/notifications/automations/${a.id}/run`, { confirm: true });
      alert(data.skipped
        ? `Nothing sent: ${data.skipped} (considered ${data.considered ?? '?'}, ${data.cooled ?? 0} inside cooldown)`
        : `Sent to ${data.stats?.sent ?? 0}. ${data.stats?.suppressed ?? 0} held back, ${data.cappedOut ?? 0} over the cap.`);
      load();
    } catch (e) { alert(e.response?.data?.message || 'Could not run it.'); }
  };

  return (
    <>
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <strong>These run without anybody watching.</strong>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
          Every one ships switched off. Switching one on does not send anything immediately — it
          schedules the first run. Each has a cooldown, so the same person cannot be hit twice by it
          inside that window, and a per-run cap so a filter typed wrongly cannot reach everybody.
          They only fire on the production server.
        </div>
      </div>

      {loading && <div className="muted">Loading…</div>}
      {rows.map((a) => (
        <div key={a.id} className="card" style={{ padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 260, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                  background: a.enabled ? '#eef9f1' : '#f3f1ef',
                  color: a.enabled ? '#166534' : '#6b7280',
                  border: `1px solid ${a.enabled ? '#cde9d6' : '#e5e1dd'}`,
                }}>{a.enabled ? 'ON' : 'OFF'}</span>
                <strong>{a.name}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 5 }}>{a.description}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 7 }}>
                {a.trigger_type === 'event'
                  ? <>Fires on <code>{a.event_name}</code>{a.delay_minutes ? `, ${a.delay_minutes} min later` : ''}</>
                  : <>{a.schedule_days?.length ? a.schedule_days.map((d) => DAY_LABELS[d]).join(', ') : 'Every day'} at {a.schedule_time || '10:00'} IST</>}
                {' · '}cooldown {a.cooldown_days}d · cap {fmt(a.max_per_run)}
                {a.audienceNow != null && <> · <strong>{fmt(a.audienceNow)} match right now</strong></>}
                {a.last_run_at && <> · last run {new Date(a.last_run_at).toLocaleString()}</>}
                {a.enabled && a.next_run_at && <> · next {new Date(a.next_run_at).toLocaleString()}</>}
                {a.total_sent ? <> · {fmt(a.total_sent)} sent all-time</> : null}
              </div>
              <div style={{ fontSize: 12.5, marginTop: 8, padding: 9, background: '#faf7f4', borderRadius: 7 }}>
                <strong>{a.title}</strong><br />{a.body}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
              <button className={a.enabled ? 'btn secondary' : 'btn'} onClick={() => toggle(a)}>
                {a.enabled ? 'Switch off' : 'Switch on'}
              </button>
              <button
                className="btn secondary"
                onClick={() => {
                  setEditing(editing === a.id ? null : a.id);
                  setDraft(a);
                }}
              >
                {editing === a.id ? 'Close' : 'Edit'}
              </button>
              <button className="btn secondary" onClick={() => runNow(a)}>Run now</button>
            </div>
          </div>

          {editing === a.id && (
            <div style={{ marginTop: 14, borderTop: '1px solid #eee3da', paddingTop: 14 }}>
              <CopyFields value={draft} onChange={(next) => setDraft({ ...draft, ...next })} />
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                {a.trigger_type !== 'event' && (
                  <>
                    <div>
                      <label className="muted" style={{ fontSize: 11.5, display: 'block' }}>Time (IST)</label>
                      <input value={draft.schedule_time || ''} placeholder="09:00" onChange={(e) => setDraft({ ...draft, schedule_time: e.target.value })} style={{ width: 90 }} />
                    </div>
                    <div>
                      <label className="muted" style={{ fontSize: 11.5, display: 'block', marginBottom: 4 }}>Days (none = every day)</label>
                      <div style={{ display: 'flex', gap: 5 }}>
                        {DAY_LABELS.map((d, i) => {
                          const on = (draft.schedule_days || []).includes(i);
                          return (
                            <button
                              key={d}
                              type="button"
                              className={on ? 'btn' : 'btn secondary'}
                              style={{ padding: '3px 8px', fontSize: 11.5 }}
                              onClick={() => setDraft({
                                ...draft,
                                schedule_days: on
                                  ? (draft.schedule_days || []).filter((x) => x !== i)
                                  : [...(draft.schedule_days || []), i].sort(),
                              })}
                            >{d}</button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
                <div>
                  <label className="muted" style={{ fontSize: 11.5, display: 'block' }}>Cooldown (days)</label>
                  <input type="number" value={draft.cooldown_days ?? ''} onChange={(e) => setDraft({ ...draft, cooldown_days: Number(e.target.value) })} style={{ width: 80 }} />
                </div>
                <div>
                  <label className="muted" style={{ fontSize: 11.5, display: 'block' }}>Max per run</label>
                  <input type="number" value={draft.max_per_run ?? ''} onChange={(e) => setDraft({ ...draft, max_per_run: Number(e.target.value) })} style={{ width: 100 }} />
                </div>
              </div>
              <button className="btn" onClick={() => { patch(a.id, draft); setEditing(null); }}>Save</button>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

// ───────────────────────────────────────────────────────────────── TEMPLATES ──

function Templates({ templates, reload }) {
  const [draft, setDraft] = useState({ name: '', category: 'promotional', title: '', body: '' });
  const [err, setErr] = useState('');

  const save = async () => {
    if (!draft.name || !draft.title || !draft.body) { setErr('A name, a title and a message are required.'); return; }
    setErr('');
    try {
      await client.post('/api/admin/notifications/templates', draft);
      setDraft({ name: '', category: 'promotional', title: '', body: '' });
      reload();
    } catch (e) { setErr(e.response?.data?.message || 'Could not save.'); }
  };

  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div className="card" style={{ padding: 18, flex: '1 1 420px', minWidth: 340 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>New template</div>
        <label className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>Name</label>
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={{ width: '100%', marginBottom: 12 }} />
        <label className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>Category</label>
        <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} style={{ width: '100%', marginBottom: 12 }}>
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <CopyFields value={draft} onChange={(next) => setDraft({ ...draft, ...next })} />
        {err && <p style={{ color: '#dc2626' }}>{err}</p>}
        <button className="btn" onClick={save}>Save template</button>
      </div>

      <div style={{ flex: '1 1 320px', minWidth: 300 }}>
        {!templates.length && <div className="muted">No templates saved yet.</div>}
        {templates.map((t) => (
          <div key={t.id} className="card" style={{ padding: 14, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <strong style={{ fontSize: 13 }}>{t.name}</strong>
                <div className="muted" style={{ fontSize: 11.5 }}>{t.category}</div>
                <div style={{ fontSize: 12.5, marginTop: 6 }}><strong>{t.title}</strong><br />{t.body}</div>
              </div>
              <button
                className="btn secondary"
                onClick={async () => {
                  if (!window.confirm(`Delete “${t.name}”?`)) return;
                  await client.delete(`/api/admin/notifications/templates/${t.id}`);
                  reload();
                }}
              >Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────── REACH & LIMITS ──

function Reach() {
  const [reach, setReach] = useState(null);
  const [limits, setLimits] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    client.get('/api/admin/notifications/reach').then(({ data }) => setReach(data.reach)).catch(() => {});
    client.get('/api/admin/notifications/limits').then(({ data }) => setLimits(data.limits)).catch(() => {});
    client.get('/api/admin/notifications/analytics?days=30').then(({ data }) => setAnalytics(data)).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const saveLimits = async () => {
    setSaving(true);
    try { await client.patch('/api/admin/notifications/limits', limits); load(); }
    catch (e) { alert(e.response?.data?.message || 'Could not save.'); }
    finally { setSaving(false); }
  };

  const r = reach;
  return (
    <>
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Who can be reached at all</div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
          A broadcast can only land on a phone that has a live push token AND has granted the OS
          permission. Everything else in this table is a reason it cannot.
        </div>
        {!r && <div className="muted">Loading…</div>}
        {r && (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <Stat label="Customers" value={fmt(r.live_customers)} hint="not deleted" />
              <Stat label="Reachable" value={fmt(r.reachable)} tone="good" hint={pct(r.reachable, r.live_customers)} />
              <Stat label="Never registered" value={fmt(r.never_registered)} tone="bad" hint="the app has never reported a device" />
              <Stat label="App removed" value={fmt(r.app_removed)} tone="bad" />
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <Stat label="Said no to the prompt" value={fmt(r.denied)} />
              <Stat label="Turned it off later" value={fmt(r.blocked)} />
              <Stat label="Allowed, but no token" value={fmt(r.granted_no_token)} hint="usually an iOS registration race" />
              <Stat label="Never asked" value={fmt(r.undetermined)} />
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Stat label="Reachable on Android" value={fmt(r.android_reachable)} />
              <Stat label="Reachable on iPhone" value={fmt(r.ios_reachable)} />
              <Stat label="Reading in Hindi" value={fmt(r.hindi_reachable)} />
            </div>
            {r.never_registered > r.reachable && (
              <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: '#fdecea', border: '1px solid #f3c8c4', fontSize: 13 }}>
                <strong>{fmt(r.never_registered)} customers have never registered a device.</strong> Most of
                them are not refusals — they are people on app builds that never reported one. That number
                falls on its own as customers open an updated app, and it is the single biggest lever on
                how far any campaign can go.
              </div>
            )}
          </>
        )}
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Limits that protect the list</div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
          These apply to promotional and engagement notifications only. Transactional ones — a chat
          request, an order update — always go through.
        </div>
        {limits && (
          <>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                <label className="muted" style={{ fontSize: 11.5, display: 'block' }}>Quiet from (hour, IST)</label>
                <input type="number" min={0} max={23} value={limits.quietStart} onChange={(e) => setLimits({ ...limits, quietStart: Number(e.target.value) })} style={{ width: 80 }} />
              </div>
              <div>
                <label className="muted" style={{ fontSize: 11.5, display: 'block' }}>Quiet until (hour, IST)</label>
                <input type="number" min={0} max={23} value={limits.quietEnd} onChange={(e) => setLimits({ ...limits, quietEnd: Number(e.target.value) })} style={{ width: 80 }} />
              </div>
              <div>
                <label className="muted" style={{ fontSize: 11.5, display: 'block' }}>Promos per person per day</label>
                <input type="number" min={0} value={limits.promoPerDay} onChange={(e) => setLimits({ ...limits, promoPerDay: Number(e.target.value) })} style={{ width: 80 }} />
              </div>
              <div>
                <label className="muted" style={{ fontSize: 11.5, display: 'block' }}>All non-transactional per day</label>
                <input type="number" min={0} value={limits.totalPerDay} onChange={(e) => setLimits({ ...limits, totalPerDay: Number(e.target.value) })} style={{ width: 80 }} />
              </div>
            </div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
              The published research says 46% of people switch notifications off after 2–5 promos a
              week, so one a day is already the generous end.
            </div>
            <button className="btn" onClick={saveLimits} disabled={saving}>{saving ? 'Saving…' : 'Save limits'}</button>
          </>
        )}
      </div>

      {analytics && (
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 14 }}>Last 30 days</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Stat label="Campaigns" value={fmt(analytics.totals.campaigns)} />
            <Stat label="Notifications sent" value={fmt(analytics.totals.sent)} />
            <Stat label="Held back" value={fmt(analytics.totals.suppressed)} />
            <Stat label="Open rate" value={analytics.totals.openRate == null ? '—' : `${analytics.totals.openRate}%`} hint="apps must be updated to report this" />
            <Stat label="Tap-through" value={analytics.totals.clickRate == null ? '—' : `${analytics.totals.clickRate}%`} hint="industry average is 3–4%" />
          </div>
        </div>
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────── PAGE ──

export default function NotificationCenter() {
  const [tab, setTab] = useState('Compose');
  const [templates, setTemplates] = useState([]);
  const [reload, setReload] = useState(0);

  const loadTemplates = useCallback(() => {
    client.get('/api/admin/notifications/templates')
      .then(({ data }) => setTemplates(data.data || []))
      .catch(() => setTemplates([]));
  }, []);
  useEffect(loadTemplates, [loadTemplates]);

  return (
    <div>
      <h1 className="page-title">Notification Center</h1>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Compose, schedule and automate notifications — and see afterwards whether anybody saw them.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t} type="button" className={`btn ${tab === t ? '' : 'secondary'}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Compose' && <Compose templates={templates} onSent={() => setReload((n) => n + 1)} />}
      {tab === 'Campaigns' && <Campaigns reload={reload} />}
      {tab === 'Automations' && <Automations />}
      {tab === 'Templates' && <Templates templates={templates} reload={loadTemplates} />}
      {tab === 'Reach & limits' && <Reach />}
    </div>
  );
}
