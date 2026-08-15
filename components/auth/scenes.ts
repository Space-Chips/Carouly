/**
 * The three stills the auth surfaces run behind their form.
 *
 * They are a sequence, not a mood board, and the labels say so: this is the
 * same three-beat the landing page tells in its run rail — you paste, it finds,
 * it cuts — recapped at the one moment somebody is being asked to stop and hand
 * over an email. The photography is deliberately candid rather than staged,
 * because the product's whole claim is that the footage does not need a shoot.
 *
 * Shared rather than duplicated so the page and the dialog cannot drift, and
 * kept free of JSX so a server component can import it without pulling a client
 * boundary along with it.
 */
export const SCENES = [
  {
    src: "/auth/scene-palms.png",
    marker: "One box",
    caption: "You paste your web address.",
  },
  {
    src: "/auth/scene-lotus.png",
    marker: "Every night",
    caption: "It finds what they are asking.",
  },
  {
    src: "/auth/scene-kitchen.png",
    marker: "Minutes later",
    caption: "A vertical cut, ready to go out.",
  },
] as const;

/**
 * The crossfade itself lives in globals.css, under `.auth-scene-*`. Adding a
 * fourth scene here therefore needs a fourth `animation-delay` rule and a wider
 * stagger on the existing three — the timing is one loop split three ways, not
 * something the markup computes.
 */
