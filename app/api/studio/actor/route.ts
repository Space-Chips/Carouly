import { auth } from "@clerk/nextjs/server";

import { COSTS } from "@/lib/credits/prices";
import { charge, isInsufficientCredits, refund } from "@/lib/credits/ledger";
import * as render from "@/lib/tools/render";

/**
 * Casting somebody who is not on the shelf.
 *
 * A description is enough to run a video — the graph would generate a face from
 * it either way — so the only thing this endpoint adds is *seeing them first*.
 * That turns out to be the whole point: a person somebody chose from a portrait
 * is a decision, and a person described into a box and never shown is a wish.
 * The frame it returns is pinned into the run, so the face that comes back in
 * the video is this exact one rather than a second interpretation of the words.
 *
 * Outside the agent loop because it belongs to a card rather than to a turn: the
 * run has already stopped and is waiting on a human. Charged all the same, and
 * charged before the model is called, because it spends real money on an image.
 */
export const runtime = "nodejs";
export const maxDuration = 120;

/** Long enough to describe a person, short enough not to be a prompt injection. */
const LIMIT = 600;

export const POST = async (request: Request) => {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in first." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { description?: string };
  const description = (body.description ?? "").trim().slice(0, LIMIT);

  if (description.length < 12) {
    return Response.json(
      { error: "Say a little more — age, look, wardrobe, and where they are." },
      { status: 400 }
    );
  }

  /**
   * A dry run costs nothing and must not be charged for.
   *
   * It also must not come back looking like a portrait: `dry-run.local` is not a
   * host, so the card would render a broken image and the person would think
   * casting had failed rather than that no image backend is configured.
   */
  if (render.mode() === "dry") {
    return Response.json({
      stub: true,
      look: description,
      note: "No image backend is configured, so there is no portrait — the description still casts them.",
    });
  }

  try {
    await charge({
      userId,
      amount: COSTS.cast_actor,
      gate: "render",
      operation: "cast_actor",
      detail: description.slice(0, 80),
    });
  } catch (error) {
    if (isInsufficientCredits(error)) {
      return Response.json(
        { error: "Not enough credits to cast somebody new.", gate: "render" },
        { status: 402 }
      );
    }
    throw error;
  }

  try {
    const frame = await render.image({
      prompt: `${description}

Vertical 9:16 photorealistic phone photograph of this person filming themselves at arm's length. Available light only, uneven shadows, honest colour. Skin has visible pores and texture, no retouching, no beauty filter. Ordinary clothes with real creases. A real room behind them with specific everyday clutter. Slightly off-centre framing, mild phone-lens distortion, subtle grain. Both eyes open, looking straight into the lens.`,
      negative_prompt:
        "eyes closed, mid-blink, looking away, profile view, studio lighting, three-point lighting, airbrushed skin, plastic skin, beauty filter, CGI, 3D render, stock photo, model headshot, polished commercial look, watermark, text overlay, subtitles, extra fingers, warped hands",
      aspect_ratio: "9:16",
    });

    if (!frame.url) throw new Error("The image came back with no file.");

    return Response.json({ url: frame.url, look: description });
  } catch (error) {
    // The charge landed and the image did not, so it goes back. A casting call
    // that produced nothing has to cost nothing, or the meter is a slot machine.
    await refund({
      userId,
      amount: COSTS.cast_actor,
      detail: "casting failed",
    }).catch(() => {});

    return Response.json(
      {
        error:
          error instanceof Error
            ? `Casting failed: ${error.message}`
            : "Casting failed.",
      },
      { status: 502 }
    );
  }
};
