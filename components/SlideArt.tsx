import { BODY_FONT, DISPLAY_FONT } from "@/lib/typography";
import { Preset } from "@/lib/presets";
import { SlideKind } from "@/types";

export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT = 1350;

const PAD = 76;
const INNER = SLIDE_WIDTH - PAD * 2;

/** Side of the brand mark in the top rail: the logo, or the accent block. */
const MARK = 44;

export type SlideArtProps = {
  preset: Preset;
  kind: SlideKind;
  heading: string;
  body?: string | null;
  footnote?: string | null;
  index: number;
  total: number;
  brandName: string;
  handle?: string | null;
  /** AI-generated hook background: a data URI, or a public URL. */
  backgroundUrl?: string | null;
  /**
   * The brand's logo or profile picture — one field, because the slide draws
   * both the same way. A data URI, or a public URL. Falls back to the accent
   * block when a brand has not uploaded one.
   */
  logoUrl?: string | null;
};

/**
 * The visual for a single slide. Every preset shares this composition and
 * differs only in palette, grain and hook-image opacity.
 *
 * Rendered twice: by satori (via next/og) to produce the posted PNG, and by
 * React in the dashboard preview. It therefore stays inside the satori CSS
 * subset — inline styles, flexbox only, explicit `display: flex` wherever an
 * element has more than one child, and no filters, shadows or transforms.
 *
 * The layout is built like a printed page rather than a web card: a fixed top
 * rail, an oversized ghosted index numeral as the field, and a single
 * bottom-anchored type block. Each slide kind gets its own composition so a
 * carousel reads as a sequence instead of four identical frames.
 */
