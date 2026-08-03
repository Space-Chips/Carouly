import { Platform } from "@/types";

import { facebook } from "./facebook";
import { instagram } from "./instagram";
import { linkedin } from "./linkedin";
import { tiktok } from "./tiktok";
import { Adapter } from "./types";
import { x } from "./x";

/**
 * The "manual" channel is always available and never fails: it marks the
 * carousel as ready to be downloaded and posted by hand. It exists so a brand
 * with no API credentials still gets a complete daily output.
 */
const manual: Adapter = {
  platform: "manual",
  label: "Manual / download",
  fields: [],
  async publish() {
    return {};
  },
};

/**
 * Order matters: this is the order the Settings cards render in, and the
 * one-click platforms come first.
 */
export const ADAPTERS = {
  instagram,
  tiktok,
  facebook,
  linkedin,
  x,
  manual,
} as const;

export const listAdapters = (): Adapter<never>[] =>
  Object.values(ADAPTERS) as unknown as Adapter<never>[];

export const getAdapter = (platform: Platform) =>
  ADAPTERS[platform] as Adapter<Record<string, string>> | undefined;
