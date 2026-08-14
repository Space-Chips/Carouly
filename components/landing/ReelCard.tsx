import { Play } from "@phosphor-icons/react/dist/ssr";

/**
 * One vertical video frame.
 *
 * The UGC renders do not exist yet, so this draws a composed stand-in rather
 * than a grey box: a 9:16 frame in a flat brand-adjacent colour, carrying the
 * duration and category a finished clip would carry. It is a placeholder that
 * is honest about being one — the section above each gallery says so in words —
 * but it is laid out exactly like the real thing, so dropping a poster or an
 * mp4 in later changes nothing about the page around it.
 *
 * `poster` is the swap-in point. Give it an image and the colour field becomes
 * the image, with every chip, ratio and radius unchanged.
 */

export type ReelTone =
  | "ember"
  | "teal"
  | "indigo"
  | "acid"
  | "cherry"
  | "fern"
  | "pitch"
  | "violet";

/** Flat fills, no gradients. Chips sit on top in solid white so every hue,
 *  including the acid yellow, keeps its label legible. */
const TONES: Record<ReelTone, string> = {
  ember: "#d4552b",
  teal: "#128f96",
  indigo: "#2b2a55",
  acid: "#e0b400",
  cherry: "#c01f3f",
  fern: "#3f8a5e",
  pitch: "#17171a",
  violet: "#6f56b5",
};

export type Reel = {
  /** What the clip is, in the words a creator would use. */
  title: string;
  /** The format lineage, shown as the category chip. */
  kind: string;
  /** Runtime in seconds. Short, because these are hooks not films. */
  seconds: number;
  tone: ReelTone;
  /** Optional still. Present means the colour field is replaced by the image. */
  poster?: string;
};

const clock = (seconds: number) =>
  `0:${String(seconds).padStart(2, "0")}`;

export default function ReelCard({
  reel,
  className = "",
}: {
  reel: Reel;
  className?: string;
}) {
  return (
    <figure
      className={`group relative aspect-[9/16] w-full overflow-hidden rounded-2xl border border-black/10 ${className}`}
      style={{ backgroundColor: TONES[reel.tone] }}
    >
      {reel.poster ? (
        // Not next/image: these will be stills pulled out of a render pipeline
        // at whatever size it emits, and the frame already fixes the box.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={reel.poster}
          alt={`${reel.title}, a ${reel.seconds} second ${reel.kind.toLowerCase()} clip`}
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}

      {/* Runtime, top left, exactly where a scrubber would put it. */}
      <span className="absolute left-2 top-2 rounded-lg bg-white px-2 py-0.5 font-mono text-xs text-graphite">
        {clock(reel.seconds)}
      </span>

      {/* The play mark is outlined rather than filled: this is a frame waiting
          for footage, and a solid play button would promise a clip that is not
          there yet. */}
      <span
        aria-hidden
        className="absolute left-1/2 top-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/70 text-white transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-110 group-hover:border-white"
      >
        <Play weight="fill" className="size-4" />
      </span>

      <figcaption className="absolute inset-x-0 bottom-0 bg-black/25 p-2">
        <p className="truncate text-sm font-semibold text-white">
          {reel.title}
        </p>
        <p className="mt-0.5 truncate font-mono text-xs uppercase tracking-[0.2em] text-white/70">
          {reel.kind}
        </p>
      </figcaption>
    </figure>
  );
}
