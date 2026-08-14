"use client";

/**
 * Projects and chats, kept in the browser.
 *
 * Local storage rather than a table, deliberately and temporarily: the shape of
 * a "project" is still moving, and a schema migration is a bad thing to owe
 * yourself while the answer is still changing weekly. Everything here is
 * addressed by id, so moving it behind an API later is a change of transport
 * rather than a change of model.
 *
 * Each chat's transcript lives under its own key. One big blob would mean
 * rewriting every chat on every keystroke of the one you are in, and would hit
 * the quota as a single unrecoverable failure rather than one chat at a time.
 */

import type { StudioContext } from "@/lib/agent/events";
import type { Block } from "@/components/studio/thread";

const INDEX_KEY = "carouly.studio.index";
const chatKey = (id: string) => `carouly.studio.chat.${id}`;

export type Project = {
  id: string;
  name: string;
  createdAt: number;
  /**
   * The host this project was opened for, when it was opened by importing one.
   *
   * Load-bearing rather than decorative: it is how a second run on the same
   * address finds the project it already belongs in, instead of leaving two
   * folders with the same name a fortnight apart.
   */
  site?: string;
  /**
   * The name is still a guess taken from the address, and may be replaced once
   * the run reads the site and learns what the brand actually calls itself.
   * Cleared the moment that happens, so a real name is never overwritten twice.
   */
  auto?: boolean;
};

export type ChatMeta = {
  id: string;
  projectId: string;
  title: string;
  updatedAt: number;
  /**
   * Somebody put this chat in this project on purpose — started it from a
   * project's own button, or dragged it here. Importing a site from a pinned
   * chat leaves it where it is, because moving something out from under the
   * person who just filed it is worse than a slightly untidy folder.
   */
  pinned?: boolean;
};

/** One thing the run put in the library, as reported by an `asset.saved` event. */
export type Kept = { id: string; kind: string; name: string };

export type ChatBody = {
  blocks: Block[];
  history: { role: "user" | "assistant"; content: string }[];
  context: StudioContext;
  /**
   * What this chat has recorded. Not derived from the blocks, because recording
   * happens on the server and is not an artifact — the run says it kept
   * something, and this is where that receipt lands.
   */
  kept: Kept[];
};

export type Index = { projects: Project[]; chats: ChatMeta[] };

export const EMPTY: ChatBody = { blocks: [], history: [], context: {}, kept: [] };

const read = <T>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: unknown) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Out of quota. Losing the write is survivable — the chat stays correct in
    // memory for this session — and throwing here would take the UI down over
    // a cache.
  }
};

export const loadIndex = (): Index => {
  const index = read<Index>(INDEX_KEY, { projects: [], chats: [] });

  // Every install has at least one project, so the sidebar is never an empty
  // shell you have to understand before you can start.
  if (!index.projects.length) {
    const project: Project = { id: newId(), name: "My work", createdAt: Date.now() };
    const seeded = { projects: [project], chats: [] };
    write(INDEX_KEY, seeded);
    return seeded;
  }

  return index;
};

export const saveIndex = (index: Index) => write(INDEX_KEY, index);

/**
 * `kept` is normalised on the way out: chats written before it existed have no
 * such key, and every consumer would otherwise have to guard a `.length` on
 * undefined. A stored shape is a version of the shape, not the shape.
 */
export const loadChat = (id: string): ChatBody => {
  const stored = read<ChatBody>(chatKey(id), EMPTY);
  return { ...stored, kept: stored.kept ?? [] };
};

export const saveChat = (id: string, body: ChatBody) => write(chatKey(id), body);

export const dropChat = (id: string) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(chatKey(id));
  } catch {
    // Nothing to do; the index no longer points at it either way.
  }
};

/* --------------------------------------------------------------- filing --- */

/**
 * Put a chat in the project for a host, opening that project if it is new.
 *
 * Reuse before creation is the whole point. Somebody who runs a client's site
 * on Monday and again on Thursday is doing one client's work, and the second
 * run belongs in the folder the first one made — otherwise the rail slowly
 * fills with duplicate names and stops being a place you can find anything.
 */
