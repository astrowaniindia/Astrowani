import { useEffect, useState } from 'react';
import client from '../api/client';

// ─────────────────────────────────────────────────────────────────────────────
// App Prompts — the "please update the app" and "please rate us on the Play Store"
// popups shown inside both mobile apps.
//
// Both configs are ONE JSON blob each in app_settings (app_update_config /
// app_review_prompt_config), saved through the existing generic
// PATCH /api/admin/settings — there is no bespoke settings endpoint for them. The
// apps read the result through GET /api/app/update-check and /api/app/review-prompt,
// which fail closed: anything this page cannot save correctly means no prompt, never
// a broken one.
// ─────────────────────────────────────────────────────────────────────────────

const UPDATE_KEY = 'app_update_config';
const REVIEW_KEY = 'app_review_prompt_config';

const BLANK_APP = {
  latestVersion: '',
  latestBuild: 0,
  minSupportedVersion: '',
  minSupportedBuild: 0,
  storeUrl: '',
  title: '',
  message: '',
  titleHi: '',
  messageHi: '',
};

const DEFAULT_UPDATE = {
  enabled: false,
  remindAfterHours: 24,
  apps: { customer: { ...BLANK_APP }, vendor: { ...BLANK_APP } },
};

const DEFAULT_REVIEW = {
  enabled: true,
  minAppOpens: 4,
  minDaysSinceInstall: 2,
  remindAfterDays: 30,
  askAfterGoodRating: true,
  title: '',
  message: '',
  titleHi: '',
  messageHi: '',
  storeUrls: { customer: '', vendor: '' },
};

