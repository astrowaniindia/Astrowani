# Can we go back to the Supabase Free plan?

Measured against production (`fxpoustnddrgumhwdcma`, org `oikugtlnwlkeoqsllfaz`, plan **pro**)
on **2026-11-13**, over a rolling 24 h window of `edge_logs` plus live DB/storage reads.
Every figure below is measured, not estimated, unless it says otherwise.

## Short answer

**No — not as the app is built today, and the blocker is not the one you'd expect.**

Two independent reasons:

1. **Cached egress is 2.3x over the Free cap.** 375 MB/day of cached egress =
   **~11.3 GB/month against Free's 5 GB cached quota.** We'd be restricted around
   **day 13** of every billing cycle, exactly as in October (EC).
2. **Image transformations do not exist on Free.** Supabase's own quota table says
   *"Storage Images Transformed — Unavailable on Free Plan"*. **20,083 of our 21,853
   daily storage requests (282 of 380 MB) go through `/storage/v1/render/image`.**
   On Free that whole delivery path stops, and the fallback is the raw originals —
   the exact thing that caused the October block at 735 MB/day.

So Free is not "tight", it is architecturally unavailable while images are served
by Supabase. **It becomes genuinely safe only if images move off Supabase.** The
middle path (stay on Supabase, cut bytes) gets us to ~3.9 GB/month — under the cap,
but with thin headroom against traffic that has grown 75% in three weeks.

## Where we stand against every Free limit

| Usage item | Free quota | Measured now | Verdict |
|---|---|---|---|
| **Cached egress** | **5 GB/mo** | **375 MB/day → 11.3 GB/mo** | **2.3x OVER** |
| Uncached egress | 5 GB/mo | ~5 MB/day → 0.15 GB/mo | ok, 3% |
| **Images transformed** | **unavailable** | **20,083 req/day, ~98 distinct sources** | **not offered at all** |
| Database size | 500 MB | **71 MB** | ok, 14% |
| Storage size | 1 GB | **285 MB** (1,064 objects) | ok, 28% |
| Monthly active users | 50,000 | **0** (`auth.users` is empty — we use our own JWT) | n/a |
| Edge function invocations | 500,000/mo | 524/day → ~16K/mo | ok, 3% |
| Realtime messages | 2 million/mo | est. well under (see below) | probably ok |
| Realtime peak connections | **200** | **not measurable from here** | UNMEASURED |

### The one number I could not measure

**Realtime peak concurrent connections (Free cap 200).** 16 tables are in the
`supabase_realtime` publication (`astrologers`, `chat_messages`, `chat_sessions`,
`call_requests`, `chat_requests`, `notifications`, `orders`, `reviews`,
`favorites`, `live_sessions`, `banners`, `blogs`, `categories`, `thoughts`,
`remedy_items`, `remedy_categories`) and every customer app holding a list screen
subscribes. 265 distinct devices were seen in 24 h; concurrent peak is plausibly
20–50 today, but this is the ceiling that bites first as users grow and it is only
readable from the dashboard's Realtime usage chart. **Check it there before
deciding.** Message *count* looks safe: only ~1,000 row inserts/day across the
churny tables plus 107 billing UPDATEs, so even a 20x subscriber fan-out is ~0.7M/mo.

## Where the 380 MB/day actually goes

**99% of it is cached (`cf_cache_status: HIT` — 375.2 MB over 21,787 requests)**, so
it lands squarely on the Cached-egress quota, the same one that hard-blocked the
project in October. REST is irrelevant: **193,091 requests/day for 2 MB total.**

By surface:

| Mode | Folder | Requests | Distinct files | Avg KB | MB/day |
|---|---|---|---|---|---|
| render 300px | astrologer-profiles | 10,580 | 45 | 10 | **103.4** |
| render 520px | card-image | 2,191 | 10 | 35 | **75.4** |
| **raw** | **astrologer-profiles** | **1,145** | **61** | **64** | **71.0** |
| render | profile-photo | 2,429 | 10 | 10 | 22.8 |
| **raw** | **profile-photo** | **479** | **7** | **37** | **17.2** |
| render 1080px | banner-image-url-or- | 221 | 2 | 75 | 16.1 |
| render 240px | categories | 1,792 | 8 | 9 | 15.7 |
| render | blogs | 707 | 4 | 22 | 15.3 |
| render | profile-photo-url-or | 876 | 4 | 12 | 10.1 |
| render 1080px | banner-image-english | 215 | 1 | 40 | 8.3 |
| render 1080px | banner-image-hindi-o | 210 | 1 | 38 | 7.8 |
| **raw** | chat-images | 46 | 23 | 135 | 6.1 |
| render 240px | icon-image-url-or-up | 448 | 2 | 9 | 4.1 |
| others | — | — | — | — | ~6 |

By transform width:

