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

-- --------------------------------------------------------------- credits ---
-- Carouly is prepaid. There are no plans, no renewals and no entitlement to
-- read off a session token: there is a balance, and work comes off it.
--
-- Two tables, and the split is the usual one. `credit_accounts` is the current
-- balance — one row per user, read on every page that shows the meter, so it
-- must be a primary-key lookup and not a sum over history. `credit_entries` is
-- the append-only record of how it got that way, which is what makes a balance
-- defensible when somebody writes in to ask where their credits went.
--
-- Nothing writes either table directly. Both moves go through the functions
-- below, because "check the balance then subtract it" is two statements and
-- therefore a race — two renders queued in the same second would both read a
-- sufficient balance and both spend it.
create table if not exists public.credit_accounts (
  user_id       text primary key,
  -- The check is the last line of defence rather than the first. `spend_credits`
  -- already refuses to overdraw; this makes a balance that went negative some
  -- other way impossible to write at all, which is the difference between a bug
  -- and a bug that gives away renders.
  balance       int not null default 0 check (balance >= 0),
  granted_total int not null default 0,
  spent_total   int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.credit_entries (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  user_id       text not null,
  -- Signed: negative spends, positive grants, purchases and refunds. One column
  -- rather than debit/credit pair, so the history is `sum(delta)` and any row
  -- that disagrees with the account balance is visible immediately.
  delta         int not null check (delta <> 0),
  -- The balance this entry produced. Redundant with the sum, deliberately: it
  -- is what turns a support question into one query instead of a replay.
  balance_after int not null,
  kind          text not null
                check (kind in ('grant', 'purchase', 'spend', 'refund', 'adjustment')),
  operation     text,                   -- 'make_video', 'build_brand_kit', ...
  detail        text,                   -- the concept title, the pack name
  -- What makes a write safe to retry. A Stripe webhook is delivered more than
  -- once as a matter of course, and a render worker can be handed the same job
  -- twice — without this, both hand out the credits twice.
  idempotency_key text,
  meta          jsonb not null default '{}'::jsonb
);

-- Partial, because most entries have no key and NULLs would otherwise be the
-- only thing this index held.
create unique index if not exists credit_entries_key
  on public.credit_entries (idempotency_key)
  where idempotency_key is not null;

create index if not exists credit_entries_user_idx
  on public.credit_entries (user_id, created_at desc);

-- Spend, atomically, or refuse.
--
-- `security definer` so it can be called with the service-role key from a
-- worker that holds no session, and `search_path` pinned because a definer
-- function that resolves its own tables through a caller-controlled path is the
-- textbook privilege-escalation hole.
--
-- Returns a verdict rather than raising. Running out of credits is a normal
-- thing that happens to a paying customer mid-run, not an exception — the
-- caller needs the balance back so it can say how far short they are.
create or replace function public.spend_credits(
  p_user_id   text,
  p_amount    int,
  p_operation text default null,
  p_detail    text default null,
  p_key       text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
begin
  if p_amount < 0 then
    raise exception 'spend_credits: amount must not be negative (got %)', p_amount;
  end if;

  -- Already done. Return what it did rather than doing it again.
  if p_key is not null then
    select balance_after into v_balance
      from public.credit_entries
     where idempotency_key = p_key;

    if found then
      return jsonb_build_object(
        'ok', true, 'balance', v_balance, 'charged', 0, 'replayed', true
      );
    end if;
  end if;

  insert into public.credit_accounts (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  if p_amount = 0 then
    select balance into v_balance
      from public.credit_accounts where user_id = p_user_id;
    return jsonb_build_object(
      'ok', true, 'balance', v_balance, 'charged', 0, 'replayed', false
    );
  end if;

  -- A subtransaction, so that losing the race below rolls the debit back with
  -- it. Without the enclosing block the balance would already have moved by the
  -- time the duplicate key was raised.
  begin
    -- The conditional update IS the lock. Postgres serialises two writers to the
    -- same row, so the second one re-evaluates `balance >= p_amount` against the
    -- first one's result and finds no row to update.
    update public.credit_accounts
       set balance     = balance - p_amount,
           spent_total = spent_total + p_amount,
           updated_at  = now()
     where user_id = p_user_id
       and balance >= p_amount
    returning balance into v_balance;

    if not found then
      select balance into v_balance
        from public.credit_accounts where user_id = p_user_id;

      return jsonb_build_object(
        'ok', false, 'balance', coalesce(v_balance, 0), 'charged', 0, 'replayed', false
      );
    end if;

    insert into public.credit_entries
      (user_id, delta, balance_after, kind, operation, detail, idempotency_key)
    values
      (p_user_id, -p_amount, v_balance, 'spend', p_operation, p_detail, p_key);
  exception
    when unique_violation then
      -- Another caller committed the same key while we were working. Their
      -- charge stands and ours has just been rolled back, which is exactly the
      -- outcome the key was asking for.
      select balance_after into v_balance
        from public.credit_entries where idempotency_key = p_key;

      return jsonb_build_object(
        'ok', true, 'balance', v_balance, 'charged', 0, 'replayed', true
      );
  end;

  return jsonb_build_object(
    'ok', true, 'balance', v_balance, 'charged', p_amount, 'replayed', false
  );
end;
$$;

-- Add credits: the signup grant, a purchase, a refund for a render that failed.
--
-- Always succeeds, so it returns the new balance rather than a verdict. There
-- is no such thing as a top-up that cannot be afforded.
create or replace function public.grant_credits(
  p_user_id text,
  p_amount  int,
  p_kind    text default 'grant',
  p_detail  text default null,
  p_key     text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
begin
  if p_amount <= 0 then
    raise exception 'grant_credits: amount must be positive (got %)', p_amount;
  end if;

  if p_key is not null then
    select balance_after into v_balance
      from public.credit_entries where idempotency_key = p_key;

    if found then
      return jsonb_build_object(
        'balance', v_balance, 'added', 0, 'replayed', true
      );
    end if;
  end if;

  insert into public.credit_accounts (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  begin
    update public.credit_accounts
       set balance = balance + p_amount,
           -- A refund is money coming back, not money given. Counting it as a
           -- grant would make lifetime-granted drift up every time a render
           -- failed, and that number is how the starter grant gets sized.
           granted_total = granted_total
             + case when p_kind = 'refund' then 0 else p_amount end,
           spent_total = spent_total
             - case when p_kind = 'refund' then p_amount else 0 end,
           updated_at = now()
     where user_id = p_user_id
    returning balance into v_balance;

    insert into public.credit_entries
      (user_id, delta, balance_after, kind, operation, detail, idempotency_key)
    values
      (p_user_id, p_amount, v_balance, p_kind, null, p_detail, p_key);
  exception
    when unique_violation then
      select balance_after into v_balance
        from public.credit_entries where idempotency_key = p_key;

      return jsonb_build_object('balance', v_balance, 'added', 0, 'replayed', true);
  end;

  return jsonb_build_object('balance', v_balance, 'added', p_amount, 'replayed', false);
end;
$$;

-- ---------------------------------------------------------------- assets ---
-- The reusable asset library: actors, brand kits, brand images and finished
-- videos, all in one table. The variable part of each kind lives in `data`
-- (jsonb) rather than in typed columns, deliberately: the shape of an actor or
-- a kit is still moving weekly (see the studio-rebuild note), and a jsonb blob
-- is the one storage choice that does not turn every shape change into a
-- migration. The columns that ARE promoted — kind, name, tags, the two urls —
-- are exactly the ones the library lists, filters and sorts by, which are the
-- only ones worth an index or an RLS-visible shape.
create table if not exists public.assets (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  user_id      text not null,
  kind         text not null check (kind in ('actor', 'kit', 'brand_asset', 'video')),
  name         text not null,
  tags         text[] not null default '{}',
  preview_url  text,                    -- image to draw the asset by in a grid
  source_url   text,                    -- where it came from, for provenance
  -- What makes this asset *this* asset, so the same thing seen twice is one row.
  -- Runs record what they make automatically, so without this the second run
  -- against a site duplicates its kit and every logo on it, and the library
  -- becomes a junk drawer within a week. Writes upsert on this key.
  fingerprint  text not null,
  -- Whether the media is somewhere that will still exist next month. Provider
  -- URLs expire, so a library entry pointing at one is a future 404: recorded
  -- honestly rather than hidden, and shown in the UI.
  storage      text not null default 'remote'
               check (storage in ('durable', 'remote', 'placeholder')),
  -- What this was made from. An array rather than a join table: the only two
  -- questions asked of it are "what made this" and "what came from this", and
  -- both are one indexed query with no join.
  parents      uuid[] not null default '{}',
  data         jsonb not null default '{}'::jsonb
);

-- The library is always browsed as "my assets of this kind, newest first".
create index if not exists assets_user_kind_idx
  on public.assets (user_id, kind, created_at desc);

-- The dedup key that upserts target.
create unique index if not exists assets_identity_key
  on public.assets (user_id, kind, fingerprint);

-- "Everything made with this actor" — an overlap test, which needs GIN.
create index if not exists assets_parents_idx on public.assets using gin (parents);

-- ------------------------------------------------------------------- RLS ---
alter table public.brands             enable row level security;
alter table public.assets             enable row level security;
alter table public.keywords           enable row level security;
alter table public.carousels          enable row level security;
alter table public.slides             enable row level security;
alter table public.social_connections enable row level security;
alter table public.posts              enable row level security;
alter table public.generation_runs    enable row level security;
alter table public.credit_accounts    enable row level security;
alter table public.credit_entries     enable row level security;

-- The two credit tables are deliberately absent from the loop below, because
-- the "own rows" policy it writes grants insert and update as well — and on
-- these tables that is the whole product given away. Anyone able to update
-- their own `credit_accounts` row would write themselves a balance; anyone able
-- to insert a `credit_entries` row would write themselves a purchase.
--
-- So they get read-only policies of their own, immediately below, and every
-- write goes through `spend_credits` / `grant_credits` under the service-role
-- key. A balance the browser can read and cannot touch is the entire security
-- model here.
do $$
declare
  t text;
begin
  foreach t in array array[
    'brands', 'keywords', 'carousels', 'slides',
    'social_connections', 'posts', 'generation_runs', 'assets'
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

-- Your balance and your history are yours to read and nobody's to write.
do $$
declare
  t text;
begin
  foreach t in array array['credit_accounts', 'credit_entries'] loop
    execute format('drop policy if exists "own credits" on public.%I', t);
    execute format($p$
      create policy "own credits" on public.%I
        for select
        to authenticated
        using ((select auth.jwt() ->> 'sub') = user_id)
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

-- Subscriptions are gone. Carouly is prepaid, so there is no plan to mirror and
-- no cron path that needs to ask what somebody is paying for — the daily run
-- asks the balance the same way an interactive request does.
--
-- Dropped rather than left in place. A table nothing reads is a table somebody
-- will read: the tier gates it used to answer were exactly the ones the credit
-- ledger now answers, and leaving both standing is how an app ends up with two
-- disagreeing opinions about whether a person may render.
drop table if exists public.subscriptions;

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

-- The asset library gained dedup, durability and lineage after its first
-- release. `create table if not exists` above skips an existing table, so these
-- reach a database created by that first version.
alter table public.assets
  add column if not exists fingerprint text,
  add column if not exists storage text not null default 'remote',
  add column if not exists parents uuid[] not null default '{}';

-- Backfill before the not-null: an existing row's own id is unique, which is
-- exactly what a fingerprint has to be, and means pre-dedup rows simply never
-- collide with anything.
update public.assets set fingerprint = id::text where fingerprint is null;

do $$
begin
  alter table public.assets alter column fingerprint set not null;
exception
  when others then null;  -- already not-null
end $$;

alter table public.assets drop constraint if exists assets_storage_check;
alter table public.assets add constraint assets_storage_check
  check (storage in ('durable', 'remote', 'placeholder'));

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

-- ------------------------------------------------------------ rendering ---
-- Rendering does not fit in a request, so it stops being one.
--
-- Measured on the local backend, a fifteen-second cut takes 27.6 minutes:
-- casting 14s, master frame 44s, then roughly nine minutes per clip. No
-- serverless function may run that long — Vercel's ceiling is 300s on Pro and
-- 800s with fluid compute — so `make_video` enqueues here and a worker picks it
-- up, instead of holding a streaming response open and being killed part-way.
--
-- The interesting column is `progress`. A worker that runs out of time saves
-- what it has and returns; the next invocation resumes rather than restarting,
-- because every finished node is already in `render_cache` below.
create table if not exists public.render_jobs (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  user_id       text not null,
  status        text not null default 'queued'
                check (status in ('queued', 'running', 'done', 'failed')),
  template_id   text not null,
  concept_title text,
  -- Everything the graph needs to run, so the worker holds no session and a
  -- cold instance costs nothing. The brand kit is the bulk of it.
  payload       jsonb not null default '{}'::jsonb,
  -- Node states, in the shape the studio's graph view already renders, so
  -- polling this is the same picture as watching a live run.
  progress      jsonb not null default '{}'::jsonb,
  result        jsonb,
  error         text,
  -- Bounded so a job that kills its worker every time cannot retry for ever.
  attempts      int not null default 0,
  -- Set when a worker takes the job. Also how a stalled job is found: one that
  -- has been `running` far longer than a worker's budget was interrupted, and
  -- is safe to hand out again.
  claimed_at    timestamptz
);

create index if not exists render_jobs_user_idx
  on public.render_jobs (user_id, created_at desc);
create index if not exists render_jobs_claim_idx
  on public.render_jobs (status, claimed_at);

-- The node cache, which is what makes a job resumable.
--
-- `execute()` already keys every node by a content hash of its type and its
-- resolved params, and already skips a node whose key is present. Backing that
-- store with a table rather than a Map is therefore the entire resumption
-- mechanism: a worker re-running a half-finished graph recomputes only the node
-- it did not reach. No executor change was needed for this.
--
-- Not per-user: the key is a content hash, so two runs asking for the identical
-- shot are asking for the same bytes. Values are written by the service role
-- only, and RLS below denies every authenticated request.
create table if not exists public.render_cache (
  key        text primary key,
  created_at timestamptz not null default now(),
  value      jsonb not null
);

alter table public.render_jobs  enable row level security;
alter table public.render_cache enable row level security;

-- Jobs are readable by the person who owns them; nothing may be written from a
-- browser. A user who could insert a job could queue paid renders for free, and
-- one who could update `status` could mark somebody else's job done — so this
-- policy grants select and nothing else. The tool and the worker use the
-- service-role key, which bypasses RLS.
drop policy if exists "own jobs" on public.render_jobs;
create policy "own jobs" on public.render_jobs
  for select
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

-- `render_cache` gets no policy at all, like `subscriptions`: it is keyed by a
-- content hash with no owner column, so there is no "own rows" to express, and
-- a writable cache would let anyone plant a value that a later render serves.
