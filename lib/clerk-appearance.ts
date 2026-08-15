/**
 * Clerk, on paper.
 *
 * The app ships two grounds. The legacy carousel screens are still on near
 * black, and `ClerkProvider` in the root layout dresses every Clerk surface to
 * match them — which is right for a checkout drawer opened from the paywall and
 * wrong for everything in the current product, because the landing page, the
 * studio and the library are all on paper.
 *
 * So this is the paper set, applied per component rather than globally. Scoping
 * it that way is the point: flipping the provider would have fixed sign-in and
 * quietly turned the paywall's card form into a white rectangle in the middle of
 * a black screen. Two grounds, two appearances, one place each is defined.
 *
 * The primary is graphite rather than ember. Ember is the brand's only warm mark
 * and it earns that by never filling a surface — the hero's own submit button is
 * black — so a terracotta "Continue" here would be the one loud button in the
 * whole funnel.
 */

const INK = {
  graphite: "#0c0a09",
  mute: "#6e6862",
  paper: "#f4f3f1",
  lift: "#ffffff",
  rule: "#e0ddd8",
  fail: "#b31b3a",
  ok: "#2f6d4f",
  ember: "#c4552f",
} as const;

/**
 * Shared by `<SignIn>`, `<SignUp>` and the studio's `<UserButton>`.
 *
 * `colorNeutral` is the one worth stating rather than defaulting. Clerk derives
 * borders, dividers, icon fills and hover surfaces from it by building an alpha
 * scale down from that colour, so leaving it unset on a light ground is how you
 * get a white panel with invisible dividers.
 */
export const paperClerk = {
  variables: {
    colorNeutral: INK.graphite,
    colorBackground: INK.lift,
    colorForeground: INK.graphite,
    colorMuted: INK.paper,
    colorMutedForeground: INK.mute,
    colorPrimary: INK.graphite,
    colorPrimaryForeground: INK.lift,
    colorInput: INK.lift,
    colorInputForeground: INK.graphite,
    colorBorder: INK.rule,
    colorShadow: "rgba(12, 10, 9, 0.16)",
    colorSuccess: INK.ok,
    colorWarning: INK.ember,
    colorDanger: INK.fail,
    borderRadius: "0.625rem",
    fontFamily: "var(--font-geist-sans)",
  },
} as const;

/**
 * The sign-in and sign-up form, shaped to the page it interrupts.
 *
 * Style objects rather than class strings, and that distinction is the whole
 * reason this reads the way it does. `elements` also accepts Tailwind classes,
 * but Clerk generates its own classes at runtime and those win — `header:
 * "hidden"` is genuinely applied to the element and still computes to
 * `display: flex`. Handing Clerk CSS instead puts our declarations in the same
 * cascade as its own, which both works and stays inside the documented API.
 *
 * The alternative was descendant selectors against `.cl-*` in globals.css.
 * That also works, and Clerk logs a warning about it every time, because those
 * class names are its internal DOM and it reserves the right to change them on
 * any component update. One `.cl-` selector survives in globals.css — the Apple
 * provider logo, which is a remote image with no `elements` key for its filter.
 */
export const paperClerkForm = {
  ...paperClerk,
  elements: {
    // Our own heading already said what this screen is for, in the product's
    // voice. Clerk's says "Sign in to <instance display name>", which is not the
    // brand and is not a sentence anybody wrote.
    header: { display: "none" },

    // Clerk's own card is dissolved into ours.
    //
    // `AuthPanel` is already the raised white surface, with its own border,
    // radius, shadow and padding — so a second card inside it arrives as a
    // panel-in-a-panel with two edges and two gutters. Stripping the chrome and
    // the width cap here lets Clerk's form sit directly in our column and take
    // its measure from it.
    //
    // Written as `elements` rather than as `.cl-cardBox` selectors in
    // globals.css on purpose: those class names are Clerk's internal DOM, it
    // logs a warning for every rule aimed at them, and it reserves the right to
    // rename them on any component update.
    // Clerk sizes the root to its content, so without this the form sits in a
    // ~200px column in the middle of ours and the provider buttons truncate
    // their own labels to "Goog…".
    rootBox: {
      width: "100%",
    },
    cardBox: {
      width: "100%",
      maxWidth: "none",
      overflow: "visible",
      border: 0,
      borderRadius: 0,
      boxShadow: "none",
    },
    card: {
      width: "100%",
      padding: 0,
      border: 0,
      backgroundColor: "transparent",
      boxShadow: "none",
    },
    // The way out of the form — "no account yet", "use another method" — sits
    // under it on the same paper rather than on a sunk strip, because our own
    // card's foot is already doing that job an element further out.
    footer: {
      padding: "1.25rem 0 0",
      borderTop: 0,
      backgroundColor: "transparent",
      backgroundImage: "none",
      boxShadow: "none",
    },

    // The same press the hero's own submit button has. This is the third black
    // button somebody pushes to get through the funnel and all three should
    // answer identically.
    formButtonPrimary: {
      borderRadius: "0.75rem",
      transition: "transform 100ms cubic-bezier(0.33, 1, 0.68, 1)",
      "&:active": { transform: "scale(0.98)" },
      "@media (prefers-reduced-motion: reduce)": {
        transition: "none",
        "&:active": { transform: "none" },
      },
    },
    // Stacked rather than laid out in a row.
    //
    // Clerk sizes the row into as many equal columns as there are providers, so
    // hiding Apple below leaves Google holding half a row with a gap beside it.
    // A column also means the list can grow later without the buttons getting
    // narrower than their own labels — this is a 24rem form, and "Continue with
    // Google" does not survive being put in a third of it.
    socialButtons: {
      display: "flex",
      flexDirection: "column",
    },
    socialButtonsBlockButton: {
      width: "100%",
      borderRadius: "0.75rem",
      borderColor: INK.rule,
      boxShadow: "none",
    },

    // Google only, as the funnel has always meant to be.
    //
    // This lived in globals.css as `[data-provider="apple"]`, which matched
    // nothing — Clerk marks the provider with a class, not an attribute, so
    // Apple has in fact been on the form the whole time. The per-provider
    // element key is the supported way to say it and it does work.
    //
    // Worth knowing that this only hides the button. If Apple is enabled on the
    // Clerk instance the strategy is still live, so the durable version of this
    // decision is turning the provider off in the Clerk dashboard; this keeps
    // the surface honest in the meantime.
    socialButtonsBlockButton__apple: {
      display: "none",
    },
    formFieldInput: {
      borderRadius: "0.75rem",
      boxShadow: "none",
    },
  },
} as const;
