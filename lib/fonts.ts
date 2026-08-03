import { readFile } from "fs/promises";
import path from "path";

import { BODY_FONT, DISPLAY_FONT } from "@/lib/typography";

/**
 * Fonts for the PNG renderer.
 *
 * satori ships only Noto Sans Regular, so every headline was rendering at
 * weight 400 no matter what `fontWeight` said — the reason the slides looked
 * thin. These are real files, read once and cached for the process.
 *
 * Anton (display) and Barlow (body) are both OFL-licensed and shipped in
 * public/fonts, which also lets the browser preview load them by the same
 * family names (see the @font-face rules in globals.css) so the preview and
 * the exported PNG stay identical.
 */

type LoadedFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 500;
  style: "normal";
};

let cache: Promise<LoadedFont[]> | null = null;

const read = async (file: string) =>
  new Uint8Array(
    await readFile(path.join(process.cwd(), "public", "fonts", file))
  ).buffer as ArrayBuffer;

export const loadFonts = async (): Promise<LoadedFont[]> => {
  cache ??= (async () => [
    {
      name: DISPLAY_FONT,
      data: await read("Anton-Regular.ttf"),
      weight: 400 as const,
      style: "normal" as const,
    },
    {
      name: BODY_FONT,
      data: await read("Barlow-Regular.ttf"),
      weight: 400 as const,
      style: "normal" as const,
    },
    {
      name: BODY_FONT,
      data: await read("Barlow-Medium.ttf"),
      weight: 500 as const,
      style: "normal" as const,
    },
  ])();

  return cache;
};