export const fileUnderSite = (index: Index, chatId: string, host: string): Index => {
  // Keyed on the site rather than the host, so the shop and the marketing page
  // land together instead of opening a folder each.
  const site = siteRoot(host);
  const existing = index.projects.find((project) => project.site === site);

  const project: Project = existing ?? {
    id: newId(),
    name: projectNameFromSite(site),
    site,
    auto: true,
    createdAt: Date.now(),
  };

  return {
    projects: existing ? index.projects : [...index.projects, project],
    chats: index.chats.map((chat) =>
      chat.id === chatId ? { ...chat, projectId: project.id } : chat
    ),
  };
};

/**
 * Replace a guessed project name with the one the brand uses for itself.
 *
 * Only ever touches a project still flagged `auto`, so this can be called on
 * every context update the stream produces without it ever undoing a rename
 * somebody made by hand.
 */
export const nameProjectOf = (index: Index, chatId: string, name: string): Index => {
  const chat = index.chats.find((entry) => entry.id === chatId);
  const project = index.projects.find((entry) => entry.id === chat?.projectId);

  if (!project?.auto || !name.trim() || project.name === name) return index;

  return {
    ...index,
    projects: index.projects.map((entry) =>
      entry.id === project.id ? { ...entry, name, auto: false } : entry
    ),
  };
};

/** Refile a chat by hand. Pins it, so nothing files it somewhere else later. */
export const moveChat = (index: Index, chatId: string, projectId: string): Index => ({
  ...index,
  chats: index.chats.map((chat) =>
    chat.id === chatId ? { ...chat, projectId, pinned: true } : chat
  ),
});

/**
 * Which panels are open.
 *
 * Remembered, because it is a preference rather than a mode: someone who works
 * with the kit closed does so every time, and re-closing it on every reload is
 * the sort of small daily tax that makes software feel like it is not paying
 * attention.
 */
export type Panels = { rail: boolean; kit: boolean };

const PANELS_KEY = "carouly.studio.panels";

export const loadPanels = (): Panels => {
  // Below this width the two panels together leave no room for the thing they
  // are attached to, so they start closed whatever the preference says. Not
  // written back: the preference is still whatever it was on a wide screen.
  if (typeof window !== "undefined" && window.innerWidth < 1024) {
    return { rail: false, kit: false };
  }

  return read<Panels>(PANELS_KEY, { rail: true, kit: true });
};

export const savePanels = (panels: Panels) => write(PANELS_KEY, panels);

export const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * A chat's name, taken from its first message.
 *
 * A host gets kept whole because that is what people scan the list for; a
 * sentence gets cut at a word boundary, since a title ending mid-word looks
 * broken rather than truncated.
 */
/**
 * Which site a host belongs to.
 *
 * `acme-tools.co.uk`, `www.acme-tools.co.uk` and `shop.acme-tools.co.uk` are
 * one client, and a run against the shop belongs in the same folder as a run
 * against the marketing site. Without this the rail collects a project per
 * subdomain, all with the same name, which is worse than no grouping at all.
 *
 * Not a public-suffix list, on purpose. The list is 15,000 lines that change
 * monthly, and the cost of being wrong here is one folder too many rather than
 * anything broken — so this handles the second-level suffixes people actually
 * register under and leaves it there.
 */
const SECOND_LEVEL = new Set(["co", "com", "net", "org", "gov", "edu", "ac"]);

export const siteRoot = (host: string) => {
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".") || host;

  const keep = SECOND_LEVEL.has(parts[parts.length - 2]) ? 3 : 2;
  return parts.slice(-keep).join(".");
};

/**
 * A project name, guessed from a host.
 *
 * The registrable label is the name: `northline.coffee` is a folder called
 * Northline, `shop.acme-tools.co.uk` is one called Acme Tools.
 *
 * This is a placeholder with a short life. The run reads the site a few seconds
 * later and comes back with what the brand actually calls itself, and the
 * project takes that name instead. Guessing well still matters: for those few
 * seconds it is the only label in the rail, and "Northline" reads like an
 * answer where "northline.coffee" reads like a URL nobody has dealt with yet.
 */
export const projectNameFromSite = (host: string) => {
  // The root is already trimmed to the registrable domain, so its first part
  // is the name and everything after it is suffix.
  const label = siteRoot(host).split(".")[0] || host;

  return label
    .split("-")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
};

export const titleFrom = (message: string) => {
  const trimmed = message.trim();
  if (trimmed.length <= 32) return trimmed;

  const cut = trimmed.slice(0, 32);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > 12 ? cut.slice(0, lastSpace) : cut}…`;
};
