# Carouly prototype — agentic URL → vertical video

A Python prototype of the new pipeline: **paste a URL, get a 9:16 video**.

Built to iterate cheaply. Text runs on `openrouter/free` (zero cost), and fal.ai
calls are stubbed until you set `FAL_KEY`. A full brand kit + video plan costs
nothing to run.

## Why it is shaped this way

This copies the *outcome* of the AdAnt reference run (in `~/Desktop/Recources`),
not its method. AdAnt drives a full sandboxed computer — it boots a VM, shells
into it, and runs scripts. That is a lot of compute to do what is really just
HTTP calls and structured generation. Here every capability is a **tool call**
against a normal Python function instead.

The one thing worth copying exactly was its **failure recovery**. AdAnt's run on
carouly.eu hit a Clerk middleware 500 under a headless browser and recovered by
fetching the prerendered HTML directly. This prototype reproduces that fallback,
and it fires on every run against the live site today.

## Layout

```
core/       agent loop, OpenRouter client, tool schema derivation, tracing
tools/      web capture, filesystem, imaging, fal.ai — the agent's capabilities
stages/     the pipeline, s1..s5
workflow/   the graph engine + templates
workspace/  per-brand output (gitignored)
```

## Pipeline

| Stage | What | Agentic? |
|---|---|---|
| s1 capture | render, HTTP fallback, palette, asset harvest | no — cheap code |
| s2a research | explore sub-pages for what the landing page omits | **yes** — tool-calling agent |
| s2b synthesis | brand.json: products, personas, concepts, match profile | structured generation |
| s2c grounding | drop every evidence quote not literally on the page | no — string check |
| s3 package | contact sheet, brandkit.md, zip bundle | brief only |
| s4 match | rank templates against the brand's match profile | scoring + LLM pairing |
| s5 produce | bind concept → template inputs, execute the graph | structured generation |

Only stage 2a is a free-roaming agent. The rest is structured generation with
validation, because a loop that can wander is the wrong tool when the output
shape is already known — and it costs more.

Evidence grounding is the quality gate: the model is asked for verbatim quotes,
and any quote not found in the captured text is deleted. On the last run it kept
4 and dropped 2 paraphrases. That is the system working.

## Templates are workflows

A template is a JSON **DAG**, not a prompt. Nodes reference each other with
`{{node.field}}`; the engine derives the edges from those references, topologically
sorts, and executes. There is no hand-written wiring.

```json
{ "id": "clips", "type": "fal.video", "foreach": "{{script.shots}}", "as": "shot",
  "prompt": "{{shot.prompt}}", "duration": 6 }
```

`foreach` fans one node over a list — three script beats become three clips —
without subgraph plumbing.

**Node types:** `const` `join` `pick` `zip` `text.fit` `llm.text` `llm.json`
`fal.video` `fal.image` `fal.image_edit` `video.concat` `video.captions`
`asset.pick` `asset.upload`. Register a new one with the `@node_type("name")`
decorator in `workflow/nodes.py`.

### Audio policy: the video model speaks, we never dub

There is no TTS, no lipsync and no audio muxing in this pipeline. Bolting
synthetic speech onto silent footage never matches lip movement or room tone, so
dialogue comes from video models that generate it natively (Veo 3 and its
image-to-video variants). `fal.video` **refuses** any model marked
`audio: False` in the registry, naming the ones that will work — a shot with
genuinely no speech opts out with `"silent": true`.

This is why `video.concat` prefers local ffmpeg: the remote video-only compose
would silently drop each clip's dialogue track. Local assembly keeps it, and
synthesises per-clip silence (sized to that clip, not the timeline) when a shot
does come from a silent model.

### Casting and first frames

Identity is anchored with pixels, not adjectives. Each UGC template runs:

```
casting  llm.json        cast one actor + a master frame prompt + per-beat direction
master   fal.image       the neutral first frame
frames   fal.image_edit  foreach beat — an EDIT of the master, identity preserved
beats    zip             pair each script beat with its frame
clips    fal.video       foreach — image-to-video from that beat's frame
```

Three independent text-to-video calls produce three different people. Deriving
every beat's frame from one master frame, then driving image-to-video from it, is
what keeps one face across the cut. Prompts deliberately ask for the markers of
real phone footage — visible pores, uneven skin, wrinkled clothing, a cluttered
room, off-centre framing, window light — and negative-prompt the AI tells:
studio lighting, airbrushed skin, cinematic grade, stock-photo polish.

`zip` exists because `foreach` walks a single list; pairing script beats with
their generated frames needs an explicit join first.

### Voiceover length and captions

`text.fit` sizes spoken text to the cut. Speech runs at roughly 2.4
words/second, so an 8-second beat carries about 18 words — the templates ask for
that up front, and `text.fit` compresses anything that overruns (falling back to
a sentence-boundary truncation if the model will not comply).

`video.captions` burns one caption per beat, because most vertical social video
is watched muted. It renders each caption to a transparent PNG with Pillow and
composites it with ffmpeg's `overlay` filter, rather than `subtitles` or
`drawtext` — ffmpeg builds routinely ship without libass *and* without
libfreetype (the Homebrew build on this machine has neither). `overlay` needs no
optional libraries. If ffmpeg or the local file is missing, it writes a sidecar
`.srt` and passes the clean cut through instead of failing.

