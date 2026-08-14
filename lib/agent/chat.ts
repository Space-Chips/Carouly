/**
 * The conversation.
 *
 * One loop, one endpoint. A pasted address and a typed sentence go down the same
 * path — the address is just a message the agent happens to answer by calling
 * `read_site`. That is why the composer can be a prompt bar instead of a URL
 * field, and why "actually our pricing starts at £14" is a thing you can say
 * halfway through a run rather than a form you have to go and find.
 *
 * A turn ends in one of three ways: the agent runs out of things to do, it asks
 * the person a question, or it fails. All three close the stream cleanly, and
 * the client carries the transcript and the accumulated context into the next
 * turn — so the server holds nothing between requests and a cold instance costs
 * a round trip rather than the run.
 */

import { encodeEvent, type RunEvent, type StudioContext } from "@/lib/agent/events";
import { hasModel, MODEL } from "@/lib/agent/llm";
import { AskUser, buildTools, type ToolWorld } from "@/lib/agent/tools";
import { makeRecorder } from "@/lib/assets/recorder";
import { freeWallet, makeWallet, NeedsCredits } from "@/lib/credits/wallet";

const SYSTEM = `You are Carouly. You turn a customer's website into short vertical video for TikTok, Reels and Shorts.

How you work:
- Given an address, read it, look around the rest of the site, build the brand kit, then show template options. Do not narrate a plan first — just start.
- Between tools, say at most one short sentence about what you found or what is next. Never repeat what a tool card already shows. Never list what you are about to do.
- After suggest_templates, STOP. The person is choosing. Do not call make_video until they have picked one.
- Once they pick a format, call cast_actor and STOP again. Who is on camera is their decision too, and the shelf is already ranked for their audience — picking for them is the one thing that step exists to prevent. Then make_video.
- After a video is complete, publish it only when the person explicitly asks. Use publish_video; never post automatically just because make_video finished.

Formats:
- The shipped templates cover the formats somebody built. When an idea genuinely does not fit one — a comparison, an unboxing, something with a structure none of them have — call compose_template and write a graph for it rather than forcing it into the nearest.
- Prefer a shipped template when one honestly fits. A composed graph is untested by definition, so it should be a considered choice and not a reflex.
- Say which you did and why, in one line.

Asking:
- If something you need is genuinely not on the site — what it costs, what the product actually does, who it is for — call ask_user immediately. Do not guess, do not hedge, do not write "pricing not stated" into the kit and carry on.
- One question at a time, plainly worded, and say in one line what you already looked at.
- Never ask about something you have not looked for, and never ask for something the answer to which is already in the conversation.

Never starting over:
- A run happens once. Anything already done is listed for you as "Already done in this run" — treat that list as work you personally did a minute ago, because you did.
- A site that has been read is not read again. A kit that exists is not rebuilt. Pages already looked around are not looked around again. You do not need to re-run a tool to see its result: it is in front of you.
- Redo something only when the person has said something that genuinely changes it, and then only that thing. A note about who is on camera changes the video and nothing before it. A correction to what they sell changes the kit — rebuild that one, carry on from there.
- Every second turn is a follow-up, not a fresh start. Their answer to your question, their correction, their choice of format: none of those are reasons to read the site again.

Being interrupted:
- The person can stop you mid-run, add something, and tell you to carry on. Pick up where it left off.
- Do not narrate the resumption. No "continuing where we left off" — just do the next thing.

Voice: plain, direct, no marketing register, no exclamation marks, no emoji. Contractions are fine. Never say "Great!", "Certainly", or "I'll now".`;

type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
};

export type Turn = { role: "user" | "assistant"; content: string };

const call = async (body: Record<string, unknown>) => {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPEN_ROUTER_API?.trim()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      "X-Title": "Carouly",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `The model is not answering (${response.status}): ${(await response.text()).slice(0, 200)}`
    );
  }

  return response.json();
};

