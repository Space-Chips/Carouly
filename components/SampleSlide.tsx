import SlideArt, { SLIDE_HEIGHT, SLIDE_WIDTH } from "@/components/SlideArt";
import { DEFAULT_PRESET, getPreset } from "@/lib/presets";
import { SampleSlideData } from "@/lib/sample-carousel";
import { PresetId } from "@/types";

/**
 * One sample slide, rendered by the same component that produces the exported
 * PNGs — so the landing page cannot show something the product does not make.
 *
 * Two sizing modes, because the two callers need different things:
 *  - fixed (default): exactly `width` px. What the proof strip wants, since it
 *    is a horizontal scroller and its slides must not shrink to fit.
 *  - responsive: three sizes across the breakpoints. What the hero wants,
 *    where a rigid 360px slide pushed the whole page sideways on a 375px
 *    phone.
 *
 * Responsive mode carries the width and its matching scale as two custom
 * properties rather than deriving one from the other. `calc(var(--w) / 1080px)`
 * would be the tidier expression, but dividing a length by a length only
 * landed in browsers recently, and this has to render everywhere.
 */
const RESPONSIVE_SIZE = [
  "[--slide-w:264px] [--slide-s:0.2444]",
  "sm:[--slide-w:320px] sm:[--slide-s:0.2963]",
  "lg:[--slide-w:360px] lg:[--slide-s:0.3333]",
].join(" ");
export default function SampleSlide({
  slide,
  index,
  total,
  width = 0,
  responsive = false,
  preset = DEFAULT_PRESET,
  backgroundUrl,
  className = "",
}: {
  slide: SampleSlideData;
  index: number;
  total: number;
  /**
   * Which look to draw. Defaults to the one a new brand gets, and must be the
   * preset whose `imageStyle` produced `backgroundUrl`.
   */
  preset?: PresetId;
  /** Fixed pixel width. Ignored when `responsive` is set. */
  width?: number;
  responsive?: boolean;
  backgroundUrl?: string | null;
  className?: string;
}) {
  const scale = width / SLIDE_WIDTH;

  return (
    <div
      className={`shrink-0 overflow-hidden rounded-xl border border-white/10 ${
        responsive ? RESPONSIVE_SIZE : ""
      } ${className}`}
      style={
        responsive
          ? {
              width: "var(--slide-w)",
              height: `calc(var(--slide-w) * ${SLIDE_HEIGHT / SLIDE_WIDTH})`,
            }
          : { width, height: SLIDE_HEIGHT * scale }
      }
    >
      <div
        style={{
          transform: responsive ? "scale(var(--slide-s))" : `scale(${scale})`,
          transformOrigin: "top left",
          width: SLIDE_WIDTH,
          height: SLIDE_HEIGHT,
        }}
      >
        <SlideArt
          preset={getPreset(preset)}
          kind={slide.kind}
          heading={slide.heading}
          body={slide.body}
          footnote={slide.footnote}
          index={index}
          total={total}
          brandName="Halden"
          handle="@haldenroasters"
          backgroundUrl={backgroundUrl}
        />
      </div>
    </div>
  );
}
