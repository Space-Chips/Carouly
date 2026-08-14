import ReelCard from "@/components/landing/ReelCard";
import { REELS } from "@/lib/reels";

/**
 * The full gallery, running edge to edge.
 *
 * The track is doubled and travels exactly its own width, so the seam lands on
 * an identical frame and the loop never shows a join. Spacing is a right margin
 * per card rather than a flex gap: a gap leaves one fewer space than there are
 * cards, which makes half the doubled track a slightly different width from the
 * other half and the loop drift a few pixels every pass.
 *
 * It pauses under the cursor, because a moving row you cannot stop is a row you
 * cannot read.
 */
export default function ReelRail() {
  const track = [...REELS, ...REELS];

  return (
    <div className="rail-hold overflow-hidden">
      <div className="rail flex w-max">
        {track.map((reel, index) => (
          <div
            key={`${reel.title}-${index}`}
            aria-hidden={index >= REELS.length}
            className="w-40 shrink-0 pr-4 sm:w-44 lg:w-48"
          >
            <ReelCard reel={reel} />
          </div>
        ))}
      </div>
    </div>
  );
}
