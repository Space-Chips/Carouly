import SlideArt, { SLIDE_HEIGHT, SLIDE_WIDTH } from "@/components/SlideArt";
import { getPreset } from "@/lib/presets";
import { Brand, Carousel, Slide } from "@/types";

/**
 * Shows a slide at any size. If the PNG has already been rendered we show it,
 * because that is literally what gets posted; otherwise we render the live
 * component so unrendered drafts still preview.
 */
export default function SlidePreview({
  slide,
  carousel,
  brand,
  total,
  width = 260,
}: {
  slide: Slide;
  carousel: Pick<Carousel, "preset" | "hook_image_url">;
  brand: Pick<Brand, "name" | "handle" | "logo_url">;
  total: number;
  width?: number;
}) {
  const scale = width / SLIDE_WIDTH;

  return (
    <div
      className="rounded-lg overflow-hidden border border-white/10 bg-black shrink-0"
      style={{ width, height: SLIDE_HEIGHT * scale }}
    >
      {slide.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={slide.image_url}
          alt={slide.heading}
          width={width}
          height={SLIDE_HEIGHT * scale}
          style={{ display: "block", width: "100%", height: "100%" }}
        />
      ) : (
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            width: SLIDE_WIDTH,
            height: SLIDE_HEIGHT,
          }}
        >
          <SlideArt
            preset={getPreset(carousel.preset)}
            kind={slide.kind}
            heading={slide.heading}
            body={slide.body}
            footnote={slide.footnote}
            index={slide.position}
            total={total}
            brandName={brand.name}
            handle={brand.handle}
            backgroundUrl={carousel.hook_image_url}
            logoUrl={brand.logo_url}
          />
        </div>
      )}
    </div>
  );
}