export const streamTurn = ({
  message,
  history,
  context,
  userId,
  balance,
  signal,
}: {
  message: string;
  history: Turn[];
  context: StudioContext;
  /**
   * Who is running this, so the run can record what it makes into their
   * library and charge what it spends to their balance. Optional so the agent
   * stays runnable from a script; a run without one keeps nothing and is free.
   */
  userId?: string | null;
  /**
   * Their balance when the turn started.
   *
   * Passed in rather than read here because the route has already resolved who
   * they are, and a second round trip to answer a question that has just been
   * answered is a round trip in the critical path of every message. It is a
   * starting point, not the authority: every charge goes to the database, which
   * is the only thing that can hold a lock.
   */
  balance?: number;
  /** Aborts when the person presses stop, or the connection drops. */
  signal?: AbortSignal;
}): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const startedAt = Date.now();
      let closed = false;

      const emit = (event: RunEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          // The reader has gone. Everything after this is bookkeeping the
          // client will never see, and it must not take the run down with it.
          closed = true;
        }
      };

      /**
       * Stopping has to actually stop.
       *
       * Aborting only on the client would leave this loop running — still
       * calling tools, still spending — with nobody reading the output. So the
       * signal is checked between steps and between tool calls, which are the
       * only two places it is safe to walk away from: mid-tool there is a
       * request in flight whose result we would rather record than discard.
       */
      const stopping = () => signal?.aborted === true;

      /**
       * Stop before the platform does.
       *
       * The route declares `maxDuration = 300`, and when a serverless function
       * reaches its ceiling it is killed — the response body just ends, with no
       * status and no chance to write a final event. The client cannot tell that
       * apart from a successful finish except by noticing no terminal event
       * arrived, and whatever tool was mid-flight is simply abandoned.
       *
       * Measured turn costs make this a real ceiling rather than a theoretical
       * one: reading a site, researching it and writing the kit is 86–164s, and
       * the brand kit alone has taken 128s. `make_video` is minutes. So the turn
       * keeps its own clock, a little under the function's, and spends what is
       * left saying what happened.
       */
      const budgetMs = Number(process.env.CAROULY_TURN_BUDGET_MS ?? 280_000);
      const outOfTime = () => Date.now() - startedAt > budgetMs;

      const working: StudioContext = structuredClone(context);
      let currentId = "";

      const wallet = userId
        ? makeWallet({ userId, balance: balance ?? 0, emit })
        : freeWallet();

      const world: ToolWorld = {
        context: working,
        userId,
        emit,
        currentId: () => currentId,
        wallet,
        library: makeRecorder(userId ?? null, emit, () => currentId),
      };

      try {
        if (!hasModel()) {
          throw new Error(
            "No model key is configured, so there is nothing to run the agent on."
          );
        }

        /**
         * The turn itself costs one credit, taken before the first model call.
         *
         * Charged per turn rather than per model call inside the loop. A single
         * message can take a dozen steps, and billing each of them would put a
         * dozen near-identical lines in somebody's history for one sentence they
         * typed — a history nobody can read is not a record of anything.
         *
         * It has to be a real charge rather than a rounding-to-zero, because
         * conversation is not free to us either and because an account at zero
         * must stop somewhere. Stopping at "you cannot start another turn" is a
         * far kinder place than stopping halfway through one.
         */
        await wallet.charge("chat_turn");

        const tools = buildTools(world);
        const byName = new Map(tools.map((tool) => [tool.name, tool]));

        const ledger = alreadyKnown(working);

        const messages: Message[] = [
          { role: "system", content: SYSTEM },
          ...history.map((turn) => ({ role: turn.role, content: turn.content })),
          // The ledger rides on the person's own message rather than arriving as
          // a message of its own.
          //
          // Its position is deliberate and worth keeping: twenty turns later a
          // note at the top of the conversation is scenery, and a note here is
          // read as part of the instruction — and this note is the only thing
          // standing between an answered question and the whole pipeline running
          // a second time.
          //
          // It used to be its own `role: "system"` entry in this exact slot, and
          // that broke every turn after the first. The agent runs on Anthropic
          // through OpenRouter, and Anthropic only accepts a system prompt as the
          // top-level `system` field — a `system` role in the middle of
          // `messages` is rejected outright with `messages.2: role 'system' must
          // follow a 'user'`. Turn one has no ledger and so always worked, which
          // is what made this look like a problem with picking a template rather
          // than a problem with every follow-up: the 400 landed before any tool
          // ran, so choosing a format failed instantly and identically every
          // time. Folding the text into the user turn keeps the placement and
          // the recency, and is a shape every provider accepts.
          { role: "user", content: ledger ? `${ledger}\n\n${message}` : message },
        ];

        // Twelve is generous for a full first run — read, research, build,
        // suggest is four — and low enough that a model stuck in a loop stops
        // costing money before anybody notices.
        let ranOut = false;

        for (let step = 0; step < 12; step++) {
          if (stopping()) break;

          // Checked between steps rather than mid-tool: a tool with a request in
          // flight has a result worth keeping, and the context published after it
          // is what lets the next turn carry on instead of starting over.
          if (outOfTime()) {
            ranOut = true;
            break;
          }

          const reply = (await call({
            model: MODEL.agent,
            messages,
            tools: tools.map((tool) => ({
              type: "function" as const,
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
              },
            })),
            max_tokens: 1200,
          }))?.choices?.[0]?.message as Message | undefined;

          if (!reply) throw new Error("The model returned nothing.");

          messages.push(reply);

          const said = (reply.content ?? "").trim();
          if (said) emit({ t: "say", text: said });

          const calls = reply.tool_calls ?? [];
          if (!calls.length) break;

          let paused = false;

          for (const toolCall of calls) {
            if (stopping()) {
              paused = true;
              break;
            }

            const tool = byName.get(toolCall.function.name);
            currentId = toolCall.id;

            let args: Record<string, string> = {};
            try {
              args = JSON.parse(toolCall.function.arguments || "{}");
            } catch {
              args = {};
            }

            if (!tool) {
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: `No such tool: ${toolCall.function.name}`,
              });
              continue;
            }

            emit({
              t: "tool.start",
              id: toolCall.id,
              name: tool.name,
              label: tool.label ?? tool.name,
              detail: Object.values(args)[0],
            });

            const began = Date.now();

            try {
              const result = await tool.run(args);
              emit({
                t: "tool.end",
                id: toolCall.id,
                ms: Date.now() - began,
                summary: summarise(tool.name, result),
              });

              // Publish what was learned the moment it is learned, rather than
              // once at the end of the turn. This is what makes stopping
              // survivable: interrupt a run after it has read the site and the
              // capture is already on the client, so carrying on later costs a
              // sentence instead of the whole pipeline again.
              emit({ t: "context", context: working });

              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: result.slice(0, 12_000),
              });
            } catch (error) {
              if (error instanceof AskUser) {
                // Not a failure. The agent has decided it needs a person, and
                // the turn is over — the answer arrives as the next message.
                emit({
                  t: "tool.end",
                  id: toolCall.id,
                  ms: Date.now() - began,
                  summary: "waiting on you",
                });
                emit({
                  t: "ask",
                  id: toolCall.id,
                  question: error.question,
                  why: error.why,
                  placeholder: error.placeholder,
                });
                paused = true;
                break;
              }

              if (error instanceof NeedsCredits) {
                // Also not a failure. The tool refused before spending anything,
                // and what happens next is a decision rather than a retry — so
                // the turn ends here and the card offers the top-up.
                emit({
                  t: "tool.end",
                  id: toolCall.id,
                  ms: Date.now() - began,
                  summary: "needs credits",
                });
                emit({
                  t: "credits.short",
                  gate: error.gate,
                  need: error.need,
                  have: error.have,
                });
                paused = true;
                break;
              }

              const detail = error instanceof Error ? error.message : String(error);
              emit({ t: "tool.fail", id: toolCall.id, ms: Date.now() - began, error: detail });
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: `Failed: ${detail}`,
              });
            }
          }

          if (paused) break;

          // suggest_templates hands control to the person. Looping again here
          // would have the agent pick for them, which is the one decision the
          // whole screen exists to let them make.
          if (
            calls.some((entry) =>
              ["suggest_templates", "cast_actor"].includes(entry.function.name)
            )
          ) {
            break;
          }
        }

        // Published before the closing event either way, so whatever this turn
        // established is on the client and the next one carries on from it.
        emit({ t: "context", context: working });

        if (ranOut) {
          emit({
            t: "run.error",
            error: "This turn ran out of time before it finished.",
            hint:
              'Everything done so far is kept — say "carry on" and it will pick up ' +
              "from there rather than starting again.",
          });
        }

        emit({ t: "run.end", ms: Date.now() - startedAt });
      } catch (error) {
        // An empty balance at the top of the turn arrives here rather than in
        // the loop's own handler, because the turn charge happens before there
        // is a loop. Same event, same card: it is a decision, not a failure, and
        // nothing has been spent.
        if (error instanceof NeedsCredits) {
          emit({
            t: "credits.short",
            gate: error.gate,
            need: error.need,
            have: error.have,
          });
          emit({ t: "context", context: working });
          emit({ t: "run.end", ms: Date.now() - startedAt });
          return;
        }

        emit({
          t: "run.error",
          error: error instanceof Error ? error.message : String(error),
          hint: hasModel() ? undefined : "Set OPEN_ROUTER_API and try again.",
        });
        emit({ t: "context", context: working });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });
};

