import Image from "next/image";

import { SCENES } from "@/components/auth/scenes";

/**
 * The picture half of the auth card.
 *
 * Three stills that cross-fade on a slow loop, each carrying its own line. It
 * is an ambient thing rather than a carousel: there are no dots and no arrows,
 * because nothing here is worth asking somebody to operate while they are
 * halfway through signing in.
 *
 * Every layer sits in the same grid cell — images in one stack, copy in
 * another. That is what keeps the card a fixed size: the tallest line reserves
 * the room once, so a caption that wraps to two lines cannot make the panel
 * jump as it fades in behind the form.
 *
 * The stills are decorative and the lines beside them are real text, so the
 * images take an empty alt. Reading out three photo descriptions to somebody
 * tabbing toward an email field is noise, not access.
 */
export default function AuthScene({ className = "" }: { className?: string }) {
  return (
    <div className={`auth-scene relative isolate overflow-hidden bg-graphite ${className}`}>
      {SCENES.map((scene, index) => (
        <Image
          key={scene.src}
          src={scene.src}
          alt=""
          fill
          priority={index === 0}
          sizes="(min-width: 640px) 44vw, 100vw"
          className={`auth-scene-image auth-scene-image-${index}`}
        />
      ))}

      {/* Ink from the foot upward, so the type below has a ground to sit on
          whichever frame is showing. Weighted low: the faces in these stills are
          in the upper half and a full-height scrim would grey them out. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent"
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 grid p-6 sm:p-8">
        {SCENES.map((scene, index) => (
          <div
            key={scene.src}
            className={`auth-scene-copy auth-scene-copy-${index} col-start-1 row-start-1 self-end`}
          >
            {/* The same letterspaced mono marker the landing page's run rail
                uses, because this is the same sequence being named again. */}
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/70">
              {scene.marker}
            </p>
            <p className="mt-2.5 max-w-[15ch] text-[1.6rem] font-semibold leading-[1.08] tracking-[-0.035em] text-white sm:text-[1.9rem]">
              {scene.caption}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
