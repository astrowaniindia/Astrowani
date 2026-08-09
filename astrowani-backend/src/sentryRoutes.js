// ─────────────────────────────────────────────────────────────────────────────
// App-health proxy for the admin Analytics page — Sentry issue counts per app.
//
// Same least-privilege shape as postHogRoutes.js/bugAgentRoutes.js: a narrowly-scoped
// token held server-side, never the admin JWT, graceful 503 (not a crash) when unset.
// Uses the exact Sentry Issues API endpoint the bug-scan skill already relies on
// (GET /api/0/projects/{org}/{project}/issues/), so this is a proven-working call
// shape, not a guess — see .claude/skills/bug-scan/SKILL.md.
//
// SENTRY_AUTH_TOKEN needs its own Internal Integration token created in the Sentry
// org settings, scoped to Issue & Event: Read + Project: Read only — the same
// least-privilege reasoning as BUG_AGENT_TOKEN and the PostHog Personal API Key.
// Do NOT reuse the bug-scan cloud routine's embedded token for this; that one is
// meant for that routine specifically.
// ─────────────────────────────────────────────────────────────────────────────
const axios = require('axios');
const { requireAdmin } = require('./adminRoutes');

const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
const SENTRY_ORG = 'astrowani';
// Project slugs from CLAUDE.md subsystem M — one per app.
const PROJECTS = { customer: 'react-native', vendor: 'astrowani-vendor' };

function isConfigured() {
  return !!SENTRY_AUTH_TOKEN;
}

const h = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(`[sentryRoutes] ${req.method} ${req.path} error:`, err.response?.data || err.message);
  res.status(502).json({ success: false, message: 'Sentry query failed' });
});

async function fetchIssueCount(project, query, statsPeriod) {
  const { data } = await axios.get(
    `https://sentry.io/api/0/projects/${SENTRY_ORG}/${project}/issues/`,
    {
      headers: { Authorization: `Bearer ${SENTRY_AUTH_TOKEN}` },
      params: { statsPeriod, query, per_page: 100 },
      timeout: 15000,
    }
  );
  // Sentry doesn't return a total count header for this endpoint reliably across
  // plans, so we count the page — fine for this app's issue volume (dozens, not
  // thousands); if that ever changes, switch to the cursor-paginated Link header.
  return Array.isArray(data) ? data.length : 0;
}

module.exports = function registerSentryRoutes(app) {
  app.get('/api/admin/analytics/app-health', requireAdmin, h(async (req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({ success: false, message: 'App health not configured (missing SENTRY_AUTH_TOKEN)' });
    }
    const days = Math.min(parseInt(req.query.days, 10) || 7, 90);
    const statsPeriod = `${days}d`;

    const results = {};
    for (const [appName, project] of Object.entries(PROJECTS)) {
      const [unresolved, newIssues] = await Promise.all([
        fetchIssueCount(project, 'is:unresolved', statsPeriod),
        fetchIssueCount(project, `is:unresolved firstSeen:-${days}d`, statsPeriod),
      ]);
      results[appName] = { unresolved, newIssues };
    }

    return res.json({ success: true, days, ...results });
  }));

  console.log(isConfigured()
    ? '[sentryRoutes] App health route registered under /api/admin/analytics/app-health'
    : '[sentryRoutes] App health route registered but SENTRY_AUTH_TOKEN is unset — will 503 until configured');
};
