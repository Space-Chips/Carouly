-- ============================================================================
-- Carouly — Supabase schema
-- Run this in the Supabase SQL editor (it is idempotent).
--
-- Auth model: Clerk is the identity provider. Every table stores the Clerk
-- user id in `user_id` (text) and RLS compares it to `auth.jwt() ->> 'sub'`,
-- which is how the Clerk <-> Supabase third-party auth integration works.
-- Background jobs (the daily cron) use the service-role key and bypass RLS.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- brands ---
create table if not exists public.brands (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  user_id             text not null,
  name                text not null,
  product_description text not null,
  domain              text not null,          -- the niche the tips live in
  audience            text,
  differentiator      text,
  website_url         text,
  bio_link_label      text default 'link in bio',
  handle              text,                   -- @yourbrand, shown on the CTA slide
  logo_url            text,                   -- logo or profile picture, drawn on every slide's top rail
  preset              text not null default 'grain',  -- whole look: palette, tone, image style. see lib/presets.ts
  posts_per_day       int  not null default 1 check (posts_per_day between 1 and 5),
  post_hour           int  not null default 9 check (post_hour between 0 and 23),
  timezone            text not null default 'UTC',
  autopilot           boolean not null default false,
  auto_publish        boolean not null default false
);

-- One brand per user for the MVP. Drop this index to go multi-brand later.
create unique index if not exists brands_user_id_key on public.brands (user_id);

-- `create table if not exists` skips existing tables entirely, so columns added
-- or retired after the first run need their own statement to reach an existing
-- database.
--
alter table public.brands
  add column if not exists logo_url text;

-- `image_vibe` used to hold the hook-image style separately from `preset`.
-- The two are one choice now (lib/presets.ts), and every id that was valid in
-- `image_vibe` is a valid preset id, so the brand's image choice is the one
-- that survives: it was the only one a user could actually change.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'brands'
      and column_name = 'image_vibe'
  ) then
    execute $mig$
      update public.brands
         set preset = image_vibe
       where image_vibe is not null
         and image_vibe <> preset
    $mig$;

    execute 'alter table public.brands drop column image_vibe';
  end if;
end $$;

-- -------------------------------------------------------------- keywords ---
create table if not exists public.keywords (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  brand_id     uuid not null references public.brands (id) on delete cascade,
  user_id      text not null,
  keyword      text not null,
  angle        text,                       -- the specific tip/insight to build on
  intent       text,                       -- informational | commercial | ...
  volume       int  not null default 0,    -- estimated monthly searches
  difficulty   int  not null default 50 check (difficulty between 0 and 100),
  relevance    int  not null default 50 check (relevance between 0 and 100),
  score        numeric not null default 0, -- internal ranking, see lib/keywords.ts
  status       text not null default 'new'
               check (status in ('new', 'approved', 'used', 'archived')),
  used_at      timestamptz
);

-- Plain (not expression) unique index: ON CONFLICT (brand_id, keyword) can
-- only match a plain index, and keywords are always stored lower-cased.
create unique index if not exists keywords_brand_keyword_key
  on public.keywords (brand_id, keyword);
create index if not exists keywords_pick_idx
  on public.keywords (brand_id, status, score desc);

-- ------------------------------------------------------------- carousels ---
create table if not exists public.carousels (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  brand_id        uuid not null references public.brands (id) on delete cascade,
  user_id         text not null,
  keyword_id      uuid references public.keywords (id) on delete set null,
  keyword_text    text,
  preset          text not null default 'grain',
  title           text not null,
  caption         text,
  hashtags        text[] not null default '{}',
  hook_image_url  text,                       -- AI generated background for slide 1
  status          text not null default 'draft'
                  check (status in ('draft', 'ready', 'publishing', 'published', 'failed')),
  scheduled_for   timestamptz,
  published_at    timestamptz,
  error           text
);

create index if not exists carousels_brand_idx on public.carousels (brand_id, created_at desc);

-- ---------------------------------------------------------------- slides ---
create table if not exists public.slides (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  carousel_id  uuid not null references public.carousels (id) on delete cascade,
  user_id      text not null,
  position     int  not null,
  kind         text not null check (kind in ('hook', 'insight', 'cta')),
  heading      text not null,
  body         text,
  footnote     text,
  image_url    text                            -- rendered PNG in Supabase Storage
);

create unique index if not exists slides_carousel_position_key
  on public.slides (carousel_id, position);

-- --------------------------------------------------- social connections ---
create table if not exists public.social_connections (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  brand_id      uuid not null references public.brands (id) on delete cascade,
  user_id       text not null,
  platform      text not null check (platform in ('instagram', 'tiktok', 'facebook', 'linkedin', 'x', 'manual')),
  account_label text,
  -- Display metadata from the OAuth handshake. Kept in plain columns so the
  -- UI can render a connection without ever decrypting the token.
  account_handle      text,
  external_account_id text,               -- IG user id / TikTok open_id
  avatar_url          text,
  scopes              text[] not null default '{}',
  expires_at          timestamptz,        -- when the access token dies
  needs_reauth        boolean not null default false,
  enabled       boolean not null default true,
  -- AES-256-GCM encrypted JSON blob (see lib/secrets.ts). Never plaintext.
  credentials   text
);

create unique index if not exists social_connections_brand_platform_key
  on public.social_connections (brand_id, platform);

-- ----------------------------------------------------------------- posts ---
create table if not exists public.posts (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  carousel_id  uuid not null references public.carousels (id) on delete cascade,
  brand_id     uuid not null references public.brands (id) on delete cascade,
  user_id      text not null,
  platform     text not null,
  status       text not null default 'pending'
               check (status in ('pending', 'published', 'failed', 'skipped')),
  external_id  text,
  permalink    text,
  error        text,
  posted_at    timestamptz
);

