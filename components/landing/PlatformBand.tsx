import {
  FacebookLogo,
  InstagramLogo,
  LinkedinLogo,
  TiktokLogo,
  XLogo,
} from "@phosphor-icons/react/dist/ssr";

/**
 * Where the posts actually land.
 *
 * It sits immediately under the hero because the hero makes a claim about
 * something happening every night, and the first question that follows is
 * "happening where". Kept to a single quiet row rather than a section: this is
 * a fact the reader needs on the way past, not an argument that needs making.
 *
 * The order matches lib/social/registry.ts, so the page cannot drift out of
 * step with what the product actually connects to.
 */
const platforms = [
  { icon: InstagramLogo, label: "Instagram" },
  { icon: TiktokLogo, label: "TikTok" },
  { icon: FacebookLogo, label: "Facebook" },
  { icon: LinkedinLogo, label: "LinkedIn" },
  { icon: XLogo, label: "X" },
];

export default function PlatformBand() {
  return (
    <section
      aria-label="Where it posts"
      // Sunk grey rather than paper: the band is a fact in passing, and giving
      // it its own ground lets the eye skip it on the way to the argument
      // without it disappearing entirely.
      className="border-y border-rule bg-paper-sunk"
    >
      {/* A grid rather than one wrapping row. The three parts do not fit on a
          line at every width, and left to wrap the closing note dropped to the
          far left under the label, where it read as a stray sentence rather
          than as a footnote to the list it belongs to. */}
      <div className="mx-auto grid w-full max-w-6xl gap-x-12 gap-y-4 px-6 py-12 sm:grid-cols-[auto_minmax(0,1fr)]">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-mute sm:pt-1">
          Posts automatically to
        </p>

        <div>
          <ul className="flex flex-wrap items-center gap-x-8 gap-y-4">
            {platforms.map((platform) => {
              const Icon = platform.icon;

              return (
                <li
                  key={platform.label}
                  className="flex items-center gap-2 text-graphite"
                >
                  <Icon weight="fill" aria-hidden className="size-5 text-mute" />
                  <span className="text-base">{platform.label}</span>
                </li>
              );
            })}
          </ul>

          <p className="mt-4 text-sm text-mute">
            Or connect nothing and download the files to post by hand.
          </p>
        </div>
      </div>
    </section>
  );
}