/** app_settings values are TEXT, so the blob comes back as a JSON string. */
function parseBlob(raw, fallback) {
  if (!raw) return fallback;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

/** Blank stays blank; a non-number becomes 0 rather than NaN (which JSON-stringifies to null). */
function numOrZero(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * A version FIELD holding "0" (or "0.0", empty, etc.) is not really "set" — no real
 * installed version is ever below it, so it can never block anyone. Treating a bare "0"
 * as meaningful is what made the old banner claim "forced update is set" when it was not.
 */
function isMeaningfulVersion(v) {
  const s = String(v ?? '').trim();
  if (!s) return false;
  return !/^0+(\.0+)*$/.test(s);
}

const APP_LABELS = { customer: 'Customer app', vendor: 'Astrologer app' };

export default function AppPrompts() {
  const [update, setUpdate] = useState(DEFAULT_UPDATE);
  const [review, setReview] = useState(DEFAULT_REVIEW);
  const [loaded, setLoaded] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);

  // Notify-everyone form (one shared form, `kind` picks which prompt it raises).
  const [notifyKind, setNotifyKind] = useState('app_update');
  const [notifyAudience, setNotifyAudience] = useState('all_customers');
  const [notifyTitle, setNotifyTitle] = useState('');
  const [notifyBody, setNotifyBody] = useState('');
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyResult, setNotifyResult] = useState(null);
  const [notifyError, setNotifyError] = useState('');

  useEffect(() => {
    client.get('/api/admin/settings')
      .then(({ data }) => {
        const st = data.settings || {};
        const u = parseBlob(st[UPDATE_KEY], DEFAULT_UPDATE);
        const r = parseBlob(st[REVIEW_KEY], DEFAULT_REVIEW);
        setUpdate({
          ...DEFAULT_UPDATE,
          ...u,
          apps: {
            customer: { ...BLANK_APP, ...(u.apps?.customer || {}) },
            vendor: { ...BLANK_APP, ...(u.apps?.vendor || {}) },
          },
        });
        setReview({
          ...DEFAULT_REVIEW,
          ...r,
          storeUrls: { ...DEFAULT_REVIEW.storeUrls, ...(r.storeUrls || {}) },
        });
      })
      .catch(() => { /* migration not run yet — the defaults above are editable as-is */ })
      .finally(() => setLoaded(true));
  }, []);

  const setAppField = (which, field, value) => {
    setUpdate((p) => ({
      ...p,
      apps: { ...p.apps, [which]: { ...p.apps[which], [field]: value } },
    }));
  };

  const saveUpdate = async () => {
    setUpdateBusy(true);
    try {
      const payload = {
        ...update,
        remindAfterHours: numOrZero(update.remindAfterHours) || 24,
        apps: {
          customer: {
            ...update.apps.customer,
            latestBuild: numOrZero(update.apps.customer.latestBuild),
            minSupportedBuild: numOrZero(update.apps.customer.minSupportedBuild),
          },
          vendor: {
            ...update.apps.vendor,
            latestBuild: numOrZero(update.apps.vendor.latestBuild),
            minSupportedBuild: numOrZero(update.apps.vendor.minSupportedBuild),
          },
        },
      };
      await client.patch('/api/admin/settings', { key: UPDATE_KEY, value: JSON.stringify(payload) });
      alert('Saved. Apps pick this up on their next launch (within a minute).');
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setUpdateBusy(false); }
  };

  const saveReview = async () => {
    setReviewBusy(true);
    try {
      const payload = {
        ...review,
        minAppOpens: numOrZero(review.minAppOpens) || 1,
        minDaysSinceInstall: parseInt(review.minDaysSinceInstall, 10) || 0,
        remindAfterDays: numOrZero(review.remindAfterDays) || 30,
      };
      await client.patch('/api/admin/settings', { key: REVIEW_KEY, value: JSON.stringify(payload) });
      alert('Saved.');
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setReviewBusy(false); }
  };

  const sendNotify = async () => {
    setNotifyError('');
    setNotifyResult(null);
    if (!notifyTitle.trim() || !notifyBody.trim()) {
      setNotifyError('Title and message are both required.');
      return;
    }
    const who = notifyAudience === 'all_customers' ? 'all customers' : 'all astrologers';
    const what = notifyKind === 'app_update' ? 'the update prompt' : 'the Play Store review prompt';
    if (!window.confirm(`Send ${what} to ${who}? They get a push notification, and the popup opens for anyone using the app right now.`)) return;

    setNotifyBusy(true);
    try {
      const { data } = await client.post('/api/admin/app-prompts/notify', {
        kind: notifyKind,
        audience: notifyAudience,
        title: notifyTitle.trim(),
        body: notifyBody.trim(),
      });
      setNotifyResult(data);
    } catch (e) {
      setNotifyError(e.response?.data?.message || e.message);
    } finally {
      setNotifyBusy(false);
    }
  };

  if (!loaded) return <div className="card">Loading…</div>;

  /** Plain-English "what will actually happen" for one app, given the saved numbers. */
  const appStatus = (which) => {
    const a = update.apps[which];
    const forced = isMeaningfulVersion(a.minSupportedVersion) || numOrZero(a.minSupportedBuild) > 0;
    const soft = isMeaningfulVersion(a.latestVersion) || numOrZero(a.latestBuild) > 0;
    if (!update.enabled) return { tone: 'off', badge: 'Off', text: 'The popup is switched off — nobody sees it, no matter what is filled in below.' };
    if (forced) {
      const v = a.minSupportedVersion || `build ${a.minSupportedBuild}`;
      return { tone: 'forced', badge: 'Blocking old builds', text: `Anyone below ${v} is stopped with no “Later” button until they update.` };
    }
    if (soft) {
      const v = a.latestVersion || `build ${a.latestBuild}`;
      return { tone: 'soft', badge: 'Reminder only', text: `Anyone below ${v} sees a dismissible reminder with a “Later” button.` };
    }
    return { tone: 'none', badge: 'Not set up', text: 'No version is filled in below, so nothing will show for this app yet.' };
  };

  const badgeStyle = (tone) => ({
    fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap',
    background: tone === 'forced' ? '#fde8e8' : tone === 'soft' ? '#e8f5e9' : '#f0f0f0',
    color: tone === 'forced' ? '#c0392b' : tone === 'soft' ? '#2e7d32' : '#777',
  });

  return (
    <div>
      <h1 className="page-title">App Prompts</h1>

      {/* ── Update prompt ────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ margin: 0 }}>“A new version is available”</h3>
        <p className="muted" style={{ marginTop: 4, marginBottom: 12 }}>
          Shown when someone opens the app on an older build. Tapping the button sends them
          straight to the Play Store listing. <b>Only type in a version that is actually live
          on the Play Store</b> — the app has nothing else to compare against, so a number
          that is not published yet asks everyone to install something they cannot get.
        </p>

        <div className="checkbox-row" style={{ marginBottom: 16 }}>
          <input
            id="upd-on"
            type="checkbox"
            checked={!!update.enabled}
            onChange={(e) => setUpdate((p) => ({ ...p, enabled: e.target.checked }))}
          />
          <label htmlFor="upd-on" style={{ margin: 0, fontWeight: 600 }}>
            Turn this popup on
          </label>
        </div>

        {['customer', 'vendor'].map((which) => {
          const status = appStatus(which);
          return (
            <div
              key={which}
              style={{ border: '1px solid #e5e5e5', borderRadius: 10, padding: 16, marginBottom: 16 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                <h4 style={{ margin: 0 }}>{APP_LABELS[which]}</h4>
                <span style={badgeStyle(status.tone)}>{status.badge}</span>
              </div>
              <p className="muted" style={{ marginTop: 0, marginBottom: 16, fontSize: 13 }}>{status.text}</p>

              {/* Step 1 — optional, skippable reminder */}
              <div style={{ background: '#fafafa', border: '1px solid #ececec', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
                  Step 1 · Remind people below this version — they can tap “Later”
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  <div className="field">
                    <label>Version on the Play Store (e.g. 24.2)</label>
                    <input
                      value={update.apps[which].latestVersion || ''}
                      onChange={(e) => setAppField(which, 'latestVersion', e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Build number (optional, more exact)</label>
                    <input
                      type="number"
                      value={update.apps[which].latestBuild || ''}
                      onChange={(e) => setAppField(which, 'latestBuild', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Step 2 — mandatory, non-dismissible block */}
              <div style={{ background: '#fff8f6', border: '1px solid #f3d3c9', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
                  Step 2 · Block anyone below this version — no “Later”, no way out
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
                  Leave both boxes empty unless an old build is genuinely broken.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  <div className="field">
                    <label>Version</label>
                    <input
                      value={update.apps[which].minSupportedVersion || ''}
                      onChange={(e) => setAppField(which, 'minSupportedVersion', e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Build number (optional, more exact)</label>
                    <input
                      type="number"
                      value={update.apps[which].minSupportedBuild || ''}
                      onChange={(e) => setAppField(which, 'minSupportedBuild', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <details>
                <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#555' }}>
                  Popup text &amp; Play Store link (optional to change)
                </summary>
                <div style={{ marginTop: 12 }}>
                  <div className="field">
                    <label>Play Store URL (blank = the app&apos;s own listing)</label>
                    <input
                      value={update.apps[which].storeUrl || ''}
                      onChange={(e) => setAppField(which, 'storeUrl', e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                    <div className="field">
                      <label>Title (English)</label>
                      <input
                        value={update.apps[which].title || ''}
                        onChange={(e) => setAppField(which, 'title', e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Title (Hindi)</label>
                      <input
                        value={update.apps[which].titleHi || ''}
                        onChange={(e) => setAppField(which, 'titleHi', e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Message (English)</label>
                      <textarea
                        rows={3}
                        value={update.apps[which].message || ''}
                        onChange={(e) => setAppField(which, 'message', e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Message (Hindi) — falls back to English if blank</label>
                      <textarea
                        rows={3}
                        value={update.apps[which].messageHi || ''}
                        onChange={(e) => setAppField(which, 'messageHi', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </details>
            </div>
          );
        })}

        <div className="field" style={{ maxWidth: 280 }}>
          <label>If someone taps “Later”, ask again after (hours)</label>
          <input
            type="number"
            value={update.remindAfterHours}
            onChange={(e) => setUpdate((p) => ({ ...p, remindAfterHours: e.target.value }))}
          />
        </div>

        <button className="btn" onClick={saveUpdate} disabled={updateBusy}>
          {updateBusy ? 'Saving…' : 'Save update settings'}
        </button>
      </div>

      {/* ── Review prompt ────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ margin: 0 }}>“Rate us on the Play Store”</h3>
        <p className="muted" style={{ marginTop: 4, marginBottom: 12 }}>
          Asks the user to leave a public Play Store rating. Nobody is asked twice: once they
          tap through to the store they are never prompted again, and <b>Maybe later</b> is
          honoured for the number of days below.
          <br />
          In the customer app it is also raised after someone rates a session <b>4 or 5
          stars</b> — a happy customer is the right moment to ask, and it keeps unhappy ones
          away from a public review form.
        </p>

        <div className="checkbox-row" style={{ marginBottom: 12 }}>
          <input
            id="rev-on"
            type="checkbox"
            checked={!!review.enabled}
            onChange={(e) => setReview((p) => ({ ...p, enabled: e.target.checked }))}
          />
          <label htmlFor="rev-on" style={{ margin: 0 }}>Review prompt is live</label>
        </div>

        <div className="checkbox-row" style={{ marginBottom: 14 }}>
          <input
            id="rev-good"
            type="checkbox"
            checked={review.askAfterGoodRating !== false}
            onChange={(e) => setReview((p) => ({ ...p, askAfterGoodRating: e.target.checked }))}
          />
          <label htmlFor="rev-good" style={{ margin: 0 }}>
            Ask after a customer gives a session 4 or 5 stars
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div className="field">
            <label>Ask only after this many app opens</label>
            <input
              type="number"
              value={review.minAppOpens}
              onChange={(e) => setReview((p) => ({ ...p, minAppOpens: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>…and this many days since install</label>
            <input
              type="number"
              value={review.minDaysSinceInstall}
              onChange={(e) => setReview((p) => ({ ...p, minDaysSinceInstall: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>“Maybe later” waits this many days</label>
            <input
              type="number"
              value={review.remindAfterDays}
              onChange={(e) => setReview((p) => ({ ...p, remindAfterDays: e.target.value }))}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          <div className="field">
            <label>Title (English)</label>
            <input
              value={review.title || ''}
              onChange={(e) => setReview((p) => ({ ...p, title: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Title (Hindi)</label>
            <input
              value={review.titleHi || ''}
              onChange={(e) => setReview((p) => ({ ...p, titleHi: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Message (English)</label>
            <textarea
              rows={3}
              value={review.message || ''}
              onChange={(e) => setReview((p) => ({ ...p, message: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Message (Hindi) — falls back to English if blank</label>
            <textarea
              rows={3}
              value={review.messageHi || ''}
              onChange={(e) => setReview((p) => ({ ...p, messageHi: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Customer app store URL (blank = its own listing)</label>
            <input
              value={review.storeUrls?.customer || ''}
              onChange={(e) => setReview((p) => ({ ...p, storeUrls: { ...p.storeUrls, customer: e.target.value } }))}
            />
          </div>
          <div className="field">
            <label>Astrologer app store URL (blank = its own listing)</label>
            <input
              value={review.storeUrls?.vendor || ''}
              onChange={(e) => setReview((p) => ({ ...p, storeUrls: { ...p.storeUrls, vendor: e.target.value } }))}
            />
          </div>
        </div>

        <button className="btn" onClick={saveReview} disabled={reviewBusy}>
          {reviewBusy ? 'Saving…' : 'Save review settings'}
        </button>
      </div>

      {/* ── Notify everyone ──────────────────────────────────────────────── */}
      <div className="card">
        <h3 style={{ margin: 0 }}>Notify everyone now</h3>
        <p className="muted" style={{ marginTop: 4, marginBottom: 12 }}>
          Sends a push notification, adds it to the in-app notification list, and opens the
          matching popup immediately for anyone currently using the app.
          <br />
          The update popup <b>re-checks with the server before it appears</b>, so sending this
          to everyone will not show “please update” to someone already on the newest build.
          The review popup skips the usage rules above, but still never asks anyone who has
          already rated.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div className="field">
            <label>Which popup</label>
            <select value={notifyKind} onChange={(e) => setNotifyKind(e.target.value)}>
              <option value="app_update">Update the app</option>
              <option value="app_review">Rate us on the Play Store</option>
            </select>
          </div>
          <div className="field">
            <label>Send to</label>
            <select value={notifyAudience} onChange={(e) => setNotifyAudience(e.target.value)}>
              <option value="all_customers">All customers</option>
              <option value="all_astrologers">All astrologers</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label>Notification title</label>
          <input value={notifyTitle} onChange={(e) => setNotifyTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>Notification message</label>
          <textarea rows={3} value={notifyBody} onChange={(e) => setNotifyBody(e.target.value)} />
        </div>

        <button className="btn" onClick={sendNotify} disabled={notifyBusy}>
          {notifyBusy ? 'Sending…' : 'Send now'}
        </button>

        {notifyError && <p style={{ color: '#c0392b', marginTop: 10 }}>{notifyError}</p>}
        {notifyResult && (
          <p style={{ marginTop: 10 }}>
            Sent to <b>{notifyResult.recipientCount}</b> {notifyAudience === 'all_customers' ? 'customers' : 'astrologers'}
            {' — '}push delivered to {notifyResult.pushSuccess}, failed for {notifyResult.pushFailure}.
            {!notifyResult.pushReady && (
              <>
                {' '}
                <b>Push is not configured on the server</b>, so only the in-app popup and the
                notification list were updated.
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