**Shipped templates:** `ugc_talking_head` (Veo 3 native dialogue, no lipsync pass),
`ugc_problem_solution` (silent footage + separate VO, so the script can be rewritten
without re-rendering video), `demo_screen_vo` (uses the brand's *real* captured
screenshots rather than generating fake UI).

This is the layer the graph GUI will sit on later. The presets are the data the
editor would produce; nothing about the engine assumes a human wrote the JSON.

### Caching

Every node caches on a hash of its type + resolved params, and bound inputs are
pinned to `inputs.json`. A rerun costs nothing:

```
run 1   6 fal calls, 2 LLM calls
run 2   0 fal calls, 0 LLM calls — all cached, identical output
```

Use `--fresh` to rebind the creative and invalidate. This is what makes editing
graph structure affordable once real rendering is switched on.

Cached results carry a `dry_run` marker. The moment a real `FAL_KEY` is present,
any stubbed entry is discarded and regenerated — otherwise adding the key would
silently replay `dry-run.local` placeholders and look like a successful render.
LLM nodes are unaffected and stay cached, so switching to real rendering costs no
extra tokens.

## Usage

```bash
python3 run.py kit https://carouly.eu      # capture + brand kit
python3 run.py match carouly               # rank templates
python3 run.py video carouly --concept 0   # produce (dry run without FAL_KEY)
python3 run.py all https://carouly.eu      # everything
python3 run.py templates                   # list templates
python3 run.py graph ugc_talking_head      # print a DAG
```

Output lands in `workspace/<slug>/`, mirroring AdAnt's artifact layout:
`brand.json`, `brandkit.md`, `assets/`, `capture/`, `pages/`, `fix_evidence.json`,
`template_match.json`, `video/<template>__<concept>/`, and `trace.jsonl`.

## Config

Keys are read from the Next.js app's `.env.local`, so there is one key store.

| Var | Purpose |
|---|---|
| `OPEN_ROUTER_API` | required, already set |
| `FAL_KEY` | **not set** — until it is, video nodes are stubbed |
| `CAROULY_MODEL_SYNTH` | override per role, e.g. `anthropic/claude-sonnet-4.5` |
| `CAROULY_DRY_RUN=1` | force stubs even with a key |

## Verified against

| Site | Path exercised | Result |
|---|---|---|
| carouly.eu | render 500s → HTTP fallback | 8 assets, palette matches the real brand tokens exactly |
| linear.app | render 200, normal path | 11 assets, Cloudflare CDN URLs handled |

Running against a second, unrelated site is what surfaced most of the real bugs
(silent asset overwrites, orphaned files, a dead trace log). Worth repeating with
a third before porting.

## Known rough edges

- **`openrouter/free` is stochastic.** It routes to whichever free model is spare,
  so output quality swings between runs and some runs need a retry. Guards are in
  place at every model boundary (JSON repair, schema key validation, synthesis
  retry, deterministic input fallback), but the writing is visibly weaker than a
  paid model. Set `CAROULY_MODEL_SYNTH` to a paid model before judging creative
  quality — the structure is what this prototype proves, not the prose.
- **Asset descriptions are inferred from filenames**, not from looking at the
  images. That works when filenames are meaningful (`bitter.jpg` on a page about
  bitter coffee) and fails silently when they are not. Restricted to product
  imagery for that reason. A vision pass over the contact sheet would fix it.
- fal model IDs churn; they are centralised in `MODELS` in `tools/falai.py`.
- Single-page capture only. Multi-page crawl is a stage-1 change, nothing else.
- Nothing has been rendered through fal yet — every video path is verified in dry
  run only. The first real render will surface payload-shape mismatches per model.
- **Clips render sequentially.** They are pure IO waits on fal, so three 60s
  renders take three minutes instead of one. The topological sort already knows
  which nodes are independent; parallelising a level is the biggest latency win
  available and is not done yet.
- **No cost estimate before spending.** There is no way to see what a graph will
  cost until it has already charged you.
- **The audio-capable model list is unverified against live fal.** Veo 3's
  image-to-video ids and the Nano Banana Pro edit endpoint are written from
  documentation, not from a successful call. If an id is wrong the run fails
  loudly at submit, and every id lives in `MODELS` in `tools/falai.py`.
- **How strongly image-to-video holds the reference face is unmeasured.** The
  architecture is right, but only a real render shows whether Veo 3 keeps the
  master frame's identity through 8 seconds of speech. If it drifts, the lever is
  a last-frame as well as a first-frame.
- **No unit tests.** The pure logic (`asset_filename`, `resolve`, `order`,
  `_similarity`, `_unfence`, `build_srt`) is where the subtle bugs actually were,
  and it is trivially testable without network.

## Porting to the website

The stage boundaries are the API boundaries. `stages/` functions each take and
return plain dicts, so they map to route handlers or queue jobs directly. The
workflow JSON is storage-ready as-is — templates become rows, `run.json` becomes
the job record, and the node cache becomes the resume point for a failed render.
