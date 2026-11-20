-- Launch day, 2026-11-20: point the blog articles' internal links at astrowani.com.
--
-- RUN THIS ONLY AFTER astrowani.com IS SERVING THE NEW SITE (step 4 of
-- MD files/Website-Launch-Runbook-2026-11-20.md). Before that, these links would
-- send readers — on the website AND in the customer app's BlogScreen, which
-- renders the same content_en/content_hi — to the old WordPress site, where
-- none of these pages exist.
--
-- WHY IT IS NEEDED. The blog agent writes ABSOLUTE internal links (the same
-- HTML renders on the website, in the app and in the admin preview, and a
-- relative link only works in the first). Every article written before the move
-- therefore names https://shop.astrowani.com/test-site/... — measured
-- 2026-11-20: all 8 published articles, in both content_en and content_hi, and
-- in no other column. The preview address 301s to astrowani.com after launch,
-- so the links would still work; this removes the extra hop for readers and the
-- "internal link to a redirect" signal for search engines.
--
-- Every target is a plain prefix swap (checked: pages, /blog/<slug>,
-- assets/logo.png, the bare root). No legal page is linked from any article, so
-- nothing here depends on the /privacy-policy/ address change.
--
-- ROLLBACK: Supabase Pro keeps daily backups. A reverse replace is NOT safe once
-- new articles exist, because it would also rewrite their genuine astrowani.com
-- links to the preview address.

begin;

update blogs
set content_en = replace(content_en, 'https://shop.astrowani.com/test-site/', 'https://astrowani.com/'),
    content_hi = replace(content_hi, 'https://shop.astrowani.com/test-site/', 'https://astrowani.com/')
where content_en like '%shop.astrowani.com/test-site%'
   or content_hi like '%shop.astrowani.com/test-site%';

-- Self-check: nothing may still name the preview address, in any text column.
do $$
declare n int;
begin
  select count(*) into n from blogs b
  where to_jsonb(b)::text like '%shop.astrowani.com/test-site%';
  if n > 0 then
    raise exception 'still % blog row(s) naming shop.astrowani.com/test-site', n;
  end if;
end $$;

commit;
