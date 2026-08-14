/**
 * The studio's agent loop, driven from a terminal.
 *
 *   npx tsx --env-file-if-exists=.env.local scripts/flow.ts northline.coffee
 *   npx tsx --env-file-if-exists=.env.local scripts/flow.ts northline.coffee --make
 *
 * `scripts/ad.ts` runs one graph with a hand-written brand. This runs the thing
 * above it: the real `streamTurn`, the real tools, the real context handoff
 * between turns — everything `/api/studio/chat` does, minus Clerk. It exists
 * because the studio is behind a login, and the pipeline underneath it is where
 * the interesting failures are, so waiting on a session to find them is a bad
 * trade.
 *
 * It prints the event stream the browser would have rendered, so a run that goes
 * wrong tells you which tool and which node it went wrong in.
 *
 * Without `--make` it stops after the templates are offered, which is where the
 * studio stops and waits for a person anyway. That first turn is the whole
 * read → research → kit → rank path and costs a few model calls. `--make` adds
 * the choice and the render, which is minutes on the local backend.
 */

import { streamTurn, type Turn } from "@/lib/agent/chat";
import {
  decodeEvents,
  identityFor,
  type RunEvent,
  type StudioContext,
} from "@/lib/agent/events";
import { GATE_COPY } from "@/lib/credits/gates";
import * as render from "@/lib/tools/render";

const [site, ...flags] = process.argv.slice(2);

if (!site) {
  console.error(
    'Usage: tsx scripts/flow.ts <site> [--make] [--answer "text"]'
  );
  process.exit(1);
}

const alsoMake = flags.includes("--make");

/**
 * What to reply if the agent stops to ask something.
 *
 * `ask_user` ends the turn, so answering it is a second turn carrying the first
 * one's context — the same path a template choice takes, and the path that used
 * to fail. Worth being able to drive from here rather than only by hand.
 */
const answerFlag = flags.indexOf("--answer");
const answer = answerFlag === -1 ? null : (flags[answerFlag + 1] ?? null);

/**
 * Run on a starved balance, to see where the meter stops the run.
 *
 * The harness has no signed-in user, so a run from here is normally unmetered —
 * `streamTurn` hands the tools a wallet that always says yes. `--broke` passes a
 * balance of zero against a synthetic user instead, which is the only way to
 * exercise the refusal path without a real account. Pair with `--make` to check
 * that the refusal happens before anything is spent.
 */
const broke = flags.includes("--broke") || flags.includes("--free");

