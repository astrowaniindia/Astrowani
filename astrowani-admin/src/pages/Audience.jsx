import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import client from '../api/client';

// Who gets which welcome offer, based on where the customer came from.
//
// The free call and the free chat both cost real money — an astrologer's time, and
// Gemini API spend. This page lets an admin stop giving them to traffic that already
// cost money to acquire, while keeping them for traffic that needs the nudge.
//
// THE SAFETY RAIL: every rule is previewed against the live customer base BEFORE it can
// be saved, and the Save button states in words how many real people it would cut off.
// Almost every existing customer has no source tag at all (they signed up before
// install-referrer tracking, or they are on iPhone, where Apple provides no equivalent),
// so a careless "only" rule would silently switch an offer off for nearly everyone. The
// preview is what makes that impossible to do by accident.

const SETTINGS_KEY = 'audience_rules';

const FEATURE_LABELS = {
  free_call: 'Free 12-minute call',
  free_chat: 'Free 5-minute chat',
};

const FEATURE_NOTES = {
  free_call: 'Costs a real astrologer’s time.',
  free_chat: 'Costs Gemini API spend per conversation.',
};

const MATCH_KINDS = [
  { value: 'prefix', label: 'Source starts with' },
  { value: 'exact', label: 'Source is exactly' },
  { value: 'raw_contains', label: 'Full referrer contains' },
  { value: 'null', label: 'No source at all (unknown)' },
];

const MODES = [
  { value: 'everyone', label: 'Everyone', hint: 'No restriction. This is the default.' },
  { value: 'block', label: 'Everyone except…', hint: 'Blocks only the groups you tick.' },
  { value: 'only', label: 'Only…', hint: 'Blocks every group you do NOT tick, including Unknown.' },
];

const blankSegment = () => ({ id: '', label: '', match: { kind: 'prefix', value: '' } });

