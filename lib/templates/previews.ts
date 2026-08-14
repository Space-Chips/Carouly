/**
 * Example renders of the shipped templates.
 *
 * A template card has to answer "what does this format look like" at the one
 * moment nothing has been generated for this brand yet. The only honest answer
 * is a video the format itself made, so that is what these are: each entry is
 * the output of running that template's own graph end to end against a fixture
 * brand, produced by `npm run previews` and committed as a file.
 *
 * The manifest is a generated JSON module rather than a directory listing for
 * the same reason the presets are imported statically — the studio runs at the
 * edge of a request, where reading the filesystem works in dev and fails on
 * deploy. If an id is missing here, the card says so rather than inventing
 * something; a template nobody has rendered yet is a fact worth showing.
 */

import manifest from "./previews.json";

export type TemplatePreview = {
  /** Public path to the example cut, e.g. /templates/ugc_talking_head.mp4 */
  preview: string;
  /** A frame from it, for the card at rest. */
  still?: string;
  seconds?: number;
  /**
   * No speech in the file — measured, not assumed.
   *
   * Recorded at generation time by looking at the actual audio level, because
   * the backend does not tell you this: a local render carries LTX's own
   * dialogue, and a render can also come back with a present-but-empty track.
   */
  silent?: boolean;
  /** When it was generated, and on which backend. Shown nowhere; kept for us. */
  madeAt?: string;
  backend?: string;
  /** A supplied visual direction, rather than a render this graph produced. */
  reference?: boolean;
};

export const PREVIEWS: Record<string, TemplatePreview> = manifest;

export const previewFor = (id: string) => PREVIEWS[id];
