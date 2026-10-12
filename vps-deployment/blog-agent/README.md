# The Astrowani blog agent

Writes **three SEO-shaped articles a day**, in English and Hindi, with a photograph,
and publishes them to the `blogs` table — which is what the new Astrowani website's
blog section and the customer app both read.

Runs unattended on the VPS. Nobody reads an article before it is public, so the
quality gate in `src/blogAgent/quality.js` is the only thing standing between a bad
generation and the live site. Read that file before loosening anything in it.

---

## What it costs

**Nothing.** Every provider is on a free tier:

| What | Provider | Free allowance | What we use |
|---|---|---|---|
| Writing | Gemini (`gemini-2.5-flash`, falls back to `2.0-flash`) | per-key daily request quota, and **six keys** are chained | ~3–6 calls/day |
| Photographs | Pexels → Pixabay → Unsplash | 200/hr (Pexels), generous (Pixabay), 50/hr (Unsplash) | 3/day |
| Photographs, no key | a branded image drawn locally with sharp | unlimited | fallback |
| Hindi | Gemini writes it natively, in the same call | — | 0 extra calls |

Hindi is **not** routed through `src/autoTranslate.js`. That module uses MyMemory's
free endpoint, whose allowance is ~5k characters a day — three long articles is
~24k, so it would be exhausted by breakfast and the Hindi columns would sit empty.
Gemini writes the Hindi directly, which is both free and better.

---

## Install

```bash
sudo bash vps-deployment/blog-agent/install.sh
```

Three systemd timers, at **03:30 / 09:30 / 17:30 IST**, one article each. The
install script explains in its own header why three timers rather than one run of
three, and why systemd rather than cron.

It installs the schedule but **does not turn the agent on** — `enabled` defaults to
`false`, so the timers fire and do nothing until you say so. That is deliberate:
deploying code must never start publishing to a live site by itself.

### Keys

In the VPS `.env`, via the `set-backend-env.yml` GitHub Action (the `deploy` SSH
user cannot write that file directly — CLAUDE.md):

| Variable | Needed? | Notes |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | already set. Anon cannot write — every anon/authenticated write in `public` was revoked on 2026-09-23 |
| `GEMINI_API_KEY` | **yes** | already set. The other five `GEMINI_API_KEY_*` are used as fallbacks automatically |
| `PEXELS_API_KEY` | recommended | free, instant, no attribution required: <https://www.pexels.com/api/> |
| `PIXABAY_API_KEY` | optional | second source: <https://pixabay.com/api/docs/> |
| `UNSPLASH_ACCESS_KEY` | optional | its licence asks for a credit, which the agent adds automatically |
| `BLOG_SITE_BASE_URL` | **see below** | where the new site lives |

**Without any image key the agent still works** — it draws a branded gradient card
locally. Get a Pexels key; it takes two minutes and real photographs are worth it.

### `BLOG_SITE_BASE_URL` — the one setting that will need changing

Defaults to `https://shop.astrowani.com/test-site`, because that is where the new
website actually answers today. All 13 internal link targets were verified there
on 2026-10-13.

**When the new site takes over `astrowani.com`**, set
`BLOG_SITE_BASE_URL=https://astrowani.com` and restart. Every future article
follows. Articles already published keep their old absolute links, so run a
one-off `UPDATE` over `blogs.content_en` and `content_hi` at the same time.

---

## Operating it

```bash
cd /var/www/astrowani-monorepo/astrowani-backend

# What is configured, which keys it can see, and the last 15 runs
node --env-file=.env scripts/runBlogAgent.js --status

# Write a full article and print it. Stores NOTHING. Works while disabled.
node --env-file=.env scripts/runBlogAgent.js --dry-run

# Turn it on / off
node --env-file=.env scripts/runBlogAgent.js --enable
node --env-file=.env scripts/runBlogAgent.js --disable

# One article now
node --env-file=.env scripts/runBlogAgent.js --count 1

# A specific subject, e.g. to check the voice on something you care about
node --env-file=.env scripts/runBlogAgent.js --topic kundali-milan --dry-run

# Publish as drafts instead of live, for a review period
node --env-file=.env scripts/runBlogAgent.js --draft
```

Schedule and logs:

```bash
systemctl list-timers 'astrowani-blog-*'
journalctl -u 'astrowani-blog-agent@*' -n 200 --no-pager
systemctl start astrowani-blog-agent@1.service   # run a slot by hand
```

`scripts/runBlogAgent.js` is **safe to run from anywhere**, unlike `index.js`,
which must never be booted outside the VPS because `sessionManager` immediately
starts billing real customers against the production database.

### The config row

Everything tunable lives in `app_settings.blog_agent_config`. Code defaults are in
`src/blogAgent/config.js`, but **the row wins** — editing the defaults changes
nothing once a row exists. This has bitten this project twice before (the free-call
duration, the Dakshina amounts; CLAUDE.md DR and DU), so: to change a live value,
change the row.

