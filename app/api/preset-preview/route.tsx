import { readFile } from "fs/promises";
import path from "path";

import { NextRequest } from "next/server";

import { getPreset, Preset } from "@/lib/presets";
import { inlineImage, renderSlidePng } from "@/lib/render";
import { SlideKind } from "@/types";

/**
 * Renders a sample slide for a preset, so Settings can show what a style
 * actually looks like instead of a swatch row. Signed-in only (the middleware
 * handles that) and cached, since the sample copy is fixed.
 */
export const runtime = "nodejs";

const SAMPLES: Record<SlideKind, { heading: string; body: string; index: number }> =
  {
    hook: {
      heading: "Your best hour is the one you protect",
      body: "Most people spend it in someone else's calendar",
      index: 0,
    },
    insight: {
      heading: "Guard the first block",
      body: "Block one 90-minute window before you open any inbox. Defend it like a client meeting — it is the only slot that compounds.",
      index: 1,
    },
    cta: {
      heading: "Stop guessing where your hours went",
      body: "A focus timer that turns protected blocks into a weekly report.",
      index: 3,
    },
  };

/**
 * The preset's committed sample image, read off disk rather than fetched over
 * HTTP: it is a local static file, and the renderer needs the bytes anyway.
 * A preset with no sample yet renders its hook slide without a background.
 */
const previewBackground = async (preset: Preset): Promise<string | null> => {
  if (!preset.hasPreview) return null;

  try {
    const file = path.join(process.cwd(), "public", "presets", `${preset.id}.jpg`);
    const bytes = await readFile(file);

    return `data:image/jpeg;base64,${bytes.toString("base64")}`;
  } catch (error) {
    console.error("[preset-preview] sample image unavailable:", error);
    return null;
  }
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const kind = (params.get("kind") ?? "hook") as SlideKind;
  const sample = SAMPLES[kind] ?? SAMPLES.hook;
  const brandName = params.get("brand") ?? "Your brand";
  const handle = params.get("handle") ?? "@yourbrand";
  const preset = getPreset(params.get("preset"));

  const bytes = await renderSlidePng({
    preset,
    kind,
    heading: sample.heading,
    body: sample.body,
    footnote: kind === "cta" ? `${handle} — link in bio` : null,
    index: sample.index,
    total: 4,
    brandName,
    handle,
    // The hook slide is shown over the preset's own sample image, so one card
    // answers both halves of the question. `bg` overrides it, which is how a
    // specific composition gets checked against a specific image.
    backgroundUrl:
      kind === "hook"
        ? ((await inlineImage(params.get("bg"))) ??
          (await previewBackground(preset)))
        : null,
  });

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