export default function Audience() {
  const [segments, setSegments] = useState([]);
  const [features, setFeatures] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const previewTimer = useRef(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await client.get('/api/admin/audience/rules');
      const loadedSegments = data.rules?.segments?.length ? data.rules.segments : (data.defaultSegments || []);
      const loadedFeatures = data.rules?.features || {};
      setSegments(loadedSegments);
      setFeatures(loadedFeatures);
      // Snapshot of what is actually stored, so the Save buttons can tell the admin
      // whether anything is still unsaved rather than always looking the same.
      setSavedSnapshot(JSON.stringify({ segments: loadedSegments, features: loadedFeatures }));
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Failed to load targeting rules.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const payload = useMemo(() => ({ segments, features }), [segments, features]);

  // Re-previewed on every edit (debounced), so the impact figures on screen always
  // describe the rules currently in the form rather than the last saved ones.
  const runPreview = useCallback(async (rules) => {
    setPreviewing(true);
    try {
      const { data } = await client.post('/api/admin/audience/preview', { rules });
      setPreview(data);
    } catch (e) {
      setPreview(null);
    } finally {
      setPreviewing(false);
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => runPreview(payload), 400);
    return () => clearTimeout(previewTimer.current);
  }, [payload, loading, runPreview]);

  const modeOf = (key) => features[key]?.mode || 'everyone';
  const segsOf = (key) => features[key]?.segments || [];

  const setMode = (key, mode) => {
    setFeatures((f) => {
      const next = { ...f };
      if (mode === 'everyone') delete next[key];
      else next[key] = { mode, segments: f[key]?.segments || [] };
      return next;
    });
  };

  const toggleSegment = (key, id) => {
    setFeatures((f) => {
      const cur = f[key];
      if (!cur) return f;
      const list = cur.segments.includes(id)
        ? cur.segments.filter((x) => x !== id)
        : [...cur.segments, id];
      return { ...f, [key]: { ...cur, segments: list } };
    });
  };

  const updateSegment = (i, patch) => {
    setSegments((s) => s.map((seg, idx) => (idx === i ? { ...seg, ...patch } : seg)));
  };
  const updateMatch = (i, patch) => {
    setSegments((s) => s.map((seg, idx) => (idx === i ? { ...seg, match: { ...seg.match, ...patch } } : seg)));
  };
  const removeSegment = (i) => {
    const seg = segments[i];
    if (!window.confirm(`Remove the group "${seg.label || seg.id}"? Any rule using it will stop applying.`)) return;
    setSegments((s) => s.filter((_, idx) => idx !== i));
    setFeatures((f) => {
      const next = {};
      for (const [k, v] of Object.entries(f)) {
        next[k] = { ...v, segments: v.segments.filter((x) => x !== seg.id) };
      }
      return next;
    });
  };

  // Every rule lives in ONE stored setting, so any Save button saves the whole page.
  // Said plainly on the buttons rather than implying each card saves in isolation.
  const dirty = savedSnapshot !== null && JSON.stringify(payload) !== savedSnapshot;

  const blockedFor = (key) => preview?.blocked?.[key] ?? null;
  const total = preview?.totalCustomers ?? null;

  // Anything that would cut off more than a third of the live base is almost certainly
  // not what the admin meant, and is exactly the "only" mode footgun.
  const heavyKeys = Object.keys(FEATURE_LABELS).filter((k) => {
    const b = blockedFor(k);
    return b != null && total && b / total > 0.33;
  });

  const save = async () => {
    const lines = Object.keys(FEATURE_LABELS)
      .map((k) => {
        const b = blockedFor(k);
        return b ? `• ${FEATURE_LABELS[k]}: blocks ${b} of ${total} customers` : null;
      })
      .filter(Boolean);
    const summary = lines.length
      ? `This will change what your customers see:\n\n${lines.join('\n')}\n\nSave?`
      : 'No customer is blocked by these rules. Save?';
    if (!window.confirm(summary)) return;

    setSaving(true);
    try {
      await client.patch('/api/admin/settings', { key: SETTINGS_KEY, value: JSON.stringify(payload) });
      await load();
      window.alert('Saved. New app launches pick this up within a minute.');
    } catch (e) {
      window.alert(e.response?.data?.message || e.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  // Defined AFTER save() on purpose. It is read during render, and a const declared
  // below its reader sits in the temporal dead zone — the same shape as the
  // deps-array bug in CLAUDE.md BR. Ordering it here removes the trap instead of
  // relying on React happening to call this component late enough.
  const SaveButton = ({ style }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', ...style }}>
      <button className="btn" onClick={save} disabled={saving || loading}>
        {saving ? 'Saving…' : 'Save settings'}
      </button>
      <span className="muted" style={{ fontSize: 12 }}>
        {dirty ? 'You have unsaved changes.' : 'Everything on this page is saved.'}
      </span>
    </div>
  );

  return (
    <div>
      <h1 className="page-title">Audience Targeting</h1>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16, maxWidth: 900 }}>
        Decide which welcome offers each kind of customer gets, based on where they came from.
        Useful for not paying twice: traffic from a paid ad already cost money, while a QR poster
        scan is cheap and is exactly where a free call earns its keep.
      </p>

      <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--amber, #d97706)' }}>
        <strong>Nobody is tagged yet.</strong>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          Source tracking starts with the next Play Store release. Until that build is live and new
          people install from it, every customer counts as <strong>Unknown</strong> &mdash; so rules about
          QR or Google will correctly affect nobody. Rules you write now simply start applying as
          tagged customers arrive.
        </p>
      </div>

      {error && <div className="card" style={{ borderLeft: '4px solid #c0392b', marginBottom: 16 }}>{error}</div>}

      {/* ── Impact ─────────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>
          What these rules do right now {previewing && <span className="muted" style={{ fontSize: 12 }}>&nbsp;updating&hellip;</span>}
        </h3>
        {!preview && <div className="muted">Working it out&hellip;</div>}
        {preview && (
          <>
            <div className="stat-grid" style={{ marginBottom: 12 }}>
              {Object.keys(FEATURE_LABELS).map((k) => {
                const b = blockedFor(k) || 0;
                return (
                  <div className="stat" key={k}>
                    <div className="stat-header"><span className="label">{FEATURE_LABELS[k]}</span></div>
                    <div className="value" style={{ color: b ? 'var(--amber, #d97706)' : undefined }}>
                      {b === 0 ? 'Everyone' : `${total - b} of ${total}`}
                    </div>
                    <div className="stat-footer">
                      <span className="muted">
                        {b === 0 ? 'No one is blocked' : `${b} customer${b === 1 ? '' : 's'} blocked`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {preview.truncated && (
              <p className="muted" style={{ fontSize: 12 }}>
                There are more customers than one read returns, so these counts under-report.
              </p>
            )}

            <div className="table-wrap">
              <table>
                <thead><tr><th>Group</th><th>Customers today</th></tr></thead>
                <tbody>
                  {(preview.segments || []).map((s) => (
                    <tr key={s.id}>
                      <td>{s.label}{s.id === 'unknown' && <span className="muted"> &mdash; incl. every iPhone customer</span>}</td>
                      <td>{s.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {heavyKeys.length > 0 && (
              <div style={{ marginTop: 12, padding: 12, borderLeft: '4px solid #c0392b', background: 'rgba(192,57,43,.06)' }}>
                <strong>Careful.</strong>
                <p className="muted" style={{ margin: '6px 0 0' }}>
                  {heavyKeys.map((k) => FEATURE_LABELS[k]).join(' and ')}{' '}
                  would be switched off for more than a third of your customers. That usually means an
                  &ldquo;Only&hellip;&rdquo; rule which leaves out <strong>Unknown</strong> &mdash; and almost
                  everyone is Unknown today, including all iPhone users.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Rules ──────────────────────────────────────────────────────────── */}
      {Object.keys(FEATURE_LABELS).map((key) => (
        <div className="card" style={{ marginBottom: 16 }} key={key}>
          <h3 style={{ marginTop: 0 }}>{FEATURE_LABELS[key]}</h3>
          <p className="muted" style={{ marginTop: -4, fontSize: 13 }}>{FEATURE_NOTES[key]}</p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                className={modeOf(key) === m.value ? 'btn' : 'btn secondary'}
                onClick={() => setMode(key, m.value)}
                title={m.hint}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            {MODES.find((m) => m.value === modeOf(key))?.hint}
          </div>

          {modeOf(key) !== 'everyone' && (
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {segments.map((s) => (
                <label key={s.id || s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={segsOf(key).includes(s.id)}
                    onChange={() => toggleSegment(key, s.id)}
                  />
                  {s.label || s.id}
                </label>
              ))}
            </div>
          )}

          <SaveButton style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border, rgba(128,128,128,.2))' }} />
        </div>
      ))}

      {/* ── Segments ───────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Customer groups</h3>
        <p className="muted" style={{ marginTop: -4, fontSize: 13 }}>
          How customers are sorted into groups. Checked top to bottom, and the first one that fits
          wins &mdash; so put a specific group above a general one. Anyone matching nothing counts as
          Unknown.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Code</th><th>Rule</th><th>Value</th><th /></tr>
            </thead>
            <tbody>
              {segments.map((s, i) => (
                <tr key={i}>
                  <td><input type="text" value={s.label} placeholder="QR posters"
                    onChange={(e) => updateSegment(i, { label: e.target.value })} /></td>
                  <td><input type="text" value={s.id} placeholder="qr" style={{ width: 110 }}
                    onChange={(e) => updateSegment(i, { id: e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, '') })} /></td>
                  <td>
                    <select value={s.match?.kind || 'prefix'} onChange={(e) => updateMatch(i, { kind: e.target.value })}>
                      {MATCH_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                    </select>
                  </td>
                  <td>
                    {s.match?.kind === 'null'
                      ? <span className="muted">&mdash;</span>
                      : <input type="text" value={s.match?.value || ''} placeholder="qr_"
                          onChange={(e) => updateMatch(i, { value: e.target.value })} />}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn danger sm" type="button" onClick={() => removeSegment(i)}>Remove</button>
                  </td>
                </tr>
              ))}
              {!segments.length && <tr><td colSpan={5} className="empty">No groups yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <button className="btn secondary sm" type="button" style={{ marginTop: 10 }}
          onClick={() => setSegments((s) => [...s, blankSegment()])}>
          Add a group
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <SaveButton />
        <button className="btn secondary" onClick={load} disabled={loading || saving}>Undo changes</button>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>Worth knowing</h3>
        <ul className="muted" style={{ fontSize: 13, lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
          <li>
            <strong>Unknown is not a mistake.</strong> It means we never learned where someone came
            from &mdash; everyone who signed up before tracking existed, every iPhone customer, and
            anyone who installed outside the Play Store. They keep every offer unless you tick
            Unknown yourself.
          </li>
          <li>
            <strong>&ldquo;Only&hellip;&rdquo; is the sharp one.</strong> It blocks every group you do not
            tick. Today that would be nearly your whole customer base.
          </li>
          <li>
            <strong>Rules apply to people who already signed up too</strong>, because a customer&apos;s
            group is fixed when they join. A free call somebody already booked is never taken away.
          </li>
          <li>
            <strong>An invited customer always gets the free call</strong>, whatever these rules say.
            If you invited them by hand, that is taken as deliberate.
          </li>
          <li>
            <strong>Google&apos;s own ads may not be separable by individual ad.</strong> For app-install
            campaigns Google controls the store link, so we may only learn &ldquo;came from
            Google&rdquo;. To split one ad from another, use a tracked link from the QR Codes page for
            ads where you control the destination.
          </li>
        </ul>
      </div>
    </div>
  );
}
