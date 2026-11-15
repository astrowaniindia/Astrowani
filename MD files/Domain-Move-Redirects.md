# IMPORTANT — old astrowani.com addresses when the new site moves in

**Written 2026-11-16. Read this before astrowani.com is switched from WordPress to the new site.**

## The short version

WordPress addresses end in a slash: `astrowani.com/privacy-policy/`.
The new site's end in `.html`: `astrowani.com/privacy-policy.html`.

**Without redirects, every old address breaks the moment the domain moves.** That includes
links inside both apps, the URLs saved in App Store Connect, Play Console and the Meta app,
and every page Google has indexed.

**The fix is ready** and is installed once on the server, at the same time as the move:

| File | What it is |
|---|---|
| `vps-deployment/nginx/wordpress-redirects.conf` | The redirect rules (34 rules, all 83 old addresses) and install steps |
| `vps-deployment/nginx/wordpress-old-urls.txt` | Every address the old site published (from its sitemap, 2026-11-16) |
| `vps-deployment/scripts/check-wordpress-redirects.js` | Checks every address. Run with `--live` after the move |

Every redirect is a **301 (permanent)**, so Google moves the old page's ranking to the new one.
Each rule works with or without the trailing slash and in any letter case, the way WordPress did.

## The pages that MUST work (apps and store consoles link to these)

| Old address | Goes to |
|---|---|
| /privacy-policy/ | /privacy-policy.html |
| /term_conditions/ | /terms-and-conditions.html |
| /refund_cancellation/ | /refund-cancellation.html |
| /delete-account/ | /delete-account.html |
| /child-safety/ | /child-safety.html |
| /safety-guidelines/ | /safety-guidelines.html |
| /report-vulnerability/ | /report-vulnerability.html |
| /about-us/ | /about.html |
| /faq/ | / (the homepage has the FAQ) |

These are in: both apps, App Store Connect (Privacy Policy URL, both apps), Play Console
(privacy policy, account deletion, child safety), and the Meta developer app
(privacy / terms / data deletion). **With the redirects in place, none of those need changing.**
Updating them to the `.html` addresses later is tidier, but not urgent.

## Everything else

| Old address | Goes to |
|---|---|
| /home/ | / |
| /contact-us/, /our-achivements/ | /about.html |
| /our-services/ | /consult.html |
| /videos/, /special/, /elementor-9/ | / |
| /astrologers/, /astrologers-5/ | /astrologers.html |
| 9 astrologer profiles (/astro-dilip-sharma/, /tarot-sampada/, /numerologist-shivani/ …) | /astrologers.html (no profile pages on the new site yet) |
| /astrologer-ragistration/ | shop.astrowani.com/astrologer-registration/ |
| /book-call/, /book-appointment/, /booking-without-astrologer/ | /book-call.html |
| /matchmaking/ | /marriage.html |
| /courses/ | /courses.html |
| /blog/, /blog-2/, /new-blog/, /category/… | /blog.html |
| Post: Special Saturn Remedy Package | that article on the new blog |
| Post: Vastu Surely affects our Life | /vastu.html |
| Post: Your Birth Chart's planets… | /kundli-reading.html |
| Post: क्या है राहु काल? | /panchang.html |
| Post: Star's Voice | /blog.html |
| Gemstone products, /energized-gemstones/ | shop.astrowani.com/gemstones/ |
| Puja products, /book-puja/ | shop.astrowani.com/pujas/ |
| Vastu products and pyramids | shop.astrowani.com/vastu/ |
| Other products, /shop/, /wanishop/, /rudraksha/, categories, tags | shop.astrowani.com/ |

Old posts with no matching article go to the **page on the same subject**, not the blog index.
That keeps more of their search value.

## Day-of-move checklist

1. **Before the move:** re-fetch `https://astrowani.com/sitemap.xml` and compare it with
   `wordpress-old-urls.txt`. If WordPress gained pages, add them to the list and the rules.
   `node vps-deployment/scripts/check-wordpress-redirects.js` fails on any address with no rule.
2. Install the rules (steps at the top of `wordpress-redirects.conf`): copy to
   `/etc/nginx/conf.d/`, add the one `if` line to the astrowani.com server block,
   run `nginx -t`, then reload.
3. Run `node vps-deployment/scripts/check-wordpress-redirects.js --live`. It must say **all good**.
   It checks each old address gives a 301 to the right page and that the page answers 200.
4. Change `SITE_BASE` in `astrowani-website/aw/apply-seo.js` and `BLOG_SITE_BASE_URL` on the
   backend, re-run apply-seo, and rewrite the absolute links in `blogs.content_en/content_hi`
   (CLAUDE.md, EN1 and EB).
5. Submit the new sitemap in Google Search Console. Ideally verify the domain there **before** the
   move, to keep a baseline of the old site's search traffic.

## What redirects cannot save — decide before the move

- **Images under `/wp-content/uploads/`.** These are indexed in Google Images and may be linked
  from old emails and posts. They 404 once WordPress is gone. To keep them, copy that folder
  to the new server at the same path before switching.
- **Anything stored only in WordPress:** WooCommerce orders, customer accounts, form entries,
  comments. Take a full WordPress backup (files and database) and keep it.
- **The new site's own links to `/astrologer-ragistration/`** (in about 20 footers) will still
  work through the redirect. Pointing them straight at
  `shop.astrowani.com/astrologer-registration/` saves one hop.

## Not tested yet

The rules are tested against a copy of nginx's matching logic (`check-wordpress-redirects.js`,
offline). That covers every address, every target, and a check that no rule catches one of
the new site's own pages. The checker was also confirmed to **fail** on a missing rule, a
wrong target, and an over-broad rule.

**`nginx -t` has not been run on this file.** There is no nginx on the development machine. Run it
on the VPS before reloading; the install steps above include it.
