// POST /api/sentry/webhook — Sentry tells us a production issue appeared (or came back),
// and we open a GitHub issue labelled `sentry-alert` for it. Opening that issue is what
// starts the "Astrowani Sentry auto-fixer" Claude routine, which investigates and, when
// confident, opens a `sentry-fix/*` PR for the owner to merge from their phone.
//
//   Sentry (issue created / regressed)
//     -> this endpoint: verify signature, drop noise, dedupe, rate-limit
//     -> GitHub issue "Sentry <SHORT-ID>: <title>" + label sentry-alert
//     -> routine (GitHub issues.labeled trigger) -> PR -> owner merges -> deploy
//
// SETUP (one-time; the endpoint 503s until the first two are set):
//   SENTRY_WEBHOOK_SECRET  Client Secret of the Sentry Internal Integration whose
//                          Webhook URL is https://backend.astrowani.com/api/sentry/webhook
//                          with the "issue" webhook enabled.
//   GITHUB_ALERT_TOKEN     fine-grained GitHub token, this repo only, Issues: read & write.
//                          Deliberately NOT a contents/workflow token: this endpoint is on
//                          the public internet and must not be able to push code.
//   SENTRY_AUTH_TOKEN      (optional, read-only) lets us check the event's environment and
//                          skip development builds. Also powers the admin App Health card.
//
// Nothing here can change the app. The worst a forged-but-validly-signed call could do
// is open a GitHub issue, and the caps below bound even that.
const crypto = require('crypto');
const axios = require('axios');

const REPO = process.env.GITHUB_ALERT_REPO || 'astrowaniindia/Astrowani';
const LABEL = 'sentry-alert';
const SENTRY_ORG = 'astrowani';

// Each forwarded issue starts a paid cloud run. A crash storm or a noisy release must
// not start dozens of them; the owner gets the worst ones and the rest wait in Sentry.
const MAX_PER_HOUR = Number(process.env.SENTRY_ALERT_MAX_PER_HOUR) || 6;
const MAX_PER_DAY = Number(process.env.SENTRY_ALERT_MAX_PER_DAY) || 20;
// Same Sentry issue again inside this window is ignored (regressions re-fire).
const DEDUPE_MS = 24 * 60 * 60 * 1000;

const forwarded = new Map(); // sentry issue id -> timestamp
let sentTimes = [];