export default function SlideArt({
  preset,
  kind,
  heading,
  body,
  footnote,
  index,
  total,
  brandName,
  handle,
  backgroundUrl,
  logoUrl,
}: SlideArtProps) {
  const c = preset.colors;
  const isHook = kind === "hook";
  const isCta = kind === "cta";

  // Anton is condensed, so it takes far more size than a normal grotesque
  // before it reads as large. Long headlines step down to stay on ~3 lines.
  const headingSize = isHook
    ? heading.length > 46
      ? 104
      : 124
    : isCta
      ? 84
      : heading.length > 34
        ? 82
        : 94;

  return (
    <div
      style={{
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        backgroundColor: c.background,
        color: c.text,
        fontFamily: BODY_FONT,
        overflow: "hidden",
      }}
    >
      {/* AI-generated hook background */}
      {isHook && backgroundUrl ? (
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
        <img
          src={backgroundUrl}
          width={SLIDE_WIDTH}
          height={SLIDE_HEIGHT}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: SLIDE_WIDTH,
            height: SLIDE_HEIGHT,
            objectFit: "cover",
            opacity: preset.hookImageOpacity,
          }}
        />
      ) : null}

      {/* Ghosted index numeral — the field the type sits on */}
      {!isHook ? (
        <div
          style={{
            position: "absolute",
            top: isCta ? -70 : 150,
            right: -34,
            display: "flex",
            fontFamily: DISPLAY_FONT,
            fontSize: 620,
            lineHeight: 1,
            color: c.text,
            opacity: 0.05,
          }}
        >
          {String(index + 1).padStart(2, "0")}
        </div>
      ) : null}

      {/* Legibility wash. Heavier at the bottom, where the type lands. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: SLIDE_WIDTH,
          height: SLIDE_HEIGHT,
          backgroundImage: `linear-gradient(180deg, ${hexA(
            c.background,
            isHook ? 0.3 : 0.55
          )} 0%, ${hexA(c.background, isHook ? 0.62 : 0.8)} 45%, ${hexA(
            c.background,
            0.97
          )} 100%)`,
        }}
      />

      {/* Procedural film grain */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: SLIDE_WIDTH,
          height: SLIDE_HEIGHT,
          opacity: preset.grain,
          backgroundImage: `url("${grainTexture()}")`,
          backgroundRepeat: "repeat",
        }}
      />

      {/* Content */}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: SLIDE_WIDTH,
          height: SLIDE_HEIGHT,
          padding: PAD,
        }}
      >
        {/* Top rail */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: `2px solid ${hexA(c.muted, 0.28)}`,
            paddingBottom: 22,
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            {/* The brand mark. `contain` rather than `cover` because the same
                slot takes a wide wordmark and a square avatar, and cropping
                someone's logo is worse than letting it sit inside the box. */}
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
              <img
                src={logoUrl}
                width={MARK}
                height={MARK}
                style={{
                  width: MARK,
                  height: MARK,
                  marginRight: 18,
                  objectFit: "contain",
                }}
              />
            ) : (
              <div
                style={{
                  width: MARK,
                  height: MARK,
                  backgroundColor: c.accent,
                  marginRight: 18,
                }}
              />
            )}
            <span
              style={{
                fontSize: 25,
                letterSpacing: 7,
                color: c.text,
                fontWeight: 500,
              }}
            >
              {(handle ?? brandName).toUpperCase()}
            </span>
          </div>
          <span style={{ fontSize: 25, letterSpacing: 5, color: c.muted }}>
            {String(index + 1).padStart(2, "0")}/{String(total).padStart(2, "0")}
          </span>
        </div>

        {/* Type block, bottom-anchored */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {isCta ? (
            <span
              style={{
                display: "flex",
                marginBottom: 26,
                fontSize: 26,
                letterSpacing: 6,
                color: c.accent,
                fontWeight: 500,
              }}
            >
              {preset.ctaKicker.toUpperCase()}
            </span>
          ) : null}

          <Heading
            text={heading}
            size={headingSize}
            color={c.text}
            width={INNER}
          />

          {body ? (
            <div
              style={{
                display: "flex",
                marginTop: 40,
                maxWidth: 880,
                fontSize: 40,
                lineHeight: 1.42,
                color: isCta ? c.text : hexA(c.text, 0.72),
              }}
            >
              {body}
            </div>
          ) : null}

          {/* Footer */}
          {isCta ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                marginTop: 56,
                borderTop: `5px solid ${c.accent}`,
                paddingTop: 34,
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontFamily: DISPLAY_FONT,
                  fontSize: 108,
                  lineHeight: 1,
                  letterSpacing: 1,
                  color: c.text,
                }}
              >
                {brandName.toUpperCase()}
              </div>
              {footnote ? (
                <div
                  style={{
                    display: "flex",
                    marginTop: 18,
                    fontSize: 32,
                    letterSpacing: 3,
                    color: c.accent,
                    fontWeight: 500,
                  }}
                >
                  {footnote.toUpperCase()}
                </div>
              ) : null}
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 52,
              }}
            >
              <div
                style={{
                  width: isHook ? 150 : 90,
                  height: 5,
                  backgroundColor: c.accent,
                }}
              />
              <span
                style={{
                  fontSize: 26,
                  letterSpacing: 7,
                  color: hexA(c.muted, 0.85),
                  fontWeight: 500,
                }}
              >
                {isHook ? "SWIPE" : "KEEP GOING"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The headline. Drawn once, cleanly — an earlier version offset a cyan and a
 * red copy behind it to fake chromatic aberration, which read as a broken
 * export rather than as optics.
 */
function Heading({
  text,
  size,
  color,
  width,
}: {
  text: string;
  size: number;
  color: string;
  width: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        width,
        color,
        fontFamily: DISPLAY_FONT,
        fontSize: size,
        lineHeight: 0.94,
        letterSpacing: -1,
        textTransform: "uppercase",
      }}
    >
      {text}
    </div>
  );
}

/** Tiling fractal-noise tile, inlined so the renderer needs no network. */
const grainTexture = () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="220" height="220" filter="url(#g)"/></svg>`;

  return `data:image/svg+xml;base64,${base64(svg)}`;
};

const base64 = (input: string) =>
  typeof window === "undefined"
    ? Buffer.from(input, "utf8").toString("base64")
    : window.btoa(input);

/** #RRGGBB + alpha -> rgba(), since satori has no color-mix(). */
const hexA = (hex: string, alpha: number) => {
  const v = hex.replace("#", "");
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