```json
{
  "enabled": true,
  "publish": true,
  "articlesPerRun": 1,
  "maxPerDay": 4,
  "maxAttemptsPerArticle": 3,
  "relatedCount": 3,
  "limits": { "minWordsEn": 700, "minAstrowaniMentions": 4 }
}
```

`maxPerDay` is a hard ceiling counted from the ledger, and it is the guard against
a misconfigured timer or two overlapping schedules quietly publishing twenty
articles overnight. Raise it only together with the timers.

---

## What an article contains

Each post is built for search, not just written:

- **A target keyword** in the title, slug, first 80 words, an `<h2>`, the meta
  description and the image alt text — with a density **cap**, because there is no
  density that helps but there is one that hurts.
- **A real slug** (`?slug=mangal-dosh-in-the-kundali`, not `?id=dcf997a3-…`).
- **A meta description that is a sentence.** The five pre-existing posts have a
  2005-style keyword list in that column, which `Home.js` renders as the visible
  line under a blog card.
- **3 internal links woven into the prose**, chosen by category, so a Vastu article
  links to Vastu-relevant pages. Placed in the article's own sentences, not in the
  boilerplate at the bottom where every low-effort auto-blog puts them.
- **Links to 3 recent articles.** This is the part that compounds: every new post
  gives three older posts another inbound link, so nothing stays orphaned and the
  whole section is reachable in a couple of hops.
- **A visible FAQ section plus `FAQPage` JSON-LD**, which is what produces the
  expandable question rows under a search result.
- **`Article` + `BreadcrumbList` JSON-LD**, with the publisher, logo and image.
- **Astrowani named 4–7 times**, naturally, enforced at both ends.
- **A full Hindi version** in Devanagari, which roughly doubles the keyword surface.
- A 1200×675 JPEG with EXIF stripped, in `app-images/blogs/` — the same bucket and
  folder the admin dashboard already uses.

### The remaining SEO blocker, which the agent cannot fix

`blog.html` and `blog-post.html` render **entirely in JavaScript**. Google does
execute JavaScript, but on a second pass that runs days to weeks behind the first,
and it only ever renders URLs it already knows.

This is mitigated, not solved:

- **`GET /api/blogs/sitemap.xml`** (`src/blogSitemap.js`) lists every article
  directly, which takes rendering out of the *discovery* path. **Submit it in Google
  Search Console** once the site is on its final domain, and point `robots.txt` at
  it. Nothing the agent writes will be found quickly until you do.
- Canonical, Open Graph and Twitter tags are set per article by `aw/blog.js`.

What would actually solve it is server-rendered article pages — prerendering at
publish time, or an nginx route that serves a static HTML file per post. That is a
separate piece of work on the website, not on the agent, and it is the single
highest-value SEO change left.

---

## When something looks wrong

**"It has gone quiet."** `--status` first. A quiet agent and a broken agent look
identical from outside, which is why the ledger records failures and rejections and
not only successes.

```sql
select started_at, status, topic_title, word_count, rejections, error
  from blog_agent_runs order by started_at desc limit 20;
```

- `status = 'rejected'` with the same rule repeating → the prompt has drifted or a
  threshold is too tight. The `rejections` column names every rule that failed.
- `status = 'failed'` with a Gemini error → every model and key refused. The message
  lists all of them with their status codes. Usually quota; it clears.
- `ran: false, reason: 'disabled'` → the switch is off.
- `reason: 'ledger-missing'` → `sql/blog_agent.sql` was not applied. The agent
  **refuses to publish** in that state rather than restarting from the top of the
  topic catalogue on every run.

**Topic exhaustion.** 2,383 topics, about **2.2 years** at three a day. `--status`
prints how many are left and how many days that is. When it runs out the agent
*stops* and says so, rather than silently rewriting old subjects — republishing
under a new title would damage the rankings it spent two years building. Extend
`SEED_TOPICS` or add a family in `src/blogAgent/topics.js` well before then.

**An article you want gone.** Delete the row; the ledger keeps its `topic_key` so
the subject is not retried.

```sql
update blogs set is_published = false where slug = 'the-slug';   -- hide
delete from blogs where slug = 'the-slug';                       -- remove
```

---

## Tests

```bash
cd astrowani-backend

# Pure logic. No network, no database, no keys.
node scripts/testBlogAgent.js            # 172 checks

# Live database + storage, model stubbed. Publishes a DRAFT and deletes it.
node --experimental-websocket --env-file=.env scripts/testBlogAgentLive.js   # 83 checks
```

`--experimental-websocket` is needed only on Node 20, which has no global
`WebSocket` for `@supabase/realtime-js` (CLAUDE.md). Not needed on Node 22+.

The live suite asserts its own teardown and checks it through the storage API
rather than the public URL — a deleted object keeps answering 200 from Supabase's
CDN for a while, which reports a leak that is not there.
