// Live Aarti / Pooja — automatic "is this channel live right now?" detection.
//
// WHY THIS SHAPE (quota is the whole story):
// The obvious YouTube call for "is channel X live" is search.list with
// eventType=live. It costs 100 units against a 10,000/day free quota, i.e. 100
// checks per DAY across all channels. Polling 6 channels every 5 minutes that
// way needs 172,800 units/day — it would die before breakfast and the aarti
// would silently stop appearing, which is exactly the "video not working"
// failure this feature must not have.
//
// So detection is built the cheap way instead:
//   1. Every channel publishes a public RSS feed
//      (youtube.com/feeds/videos.xml?channel_id=UC…). It is FREE and costs no
//      quota. It gives us recent video IDs — but not whether they are live.
//   2. All those IDs from all channels go into ONE videos.list call, which
//      accepts 50 IDs and costs 1 unit total. That tells us
//      snippet.liveBroadcastContent === 'live' and status.embeddable.
// A poll of every channel therefore costs ~1 unit, so a 4-minute cycle uses
// ~360 units/day out of 10,000 and leaves plenty of headroom.
//
// search.list is still used, but only for two rare admin-triggered actions
// (resolving a /c/ vanity URL, and the "Check now" button), never on a timer.
const axios = require('axios');

const API = 'https://www.googleapis.com/youtube/v3';
const RSS = 'https://www.youtube.com/feeds/videos.xml';

// A live aarti runs for a while, so minute-level precision buys nothing.
const POLL_INTERVAL_MS = 4 * 60 * 1000;
const HTTP_TIMEOUT_MS = 12000;
// Newest N videos per channel from the feed. A channel's live stream is among
// its most recent entries; going deeper just pads the videos.list call.
const RECENT_PER_CHANNEL = 4;
const VIDEOS_LIST_MAX_IDS = 50;

