"use client";

import { ArrowDown, ArrowRight, SidebarSimple, SquaresFour } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { GATE_COPY, shortfall } from "@/lib/credits/gates";
import { normalizeSite } from "@/lib/site-url";

import ArtifactCard, { PendingCard } from "@/components/studio/artifacts";
import AskCard from "@/components/studio/AskCard";
import CastingCard from "@/components/studio/CastingCard";
import Composer from "@/components/studio/Composer";
import GraphView from "@/components/studio/GraphView";
import Inspector from "@/components/studio/Inspector";
import RenderJob from "@/components/studio/RenderJob";
import Meter from "@/components/credits/Meter";
import Sidebar from "@/components/studio/Sidebar";
import TemplateCards from "@/components/studio/TemplateCards";
import ToolBlock from "@/components/studio/ToolBlock";
import {
  dropChat,
  EMPTY,
  fileUnderSite,
  loadChat,
  loadIndex,
  moveChat,
  nameProjectOf,
  newId,
  saveChat,
  loadPanels,
  saveIndex,
  savePanels,
  titleFrom,
  type ChatBody,
  type Index,
} from "@/components/studio/store";
import {
  applyEvent,
  collectState,
  completedTools,
  markCutOff,
  markStopped,
  seedBlocks,
  type Block,
  type StudioSeed,
} from "@/components/studio/thread";
import {
  decodeEvents,
  type ActorIdentity,
  type RunEvent,
  type StudioContext,
  type TemplateCandidate,
} from "@/lib/agent/events";

/**
 * The studio.
 *
 * One screen. Projects on the left, the run in the middle, what it knows on the
 * right — and both sides fold away, because on a laptop the transcript wants the
 * room and there is nothing in either panel you need while reading.
 */