function signatureValid(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Pulls a uniform issue record out of either webhook shape Sentry sends. */
function extractIssue(resource, body) {
  const data = (body && body.data) || {};
  if (resource === 'issue' && data.issue) {
    const i = data.issue;
    return {
      id: String(i.id),
      shortId: i.shortId,
      title: i.title,
      culprit: i.culprit,
      level: i.level,
      project: i.project && (i.project.slug || i.project.name),
      permalink: i.permalink || i.web_url,
      count: i.count,
      userCount: i.userCount,
      environment: null,
    };
  }
  if (resource === 'event_alert' && data.event) {
    const e = data.event;
    const tags = Object.fromEntries((e.tags || []).map((t) => (Array.isArray(t) ? t : [t.key, t.value])));
    return {
      id: String(e.issue_id || ''),
      shortId: null,
      title: e.title,
      culprit: e.culprit,
      level: e.level,
      project: e.project && String(e.project),
      permalink: e.web_url || e.issue_url,
      count: null,
      userCount: null,
      environment: e.environment || tags.environment || null,
    };
  }
  return null;
}

/** Best-effort enrichment from Sentry's API; never blocks forwarding on failure. */
async function enrichFromSentry(issue) {
  const token = process.env.SENTRY_AUTH_TOKEN;
  if (!token || !issue.id) return issue;
  const headers = { Authorization: `Bearer ${token}` };
  try {
    const { data } = await axios.get(`https://sentry.io/api/0/issues/${issue.id}/`, { headers, timeout: 8000 });
    issue.shortId = issue.shortId || data.shortId;
    issue.title = issue.title || data.title;
    issue.project = (data.project && data.project.slug) || issue.project;
    issue.permalink = issue.permalink || data.permalink;
    issue.count = data.count;
    issue.userCount = data.userCount;
  } catch (_) {}
  if (!issue.environment) {
    try {
      const { data } = await axios.get(`https://sentry.io/api/0/issues/${issue.id}/events/latest/`, { headers, timeout: 8000 });
      const env = (data.tags || []).find((t) => t.key === 'environment');
      issue.environment = env ? env.value : null;
      const rel = (data.tags || []).find((t) => t.key === 'release');
      issue.release = rel ? rel.value : null;
    } catch (_) {}
  }
  return issue;
}

function withinCaps(now) {
  sentTimes = sentTimes.filter((t) => now - t < 24 * 60 * 60 * 1000);
  const lastHour = sentTimes.filter((t) => now - t < 60 * 60 * 1000).length;
  return lastHour < MAX_PER_HOUR && sentTimes.length < MAX_PER_DAY;
}

async function openGithubIssue(issue) {
  const gh = axios.create({
    baseURL: 'https://api.github.com',
    timeout: 10000,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_ALERT_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  // Survives restarts, unlike the in-memory map: an already-open alert for this
  // Sentry issue means the fixer is on it (or waiting on the owner).
  const key = issue.shortId || `sentry:${issue.id}`;
  const { data: open } = await gh.get(`/repos/${REPO}/issues`, { params: { labels: LABEL, state: 'open', per_page: 100 } });
  if ((open || []).some((i) => (i.title || '').includes(key))) return { skipped: 'already open' };

  const title = `Sentry ${key}: ${String(issue.title || 'error').slice(0, 180)}`;
  const body = [
    'Opened automatically from a production Sentry alert. The Claude auto-fixer picks this up,',
    'investigates, and either opens a `sentry-fix/*` PR or comments its findings here.',
    '',
    `- sentry_issue_id: ${issue.id}`,
    `- short_id: ${issue.shortId || 'unknown'}`,
    `- project: ${issue.project || 'unknown'}`,
    `- level: ${issue.level || 'unknown'}`,
    `- environment: ${issue.environment || 'unknown'}`,
    `- release: ${issue.release || 'unknown'}`,
    `- events: ${issue.count ?? 'unknown'}, users: ${issue.userCount ?? 'unknown'}`,
    `- culprit: \`${String(issue.culprit || '').slice(0, 300)}\``,
    `- sentry: ${issue.permalink || 'n/a'}`,
  ].join('\n');

  const { data: created } = await gh.post(`/repos/${REPO}/issues`, { title, body, labels: [LABEL] });
  return { created: created && created.html_url };
}

module.exports = function registerSentryWebhook(app) {
  app.post('/api/sentry/webhook', async (req, res) => {
    const secret = process.env.SENTRY_WEBHOOK_SECRET;
    if (!secret || !process.env.GITHUB_ALERT_TOKEN) {
      return res.status(503).json({ ok: false, message: 'Sentry webhook not configured' });
    }
    if (!signatureValid(req.rawBody, req.get('sentry-hook-signature'), secret)) {
      console.warn('[sentry-webhook] rejected a call with a bad or missing signature');
      return res.status(401).json({ ok: false, message: 'Bad signature' });
    }

    const resource = req.get('sentry-hook-resource');
    const action = req.body && req.body.action;
    // "created" = a brand-new issue; "unresolved" = it came back after being resolved.
    const wanted = (resource === 'issue' && (action === 'created' || action === 'unresolved'))
      || (resource === 'event_alert' && action === 'triggered');
    if (!wanted) return res.json({ ok: true, ignored: `${resource}:${action}` });

    let issue = extractIssue(resource, req.body);
    if (!issue || !issue.id) return res.json({ ok: true, ignored: 'no issue id' });

    // Answer Sentry now; everything below is our own business and can take seconds.
    res.json({ ok: true });

    try {
      const now = Date.now();
      for (const [id, t] of forwarded) if (now - t > DEDUPE_MS) forwarded.delete(id);
      if (forwarded.has(issue.id)) return;

      issue = await enrichFromSentry(issue);
      if (issue.environment === 'development') return;
      if (issue.level && !['error', 'fatal'].includes(issue.level)) return;
      if (!withinCaps(now)) {
        console.warn(`[sentry-webhook] cap reached; not forwarding ${issue.shortId || issue.id}`);
        return;
      }

      forwarded.set(issue.id, now);
      const result = await openGithubIssue(issue);
      if (result.created) sentTimes.push(now);
      console.log('[sentry-webhook]', issue.shortId || issue.id, result);
    } catch (err) {
      // Let the next occurrence try again.
      forwarded.delete(issue.id);
      console.error('[sentry-webhook] forwarding failed:', err.response ? `${err.response.status} ${JSON.stringify(err.response.data).slice(0, 200)}` : err.message);
    }
  });
};

module.exports._internal = { signatureValid, extractIssue, withinCaps };