function apiKey() {
  const key = process.env.YOUTUBE_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

function isConfigured() {
  return !!apiKey();
}

// ---------------------------------------------------------------------------
// Channel URL → channel id
// ---------------------------------------------------------------------------

/**
 * Pull whatever identifier we can out of whatever the admin pasted.
 * Returns {kind: 'id'|'handle'|'user'|'vanity', value} or null.
 */
function parseChannelInput(raw) {
  const input = String(raw || '').trim();
  if (!input) return null;

  // A bare channel id or @handle typed without a URL.
  if (/^UC[\w-]{20,}$/.test(input)) return { kind: 'id', value: input };
  if (/^@[\w.-]+$/.test(input)) return { kind: 'handle', value: input };

  const patterns = [
    [/youtube\.com\/channel\/(UC[\w-]{20,})/i, 'id'],
    [/youtube\.com\/(@[\w.-]+)/i, 'handle'],
    [/youtube\.com\/user\/([\w.-]+)/i, 'user'],
    [/youtube\.com\/c\/([\w.-]+)/i, 'vanity'],
  ];
  for (const [re, kind] of patterns) {
    const m = input.match(re);
    if (m) return { kind, value: m[1] };
  }
  return null;
}

/**
 * Resolve to a UC… channel id. Returns {channelId} or {error} — never throws,
 * because a bad paste in the admin form must surface as a message on the row,
 * not a 500.
 */
async function resolveChannelId(rawUrl) {
  if (!isConfigured()) return { error: 'YouTube API key is not configured on the server.' };

  const parsed = parseChannelInput(rawUrl);
  if (!parsed) {
    return { error: "That does not look like a YouTube channel link. Use the channel's URL, e.g. https://www.youtube.com/@SomeTemple" };
  }
  if (parsed.kind === 'id') return { channelId: parsed.value };

  try {
    // forHandle / forUsername are 1 unit each.
    if (parsed.kind === 'handle' || parsed.kind === 'user') {
      const params = { part: 'id', key: apiKey() };
      if (parsed.kind === 'handle') params.forHandle = parsed.value;
      else params.forUsername = parsed.value;

      const { data } = await axios.get(`${API}/channels`, { params, timeout: HTTP_TIMEOUT_MS });
      const id = data?.items?.[0]?.id;
      if (id) return { channelId: id };
      // Handles sometimes miss on forHandle; fall through to search.
    }

    // Last resort — a /c/ vanity URL has no direct lookup. 100 units, but this
    // runs once when an admin adds a channel, never on the poll loop.
    const { data: search } = await axios.get(`${API}/search`, {
      params: { part: 'snippet', type: 'channel', q: parsed.value.replace(/^@/, ''), maxResults: 1, key: apiKey() },
      timeout: HTTP_TIMEOUT_MS,
    });
    const found = search?.items?.[0]?.snippet?.channelId || search?.items?.[0]?.id?.channelId;
    if (found) return { channelId: found };
    return { error: 'No YouTube channel found for that link.' };
  } catch (err) {
    return { error: describeYouTubeError(err) };
  }
}

function describeYouTubeError(err) {
  const reason = err?.response?.data?.error?.errors?.[0]?.reason;
  if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
    return 'YouTube API daily quota exceeded — detection will resume tomorrow.';
  }
  if (reason === 'keyInvalid' || reason === 'badRequest') {
    return 'The YouTube API key was rejected. Check the key and that YouTube Data API v3 is enabled for it.';
  }
  return err?.response?.data?.error?.message || err.message || 'YouTube request failed.';
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** Recent video ids for a channel, straight off the free RSS feed. */
async function recentVideoIds(channelId) {
  try {
    const { data } = await axios.get(RSS, {
      params: { channel_id: channelId },
      timeout: HTTP_TIMEOUT_MS,
      responseType: 'text',
    });
    const ids = [];
    const re = /<yt:videoId>([\w-]{11})<\/yt:videoId>/g;
    let m;
    while ((m = re.exec(String(data))) && ids.length < RECENT_PER_CHANNEL) ids.push(m[1]);
    return ids;
  } catch (_) {
    // A feed hiccup must not take out the whole poll.
    return [];
  }
}

/**
 * One videos.list call for up to 50 ids (1 unit) → live/embeddable state.
 * Returns a Map of videoId → {live, embeddable, title, thumbnail, channelId}.
 */
async function describeVideos(ids) {
  const out = new Map();
  if (!ids.length || !isConfigured()) return out;

  for (let i = 0; i < ids.length; i += VIDEOS_LIST_MAX_IDS) {
    const batch = ids.slice(i, i + VIDEOS_LIST_MAX_IDS);
    const { data } = await axios.get(`${API}/videos`, {
      params: { part: 'snippet,status', id: batch.join(','), key: apiKey() },
      timeout: HTTP_TIMEOUT_MS,
    });
    for (const item of data?.items || []) {
      const sn = item.snippet || {};
      const th = sn.thumbnails || {};
      out.set(item.id, {
        live: sn.liveBroadcastContent === 'live',
        // status.embeddable is the difference between a working player and a
        // silent black rectangle in the app.
        embeddable: item.status?.embeddable !== false,
        title: sn.title || '',
        thumbnail: (th.high || th.medium || th.default || {}).url || '',
        channelId: sn.channelId || '',
      });
    }
  }
  return out;
}

// DO NOT add an oEmbed "is it embeddable?" check here. It was tried and it is
// wrong: youtube.com/oembed returned HTTP 200 for video 6qySbgwFVpk (the aarti
// stream this feature's admin had configured), while the actual IFrame player
// refused that same video with error 150 — "embedding disabled by the owner".
// A control video in the identical harness reported ready, so this was the
// video's own restriction, not the test environment. oEmbed answering 200
// therefore does NOT mean the player will play it, and trusting it would mark
// unplayable streams as fine — the exact "black rectangle" bug being fixed.
//
// The two signals that ARE trustworthy:
//   • status.embeddable from videos.list (server-side, best effort), and
//   • the player's own onError in the app, which is the real safety net and
//     swaps in a "Watch on YouTube" card (see LiveAartiSection.js).

/**
 * Admin-triggered "Check now" for ONE channel. Uses search.list (100 units) so
 * it can find a live stream the RSS feed has not listed yet — the known weak
 * spot of the cheap path above. Deliberately never called on a timer.
 */
async function forceCheckChannel(channelId) {
  if (!isConfigured()) return { error: 'YouTube API key is not configured on the server.' };
  try {
    const { data } = await axios.get(`${API}/search`, {
      params: { part: 'id', channelId, eventType: 'live', type: 'video', maxResults: 1, key: apiKey() },
      timeout: HTTP_TIMEOUT_MS,
    });
    const videoId = data?.items?.[0]?.id?.videoId;
    if (!videoId) return { live: false };
    const described = await describeVideos([videoId]);
    const info = described.get(videoId);
    return { live: !!info?.live, videoId, info };
  } catch (err) {
    return { error: describeYouTubeError(err) };
  }
}

// ---------------------------------------------------------------------------
// Poller
// ---------------------------------------------------------------------------

function createLiveAartiPoller(db) {
  let timer = null;
  let running = false;

  async function pollOnce() {
    if (running) return { skipped: 'already running' };
    running = true;
    try {
      if (!isConfigured()) return { skipped: 'no api key' };

      const { data: channels, error } = await db
        .from('live_aarti_channels')
        .select('id, channel_id, is_live')
        .eq('is_enabled', true)
        .not('channel_id', 'is', null);
      if (error) throw error;
      if (!channels || !channels.length) return { checked: 0, live: 0 };

      // Collect candidate ids per channel from the free feeds, in parallel.
      const perChannel = await Promise.all(
        channels.map(async (c) => ({ row: c, ids: await recentVideoIds(c.channel_id) })),
      );

      const allIds = [];
      for (const { ids } of perChannel) for (const id of ids) if (!allIds.includes(id)) allIds.push(id);

      const described = await describeVideos(allIds);
      const now = new Date().toISOString();
      let liveCount = 0;

      await Promise.all(perChannel.map(async ({ row, ids }) => {
        const liveId = ids.find((id) => described.get(id)?.live);
        const info = liveId ? described.get(liveId) : null;
        if (info) liveCount++;

        const patch = info
          ? {
            is_live: true,
            live_video_id: liveId,
            live_title: info.title,
            live_thumbnail: info.thumbnail,
            is_embeddable: info.embeddable,
            last_checked_at: now,
            last_live_at: now,
          }
          : {
            is_live: false,
            live_video_id: null,
            live_title: null,
            live_thumbnail: null,
            last_checked_at: now,
          };

        const { error: upErr } = await db.from('live_aarti_channels').update(patch).eq('id', row.id);
        if (upErr) console.error('[live-aarti] update failed for', row.id, upErr.message);
      }));

      return { checked: channels.length, live: liveCount, unitsUsed: Math.ceil(allIds.length / VIDEOS_LIST_MAX_IDS) };
    } catch (err) {
      // Never let a YouTube outage kill the interval.
      console.error('[live-aarti] poll failed:', describeYouTubeError(err));
      return { error: describeYouTubeError(err) };
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer) return;
    if (!isConfigured()) {
      console.log('[live-aarti] YOUTUBE_API_KEY not set — live detection disabled (the manual URL fallback still works).');
      return;
    }
    // A first pass shortly after boot so a restart doesn't leave the section
    // dark for a full interval.
    setTimeout(() => { pollOnce().catch(() => {}); }, 10000);
    timer = setInterval(() => { pollOnce().catch(() => {}); }, POLL_INTERVAL_MS);
    console.log(`[live-aarti] live detection every ${POLL_INTERVAL_MS / 60000} min`);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, pollOnce };
}

module.exports = {
  isConfigured,
  parseChannelInput,
  resolveChannelId,
  describeVideos,
  forceCheckChannel,
  createLiveAartiPoller,
  POLL_INTERVAL_MS,
};
