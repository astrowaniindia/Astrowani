// Live Aarti & Pooja — YouTube channels the app watches for live streams.
//
// The customer app shows EVERY channel that is live at that moment, side by
// side in a horizontal scroller. There is no priority or "featured" channel —
// sort order only decides the left-to-right order they appear in.
import { useEffect, useState } from 'react';
import client from '../api/client';
import Modal from '../components/Modal';

const EMPTY = { name: '', channel_url: '', is_enabled: true, sort_order: 0 };

function timeAgo(iso) {
  if (!iso) return 'never';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

/** One channel's current state, as a single readable badge. */
function StatusCell({ row }) {
  if (row.resolve_error) return <span className="badge red" title={row.resolve_error}>Link problem</span>;
  if (!row.channel_id) return <span className="badge gray">Not resolved</span>;
  if (!row.is_enabled) return <span className="badge gray">Off</span>;
  if (row.is_live && row.is_embeddable === false) {
    return (
      <span className="badge amber" title="This channel is live, but it does not allow its videos to be embedded. The app shows a 'Watch on YouTube' card instead of a player.">
        Live · not embeddable
      </span>
    );
  }
  if (row.is_live) return <span className="badge green">Live now</span>;
  return <span className="badge gray">Offline</span>;
}

export default function LiveAarti() {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(null);
  const [youtubeConfigured, setYoutubeConfigured] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/api/admin/live-aarti-channels');
      setRows(data.data || []);
      setYoutubeConfigured(data.youtubeConfigured !== false);
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  // The list is a live view, so it refreshes itself — an admin watching this
  // page during an aarti should see a channel flip to "Live now" on its own.
  useEffect(() => {
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        name: editing.name.trim(),
        channel_url: editing.channel_url.trim(),
        is_enabled: !!editing.is_enabled,
        sort_order: Number(editing.sort_order) || 0,
      };
      const res = editing.id
        ? await client.put(`/api/admin/live-aarti-channels/${editing.id}`, payload)
        : await client.post('/api/admin/live-aarti-channels', payload);
      setEditing(null);
      await load();
      // Resolution happens server-side on save; surface a bad link immediately
      // rather than leaving a row that quietly never goes live.
      if (res.data?.data?.resolve_error) alert(`Saved, but: ${res.data.data.resolve_error}`);
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r) => {
    if (!confirm(`Remove "${r.name}" from Live Aarti?`)) return;
    try {
      await client.delete(`/api/admin/live-aarti-channels/${r.id}`);
      await load();
    } catch (e) { alert(e.response?.data?.message || e.message); }
  };

  const checkNow = async (r) => {
    setChecking(r.id);
    try {
      const { data } = await client.post(`/api/admin/live-aarti-channels/${r.id}/check`);
      await load();
      alert(data.live ? `${r.name} is LIVE right now.` : `${r.name} is not live at the moment.`);
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    } finally { setChecking(null); }
  };

  const refreshAll = async () => {
    setBusy(true);
    try {
      await client.post('/api/admin/live-aarti-channels/poll');
      await load();
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  const set = (k, v) => setEditing((p) => ({ ...p, [k]: v }));
  const liveCount = rows.filter((r) => r.is_live).length;

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Live Aarti &amp; Pooja</h1>
        <div className="btn-group">
          <button className="btn secondary" onClick={refreshAll} disabled={busy}>
            {busy ? 'Refreshing…' : 'Refresh now'}
          </button>
          <button className="btn" onClick={() => setEditing({ ...EMPTY })}>+ Add Channel</button>
        </div>
      </div>

      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Add the YouTube channels whose aarti should appear on the app&apos;s Home screen. The app checks
        them automatically and shows <strong>every channel that is live at that moment</strong> in a
        side-scrolling row — you never paste a video link. Channels are checked about every 4 minutes.
      </p>

      {!youtubeConfigured && (
        <div className="card" style={{ borderLeft: '4px solid var(--amber)', marginBottom: 16 }}>
          <strong>Automatic detection is off.</strong>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            The server has no <code>YOUTUBE_API_KEY</code> set, so channels can be added here but will
            never be detected as live. Add a YouTube Data API v3 key to the backend environment to turn
            detection on.
          </p>
        </div>
      )}

      {youtubeConfigured && (
        <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
          {liveCount === 0
            ? 'No channel is live right now — the Home section is hidden (or shows your fallback video, if one is set on the Banners page).'
            : `${liveCount} channel${liveCount === 1 ? '' : 's'} live right now — ${liveCount === 1 ? 'it is' : 'all of them are'} showing on Home.`}
        </p>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Channel</th><th>Status</th><th>Now playing</th>
              <th>Last checked</th><th>Order</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="empty">Loading…</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="empty">No channels yet. Add one to get started.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <a href={r.channel_url} target="_blank" rel="noreferrer">{r.channel_url}</a>
                </td>
                <td><StatusCell row={r} /></td>
                <td style={{ maxWidth: 260 }}>
                  {r.is_live && r.live_video_id ? (
                    <a href={`https://www.youtube.com/watch?v=${r.live_video_id}`} target="_blank" rel="noreferrer">
                      {r.live_title || r.live_video_id}
                    </a>
                  ) : <span className="muted">—</span>}
                </td>
                <td className="muted">{timeAgo(r.last_checked_at)}</td>
                <td>{r.sort_order}</td>
                <td>
                  <div className="btn-group">
                    <button className="btn secondary sm" onClick={() => checkNow(r)} disabled={checking === r.id}>
                      {checking === r.id ? 'Checking…' : 'Check now'}
                    </button>
                    <button className="btn secondary sm" onClick={() => setEditing({ ...r })}>Edit</button>
                    <button className="btn danger sm" onClick={() => remove(r)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={editing.id ? 'Edit Channel' : 'Add Channel'} onClose={() => setEditing(null)}>
          <div className="field">
            <label>Name shown in the app</label>
            <input
              type="text"
              placeholder="e.g. Mahakaleshwar Ujjain"
              value={editing.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>
          <div className="field">
            <label>YouTube channel link</label>
            <input
              type="text"
              placeholder="https://www.youtube.com/@ChannelName"
              value={editing.channel_url}
              onChange={(e) => set('channel_url', e.target.value)}
            />
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
              The <strong>channel</strong> link, not a video link. Open the channel on YouTube and copy the
              address bar — <code>youtube.com/@Name</code> and <code>youtube.com/channel/UC…</code> both work.
            </p>
          </div>
          <div className="two-col">
            <div className="field">
              <label>Sort order</label>
              <input type="number" value={editing.sort_order} onChange={(e) => set('sort_order', e.target.value)} />
            </div>
            <div className="field checkbox-row" style={{ alignSelf: 'end' }}>
              <input
                id="la-enabled"
                type="checkbox"
                checked={!!editing.is_enabled}
                onChange={(e) => set('is_enabled', e.target.checked)}
              />
              <label htmlFor="la-enabled" style={{ margin: 0 }}>Enabled</label>
            </div>
          </div>
          {editing.resolve_error && (
            <p style={{ color: 'var(--red)', fontSize: 13 }}>{editing.resolve_error}</p>
          )}
          <div className="actions">
            <button className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button
              className="btn"
              onClick={save}
              disabled={busy || !editing.name.trim() || !editing.channel_url.trim()}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
