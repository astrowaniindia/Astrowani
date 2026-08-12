// Shared TTL cache for admin-authored, rarely-changing content endpoints —
// categories, gifts, remedies, astro-services, banners, thoughts. Each of
// these is hit on nearly every Home-screen load (2026-08-13 perf audit,
// finding D1) but only changes when an admin edits it via astrowani-admin,
// so a short cache removes the repeat reads with no meaningful staleness
// cost. Invalidated from adminRoutes.js's crud() factory on any write.
//
// A single shared instance (rather than one per endpoint) so adminRoutes.js
// can invalidate by resource-name prefix without importing index.js.
const { TtlCache } = require('./ttlCache');

const contentCache = new TtlCache({ ttlMs: 60_000, maxEntries: 50 });

module.exports = { contentCache };