| Width | Requests | Distinct sources | Avg KB | MB/day |
|---|---|---|---|---|
| 300 (AVATAR) | 13,869 | 59 | 10 | 136.3 |
| 520 (CARD) | 3,076 | 15 | 31 | 93.1 |
| 1080 (BANNER) | 646 | 4 | 51 | 32.3 |
| 240 (ICON) | 2,240 | 10 | 9 | 19.8 |
| 120 (AVATAR_SMALL) | 252 | 10 | 2 | 0.5 |

Note the ~98 distinct source images being transformed: **Pro includes exactly 100**,
then $5/1000. We are sitting on that line right now, on the plan we are paying for.

## Two real defects found while measuring

### 1. ~94 MB/day of profile photos still bypass `imageUrl.js`

**87.4 of the 97.7 MB of raw `object/public` egress is `okhttp/4.12.0`** — the Android
customer app's image loader, over 288 distinct IPs. So an API response is still
handing the app raw storage URLs at 64 KB where the same face through the 300px
render is **10 KB**. The call sites:

- `src/freeCallRoutes.js:1090`, `:1371`, `:1911`, `:3030` — `image: a.profile_pic_url || ''`
  and `astrologerImage: astro?.profile_pic_url || ''`. **This is the free instant-call
  screen**, i.e. the highest-traffic surface for every new install, showing a grid of
  astrologer faces at full resolution. (`:1406`, `:1447`, `:1552`, `:2929`, `:3019`
  select the column for those same responses.)
- `index.js:7804` and `:7873` — `httpPhotoOnly(a?.profile_pic_url)` in
  `GET /api/customer/chat-threads` and `/api/customer/chat-threads/:astrologerId`.

`src/freeCallRoutes.js` does not import `src/imageUrl.js` at all — only
`astroRoutes.js`, `blogPublic.js`, `sessionReadRoutes.js` and `index.js` do.

**Fix: wrap those returns in `avatarUrl()`. Backend only, no OTA, no app release.**
Measured saving: **~94 MB/day (-25%)**, taking 380 → ~286 MB/day on its own.

### 2. Every image was cached for ONE HOUR — FIXED 2026-11-13

```
app-images                           963 objects   87 MB   max-age=3600
hot-updater-storage-for-astrowani     54 objects  104 MB   max-age=max-age=31536000
hot-updater-storage-..-vendor         47 objects   94 MB   max-age=max-age=31536000
```

> **CORRECTION to the first version of this file, which said the 101 malformed
> objects were "touched by the October recompress pass". They were not.** The split
> is by BUCKET and it is clean: all 963 `app-images` objects were on `max-age=3600`,
> and the 101 malformed ones are **OTA `bundle.zip` files** in the two
> `hot-updater-storage-*` buckets, written by the `hot-updater` library, not by our
> code. They are not images, they are not part of the 380 MB/day, and a device
> downloads a bundle once per release — so that half is cosmetic. **The real finding
> was the other one: every image in the app was cached for an hour.**

`max-age=max-age=31536000` is a doubled prefix: storage-js emits
`cache-control: max-age=${cacheControl}` verbatim, so passing the string
`'max-age=31536000'` produces an invalid directive that caches nothing. Our own
sites had the opposite bug — **not one of them set `cacheControl` at all**, so they
all inherited the SDK default of `'3600'`. Confirmed on the wire: both the raw
object AND the render endpoint served `Cache-Control: public, max-age=3600`, so the
transformed response inherits the source object's header.

**Fixed.** `imageUrl.UPLOAD_CACHE_CONTROL = '31536000, immutable'` is now passed by
every production upload path, and the 667 existing objects in the shared-screen
folders were repaired with `scripts/repairStorageCacheControl.js` (`chat-images/`
and `voice-notes/` deliberately left alone — one-to-one user content fetched once
or twice in its life, so nothing to gain). Verified on the wire at the widths the
app actually requests.

**Honest sizing, because the obvious guess is wrong:** only **7% of egress
(26.7 MB/day) is the same device re-fetching the same URL inside 24 h**
(19,706 device+URL pairs for 21,879 requests). So this is worth ~27 MB/day
same-day plus more across days for returning users — real, free, and worth doing,
but **not** the big lever. Filenames are already content-unique (timestamp + hash),
so `max-age=31536000, immutable` is safe.

## What it would take to fit inside 5 GB/month

Target: under **167 MB/day**. We are at 380.

| Step | Saving | Effort | Needs an app release? |
|---|---|---|---|
| 1. Wrap the raw `profile_pic_url` returns in `avatarUrl()` | **-94 MB/day** | ~1 hour | No — backend only |
| 2. Pre-generate WebP derivatives at upload; serve `object/public` | **-~130 MB/day** | 1–2 days | No — URLs come from the API |
| 3. ~~`cacheControl`~~ **DONE 2026-11-13** | **-27 MB/day** | done | No |
| | **≈ 129 MB/day ≈ 3.9 GB/mo** | | |