create index if not exists posts_carousel_idx on public.posts (carousel_id);

-- -------------------------------------------------------- generation log ---
-- One row per brand per local day, so a cron that fires hourly (or twice)
-- can never double-generate.
create table if not exists public.generation_runs (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  brand_id      uuid not null references public.brands (id) on delete cascade,
  user_id       text not null,
  run_date      date not null,
  requested     int not null default 0,
  created_count int not null default 0,
  status        text not null default 'ok',
  error         text
);

create unique index if not exists generation_runs_brand_date_key
  on public.generation_runs (brand_id, run_date);

-- --------------------------------------------------------- subscriptions ---
-- A mirror of Clerk Billing, maintained by the billing webhook
-- (app/api/webhooks/clerk). Clerk is the source of truth; this table exists
-- only because the daily cron has no session token to read a plan claim from.
--
-- Interactive requests never read it — they use `has({ plan })` off the
-- session, which cannot go stale. See lib/billing.ts.
create table if not exists public.subscriptions (
  user_id            text primary key,
  clerk_id           text,                -- Clerk's subscription id, for support
  plan_slug          text,                -- null once every paid item has ended
  plan_period        text check (plan_period in ('month', 'annual')),
  status             text check (status in ('active', 'past_due', 'ended', 'upcoming')),
  is_free_trial      boolean not null default false,
  current_period_end timestamptz,
  updated_at         timestamptz not null default now()
);

-- ------------------------------------------------------------------- RLS ---
alter table public.brands             enable row level security;
alter table public.keywords           enable row level security;
alter table public.carousels          enable row level security;
alter table public.slides             enable row level security;
alter table public.social_connections enable row level security;
alter table public.posts              enable row level security;
alter table public.generation_runs    enable row level security;
alter table public.subscriptions      enable row level security;

-- `subscriptions` is deliberately absent from the loop below and gets no
-- policy at all, so RLS denies every authenticated request to it. The webhook
-- and the cron reach it with the service-role key, which bypasses RLS.
--
-- This is not paranoia about reads: the "own rows" policy grants insert and
-- update as well, which on this table would let any signed-in user write
-- themselves a row saying plan_slug = 'studio' and hand themselves the paid
-- tier on the cron path. The billing UI reads Clerk directly instead.
do $$
declare
  t text;
begin
  foreach t in array array[
    'brands', 'keywords', 'carousels', 'slides',
    'social_connections', 'posts', 'generation_runs'
  ] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format($p$
      create policy "own rows" on public.%I
        to authenticated
        using ((select auth.jwt() ->> 'sub') = user_id)
        with check ((select auth.jwt() ->> 'sub') = user_id)
    $p$, t);
  end loop;
end $$;

-- --------------------------------------------------------------- storage ---
-- Public bucket for the rendered slide PNGs. They have to be publicly
-- readable: Instagram / LinkedIn / X fetch the image by URL when publishing.
insert into storage.buckets (id, name, public)
values ('carousel-assets', 'carousel-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "public read carousel assets" on storage.objects;
create policy "public read carousel assets" on storage.objects
  for select using (bucket_id = 'carousel-assets');

-- ------------------------------------------------------------ migrations ---
-- Additive changes for databases created by an earlier version of this file.
-- Safe to re-run: the whole script is idempotent.

-- `demand` is a 0-100 signal derived from real search-autocomplete data
-- (position in the suggestion list + how many seeds surfaced the phrase).
-- It is deliberately NOT search volume — see lib/keyword-sources.ts.
alter table public.keywords
  add column if not exists demand int not null default 0
    check (demand between 0 and 100);

-- Where the keyword came from, so the UI can be honest about the data.
alter table public.keywords
  add column if not exists source text not null default 'llm'
    check (source in ('llm', 'autocomplete'));

-- Keywords are now reviewed by a human before autopilot writes them, so the
-- queue has an "approved" state between discovery and use.
alter table public.keywords drop constraint if exists keywords_status_check;
alter table public.keywords add constraint keywords_status_check
  check (status in ('new', 'approved', 'used', 'archived'));

-- One-click OAuth connections (Instagram, TikTok). Existing databases get the
-- metadata columns here; `create table if not exists` above skips them.
alter table public.social_connections
  add column if not exists account_handle      text,
  add column if not exists external_account_id text,
  add column if not exists avatar_url          text,
  add column if not exists scopes              text[] not null default '{}',
  add column if not exists expires_at          timestamptz,
  add column if not exists needs_reauth        boolean not null default false;

-- TikTok joined the supported platforms after the first release.
alter table public.social_connections drop constraint if exists social_connections_platform_check;
alter table public.social_connections add constraint social_connections_platform_check
  check (platform in ('instagram', 'tiktok', 'facebook', 'linkedin', 'x', 'manual'));

-- The cron sweeps for tokens about to expire; without this it scans the table.
create index if not exists social_connections_expiry_idx
  on public.social_connections (expires_at)
  where expires_at is not null;

-- Earlier versions indexed lower(keyword). An expression index cannot satisfy
-- ON CONFLICT (brand_id, keyword), so replace it with a plain one.
do $$
begin
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'keywords_brand_keyword_key'
      and indexdef like '%lower(keyword)%'
  ) then
    drop index public.keywords_brand_keyword_key;
    create unique index keywords_brand_keyword_key
      on public.keywords (brand_id, keyword);
  end if;
end $$;
