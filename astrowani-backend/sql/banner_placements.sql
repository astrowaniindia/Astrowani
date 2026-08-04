-- Adds named placements + a click action to the existing `banners` table so a single
-- banner row can target a specific spot in the app (Home top, Home secondary, Chat top,
-- Video top, Call top, ...) and navigate somewhere when tapped.
alter table banners add column if not exists placement text not null default 'home_primary';
alter table banners add column if not exists action_type text not null default 'none'; -- 'none' | 'screen' | 'url'
alter table banners add column if not exists action_value text;
