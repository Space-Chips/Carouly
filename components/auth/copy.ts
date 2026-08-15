/**
 * What the auth surfaces say, in one place.
 *
 * There are three doors into the same form — the hero's address box, the nav's
 * two buttons, and the /sign-in and /sign-up routes the middleware redirects to
 * — and the wording has to hold across all of them, because somebody can arrive
 * at the dialog, close it, and land on the page a second later. Keeping the
 * strings here rather than at each call site is what makes that a fact instead
 * of a thing to remember.
 *
 * Two axes: what they came to do, and whether they brought an address. The
 * address is the one that changes the register — with a host in hand the screen
 * describes a run that is already queued, so it stops selling and starts
 * confirming.
 */
export type AuthIntent = "sign-in" | "sign-up";

export type AuthCopy = {
  eyebrow: string;
  heading: string;
  blurb: string;
};

export const authCopy = (intent: AuthIntent, site: string | null): AuthCopy => {
  if (site) {
    return {
      eyebrow: "Queued",
      heading: "Your run is ready.",
      blurb:
        intent === "sign-up"
          ? "Free while we are in early access, and there is no card at signup. Nothing publishes until you connect an account."
          : "We read the address as soon as you are through, and the first cut is waiting a few minutes later. Nothing publishes until you connect an account.",
    };
  }

  return intent === "sign-up"
    ? {
        eyebrow: "Early access",
        heading: "Create your studio.",
        blurb:
          "No brief, no forms, no filming. Paste the address you already have and the first vertical cut lands minutes later — free while we are in early access.",
      }
    : {
        eyebrow: "Welcome back",
        heading: "Welcome back.",
        blurb:
          "Your projects, your brand kits and everything the runs have kept are where you left them.",
      };
};

/**
 * Where somebody lands once they are through.
 *
 * The studio reads `?site=` and starts the run itself, so carrying the host
 * across the auth wall is the difference between arriving at work already in
 * progress and arriving at an empty box you have to fill in twice.
 */
export const studioHref = (site: string | null) =>
  site ? `/studio?site=${encodeURIComponent(site)}` : "/studio";
