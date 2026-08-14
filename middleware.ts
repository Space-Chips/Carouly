import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// The marketing page, its legal pages, the auth screens and the cron endpoint
// are the only things reachable without a session. The cron route
// authenticates itself with CRON_SECRET instead.
const isPublicRoute = createRouteMatcher([
  "/",
  "/privacy",
  "/terms",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/cron(.*)",
  // Clerk posts here with a Svix signature, not a session. The route verifies
  // that signature itself — see app/api/webhooks/clerk.
  "/api/webhooks(.*)",
]);

/**
 * The OAuth connect routes are browser navigations, not API calls — the user
 * leaves for Instagram or TikTok and comes back. Clerk answers an unprotected
 * /api/* request with a bare 404, which mid-flow would look like the app
 * broke, so these redirect to sign-in like a page would.
 */
const isConnectRoute = createRouteMatcher(["/api/connect(.*)"]);

export default clerkMiddleware(
  async (auth, request) => {
    if (isConnectRoute(request)) {
      await auth.protect({
        unauthenticatedUrl: new URL("/sign-in", request.url).toString(),
      });
      return;
    }

    if (!isPublicRoute(request)) {
      await auth.protect();
    }
  },
  {
    /**
     * Where `auth.protect()` sends a signed-out visitor.
     *
     * These have to be here and not only on `ClerkProvider`. The provider is a
     * React context and this runs in the edge, so with the option set in just
     * one place the app said two different things: client-side buttons opened
     * the in-app pages while every protected navigation — which is the path
     * almost everybody actually takes, straight off the hero box — was redirected
     * to Clerk's hosted Account Portal on `*.accounts.dev`. That is a different
     * domain, in Clerk's purple, titled "My Application", and it is where the
     * funnel had been leaking the entire time.
     *
     * `redirect_url` is appended by Clerk, so `?site=` survives the round trip
     * and the auth screen can name the address it is about to read.
     */
    signInUrl: "/sign-in",
    signUpUrl: "/sign-up",
  }
);

// No `runtime` key: this stays on the edge, which is the default through
// Next 15, and Next's own build bundles Clerk into the middleware correctly.
//
// A long run of deploy failures here — every @clerk/shared subpath reported as
// an unsupported module, then MIDDLEWARE_INVOCATION_FAILED after switching to
// the Node runtime, then `Error: Unhandled type: "ColonToken"` from a JSDoc
// block in this object — all had a single cause that is not in this file: the
// Vercel project's framework preset was "Other", not Next.js. With no preset,
// Vercel ignores the Next builder and compiles this root middleware.ts with its
// own standalone edge bundler, which statically evaluates the config export and
// cannot resolve Clerk's bundler-only ESM build. `next build` succeeds locally
// the whole time, because locally Next is doing the bundling and Vercel was not.
//
// The preset is now pinned in vercel.json ("framework": "nextjs"). If these
// symptoms ever return, check that setting before changing anything here.
export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    // mp4/webm/mov are in the list because the studio serves example renders and
    // template previews as static files. Without them Clerk answers a request
    // for a video with a bare 404, which arrives as a `<video>` that silently
    // will not play — the hardest possible way to find out about a matcher.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|mp4|webm|mov|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