export default function Studio({
  initialSite,
  seed,
  openingBalance,
}: {
  initialSite?: string;
  /** A kit and/or actor to start from, resolved server-side from `?use=`. */
  seed?: StudioSeed;
  /** Their balance when the page was rendered. The stream keeps it current. */
  openingBalance: number;
}) {
  const [index, setIndex] = useState<Index>({ projects: [], chats: [] });
  const [chatId, setChatId] = useState<string | null>(null);
  const [body, setBody] = useState<ChatBody>(EMPTY);
  const [busy, setBusy] = useState(false);
  /**
   * The balance, kept here rather than in the transcript.
   *
   * It is a property of the account, not of a conversation: switching chats
   * must not change it, and reloading a saved transcript must not restore an
   * old one. So it starts from the server's number and is updated only by the
   * `credits` events the live run emits.
   */
  const [balance, setBalance] = useState(openingBalance);
  const [panels, setPanels] = useState({ rail: true, kit: true });
  const railOpen = panels.rail;
  const kitOpen = panels.kit;

  const togglePanel = (which: "rail" | "kit", open: boolean) =>
    setPanels((current) => {
      const next = { ...current, [which]: open };
      savePanels(next);
      return next;
    });
  const [adrift, setAdrift] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const abort = useRef<AbortController | null>(null);
  const booted = useRef(false);
  const seeded = useRef(false);

  /**
   * The transcript, held where it can be read synchronously.
   *
   * This exists because of a real bug, and the bug is worth naming so it does
   * not come back. A turn needs the accumulated context and history *at the
   * moment it fires*, and the previous version got them by assigning to outer
   * variables from inside a `setBody` updater — then read those variables in the
   * same tick, to build the request body.
   *
   * React does not promise the updater has run by then. It sometimes does, via
   * the eager-state optimisation when the queue is empty, and sometimes does
   * not — and never when the updater returns the state unchanged, which is
   * exactly what the non-echoing paths do. So follow-up turns were posting an
   * empty context and an empty history: the agent arrived with no site and no
   * kit, and quite sensibly asked for the address and read it all again.
   *
   * A ref updated synchronously alongside the state removes the race entirely.
   */
  const bodyRef = useRef<ChatBody>(EMPTY);

  /** The only way state changes, so the ref can never drift from it. */
  const updateBody = useCallback(
    (next: ChatBody | ((current: ChatBody) => ChatBody)) => {
      bodyRef.current =
        typeof next === "function"
          ? (next as (current: ChatBody) => ChatBody)(bodyRef.current)
          : next;
      setBody(bodyRef.current);
    },
    []
  );

  /* ------------------------------------------------------------ storage --- */

  useEffect(() => {
    setPanels(loadPanels());

    const loaded = loadIndex();
    setIndex(loaded);

    // A run started from the library. Resolved on the server from `?use=`, so
    // by the time it gets here it is real data rather than a promise to fetch
    // some. Wins over both `initialSite` and the most-recent chat — it is the
    // most explicit intent of the three.
    // Guarded, because the cost of this effect running twice is a duplicate
    // chat rather than a wasted render — and `seed` is an object prop, so its
    // identity is exactly the kind of thing that is stable until one day it is
    // not.
    const project = loaded.projects[0];
    if (seed && (seed.kit || seed.actor) && project && !seeded.current) {
      seeded.current = true;
      const id = newId();
      let next: Index = {
        ...loaded,
        chats: [
          {
            id,
            projectId: project.id,
            title: seed.label ?? seed.kit?.brand_name ?? "Library run",
            updatedAt: Date.now(),
          },
          ...loaded.chats,
        ],
      };

      // A kit already knows which site it came from and what that brand is
      // called, so a run reopened from the library files itself the same way a
      // freshly pasted address does — and skips the guessed name entirely.
      const host = seed.kit?.sourceUrl ? normalizeSite(seed.kit.sourceUrl) : null;
      if (host?.ok) {
        next = fileUnderSite(next, id, host.host);
        if (seed.kit?.brand_name) next = nameProjectOf(next, id, seed.kit.brand_name);
      }

      setIndex(next);
      saveIndex(next);
      setChatId(id);
      updateBody({
        blocks: seedBlocks(seed),
        history: [],
        kept: [],
        context: {
          ...(seed.kit
            ? {
                kit: seed.kit,
                kitId: seed.kitId,
                site: seed.kit.sourceUrl?.replace(/^https?:\/\//, ""),
              }
            : {}),
          ...(seed.actor ? { actor: seed.actor } : {}),
        },
      });
      return;
    }

    const latest = [...loaded.chats].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (latest && !initialSite) {
      setChatId(latest.id);
      updateBody(loadChat(latest.id));
    }
  }, [initialSite, seed, updateBody]);

  // Persist on every change. Cheap — one chat's own key — and it means a reload
  // mid-run loses the tail of the stream rather than the whole conversation.
  useEffect(() => {
    if (chatId) saveChat(chatId, body);
  }, [chatId, body]);

  /**
   * Open a chat.
   *
   * With a project id it was started from that project's own button, so it is
   * pinned there and stays put whatever gets pasted into it. Without one it is
   * unfiled — it sits in the first project only so it has somewhere to be, and
   * the first address typed into it moves it to a folder of its own.
   */
  const startChat = useCallback(
    (projectId?: string) => {
      const project = projectId ?? index.projects[0]?.id;
      if (!project) return null;

      const id = newId();
      const next: Index = {
        ...index,
        chats: [
          {
            id,
            projectId: project,
            title: "New chat",
            updatedAt: Date.now(),
            pinned: Boolean(projectId),
          },
          ...index.chats,
        ],
      };

      setIndex(next);
      saveIndex(next);
      setChatId(id);
      updateBody(EMPTY);
      return id;
    },
    [index, updateBody]
  );

  /* ------------------------------------------------------------- stream --- */

  const send = useCallback(
    async (
      message: string,
      {
        targetId,
        // An answer typed into a question card, or a template picked from the
        // rail, is already on screen where it was given. Echoing it again as a
        // chat bubble says the same thing twice in two different places.
        echo = true,
      }: { targetId?: string; echo?: boolean } = {}
    ) => {
      const id = targetId ?? chatId ?? startChat();
      if (!id) return;

      pinned.current = true;
      setAdrift(false);
      setBusy(true);

      // Read straight off the ref: this is the state as it stands right now,
      // not whatever React has got round to committing.
      const { context, history } = bodyRef.current;

      if (echo) {
        updateBody((current) => ({
          ...current,
          blocks: [
            ...current.blocks,
            { kind: "you" as const, id: newId(), text: message },
          ],
        }));
      }

      // The first thing said in a chat decides where the chat lives. An address
      // is a new client, not a new message, so it opens a project of its own
      // rather than landing in whichever folder happened to be at the top of
      // the rail. Later turns never refile — by then the chat has a home.
      const opening = !history.length;

      setIndex((current) => {
        const titled: Index = {
          ...current,
          chats: current.chats.map((chat) =>
            chat.id === id
              ? {
                  ...chat,
                  updatedAt: Date.now(),
                  title: chat.title === "New chat" ? titleFrom(message) : chat.title,
                }
              : chat
          ),
        };

        const site = opening ? normalizeSite(message) : null;
        const pinned = current.chats.find((chat) => chat.id === id)?.pinned;
        const next = site?.ok && !pinned ? fileUnderSite(titled, id, site.host) : titled;

        saveIndex(next);
        return next;
      });

      const controller = new AbortController();
      abort.current = controller;

      let said = "";
      let stopped = false;
      /**
       * Did the run actually finish, or did the stream just stop arriving?
       *
       * `reader.read()` returning `done` means the body ended, which says nothing
       * about whether the turn completed — a function killed at the platform's
       * time limit ends its body exactly the same way a successful one does. So
       * a terminal event has to be seen, rather than the absence of an exception
       * being treated as success.
       */
      let ended = false;
      let threw = false;

      try {
        const response = await fetch("/api/studio/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, history, context }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            response.status === 401 ? "Sign in to run this." : await response.text()
          );
        }
        if (!response.body) throw new Error("No response body.");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const { events, remainder } = decodeEvents(buffer);
          buffer = remainder;
          if (!events.length) continue;

          for (const event of events) {
            if (event.t === "say") said += `${said ? "\n" : ""}${event.text}`;
            // The three ways a turn legitimately concludes: it ran out of work,
            // it failed, or it is waiting on an answer.
            if (event.t === "run.end" || event.t === "run.error" || event.t === "ask") {
              ended = true;
            }
          }

          // One state update per chunk, not per event: a fast tool emits a dozen
          // node events inside a single chunk, and rendering each separately is
          // a dozen layouts for one visible change.
          // The last context in the chunk, not the first: one arrives after
          // every tool now, so a chunk carrying two would otherwise leave the
          // client holding the older of them.
          const latest = [...events]
            .reverse()
            .find((event) => event.t === "context") as
            | { context: StudioContext }
            | undefined;

          // Same reasoning for the meter: the last balance in the chunk is the
          // true one, and animating through the intermediate values of a chunk
          // that carried three charges would make the number chase itself.
          const charged = [...events]
            .reverse()
            .find((event) => event.t === "credits") as
            | { balance: number }
            | undefined;

          if (charged) setBalance(charged.balance);

          // The guessed name gets one chance to be corrected: the moment the
          // kit lands, the folder takes whatever the brand calls itself. Safe
          // to run on every chunk — `nameProjectOf` ignores anything already
          // named, so this is a no-op for the rest of the run.
          const brand = latest?.context.kit?.brand_name;
          if (brand) {
            setIndex((current) => {
              const next = nameProjectOf(current, id, brand);
              if (next !== current) saveIndex(next);
              return next;
            });
          }

          // Receipts from the run recording what it made. Deduped by id because
          // a reused asset is reported every time it is touched, and the panel
          // is a list of things kept rather than a log of times they were.
          const saved = events.filter(
            (event): event is Extract<RunEvent, { t: "asset.saved" }> =>
              event.t === "asset.saved"
          );

          updateBody((current) => ({
            ...current,
            blocks: events.reduce(applyEvent, current.blocks),
            context: latest?.context ?? current.context,
            kept: saved.length
              ? [
                  ...current.kept.filter(
                    (asset) => !saved.some((event) => event.id === asset.id)
                  ),
                  ...saved.map(({ id, kind, name }) => ({ id, kind, name })),
                ]
              : current.kept,
          }));
        }

      } catch (error) {
        if ((error as Error)?.name === "AbortError") {
          stopped = true;
        } else {
          threw = true;
          updateBody((current) => ({
            ...current,
            blocks: applyEvent(current.blocks, {
              t: "run.error",
              error: error instanceof Error ? error.message : String(error),
            }),
          }));
        }
      } finally {
        // The transcript is committed here rather than after the read loop, so
        // that a turn the person stopped is still remembered. Committing only on
        // a clean finish was the bug that made stopping destructive: the agent
        // came back with no memory of the message it had just been given, let
        // alone what it had done about it.
        // The stream ended without the run saying it had. Nothing threw, so the
        // catch above added nothing, and every tool still in flight would sit at
        // `running` for good — persisted that way, so a reload shows the same
        // frozen step rather than a run that ended.
        const cutOff = !stopped && !threw && !ended;

        updateBody((current) => {
          const finished = completedTools(current.blocks);

          const note = stopped
            ? `[The user stopped you here.${
                finished.length ? ` You had completed: ${finished.join(", ")}.` : ""
              } Carry on from this point — do not repeat that work.]`
            : cutOff
              ? // Written for the model, like the stop note: the next turn has to
                // know this work happened, or it starts the pipeline again.
                `[The connection dropped before you finished.${
                  finished.length ? ` You had completed: ${finished.join(", ")}.` : ""
                } Carry on from this point — do not repeat that work.]`
              : // A turn that said nothing left no assistant message at all, so
                // the next turn read as a conversation in which the agent had
                // never done anything — and it started from the top. The prompt
                // asks for near-silence between tools, so silence is the normal
                // case and this receipt has to stand in for it.
                !said && finished.length
                ? `[No commentary. Tools completed so far: ${finished.join(", ")}.]`
                : "";

          const assistant = [said, note].filter(Boolean).join("\n\n");

          const blocks = stopped
            ? markStopped(current.blocks)
            : cutOff
              ? markCutOff(
                  current.blocks,
                  "The run was cut off before it finished.",
                  finished.length
                    ? `${finished.length} step${
                        finished.length === 1 ? "" : "s"
                      } were kept. Say "carry on" to pick up from there.`
                    : 'Nothing was lost — say "carry on" to try again.'
                )
              : current.blocks;

          return {
            ...current,
            blocks,
            history: [
              ...current.history,
              { role: "user" as const, content: message },
              ...(assistant ? [{ role: "assistant" as const, content: assistant }] : []),
            ],
          };
        });

        abort.current = null;
        setBusy(false);
      }
    },
    [chatId, startChat, updateBody]
  );

  /** A pasted address from the marketing page starts the run on its own. */
  useEffect(() => {
    if (!initialSite || booted.current || !index.projects.length) return;
    booted.current = true;

    // Spend the parameter as it is used.
    //
    // `?site=` is a one-shot instruction, but it stays in the address bar, and
    // every later arrival at that URL — a reload, the back button, restoring the
    // tab tomorrow — reads it again and starts a second run from the top on a
    // site that has already been done. The ref only guards one mount.
    window.history.replaceState(null, "", "/studio");

    const id = startChat();
    if (id) void send(initialSite, { targetId: id });
  }, [initialSite, index.projects.length, startChat, send]);

  /* ------------------------------------------------------------- scroll --- */

  // Instant, not smooth. Smooth-scrolling on every streamed chunk means the view
  // is permanently mid-animation and anything you try to read slides away under
  // you — which is what made the earlier version feel broken. This just keeps
  // the bottom edge pinned, and lets go the moment you scroll up.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !pinned.current) return;

    const frame = requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [body.blocks]);

  const onScroll = () => {
    const element = scrollRef.current;
    if (!element) return;

    const atBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight < 80;

    pinned.current = atBottom;
    setAdrift(!atBottom && element.scrollHeight > element.clientHeight + 200);
  };

  const jump = () => {
    const element = scrollRef.current;
    if (!element) return;
    pinned.current = true;
    setAdrift(false);
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  };

  /* --------------------------------------------------------------- acts --- */

  const answer = (blockId: string, text: string) => {
    updateBody((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.id === blockId && block.kind === "ask" ? { ...block, answer: text } : block
      ),
      context: {
        ...current.context,
        answers: { ...(current.context.answers ?? {}), [blockId]: text },
      },
    }));
    void send(text, { echo: false });
  };

  const choose = (blockId: string, template: TemplateCandidate) => {
    updateBody((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.id === blockId && block.kind === "choice"
          ? { ...block, chosen: template.id }
          : block
      ),
    }));
    void send(
      `Make the ${template.name}${template.concept ? ` for "${template.concept}"` : ""}.`,
      { echo: false }
    );
  };

  /**
   * Who is on camera.
   *
   * The identity goes into the context here, on the client, rather than being
   * described to the agent and read back out of a sentence. That is the same
   * mechanism a library actor already uses — `make_video` pins `context.actor`
   * into the graph's identity node — so a person picked off the shelf and a
   * person reused from the library take exactly one path through the run.
   *
   * The message still gets sent, because the turn has to resume and the agent
   * has to know casting is settled. It is a notification, not the data.
   */
  const cast = (
    blockId: string,
    candidateId: string | undefined,
    person: { name: string; identity: ActorIdentity }
  ) => {
    updateBody((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.id === blockId && block.kind === "cast"
          ? {
              ...block,
              chosen: candidateId,
              cast: {
                name: person.name,
                look: person.identity.look,
                portrait: person.identity.masterFrameUrl || undefined,
              },
            }
          : block
      ),
      // Stored whole. A saved actor arrives carrying their `assetId` and their
      // real master frame, and both are load-bearing downstream: the frame is
      // pinned into the graph's identity node, and the id is what makes the run
      // update that library row instead of filing a near-identical twin.
      context: { ...current.context, actor: person.identity },
    }));

    void send(`Cast ${person.name}. Carry on and make the video.`, { echo: false });
  };

  /**
   * Run one of the ideas.
   *
   * Left deliberately open rather than naming a template: the agent decides
   * whether one of the ranked formats fits, or whether this idea wants a graph
   * of its own. That is a judgement about the idea, which is the sort of thing
   * it is for.
   */
  const runIdea = (title: string) => {
    void send(
      `Make "${title}". Use whichever of the ranked templates genuinely fits. ` +
        `If none of them do, compose a format for it instead.`,
      { echo: false }
    );
  };

  /** Drag, or Alt+Arrow from the keyboard. Either way the chat changes folder. */
  const relocate = (id: string, projectId: string) => {
    setIndex((current) => {
      const chat = current.chats.find((entry) => entry.id === id);
      if (!chat || chat.projectId === projectId) return current;

      const next = moveChat(current, id, projectId);
      saveIndex(next);
      return next;
    });
  };

  const removeChat = (id: string) => {
    const next = { ...index, chats: index.chats.filter((chat) => chat.id !== id) };
    setIndex(next);
    saveIndex(next);
    dropChat(id);

    if (id === chatId) {
      setChatId(null);
      updateBody(EMPTY);
    }
  };

  const removeProject = (id: string) => {
    for (const chat of index.chats.filter((entry) => entry.projectId === id)) {
      dropChat(chat.id);
    }

    const next = {
      projects: index.projects.filter((project) => project.id !== id),
      chats: index.chats.filter((chat) => chat.projectId !== id),
    };

    setIndex(next);
    saveIndex(next);
    if (!next.chats.some((chat) => chat.id === chatId)) {
      setChatId(null);
      updateBody(EMPTY);
    }
  };

  const state = collectState(body.blocks);
  const empty = body.blocks.length === 0;

  // The last tool still running tells us which card shape is about to arrive.
  const pendingTool = (() => {
    const last = [...body.blocks]
      .reverse()
      .find((block) => block.kind === "tool" || block.kind === "artifact");
    return last?.kind === "tool" && last.status === "running" ? last.name : null;
  })();

  return (
    /* Full height: the studio owns the whole viewport, with no app bar above. */
    <div className="flex h-screen">
      <Sidebar
        projects={index.projects}
        chats={index.chats}
        activeChatId={chatId}
        open={railOpen}
        onToggle={() => togglePanel("rail", false)}
        onNewChat={(projectId) => startChat(projectId)}
        onNewProject={(name) => {
          const next = {
            ...index,
            projects: [...index.projects, { id: newId(), name, createdAt: Date.now() }],
          };
          setIndex(next);
          saveIndex(next);
        }}
        onOpenChat={(id) => {
          setChatId(id);
          updateBody(loadChat(id));
          pinned.current = true;
        }}
        onMoveChat={relocate}
        onDeleteChat={removeChat}
        onDeleteProject={removeProject}
        balance={balance}
      />

      {/* Tapping away closes a floating panel, which is the gesture anyone who
          has used a phone will try first. Desktop never sees it. */}
      {railOpen || kitOpen ? (
        <button
          type="button"
          aria-label="Close panels"
          onClick={() => {
            togglePanel("rail", false);
            togglePanel("kit", false);
          }}
          className="fixed inset-0 z-30 bg-graphite/20 lg:hidden"
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Only shown when a panel is away, so the bar is empty in the state
            everything is already visible in. */}
        {!railOpen || !kitOpen ? (
          <div className="flex items-center justify-between px-3 py-2">
            {!railOpen ? (
              <button
                type="button"
                onClick={() => togglePanel("rail", true)}
                aria-label="Show projects"
                className="grid size-7 place-items-center rounded-md text-mute transition-colors duration-150 hover:bg-paper-sunk hover:text-graphite focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-graphite"
              >
                <SidebarSimple weight="regular" aria-hidden className="size-4" />
              </button>
            ) : (
              <span />
            )}

            {/* The meter follows the rail out. With the sidebar hidden there is
                nowhere else on this screen it could live, and a spend counter
                that disappears when you collapse a panel is a spend counter
                nobody trusts. */}
            {!railOpen ? (
              <div className="ml-auto mr-2">
                <Meter balance={balance} tone="rail" />
              </div>
            ) : null}

            {!kitOpen ? (
              <button
                type="button"
                onClick={() => togglePanel("kit", true)}
                aria-label="Show the kit"
                className="grid size-7 place-items-center rounded-md text-mute transition-colors duration-150 hover:bg-paper-sunk hover:text-graphite focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-graphite"
              >
                <SquaresFour weight="regular" aria-hidden className="size-4" />
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="h-full overflow-y-auto [scroll-behavior:auto]"
          >
            {empty ? (
              <div className="mx-auto flex h-full w-full max-w-[720px] flex-col justify-center px-5 pb-16">
                <h1 className="rise balance text-center text-3xl font-bold tracking-tighter text-graphite sm:text-4xl">
                  Give it an address.
                </h1>
                <div className="rise stagger-2 mt-7">
                  <Composer onSubmit={(message) => void send(message)} busy={busy} variant="hero" />
                </div>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-[720px] space-y-5 px-5 py-8">
                {body.blocks.map((block) => (
                  <Row
                    key={block.id}
                    block={block}
                    busy={busy}
                    onAnswer={answer}
                    onChoose={choose}
                    onCast={cast}
                    onRunIdea={runIdea}
                  />
                ))}

                {pendingTool ? <PendingCard tool={pendingTool} /> : null}
              </div>
            )}
          </div>

          {adrift ? (
            <button
              type="button"
              onClick={jump}
              className="stream absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-rule bg-paper-lift px-3 py-1.5 text-xs text-graphite shadow-[0_8px_24px_-12px_rgba(12,10,9,0.4)] transition-transform duration-200 ease-[var(--ease-out)] hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-graphite"
              style={{ transform: "translateX(-50%)" }}
            >
              <ArrowDown weight="bold" aria-hidden className="size-3" />
              Latest
            </button>
          ) : null}
        </div>

        {!empty ? (
          <div className="border-t border-rule bg-paper/85 backdrop-blur-sm">
            <div className="mx-auto w-full max-w-[720px] px-5 py-3">
              <Composer
                onSubmit={(message) => void send(message)}
                onStop={() => abort.current?.abort()}
                busy={busy}
                // After a stop the next message is usually a correction, so the
                // box says so rather than repeating the first-run prompt.
                placeholder={
                  body.blocks[body.blocks.length - 1]?.kind === "stopped"
                    ? "Add a note, then say carry on"
                    : undefined
                }
              />
            </div>
          </div>
        ) : null}
      </div>

      <Inspector
        site={body.context.site ?? null}
        state={state}
        kept={body.kept}
        open={kitOpen}
        onClose={() => togglePanel("kit", false)}
      />
    </div>
  );
}

const Row = ({
  block,
  busy,
  onAnswer,
  onChoose,
  onCast,
  onRunIdea,
}: {
  block: Block;
  busy: boolean;
  onAnswer: (blockId: string, text: string) => void;
  onChoose: (blockId: string, template: TemplateCandidate) => void;
  onCast: (
    blockId: string,
    candidateId: string | undefined,
    person: { name: string; identity: ActorIdentity }
  ) => void;
  onRunIdea: (title: string) => void;
}) => {
  switch (block.kind) {
    case "you":
      return (
        <div className="stream flex justify-end">
          <p className="pretty max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-graphite px-4 py-2 text-sm text-white">
            {block.text}
          </p>
        </div>
      );

    case "say":
      return (
        <p className="stream pretty whitespace-pre-wrap text-[15px] leading-relaxed text-graphite">
          {block.text}
        </p>
      );

    case "tool":
      return <ToolBlock block={block} />;

    case "artifact":
      return (
        <ArtifactCard artifact={block.artifact} onRunIdea={onRunIdea} busy={busy} />
      );

    case "graph":
      return <GraphView block={block} />;

    case "render":
      return <RenderJob block={block} />;

    case "choice":
      return (
        <TemplateCards
          items={block.items}
          library={block.library}
          prompt={block.prompt}
          chosen={block.chosen}
          disabled={busy || Boolean(block.chosen)}
          onChoose={(template) => onChoose(block.id, template)}
        />
      );

    case "cast":
      return (
        <CastingCard
          block={block}
          busy={busy}
          onCast={(candidateId, person) => onCast(block.id, candidateId, person)}
        />
      );

    case "ask":
      return (
        <AskCard
          block={block}
          disabled={busy}
          onAnswer={(text) => onAnswer(block.id, text)}
        />
      );

    // A rule across the transcript rather than a card. It marks a boundary in
    // time, not a thing that was produced, and stopping is a normal thing to do
    // — so it has to read as a place you can carry on from rather than as
    // something that went wrong. It names what was kept, because the question
    // anyone has after pressing stop is whether they just threw the last two
    // minutes away.
    case "stopped":
      return (
        <div className="stream flex items-center gap-3 py-1">
          <span aria-hidden className="h-px flex-1 bg-rule" />
          <p className="shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
            Stopped
            {block.done.length ? ` · kept ${block.done.length} step${
              block.done.length === 1 ? "" : "s"
            }` : ""}
          </p>
          <span aria-hidden className="h-px flex-1 bg-rule" />
        </div>
      );

    // An offer, so it takes the ember border the question card uses rather than
    // the failure red. Nothing went wrong here and it must not read as though it
    // did — everything the run produced is still on screen above this, and the
    // credits it would have cost were never taken.
    case "wall": {
      const copy = GATE_COPY[block.gate];

      return (
        <div className="stream rounded-2xl border border-ember/30 bg-ember/[0.035] p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ember">
            {copy.eyebrow}
          </p>
          <p className="balance mt-2.5 text-[17px] font-semibold leading-snug text-graphite">
            {copy.headline}
          </p>
          <p className="pretty mt-2 text-sm leading-relaxed text-mute">{copy.body}</p>

          {/* The arithmetic, on its own line and in the same mono figures the
              meter uses. It is the one thing on this card the person has to be
              able to check, and burying it in a sentence makes it a claim
              rather than a sum. */}
          <p className="mt-4 border-t border-ember/20 pt-3 font-mono text-xs tabular-nums text-graphite">
            {shortfall(block.need, block.have)}
          </p>

          <Link
            href={`/credits?gate=${block.gate}&need=${block.need}`}
            className="group mt-4 inline-flex items-center gap-2 rounded-full bg-graphite px-4 py-2.5 text-sm font-medium text-white transition-all duration-200 ease-[var(--ease-out)] hover:bg-graphite/85 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-graphite"
          >
            {copy.cta}
            <ArrowRight
              weight="bold"
              aria-hidden
              className="size-3.5 transition-transform duration-200 ease-[var(--ease-out)] group-hover:translate-x-0.5"
            />
          </Link>
        </div>
      );
    }

    case "error":
      return (
        <div className="stream rounded-2xl border border-fail/30 bg-fail/[0.04] p-4">
          <p className="text-sm font-medium text-fail">{block.error}</p>
          {block.hint ? (
            <p className="pretty mt-1.5 text-sm leading-relaxed text-mute">{block.hint}</p>
          ) : null}
        </div>
      );
  }
};
