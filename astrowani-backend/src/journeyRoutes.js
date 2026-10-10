/**
 * The customer journey, start to finish, in one request.
 *
 * Replaces nothing and competes with nothing: the Analytics page's existing cards each
 * answer a specific question ("how is the wallet funnel doing"), and they stay. This
 * answers the question none of them could — "what does a customer actually DO, in
 * order, from install to leaving" — across EVERY event the app fires rather than the
 * quarter of them those cards happened to name.
 *
 * ONE QUERY, NOT ONE PER STAGE. All ~230 events are counted in a single HogQL round
 * trip and grouped in Node. The page that hosts this used to fire 26 PostHog queries on
 * open; adding seventeen more, one per stage, would have been repeating the mistake
 * this work exists to fix.
 *
 * See journeyCatalogue.js for the ordered list itself and why it is data rather than
 * seventeen hand-written queries.
 */
const { requireAdmin } = require('./adminRoutes');
const postHog = require('./postHogRoutes');
const { STAGES, EVENTS } = require('./journeyCatalogue');

const h = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(`[journey] ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ success: false, message: 'Could not load the customer journey' });
});

/** YYYY-MM-DD or null. Rejects anything else rather than interpolating it. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function rangeFrom(req) {
  const from = ISO_DATE.test(String(req.query.from || '')) ? req.query.from : null;
  const to = ISO_DATE.test(String(req.query.to || '')) ? req.query.to : null;
  if (from && to) return { from, to };
  // Default: the last 7 days, matching the page's own default preset.
  const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const today = new Date();
  const fmt = (x) => x.toISOString().slice(0, 10);
  return { from: fmt(d), to: fmt(today) };
}

module.exports = function registerJourneyRoutes(app) {
  /**
   * GET /api/admin/analytics/journey?from=YYYY-MM-DD&to=YYYY-MM-DD
   *
   * Returns every stage in order, every event within it in order, with how many PEOPLE
   * did it and how many TIMES it happened. Events with no activity are still returned,
   * marked `seen: false` — "nobody did this" is a finding, and silently dropping the
   * row makes a dead step look like a step that does not exist.
   */
  app.get('/api/admin/analytics/journey', requireAdmin, h(async (req, res) => {
    const { from, to } = rangeFrom(req);

    if (!postHog.isConfigured()) {
      return res.status(200).json({
        success: true, available: false, range: { from, to },
        message: 'PostHog is not configured, so there is no event history to read.',
        stages: [],
      });
    }

    const names = EVENTS.map((e) => `'${e.event}'`).join(', ');
    // ${postHog.ENV_FILTER} is mandatory on every query here — production only, from
    // the admin's analytics start date, minus excluded customers.
    const sql = `
      SELECT event, count() AS total, count(DISTINCT person_id) AS people
      FROM events
      WHERE event IN (${names})
        AND ${postHog.ENV_FILTER}
        AND timestamp >= toDateTime('${from} 00:00:00')
        AND timestamp <= toDateTime('${to} 23:59:59')
      GROUP BY event
    `;

    let by = new Map();
    try {
      const rows = await postHog.runHogQL(sql);
      by = new Map((rows || []).map((r) => [r[0], { total: Number(r[1]) || 0, people: Number(r[2]) || 0 }]));
    } catch (err) {
      console.error('[journey] HogQL failed:', err.message);
      return res.status(200).json({
        success: true, available: false, range: { from, to },
        message: `Could not read the event history: ${err.message}`,
        stages: [],
      });
    }

    const stages = STAGES.map((s) => {
      const events = EVENTS.filter((e) => e.stage === s.key).map((e) => {
        const hit = by.get(e.event);
        return {
          event: e.event,
          label: e.label,
          note: e.note || null,
          drop: !!e.drop,
          people: hit?.people || 0,
          total: hit?.total || 0,
          seen: !!hit,
        };
      });
      // The stage's headline number is the most people who reached ANY non-drop step in
      // it. Summing would double-count one person who did several things, and taking
      // the first step would under-report a stage people enter sideways (a push
      // notification drops somebody straight into the middle of one).
      const reach = Math.max(0, ...events.filter((e) => !e.drop).map((e) => e.people));
      return {
        ...s,
        events,
        peopleReached: reach,
        eventsWithActivity: events.filter((e) => e.seen).length,
        eventsTotal: events.length,
      };
    });

    return res.status(200).json({
      success: true,
      available: true,
      range: { from, to },
      // Honest about its own scope: this is PostHog, so it is subject to analytics
      // consent and the environment/exclusion filters, and is NOT the money record.
      source: 'posthog',
      totals: {
        eventsTracked: EVENTS.length,
        eventsWithActivity: [...by.keys()].length,
        stages: stages.length,
      },
      stages,
    });
  }));

  console.log(`[journey] route registered: GET /api/admin/analytics/journey (${EVENTS.length} events, ${STAGES.length} stages)`);
};
