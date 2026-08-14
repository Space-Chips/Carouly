/**
 * Normalising what someone types into the hero box.
 *
 * People type `northline.app`, `www.northline.app/pricing`, `https://northline.app`
 * and `Northline.app ` with a trailing space, all meaning the same thing. The
 * onboarding step downstream only wants the host, so everything collapses to one
 * lowercase hostname here rather than four times further in.
 *
 * Deliberately not a strict TLD check: the point is to catch a genuine typo
 * before someone is sent through sign-up, not to police obscure domains.
 */

const HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

export type SiteResult =
  | { ok: true; host: string }
  | { ok: false; reason: string };

export const normalizeSite = (input: string): SiteResult => {
  const trimmed = input.trim();

  if (!trimmed) return { ok: false, reason: "Enter your website address." };

  // Strip the scheme, any credentials, and everything from the first slash,
  // question mark or hash onward.
  const host = trimmed
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/^[^@/]*@/, "")
    .split(/[/?#]/)[0]
    .replace(/^www\./i, "")
    .replace(/\.$/, "")
    .toLowerCase();

  if (!host || !HOST.test(host)) {
    return {
      ok: false,
      reason: "That does not look like a web address. Try northline.app",
    };
  }

  return { ok: true, host };
};

/**
 * The address someone pasted, recovered on the way through the auth wall.
 *
 * Clerk protects `/studio`, so a visitor who pastes into the hero is bounced to
 * sign-in with their intended destination parked in `redirect_url` —
 * `?redirect_url=http://localhost:3000/studio%3Fsite%3Dnorthline.coffee`. The
 * host is therefore still in hand at the one moment the funnel is most likely to
 * lose someone, and the auth screen can say what it is about to do rather than
 * presenting a bare form.
 *
 * Tolerant by design. This only ever decorates a page — a value that does not
 * parse yields nothing and the screen falls back to its no-address wording, so
 * a hand-edited query string cannot produce an error page.
 */
export const siteFromRedirect = (redirect?: string | string[]): string | null => {
  const raw = Array.isArray(redirect) ? redirect[0] : redirect;
  if (!raw) return null;

  try {
    // Relative in production, absolute in development — a base covers both.
    const site = new URL(raw, "http://localhost").searchParams.get("site");
    if (!site) return null;

    const result = normalizeSite(site);
    return result.ok ? result.host : null;
  } catch {
    return null;
  }
};