/** Wall-clock from the start of the run, so slow steps are obvious. */
const t0 = Date.now();
const stamp = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`.padStart(7);

/**
 * One turn, read to completion, returning what the client would have kept.
 *
 * The context and history threading is the part worth copying exactly: the
 * server holds nothing between turns, so a follow-up that does not carry these
 * forward makes the agent start the whole pipeline again — which was a real bug
 * in the studio once, and is the thing this harness is most useful for catching.
 */
const runTurn = async (
  message: string,
  history: Turn[],
  context: StudioContext
): Promise<{ history: Turn[]; context: StudioContext; events: RunEvent[] }> => {
  console.log(`\n\x1b[1m▸ you\x1b[0m  ${message}\n`);

  // No user id, so the wallet is the free one and nothing is charged: this
  // harness exists to exercise rendering, not billing. `--broke` opts into the
  // metered path against a synthetic account with nothing on it.
  const stream = streamTurn({
    message,
    history,
    context,
    ...(broke ? { userId: "flow-harness", balance: 0 } : {}),
  });
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let said = "";
  const seen: RunEvent[] = [];
  let latest = context;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const { events, remainder } = decodeEvents(buffer);
    buffer = remainder;

    for (const event of events) {
      seen.push(event);
      report(event);
      if (event.t === "say") said += `${said ? "\n" : ""}${event.text}`;
      if (event.t === "context") latest = event.context;
    }
  }

  return {
    history: [
      ...history,
      { role: "user", content: message },
      ...(said ? [{ role: "assistant" as const, content: said }] : []),
    ],
    context: latest,
    events: seen,
  };
};

const report = (event: RunEvent) => {
  const at = `\x1b[2m${stamp()}\x1b[0m`;

  switch (event.t) {
    case "say":
      return console.log(`${at}  \x1b[36m${event.text}\x1b[0m`);
    case "tool.start":
      return console.log(`${at}  \x1b[1m${event.label}\x1b[0m ${dim(event.detail)}`);
    case "tool.step":
      return console.log(`${at}    · ${event.label} ${dim(event.detail)}`);
    case "tool.end":
      return console.log(`${at}    \x1b[32m✓\x1b[0m ${event.ms}ms ${dim(event.summary)}`);
    case "tool.fail":
      return console.log(`${at}    \x1b[31m✗ ${event.error}\x1b[0m`);
    case "artifact":
      return console.log(`${at}  \x1b[35m[${event.artifact.kind}]\x1b[0m ${summarise(event)}`);
    case "graph":
      return console.log(
        `${at}  \x1b[33mgraph ${event.template}\x1b[0m — ${event.nodes
          .map((node) => node.id)
          .join(" → ")}`
      );
    case "node.start":
      return console.log(`${at}    ▷ ${event.node}`);
    case "node.ok":
      return console.log(
        `${at}    \x1b[32m▪\x1b[0m ${event.node} ${event.ms}ms${
          event.cached ? " (cached)" : ""
        }${event.pinned ? " (pinned)" : ""}`
      );
    case "node.fail":
      return console.log(`${at}    \x1b[31m▪ ${event.node}: ${event.error}\x1b[0m`);
    case "choice":
      return console.log(
        `${at}  \x1b[33mchoose:\x1b[0m ${event.items
          .map((item) => `${item.id}${item.score !== undefined ? ` (${item.score})` : ""}`)
          .join(", ")}`
      );
    case "cast":
      return console.log(
        `${at}  \x1b[33mcast for ${event.template}:\x1b[0m ${event.items
          .map((item) => `${item.name} (${item.source})`)
          .join(", ")}${
          event.library?.length ? dim(` +${event.library.length} more`) : ""
        }`
      );
    case "ask":
      return console.log(`${at}  \x1b[33m? ${event.question}\x1b[0m ${dim(event.why)}`);
    case "credits":
      return console.log(
        `${at}  \x1b[35m−${event.charged}\x1b[0m ${dim(
          `${event.operation ?? "adjustment"} · ${event.balance} left`
        )}`
      );
    case "credits.short":
      return console.log(
        `${at}  \x1b[33mOUT OF CREDITS (${event.gate}: needs ${event.need}, has ${event.have})\x1b[0m ${dim(
          GATE_COPY[event.gate].headline
        )}`
      );
    case "asset.saved":
      return console.log(`${at}  \x1b[34mkept ${event.kind}\x1b[0m ${event.name}`);
    case "run.error":
      return console.log(`${at}  \x1b[31mRUN ERROR: ${event.error}\x1b[0m ${dim(event.hint)}`);
    case "run.end":
      return console.log(`${at}  \x1b[2m— turn ended (${event.ms}ms)\x1b[0m`);
    default:
      return;
  }
};

const dim = (text?: string) => (text ? `\x1b[2m${text}\x1b[0m` : "");

const summarise = (event: Extract<RunEvent, { t: "artifact" }>) => {
  const art = event.artifact;
  switch (art.kind) {
    case "palette":
      return art.colors.join(" ");
    case "assets":
      return `${art.items.length} images`;
    case "brand":
      return `${art.name} — ${art.valueProps.length} props, ${art.evidence.length} quotes, ${art.dropped} dropped`;
    case "concepts":
      return art.items.map((item) => item.title).join(" | ");
    case "actor":
      return art.name;
    case "video":
      return `${art.seconds}s ${art.url ?? ""}`;
    default:
      return "";
  }
};

/* ------------------------------------------------------------------- run --- */

console.log(
  `\x1b[1mCarouly flow\x1b[0m  site=${site}  render=${render.mode()}` +
    `  model=${process.env.OPEN_ROUTER_API ? "set" : "\x1b[31mMISSING\x1b[0m"}`
);

let state = await runTurn(site, [], {});

// Answer a question before doing anything else with the run: everything after it
// depends on the agent having what it stopped for.
const asked = state.events.find(
  (event): event is Extract<RunEvent, { t: "ask" }> => event.t === "ask"
);

if (asked && answer) {
  state = await runTurn(answer, state.history, state.context);
} else if (asked) {
  console.log(
    `\n\x1b[33mThe run stopped to ask something. Re-run with --answer "…" to continue it.\x1b[0m`
  );
}

if (alsoMake) {
  // Pick the top-ranked template exactly as clicking the first card would, so
  // the second turn exercises the context handoff rather than a fresh start.
  const choice = state.events.find(
    (event): event is Extract<RunEvent, { t: "choice" }> => event.t === "choice"
  );
  const pick = choice?.items[0];

  if (!pick) {
    console.log("\n\x1b[31mNo templates were offered, so there is nothing to make.\x1b[0m");
  } else {
    state = await runTurn(
      `Make the ${pick.name}${pick.concept ? ` for "${pick.concept}"` : ""}.`,
      state.history,
      state.context
    );

    /**
     * Casting is a second stop, so `--make` has to answer it too.
     *
     * Answered the way the card does rather than by talking to the agent: the
     * chosen identity goes into the context, because that is what `make_video`
     * pins into the graph. Replying with a sentence alone would leave the run
     * casting whoever the model imagined from it, which is the exact thing this
     * step exists to stop.
     */
    const casting = state.events.find(
      (event): event is Extract<RunEvent, { t: "cast" }> => event.t === "cast"
    );
    const who = casting?.items[0];

    if (who) {
      state = await runTurn(`Cast ${who.name}. Carry on and make the video.`, state.history, {
        ...state.context,
        actor: identityFor(who),
      });
    }
  }
}

/* Everything the next turn would carry, which is the thing most worth eyeballing
   after a run: a missing kit or a missing site here is a restart waiting to
   happen. */
console.log("\n\x1b[1mcontext carried forward\x1b[0m");
console.log({
  site: state.context.site,
  captured: Boolean(state.context.capture),
  researched: Boolean(state.context.research),
  kit: state.context.kit?.brand_name,
  concepts: state.context.kit?.video_concepts?.length,
  templates: state.context.templates?.map((template) => template.id),
  cast: state.context.actor?.persona ?? Boolean(state.context.actor),
});