/**
 * Everything this run has already established, as a standing instruction.
 *
 * The history the client sends back is only what the agent *said*, and the
 * system prompt tells it to say almost nothing — so a turn that read a site,
 * researched it and built a kit can leave behind no assistant message at all.
 * From the model's side the next turn then looks like a conversation that has
 * never done anything, and it quite reasonably starts at the beginning.
 *
 * This is the correction: the state, named, every turn. The tools enforce it
 * as well — a prompt is a request, and this is a request — but the two together
 * are what stop a run from appearing to restart itself.
 *
 * Returns the text, not a message. The caller prepends it to the person's own
 * turn; see the note there for why it cannot be a message of its own.
 */
const alreadyKnown = (context: StudioContext): string | null => {
  const done: string[] = [];

  if (context.site) done.push(`the site ${context.site} has been read`);
  if (context.research) done.push("its other pages have been looked around");
  if (context.kit) {
    done.push(
      `a brand kit exists for ${context.kit.brand_name}, with these ideas already on screen: ${(
        context.kit.video_concepts ?? []
      )
        .map((concept) => concept.title)
        .join("; ")}`
    );
  }
  if (context.templates?.length) {
    done.push(
      `template options have been shown (${context.templates
        .map((template) => template.id)
        .join(", ")})`
    );
  }
  if (context.actor) {
    done.push(
      `an actor is cast (${context.actor.persona ?? context.actor.look.slice(0, 60)}) — ` +
        "make_video will use this exact person automatically, so do not describe a new " +
        "one and do not call cast_actor again"
    );
  }

  const answers = Object.values(context.answers ?? {});
  if (!done.length && !answers.length) return null;

  // Bracketed, because it is now part of the user's turn and has to be legible
  // as the run's own bookkeeping rather than as something the person typed.
  return [
    "[Run state, not from the owner:",
    done.length
      ? `Already done in this run — do not do any of it again: ${done.join("; ")}.`
      : "",
    answers.length ? `The owner has told you: ${answers.join(" | ")}` : "",
    "Carry on from here. Calling a tool to remind yourself what you already " +
      "have is not free and looks, to the person watching, like you have lost " +
      "your place and started over.]",
  ]
    .filter(Boolean)
    .join("\n");
};

