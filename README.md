# Carouly

A SaaS that runs a brand's social content for them. You describe your brand
once; every day the app picks a topic from a ranked keyword bank, writes a
4-slide carousel that teaches something genuinely useful in your domain,
generates a hook image, renders the slides to PNG, and publishes them to every
social account you've connected.

The first three slides never mention the product. The last one makes the brand
unmistakable and points at the bio link — because Instagram and TikTok won't
let you share a link any other way.

**Stack:** Next.js 15 (App Router) · Clerk · Supabase (Postgres + Storage) ·
OpenRouter · `next/og` (satori) for image rendering. No extra dependencies
beyond what the template already had.

---

## How it works

```
brand profile
     │
     ▼
seed topics (small LLM call)
     │
     ▼
free search autocomplete ──► Google Suggest (client=chrome) + DuckDuckGo
     │                        two-pass harvest, ~300 real phrases in ~1s
     ▼
keyword bank ──► score = 0.45·demand + 0.30·opportunity + 0.25·relevance
     │                    (lib/keywords.ts)
     ▼
highest-scoring unused keyword
     │
     ▼
LLM writes 4 slides + caption + hashtags + a hook-image scene   (lib/generator.ts)
     │
     ▼
hook image generated in the preset's style                      (lib/openrouter.ts)
     │
     ▼
slides rendered to 1080×1350 PNGs, uploaded to public storage   (lib/render.tsx)
     │
     ▼
published to every enabled connection                           (lib/social/*)
```

`lib/pipeline.ts` is the orchestrator; `/api/cron/daily` is the trigger.

### Keyword discovery ([lib/keyword-sources.ts](lib/keyword-sources.ts))

Keywords are **real search phrases**, not model inventions. The model supplies
only the domain vocabulary (a handful of seed stems) and the editorial
judgement at the end; everything in between is free, keyless search data.

