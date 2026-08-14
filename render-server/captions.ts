/**
 * Caption images.
 *
 * ffmpeg here has no freetype, so text cannot be drawn by a filter. It has to
 * arrive as pixels, and `next/og` is already in the tree — it rasterises a
 * layout to PNG with real font files, so drafts get the same type the product
 * uses elsewhere rather than something approximate.
 *
 * The style is the social-video convention rather than a design decision: heavy
 * type, tight leading, a dark plate behind it. Captions are read at arm's length
 * on a phone over moving footage, and anything lighter disappears the moment the
 * shot behind it turns pale.
 */

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

let fontCache: Buffer | null = null;

const font = async () => {
  fontCache ??= await readFile(
    join(process.cwd(), "public", "fonts", "Barlow-Medium.ttf")
  );
  return fontCache;
};

/** Rough wrap so the plate stays inside the frame and the height is predictable. */
const wrap = (text: string, perLine: number) => {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
    } else if (`${current} ${word}`.length <= perLine) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
};

export const captionPng = async (text: string, videoWidth: number) => {
  const size = Math.round(videoWidth * 0.075);
  const lines = wrap(text, Math.max(14, Math.floor(videoWidth / (size * 0.5))));
  const height = Math.round(lines.length * size * 1.28 + size * 0.9);

  const response = new ImageResponse(
    {
      type: "div",
      props: {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          // Transparent outside the plate: the overlay filter composites this
          // straight onto the picture, so any background here is a grey box
          // across the whole frame.
          background: "transparent",
        },
        children: lines.map((line, index) => ({
          type: "div",
          key: String(index),
          props: {
            style: {
              display: "flex",
              backgroundColor: "rgba(12,10,9,0.72)",
              color: "#ffffff",
              fontFamily: "Barlow",
              fontSize: size,
              lineHeight: 1.28,
              padding: `${Math.round(size * 0.16)}px ${Math.round(size * 0.4)}px`,
              borderRadius: Math.round(size * 0.22),
              marginBottom: index === lines.length - 1 ? 0 : Math.round(size * 0.14),
            },
            children: line,
          },
        })),
      },
    } as never,
    {
      width: videoWidth,
      height,
      fonts: [{ name: "Barlow", data: await font(), weight: 500, style: "normal" }],
    }
  );

  return Buffer.from(await response.arrayBuffer());
};

const stamp = (seconds: number) => {
  const total = Math.max(seconds, 0);
  const hh = String(Math.floor(total / 3600)).padStart(2, "0");
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const ss = String(Math.floor(total % 60)).padStart(2, "0");
  const ms = String(Math.round((total % 1) * 1000)).padStart(3, "0");
  return `${hh}:${mm}:${ss},${ms}`;
};

export const buildSrt = (lines: string[], spans: [number, number][]) =>
  lines
    .map(
      (line, index) =>
        `${index + 1}\n${stamp(spans[index][0])} --> ${stamp(spans[index][1])}\n${line.trim()}\n`
    )
    .join("\n");