/** A one-line receipt for the thread. The payload goes to the model, not the page. */
const summarise = (name: string, result: string) => {
  try {
    const data = JSON.parse(result) as Record<string, unknown>;

    if (name === "read_site") {
      return `${data.copy_chars} chars · ${
        (data.palette as string[])?.length ?? 0
      } colours`;
    }
    if (name === "research_site") {
      const pages = (data.pages_checked as unknown[])?.length ?? 0;
      return `${pages} page${pages === 1 ? "" : "s"}`;
    }
    if (name === "build_brand_kit") {
      return `${data.verified_quotes} quotes verified, ${data.dropped_quotes} dropped`;
    }
    if (name === "suggest_templates") {
      const picked = (data.recommended as unknown[])?.length ?? 0;
      const rest = Number(data.also_browsable ?? 0);
      return `${picked} picked of ${picked + rest}`;
    }
    if (name === "cast_actor") {
      const shown = (data.shown as unknown[])?.length ?? 0;
      return shown ? `${shown} to choose from` : "nobody to cast";
    }
    if (name === "make_video") {
      return `${Math.round(Number(data.seconds))}s`;
    }
    if (name === "publish_video") {
      const published = (data.published as string[]) ?? [];
      const failed = (data.failed as unknown[]) ?? [];
      return `${published.length} posted${failed.length ? ` · ${failed.length} failed` : ""}`;
    }
  } catch {
    // Not JSON — fall through.
  }

  return "";
};
