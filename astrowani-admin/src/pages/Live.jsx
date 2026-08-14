import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';

export default function Live() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // Live Aarti / Pooja — a YouTube URL embedded in-app at the very bottom of the
  // customer Home screen (before "What Our Clients Say"). This is unrelated to the
  // in-app astrologer broadcasts below (different feature entirely — a fixed
  // YouTube stream vs. an astrologer going live via WebRTC) but lives on this page
  // because "Live" is where an admin naturally looks for it. Empty = section
  // hidden entirely, no placeholder shown. Same app_settings key/value pattern as
  // the banner rotation interval on the Banners page.
  const [liveAartiUrl, setLiveAartiUrl] = useState('');
  const [liveAartiBusy, setLiveAartiBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await client.get('/api/admin/live');
      setRows(data.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
    // Independent of the live-sessions list — a failure here (e.g. app_settings
    // not yet migrated) must not block the broadcasts table from rendering.
    try {
      const settingsRes = await client.get('/api/admin/settings');
      setLiveAartiUrl(settingsRes.data.settings?.live_aarti_youtube_url || '');
    } catch (e) {
      console.error('load settings failed (run app_settings_schema.sql):', e.message);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000); // refresh active streams every 10s
    return () => clearInterval(t);
  }, [load]);

  const stop = async (r) => {
    if (!confirm(`Force-stop ${r.astrologerName}'s live stream?`)) return;
    await client.post(`/api/admin/live/${r.id}/stop`);
    await load();
  };

  const saveLiveAarti = async () => {
    setLiveAartiBusy(true);
    try {
      await client.patch('/api/admin/settings', { key: 'live_aarti_youtube_url', value: liveAartiUrl.trim() });
      alert(liveAartiUrl.trim() ? 'Live Aarti stream saved — it will appear on Home shortly.' : 'Live Aarti stream cleared — the section is now hidden on Home.');
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setLiveAartiBusy(false); }
  };

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Live Streams</h1>
        <button className="btn secondary" onClick={load}>Refresh</button>
      </div>

      {/* Live Aarti / Pooja stream — a YouTube URL embedded in-app at the very
          bottom of the customer Home screen, before "What Our Clients Say".
          Empty = section hidden entirely, no placeholder shown. */}
      <div className="card" style={{ marginBottom: 18, display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div className="field" style={{ margin: 0, minWidth: 320, flex: 1 }}>
          <label>Live Aarti / Pooja — YouTube URL</label>
          <input
            type="text"
            placeholder="https://www.youtube.com/watch?v=... or a live stream link"
            value={liveAartiUrl}
            onChange={(e) => setLiveAartiUrl(e.target.value)}
          />
        </div>
        <button className="btn" onClick={saveLiveAarti} disabled={liveAartiBusy}>
          {liveAartiBusy ? 'Saving…' : 'Save'}
        </button>
        {liveAartiUrl && (
          <button className="btn secondary" disabled={liveAartiBusy} onClick={() => { setLiveAartiUrl(''); }}>
            Clear
          </button>
        )}
        <span className="muted" style={{ width: '100%' }}>
          Plays in-app on the customer Home screen, right above the reviews section. Leave empty
          (and hit Save) to hide the section — nothing shows when there's no video/pooja live.
          Clicking "Clear" only clears the field here; click Save to actually apply it.
        </span>
      </div>

      <h3 style={{ marginBottom: 4 }}>In-app astrologer broadcasts</h3>
      <p className="muted" style={{ marginTop: -2, marginBottom: 16 }}>
        Astrologers currently broadcasting live (WebRTC, not the YouTube stream above). Use Stop
        to immediately end a stream (both vendor and viewers are dropped).
      </p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Astrologer</th><th>Title</th><th>Viewers</th><th>Gifts (₹)</th><th>Started</th><th></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="empty">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className="empty">No live streams right now.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className="badge red" style={{ marginRight: 8 }}>● LIVE</span>
                  {r.astrologerName}
                </td>
                <td className="muted">{r.title || '—'}</td>
                <td>{r.viewerCount}</td>
                <td><b>{r.totalGiftAmount}</b></td>
                <td className="muted">{r.startedAt ? new Date(r.startedAt).toLocaleTimeString() : '—'}</td>
                <td><button className="btn danger sm" onClick={() => stop(r)}>Stop</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
