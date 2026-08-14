/**
 * Portraits for the casting library.
 *
 * Generated rather than committed by hand: `npm run actors` runs each preset's
 * `look` through the image model once and writes the file plus an entry here,
 * the same arrangement as the template examples. A static JSON module rather
 * than a directory listing because the studio runs at the edge of a request,
 * where reading the filesystem works in dev and fails on deploy.
 *
 * An id with no entry is the normal state, not a broken one — the picker draws
 * a typographic card and says the face is made when they are cast, which is the
 * truth about a preset: it is a description until somebody uses it.
 */

import manifest from "./previews.json";

export type ActorPortrait = {
  /** Public path, e.g. /actors/nadia.jpg */
  url: string;
  madeAt?: string;
  backend?: string;
};

export const PORTRAITS: Record<string, ActorPortrait> = manifest;

export const portraitFor = (id: string): string | undefined => PORTRAITS[id]?.url;
