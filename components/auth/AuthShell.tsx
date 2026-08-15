import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import AuthPanel, {
  authBlurbClass,
  authHeadingClass,
} from "@/components/auth/AuthPanel";
import { SCENES } from "@/components/auth/scenes";

/**
 * The /sign-in and /sign-up routes.
 *
 * These are not the main door any more — the landing page opens the same card
 * in a dialog without leaving the page — but they are the one the middleware
 * uses, so they carry every arrival the dialog cannot: a link straight to
 * /studio, a returning OAuth redirect, a password reset out of an email. They
 * have to be a whole page, and they have to look like the dialog, which is why
 * both mount the same `AuthPanel`.
 *
 * A server component on purpose. Nothing here reacts to anything, so the route
 * ships the panel as markup and only Clerk's own form arrives as JavaScript.
 */
export default function AuthShell({
  site,
  eyebrow,
  heading,
  blurb,
  children,
}: {
  site: string | null;
  eyebrow: string;
  heading: string;
  blurb: string;
  children: ReactNode;
}) {
  return (
    <main className="auth-stage relative flex min-h-dvh flex-col bg-paper px-4 py-4 text-graphite sm:px-8 sm:py-6">
      {/* The same three stills as the card, blown out behind frosted glass.
          It is the card's own picture out of focus — the screen has one image
          on it, shown twice at two depths, rather than two competing ones. */}
      <div aria-hidden className="auth-backdrop">
        {SCENES.map((scene, index) => (
          <Image
            key={scene.src}
            src={scene.src}
            alt=""
            fill
            sizes="100vw"
            className={`auth-backdrop-image auth-backdrop-image-${index}`}
          />
        ))}
        <div className="auth-backdrop-wash" />
      </div>

      {/* The wordmark is the only navigation. Auth is a focused task, so the app
          bar is gone — but the way back out must not be, or the only exit from a
          screen somebody landed on by accident is the browser's own button. */}
      <div className="relative z-10 flex items-center justify-between px-2 py-2">
        <Link
          href="/"
          className="rounded text-lg font-bold tracking-[-0.03em] text-graphite transition-opacity duration-200 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-graphite"
        >
          Carouly
        </Link>
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.22em] text-mute sm:block">
          Your URL to nightly video
        </span>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center py-6 sm:py-10">
        <AuthPanel
          site={site}
          eyebrow={eyebrow}
          heading={<h1 className={authHeadingClass}>{heading}</h1>}
          blurb={<p className={authBlurbClass}>{blurb}</p>}
          className="w-full max-w-[60rem] max-h-[min(46rem,calc(100dvh-8rem))]"
        >
          {children}
        </AuthPanel>
      </div>
    </main>
  );
}
