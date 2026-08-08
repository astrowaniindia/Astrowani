// astrowani-backend/src/ttlCache.js
//
// A tiny in-process TTL cache with single-flight de-duplication.
//
// WHY: the customer app's four list screens each subscribe to *every* change on
// the astrologers table, unfiltered, and refetch the whole list on any of them.
// One astrologer flipping their availability toggle therefore fans out to every
// connected client at once, and each answers by calling /api/astrologers — which
// costs five sequential unindexed queries. At a thousand concurrent users that
// is hundreds of identical requests per second, all asking for the same bytes.
//
// Two mechanisms here, and the second matters more than the first:
//   - TTL: repeat calls inside the window are served from memory.
//   - Single-flight: when N requests miss simultaneously (exactly the thundering
//     herd above), only ONE hits the database; the rest await that same promise.
//     Without this, a cache miss under load is just as bad as no cache at all.
//
// This is safe for the astrologer list specifically because correctness does not
// depend on it being current: a stale "available" entry cannot cause a bad call,
// since POST /api/call/initiate re-checks busy state server-side and returns 409.
// The list is a hint; the initiate endpoint is the authority.
//
// Deliberately in-process, not Redis: with one backend process this is all that
// is needed. If the API is ever scaled to multiple instances the only cost is
// each instance holding its own copy, which is still correct.

class TtlCache {
  constructor({ ttlMs = 10_000, maxEntries = 500 } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.store = new Map();   // key -> { value, expiresAt }
    this.inflight = new Map(); // key -> Promise
    this.hits = 0;
    this.misses = 0;
    this.coalesced = 0;
  }

  /**
   * Return the cached value for `key`, or call `producer()` to make one.
   * Concurrent misses for the same key share a single producer call.
   */
  async get(key, producer, ttlMs = this.ttlMs) {
    const now = Date.now();
    const hit = this.store.get(key);
    if (hit && hit.expiresAt > now) {
      this.hits++;
      return hit.value;
    }

    const pending = this.inflight.get(key);
    if (pending) {
      this.coalesced++;
      return pending;
    }

    this.misses++;
    const promise = (async () => {
      try {
        const value = await producer();
        // Evict oldest first — Map preserves insertion order.
        if (this.store.size >= this.maxEntries) {
          const oldest = this.store.keys().next().value;
          this.store.delete(oldest);
        }
        this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, promise);
    return promise;
  }

  /** Drop cached entries. With no argument, drops everything. */
  invalidate(prefix) {
    if (prefix == null) { this.store.clear(); return; }
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  stats() {
    const total = this.hits + this.misses + this.coalesced;
    return {
      entries: this.store.size,
      hits: this.hits,
      misses: this.misses,
      coalesced: this.coalesced,
      hitRate: total ? +(((this.hits + this.coalesced) / total) * 100).toFixed(1) : 0,
    };
  }
}

module.exports = { TtlCache };
