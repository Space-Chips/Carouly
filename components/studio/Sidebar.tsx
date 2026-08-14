"use client";

import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import {
  FolderSimple,
  NotePencil,
  Plus,
  SidebarSimple,
  Stack,
  TrashSimple,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import Meter from "@/components/credits/Meter";
import type { ChatMeta, Project } from "@/components/studio/store";

/**
 * What a dragged chat puts on the clipboard.
 *
 * Its own type rather than `text/plain`, because a drop target has to be able
 * to tell "one of my chats" from "some text off a web page" — and mid-drag the
 * only thing a browser will let it read is the list of types.
 */
const CHAT = "application/x-carouly-chat";

/**
 * Projects and their chats.
 *
 * A run is not a session you throw away — it is work about one client's site,
 * and you come back to it. So chats group under a project, and the project is
 * the thing you name. Nothing is nested deeper than that on purpose: two levels
 * is enough to find anything by scanning, and three is enough to make you think.
 *
 * Chats title themselves from the first thing you said, and a chat that started
 * with an address files itself under a project named after that brand. So the
 * rail reads as a list of clients, each holding their runs, without anyone ever
 * having been asked to name or sort anything.
 *
 * Filing by hand is a drag: a chat can be dropped on any project, and Alt with
 * an arrow key does the same thing for anyone not using a mouse.
 */
export default function Sidebar({
  projects,
  chats,
  activeChatId,
  open,
  onToggle,
  onNewChat,
  onNewProject,
  onOpenChat,
  onMoveChat,
  onDeleteChat,
  onDeleteProject,
  balance,
}: {
  projects: Project[];
  chats: ChatMeta[];
  activeChatId: string | null;
  open: boolean;
  /** Credits left, live. Sits with the account because that is what it is. */
  balance: number;
  onToggle: () => void;
  /** With a project, the chat is pinned there. Without, it files itself. */
  onNewChat: (projectId?: string) => void;
  onNewProject: (name: string) => void;
  onOpenChat: (id: string) => void;
  onMoveChat: (chatId: string, projectId: string) => void;
  onDeleteChat: (id: string) => void;
  onDeleteProject: (id: string) => void;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  /** The chat under the cursor, and the project it is hovering over. */
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  /**
   * The chat that just arrived somewhere, so it can flash once and settle.
   *
   * Without it a move is invisible: the row vanishes from one list and appears
   * in another, several hundred pixels away, and the eye has no reason to look
   * there. The flash is the only thing saying "it went here".
   */
  const [landed, setLanded] = useState<string | null>(null);

  /** Spoken, not drawn — a move made from the keyboard leaves nothing to see. */
  const [note, setNote] = useState("");

  /** Set only by the keyboard path, so a drag never steals focus. */
  const refocus = useRef<string | null>(null);

  useEffect(() => {
    if (!landed) return;
    const timer = window.setTimeout(() => setLanded(null), 700);
    return () => window.clearTimeout(timer);
  }, [landed]);

  // The row is a different DOM node after the move — same chat, new list — so
  // the browser has dropped focus on the floor. Put it back on the thing that
  // moved, or arrowing a chat across three projects means tabbing back each
  // time from wherever focus landed.
  //
  // Straight into the effect, with no animation frame in between. The DOM is
  // already committed by the time this runs, so the frame bought nothing — and
  // it cost the restore entirely: the very next effect pass ran the cleanup and
  // cancelled the frame before it fired, leaving focus on `<body>`.
  useEffect(() => {
    const id = refocus.current;
    if (!id) return;

    refocus.current = null;
    document.querySelector<HTMLElement>(`[data-chat="${id}"]`)?.focus();
  }, [chats]);

  const move = (chatId: string, project: Project) => {
    onMoveChat(chatId, project.id);
    setLanded(chatId);
    setNote(`Moved to ${project.name}`);
  };

  /**
   * Alt with an arrow moves a chat one project up or down the rail.
   *
   * Chosen over a menu because the rail already reads top to bottom, so "the
   * project above this one" is a thing you can see rather than a list you have
   * to open and read. Alt keeps it clear of the arrow keys' own job of moving
   * between rows.
   */
  const onChatKeyDown = (event: React.KeyboardEvent, chat: ChatMeta) => {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;

    const at = projects.findIndex((project) => project.id === chat.projectId);
    const to = projects[at + (event.key === "ArrowUp" ? -1 : 1)];
    if (!to) return;

    event.preventDefault();
    refocus.current = chat.id;
    move(chat.id, to);
  };

  return (
    <aside
      // The panel keeps its width and slides out of the way, so the transition
      // is a transform rather than a reflow of everything beside it.
      aria-label="Projects"
      aria-hidden={!open}
      // `min-w-0` is load-bearing: a flex item defaults to `min-width: auto`,
      // so `w-0` alone leaves the panel at its content width and the collapse
      // silently does nothing.
      // On a narrow screen the panel floats over the transcript instead of
      // pushing it: 248px taken out of 375px leaves a column too narrow to read.
      className={`min-w-0 shrink-0 overflow-hidden border-r border-rule bg-paper-sunk/45 transition-[width] duration-300 ease-[var(--ease-glide)] max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:bg-paper max-lg:shadow-[8px_0_32px_-16px_rgba(12,10,9,0.5)] ${
        open ? "w-[248px]" : "w-0 border-r-0"
      }`}
    >
      <div className="flex h-full w-[248px] flex-col">
        <div className="flex items-center justify-between px-3 py-3">
          <Link
            href="/"
            className="rounded px-1 text-sm font-semibold tracking-tight text-graphite focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-graphite"
          >
            Carouly
          </Link>
          <button
            type="button"
            onClick={onToggle}
            aria-label="Hide projects"
            className="grid size-7 place-items-center rounded-md text-mute transition-colors duration-150 hover:bg-paper-lift hover:text-graphite focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-graphite"
          >
            <SidebarSimple weight="regular" aria-hidden className="size-4" />
          </button>
        </div>

        <div className="px-2">
          {/* No project passed: a chat started here belongs to whatever address
              is typed into it, and files itself once that is known. */}
          <button
            type="button"
            onClick={() => onNewChat()}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-graphite transition-colors duration-150 hover:bg-paper-lift focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-graphite"
          >
            <NotePencil weight="regular" aria-hidden className="size-4 text-mute" />
            New chat
          </button>

          {/* The library is a route, not a chat, so it is a link rather than a
              handler — the one thing in this rail that leaves the run behind. */}
          <Link
            href="/studio/library"
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-graphite transition-colors duration-150 hover:bg-paper-lift focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-graphite"
          >
            <Stack weight="regular" aria-hidden className="size-4 text-mute" />
            Library
          </Link>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          <p className="px-2 pb-1 text-xs text-mute">Projects</p>

          {projects.map((project) => {
            const inProject = chats.filter((chat) => chat.projectId === project.id);

            // A chat cannot be dropped where it already is, so that project
            // never lights up — the highlight is a promise that something will
            // happen, and nothing would.
            const from = chats.find((chat) => chat.id === dragging);
            const receiving = over === project.id && from?.projectId !== project.id;

            return (
              <section
                key={project.id}
                onDragOver={(event) => {
                  // Read off the drag itself rather than off `dragging`. React
                  // has not necessarily re-rendered between `dragstart` and the
                  // first `dragover`, so a handler closed over that state can
                  // still see `null` and refuse the drop it was opened for.
                  // `types` is the one part of a dataTransfer readable mid-drag,
                  // which is exactly enough: a chat announces itself here, and a
                  // file or a dragged selection does not.
                  if (!event.dataTransfer.types.includes(CHAT)) return;

                  // Without this the browser refuses the drop outright.
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setOver(project.id);
                }}
                onDragLeave={(event) => {
                  // Crossing between children of this section fires a leave for
                  // the child. Only a pointer that has actually left the section
                  // counts, or the highlight strobes as you move down the list.
                  if (event.currentTarget.contains(event.relatedTarget as Node)) return;
                  setOver((current) => (current === project.id ? null : current));
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const id = event.dataTransfer.getData(CHAT) || dragging;
                  setOver(null);
                  setDragging(null);
                  if (id) move(id, project);
                }}
                className={`mb-2 rounded-xl border transition-colors duration-150 ease-[var(--ease-out)] ${
                  receiving
                    ? "border-dashed border-ember/50 bg-ember/[0.05]"
                    : "border-transparent"
                }`}
              >
                <div className="group flex items-center gap-2 rounded-lg px-2 py-1.5">
                  <FolderSimple
                    weight="regular"
                    aria-hidden
                    className={`size-4 shrink-0 transition-colors duration-150 ${
                      receiving ? "text-ember" : "text-mute"
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-graphite">
                    {project.name}
                  </span>

                  {/* Revealed on hover, but reachable by keyboard at all times:
                      focus-within keeps them visible while tabbing through.
                      Hidden outright mid-drag — nothing here is a drop target,
                      and a delete button under the cursor is a bad surprise. */}
                  <span
                    className={`flex shrink-0 items-center transition-opacity duration-150 ${
                      dragging
                        ? "pointer-events-none opacity-0"
                        : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onNewChat(project.id)}
                      aria-label={`New chat in ${project.name}`}
                      className="grid size-6 place-items-center rounded text-mute hover:text-graphite focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-graphite"
                    >
                      <Plus weight="bold" aria-hidden className="size-3.5" />
                    </button>
                    {projects.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => onDeleteProject(project.id)}
                        aria-label={`Delete ${project.name}`}
                        className="grid size-6 place-items-center rounded text-mute hover:text-fail focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-graphite"
                      >
                        <TrashSimple weight="regular" aria-hidden className="size-3.5" />
                      </button>
                    ) : null}
                  </span>
                </div>

                <ul>
                  {inProject.map((chat) => {
                    const active = chat.id === activeChatId;
                    const held = chat.id === dragging;

                    return (
                      // The hint sits on the row, not on the button. On the
                      // button, `title` competes with the chat's own name for
                      // the accessible name — and a screen reader announcing
                      // "drag to another project" for every chat in the list,
                      // instead of what the chat is called, makes the rail
                      // useless to the people who most need it labelled.
                      <li
                        key={chat.id}
                        title="Drag to another project, or Alt+↑ / Alt+↓"
                        className="group/chat relative"
                      >
                        <button
                          type="button"
                          draggable
                          data-chat={chat.id}
                          onDragStart={(event) => {
                            event.dataTransfer.setData(CHAT, chat.id);
                            // Dropped anywhere else — a text field, another
                            // window — a chat is its own name rather than a
                            // stray id nobody can read.
                            event.dataTransfer.setData("text/plain", chat.title);
                            event.dataTransfer.effectAllowed = "move";
                            setDragging(chat.id);
                          }}
                          onDragEnd={() => {
                            setDragging(null);
                            setOver(null);
                          }}
                          onClick={() => onOpenChat(chat.id)}
                          onKeyDown={(event) => onChatKeyDown(event, chat)}
                          aria-current={active ? "page" : undefined}
                          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                          className={`w-full cursor-grab truncate rounded-lg py-1.5 pl-8 pr-8 text-left text-sm transition-[background-color,color,opacity,transform] duration-150 ease-[var(--ease-out)] active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-graphite ${
                            held ? "scale-[0.98] opacity-40" : ""
                          } ${
                            landed === chat.id ? "landed" : ""
                          } ${
                            active
                              ? "bg-paper-lift text-graphite"
                              : "text-mute hover:bg-paper-lift/70 hover:text-graphite"
                          }`}
                        >
                          {chat.title}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteChat(chat.id)}
                          aria-label={`Delete ${chat.title}`}
                          className={`absolute right-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-mute transition-opacity duration-150 hover:text-fail focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-graphite ${
                            dragging
                              ? "pointer-events-none opacity-0"
                              : "opacity-0 group-hover/chat:opacity-100"
                          }`}
                        >
                          <TrashSimple weight="regular" aria-hidden className="size-3.5" />
                        </button>
                      </li>
                    );
                  })}

                  {!inProject.length ? (
                    <li
                      className={`py-1.5 pl-8 text-sm transition-colors duration-150 ${
                        receiving ? "text-ember" : "text-mute/70"
                      }`}
                    >
                      {receiving ? "Drop here" : "No chats yet"}
                    </li>
                  ) : null}
                </ul>
              </section>
            );
          })}

          {naming ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (name.trim()) onNewProject(name.trim());
                setName("");
                setNaming(false);
              }}
              className="px-2 pt-1"
            >
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                onBlur={() => {
                  if (name.trim()) onNewProject(name.trim());
                  setName("");
                  setNaming(false);
                }}
                placeholder="Project name"
                className="w-full rounded-lg border border-rule bg-paper-lift px-2.5 py-1.5 text-sm text-graphite outline-none placeholder:text-mute focus:border-graphite/30"
              />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setNaming(true)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-mute transition-colors duration-150 hover:bg-paper-lift hover:text-graphite focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-graphite"
            >
              <Plus weight="bold" aria-hidden className="size-4" />
              New project
            </button>
          )}
        </div>

        {/* The account sits at the foot of the rail rather than in a top bar,
            which is the only place left for it now the studio has no header.
            The meter sits with it: what is left to spend is a fact about the
            account, and this is where the account lives. */}
        <div className="flex items-center gap-2 border-t border-rule px-3 py-2.5">
          <Show when="signed-in">
            <UserButton />
            <div className="ml-auto">
              <Meter balance={balance} tone="rail" />
            </div>
          </Show>
          <Show when="signed-out">
            <SignInButton>
              <button
                type="button"
                className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-graphite transition-colors duration-150 hover:bg-paper-lift focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-graphite"
              >
                Sign in
              </button>
            </SignInButton>
          </Show>
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {note}
      </p>
    </aside>
  );
}
