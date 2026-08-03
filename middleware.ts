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

export default clerkMiddleware(async (auth, request) => {
  if (isConnectRoute(request)) {
    await auth.protect({
      unauthenticatedUrl: new URL("/sign-in", request.url).toString(),
    });
    return;
  }

  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  /**
   * Runs on Node, not on the edge.
   *
   * Clerk v7's middleware reaches for Node built-ins — `#crypto` for token
   * verification and `#safe-node-apis` underneath it — so bundling it for the
   * edge target fails at deploy time with:
   *
   *   The Edge Function "middleware" is referencing unsupported modules:
   *     @clerk/shared/authorization, #crypto, #safe-node-apis, …
   *
   * Middleware defaults to the edge runtime up to Next 15, and the Node.js
   * runtime became stable in 15.5 — which is what makes this one line legal
   * here. Next 16 renames the file to `proxy.ts` and flips the default to
   * Node, at which point this key has to go: setting `runtime` in a proxy file
   * is an error rather than a no-op.
   */
  runtime: "nodejs",
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