Step 2 is the one that matters twice over: it both cuts bytes (avatars 10→~5 KB,
cards 31→~14 KB, banners 51→~22 KB at WebP q70–75) **and removes the dependency on
the transformation service, which Free does not have.** Resize at upload in
`src/uploadRoutes.js` (which already caps source dimensions and already runs sharp),
write one derivative per surface width, and have `src/imageUrl.js` point at the
stored derivative instead of building a `render/image` URL. Keep `WIDTH` exactly as
it is — those numbers were measured against the real screens.

**That lands at roughly 3.9 GB against a 5 GB cap — under, but only ~20% headroom.**

## Why I would not actually do it

Three things make that 20% headroom a bad bet:

- **Traffic is growing fast.** REST requests went from 110,000/day (measured
  2026-10-19) to **193,091/day** now — **+75% in three weeks** — and two iOS
  listings are waiting in review, neither of which has sent a single user yet.
  3.9 GB becomes 5+ GB inside a month or two, and then we are blocked again.
- **There is no grace period left.** Supabase's Fair Use Policy gives one. It was
  spent in October. Exceeding a Free quota again means immediate restriction — which
  on this project means **every API request returning 402 and the apps going dark**,
  for however long remains in the cycle.
- **Free has no database backups.** Pro was bought in October for egress, but daily
  backups came with it and this database holds customer wallets, both ledgers,
  withdrawal requests and order history. Going Free gives that up for ~$25/month.

## The option that actually makes Free safe: move images to R2

**Cloudflare R2 charges nothing for egress, ever.** We already use it for OTA
bundles (`astrowani-ota-customer` / `-vendor`) and `src/objectStorage.js` already
speaks to it with `aws4fetch`.

Put the image derivatives there instead of in Supabase storage and the numbers become:

| | Supabase cached egress | Free cap | Headroom |
|---|---|---|---|
| today | 11.3 GB/mo | 5 GB | over |
| after steps 1–3 | ~3.9 GB/mo | 5 GB | 20% |
| **images on R2** | **~0.06 GB/mo** (REST only) | 5 GB | **99%** |

Storage size drops under 100 MB too, and the transformation dependency disappears.
Every Free quota then has 50x+ headroom and stays there however much we grow —
because the thing that grows is image delivery, and image delivery would no longer
touch Supabase.

**What would still be given up by going Free:** daily backups (the real cost),
nano compute, 1-day log retention instead of 7, and no spend-cap safety net —
an overage becomes a hard block rather than a bill. Realtime peak connections
(200) would also become the new growth ceiling and should be read off the
dashboard before committing.

## Recommendation

1. **Do steps 1–3 now regardless of the plan decision.** 380 → ~129 MB/day. On Pro
   that is pure headroom and a faster app; it is also the prerequisite for any Free
   move. Step 1 alone is an hour's work for a quarter of the bill.
2. **Then move image derivatives to R2.** That is the change that makes Free a real
   option rather than a marginal one, and it is worth doing on Pro anyway.
3. **Only then consider downgrading** — and decide separately whether losing daily
   backups is acceptable for a database holding money. If the answer is no, keep Pro
   and bank the egress reduction as safety margin instead.

## How to re-measure

Egress by surface (last 24 h), via the Supabase MCP `query_logs` on `edge_logs`:

```sql
select
  if(log_attributes['request.path'] like '/storage/v1/render/image%','render','raw') as mode,
  splitByChar('/', log_attributes['request.path'])[if(log_attributes['request.path'] like '/storage/v1/render/image%',8,7)] as folder,
  count(*) as reqs,
  uniqExact(log_attributes['request.path']) as distinct_files,
  round(sum(toUInt64OrZero(log_attributes['response.headers.content_length']))/1048576.0,1) as mb,
  round(avg(toUInt64OrZero(log_attributes['response.headers.content_length']))/1024.0) as avg_kb
from logs
where source='edge_logs' and log_attributes['request.path'] like '/storage/v1/%'
group by mode, folder order by mb desc
```

Cache-control state of every object:

```sql
select coalesce(metadata->>'cacheControl','(none)') as cache_control,
       count(*) as objects,
       pg_size_pretty(sum((metadata->>'size')::bigint)) as bytes
from storage.objects group by 1 order by objects desc;
```

Share of egress that is a same-device repeat fetch (the cache-control lever):

```sql
select sum(hits) as reqs,
  round(sum(b)/1048576.0,1) as total_mb,
  round(sum(if(hits>1, b*(hits-1)/hits, 0))/1048576.0,1) as mb_from_repeats
from (
  select log_attributes['request.headers.cf_connecting_ip'] as ip,
         concat(log_attributes['request.path'], log_attributes['request.search']) as u,
         count(*) as hits,
         sum(toUInt64OrZero(log_attributes['response.headers.content_length'])) as b
  from logs where source='edge_logs' and log_attributes['request.path'] like '/storage/v1/%'
  group by ip, u) as per
```