- **Google Suggest via `client=chrome`** — this client returns
  `google:suggestrelevance` (Google's own numeric relevance per suggestion)
  and `google:suggesttype`, so demand is a measured signal and NAVIGATION
  results can be dropped by Google's own classification. It also returns ~15
  suggestions instead of ~10. DuckDuckGo is the fallback; it has no relevance
  scores, so those phrases are scored from rank and then discounted — an
  unverified signal must never outrank a measured one.
- **Two-pass harvest** — seeds are expanded under question patterns
  (`how to…`, `why…`, `what is…`) and modifier patterns (`… tips`,
  `… mistakes`, `… vs`), then the strongest finds are expanded again. The
  second pass is where the long-tail, low-competition phrases come from.
- **Drift guard** — suggestion engines wander (`why is deep work` returns
  `why is deep heat not working`), so every phrase is checked against the
  seed's distinctive tokens.
- **Diversity cap** — autocomplete returns tight variant clusters; at most two
  phrases sharing an opening survive, or one cluster crowds out every other
  topic in the slice that gets scored.

### Ranking is arithmetic, selection is human

No model scores keywords. `score = 0.55·demand + 0.45·opportunity`, where both
inputs come from measured suggestion data ([lib/keywords.ts](lib/keywords.ts)),
so the same phrase always scores the same:

- **demand** — a 0-100 signal, **not search volume**: Google's own relevance
  score for the phrase plus how many seed topics surfaced it.
- **competition** — an **estimate** from phrase length (the strongest proxy),
  relevance, breadth, and commercial vs question wording.

Both are labelled as signals and estimates everywhere they appear. True volume
and true difficulty are only available from paid APIs (DataForSEO, Semrush) or
a Google Ads account with active spend. An LLM-guessed "difficulty 0-100" is
the same class of fabrication as an LLM-guessed volume, so neither is used.

The judgement call — *is this worth posting about* — belongs to the user. The
keyword bank is a review queue: research fills **To review**, you bulk-approve
into the **Queue**, and autopilot writes from the queue. If the queue empties,
it falls back to the highest-ranked unreviewed keyword so daily posting never
silently stops.

The model is left with exactly two jobs: producing seed topics, and writing
the carousel.

### Slide structure

| # | Kind | Purpose |
|---|------|---------|
| 1 | `hook` | Scroll-stopper over the AI-generated background image |
| 2 | `insight` | The core idea |
| 3 | `insight` | How to apply it / the nuance most people miss |
| 4 | `cta` | Brand name at full size + "@handle — link in bio" |

The shape is enforced in code, not just prompted: if the model omits the CTA
slide, `sanitiseCarousel` appends one. Nothing publishes without a conversion
slide.

Every slide carries the brand mark beside the handle on its top rail — the
logo or profile picture uploaded during onboarding (`brands.logo_url`), or the
preset's accent block when there is none. There is one field and one wording
for it: the slide draws a wordmark and an avatar identically, so asking which
one it is would be a question with no consequence. Uploads are PNG or JPEG only
— satori cannot decode WebP, and refusing it at upload beats a carousel that
fails to render hours later.

### Presets

A preset is the complete identity of a carousel — palette, type treatment,
copy tone, *and* the style the AI hook image is generated in. Slides and image
are one choice on purpose: picking a warm filmic palette and a cold clinical
background produced carousels that looked like two products.

| Preset | Look |
|---|---|
| **Grain** | Dark, filmic, physical. Limited palette, heavy grain, motion blur. |
| **Nocturne** | Cinematic night. Crushed blacks, one rim-lit subject, cold accent. |
| **Bleach** | High-key daylight on warm paper. Ink type, burnt-orange accent. |
| **Atlas** | Archival documentary. Muted earth tones, flat overcast light. |
| **Signal** | Studio-lit and clinical. Seamless backdrop, electric lime accent. |
| **Ember** | Golden hour on 35mm. Warm haze, low sun, halation. |

Adding one means appending an entry to `PRESETS` in `lib/presets.ts` — nothing
downstream hardcodes a preset id. The pickers show real rendered slides, so a
new preset is visible immediately; its hook-image sample comes from

```bash
npx tsx scripts/generate-preset-previews.ts
```

which writes `public/presets/<id>.jpg`. Set `hasPreview: true` once it has run.

### The paywall is a flow, not a screen

Plans, prices and trials live in Clerk. What lives here is *where* the paywall
appears and *what it says* — which is the part that decides whether anyone
subscribes.

**What the free tier is.** Three carousels, ever, written and rendered in full
and downloadable as PNGs. What a plan buys is not better output, it is the app
running without you: scheduled generation and posting to a connected account.
Enforcement is in the server actions ([`lib/billing.ts`](lib/billing.ts)), not
only in the UI — every gate is a thrown `UpgradeRequiredError`, and the buttons
that trigger them are swapped for an upgrade link so the refusal is readable
before it happens.

**Where it appears.** A paywall that names the thing you just reached for
converts better than a generic one, so each gate carries a reason and the
reason picks the headline ([`lib/paywall.ts`](lib/paywall.ts)):

| Touchpoint | Reason | Opens on |
| --- | --- | --- |
| End of onboarding | `general` | Value step, then price |
| Free allowance spent | `quota` | Price |
| Autopilot toggle | `autopilot` | Price |
| Auto-publish toggle | `auto_publish` | Price |
| Publish button | `publish` | Price |
| More than one a day | `posts_per_day` | Studio, not Autopilot |

**Why onboarding is the main one.** It is the only moment the app has just done
real work on the user's real domain and they have not seen it yet. So it runs
two steps: the research it found stated back to them, then the price. Two-step
paywalls beat single-screen ones consistently, and the first step is what makes
the second stop feeling like an interruption.

**What reduces the risk.** A dated trial timeline (today → reminder → charge),
because the objection on a card-required trial is always "will I get charged
without noticing". A `cancel any time` line under the button. Annual
preselected with the saving shown, monthly visible beside it, and every other
plan behind **Compare all plans** so the base decision stays two options wide.

**What it deliberately does not do.** No countdown timers, no spin-the-wheel,
no last-minute discount for dismissing the page. Those work, and they work by
teaching users that the first price is never the real one. Dismissing the
annual plan offers the *monthly* plan instead — a smaller commitment, not a
lower price, which gets the same yes without the lesson.

### Publishing

| Platform | Method | How it connects |
|---|---|---|
| Instagram | Graph API carousel (item containers → carousel container → publish) | **One click** — Instagram Login |
| TikTok | Content Posting API photo post (`PULL_FROM_URL`) | **One click** — Login Kit |
| Facebook Page | Unpublished photos → single multi-photo feed post | Page ID + Page token |
| LinkedIn | Images API upload → `multiImage` post | Access token + author URN |
| X | v2 media upload → post with up to 4 images | OAuth 2.0 user token |
| Manual | Always available — download the PNGs and post by hand | — |

Every platform publishes independently: one bad token can't stop the others,
and every attempt — success or failure — is recorded in `posts`.

### One-click connect

Instagram and TikTok are a single button. The user is handed to the platform's
own login, and the callback stores a connection they never have to touch
again:

```
Settings → /api/connect/{platform}          signed state + httpOnly nonce
        → platform login & consent
        → /api/connect/{platform}/callback  code → long-lived token → account
        → Settings                          avatar, @handle, "connected"
```

Instagram uses **Instagram API with Instagram Login** rather than Facebook
Login — no Facebook Page, no Page picker, no account picker, just an Instagram
login (the account has to be Business or Creator, a free toggle in the app).
The one-hour token it returns is immediately traded for a 60-day one, because
a connection that dies before the first scheduled post isn't a connection.

Both platforms' tokens are then kept alive automatically:
`ensureFreshCredentials` renews before every publish, and the hourly cron
sweeps everything within eight days of expiry (`refreshExpiringConnections`).
TikTok tokens live 24 hours and Instagram's 60 days, and both can only be
refreshed while still valid — so the sweep runs early rather than on expiry. A
refresh that fails inside the lead window is retried; one that fails on a dead
token flips `needs_reauth` and Settings shows **Reconnect**.

Publishing also adapts to what the user actually granted rather than assuming:
TikTok direct-posts when `video.publish` came back and drops a draft in the
user's inbox when only `video.upload` did (which is all an app gets before
TikTok's content-posting audit), and it asks `creator_info` which privacy
levels the account allows instead of hardcoding one.

Adding a third platform is one `oauth` block on its adapter — `lib/social/oauth.ts`
owns the state signing, redirect URI, storage and refresh scheduling.

**Setup.** Add both key pairs to `.env.local` (see `.env.example`) and register
the redirect URIs below. Leave a pair blank and Instagram falls back to a token
paste form while TikTok reports that it needs credentials — nothing crashes.

```
{NEXT_PUBLIC_APP_URL}/api/connect/instagram/callback
{NEXT_PUBLIC_APP_URL}/api/connect/tiktok/callback
```

Both platforms require **https** redirect URIs, so testing connect locally
needs a tunnel (`ngrok http 3000`, `cloudflared tunnel`) with
`NEXT_PUBLIC_APP_URL` pointed at it. TikTok additionally requires the domain
serving the slide PNGs — the Supabase storage host — to be verified in its
developer portal, or `content/init` is rejected with
`url_ownership_unverified`.

Tokens are encrypted with AES-256-GCM (`lib/secrets.ts`) before they touch the
database and are never returned to the browser; only display metadata (handle,
avatar, scopes, expiry) lives in plain columns so Settings can render a
connection without decrypting anything.

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Supabase

Run [`supabase_schema.sql`](supabase_schema.sql) in the Supabase SQL editor. It
creates every table, the RLS policies (`auth.jwt() ->> 'sub'` = the Clerk user
id), and the public `carousel-assets` storage bucket.

Then connect Clerk as a third-party auth provider in
**Supabase → Authentication → Sign In / Providers → Clerk**, so session tokens
satisfy RLS.

> The bucket is public on purpose: Instagram, LinkedIn and X all fetch slide
> images by URL server-side.

### 3. Environment

Copy [`.env.example`](.env.example) to `.env.local` and fill it in.

```bash
openssl rand -hex 32   # APP_ENCRYPTION_KEY
openssl rand -hex 32   # CRON_SECRET
```

`OPENROUTER_TEXT_MODEL` and `OPENROUTER_IMAGE_MODEL` accept any OpenRouter
model id, so you can swap models without touching code.

### 4. Billing

Billing runs on **Clerk Billing**, which connects to your own Stripe account:
Stripe processes the card, Clerk owns plans, trials and entitlements, and the
plan a user is on rides in their session token. Nothing about pricing is
hardcoded — the app reads it from Clerk at render time.

**In the Clerk dashboard:**

1. **Billing → Settings** → enable Billing. Development instances use Clerk's
   shared test gateway; production asks you to connect your Stripe account.
2. **Billing → Plans → Plans for Users** → create two plans. The slugs must
   match exactly, because that is what `has({ plan })` compares against:

   | Slug | Monthly fee | Annual **monthly** fee | Charged yearly | Free trial |
   | --- | --- | --- | --- | --- |
   | `autopilot` | 29 | 24 | $288 | 7 days |
   | `studio` | 79 | 65 | $780 | 7 days |

   Clerk's annual field is the effective *per month* price when billed yearly,
   not the yearly total — it multiplies by twelve itself and rejects anything
   that is not cheaper per month than the monthly plan. Put 24 in, get $288 a
   year out.

   Leave **Require a payment method for free trials** on. Fewer people start a
   trial that way and considerably more of them convert, because it filters out
   the ones who were never going to pay.
3. **Webhooks** → add an endpoint at `https://your-app/api/webhooks/clerk`
   subscribed to the `subscription.*` events, and put its signing secret in
   `CLERK_WEBHOOK_SIGNING_SECRET`.

> The webhook is not optional. The daily cron has no session token to read a
> plan claim from, so it reads the `subscriptions` table this endpoint keeps in
> sync. Without it every subscriber looks unpaid to the cron and autopilot
> quietly stops. Locally:
>
> ```bash
> npx clerk@latest webhooks listen --forward-to http://localhost:3000/api/webhooks/clerk
> ```

Prices, trial length and plan names all come from Clerk. What lives in
[`lib/plans.ts`](lib/plans.ts) is the part Clerk has nowhere to store: the
limits each tier enforces, and the sentence describing what it does for you.

### 5. Run

```bash
npm run dev
```

Sign up → onboarding → **Research keywords** → **Write one now**.

### 6. Deploy

`vercel.json` registers the cron at `0 * * * *`. It runs hourly and fires each
brand only when that brand's *local* clock reaches its posting hour, so
timezones work without a per-user scheduler. The unique
`(brand_id, run_date)` index makes a repeat run within the same local day a
no-op — a retried or double-firing cron cannot double-post.

Set `CRON_SECRET` in the Vercel project env; Vercel Cron sends it as
`Authorization: Bearer …` automatically. Trigger it by hand with:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/cron/daily
```

---

## Layout

```
app/
  page.tsx                    marketing page (public)
  onboarding/                 brand setup
  dashboard/                  status, manual triggers, recent output
  keywords/                   the ranked keyword bank
  carousels/[id]/             preview, inline copy editing, publish, history
  settings/                   plan, schedule, connections, preset, brand
  upgrade/                    the paywall (value step → price step)
  api/connect/[platform]/     one-click OAuth: start + callback
  api/cron/daily/             hourly autopilot trigger
  api/webhooks/clerk/         mirrors Clerk Billing into `subscriptions`
  api/preset-preview/         renders sample slides for the preset picker
lib/
  plans.ts                    tier catalogue + limits (client safe)
  billing.ts                  entitlement, quota, gates (server only)
  paywall.ts                  what the paywall says, per gate
  presets.ts                  look registry: palette, tone, image style
  keywords.ts                 the internal scoring model
  generator.ts                all LLM prompting
  openrouter.ts               text + image model calls
  render.tsx                  satori → PNG → storage
  pipeline.ts                 keyword → carousel → publish orchestration
  secrets.ts                  AES-256-GCM for social tokens
  social/                     one adapter per platform (+ its oauth provider)
  social/oauth.ts             signed state, redirect URIs, token refresh
components/
  SlideArt.tsx                the slide visual (renders in satori AND the browser)
```

`SlideArt` is deliberately restricted to the satori-supported CSS subset so
one component drives both the exported PNG and the dashboard preview — the
preview can't drift from what actually gets posted.

---

## Known limits

- Slide type uses satori's bundled Noto Sans. Drop a display font into
  `public/fonts` and pass it via the `fonts` option in `lib/render.tsx` for a
  stronger look.
- One brand per user (a unique index on `brands.user_id`). The schema is
  already multi-brand — drop that index and add a brand switcher.
- Facebook, LinkedIn and X are still token-paste; only Instagram and TikTok
  have one-click connect so far (see Publishing above).
- The paywall ships one variant. Everything about it is a hypothesis worth
  testing — the two-step order, the trial timeline, annual-first, the exit
  offer. There is no universally best paywall, only the one that won your last
  test, so treat `lib/paywall.ts` and `components/upgrade/` as the surface to
  experiment on.
- No social proof on the paywall. The slot is there in `WhatYouGet`
  ([`components/upgrade/Paywall.tsx`](components/upgrade/Paywall.tsx)) but it is
  deliberately empty rather than filled with invented testimonials. Add real
  ones once you have them — a five-star row nobody wrote costs more trust than
  it buys.
- Billing is B2C only (`PricingTable` for users, not organizations). Clerk
  supports org plans if this ever needs teams