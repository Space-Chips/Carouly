"use client";

import { SignIn, UNSAFE_PortalProvider } from "@clerk/nextjs";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";
import { useCallback, useRef } from "react";

import AuthFormSkeleton from "@/components/auth/AuthFormSkeleton";
import AuthPanel, {
  authBlurbClass,
  authHeadingClass,
} from "@/components/auth/AuthPanel";
import { authCopy, studioHref, type AuthIntent } from "@/components/auth/copy";
import { paperClerkForm } from "@/lib/clerk-appearance";

/**
 * Sign-in without leaving the page.
 *
 * The hero's whole argument is that one address is the entire setup, and a full
 * navigation to a login route in the middle of that is the page contradicting
 * itself: the box you just typed into is gone, and what replaces it is a form.
 * Opening the same card over the page keeps the address visible, keeps the
 * scroll position, and makes closing it a way back rather than a page load.
 *
 * Built on Radix rather than a portal and a fixed div. What a login dialog owes
 * somebody is a focus trap, Escape, a locked background, focus returned to the
 * control they opened it from, and an accessible name — five things that are
 * each a small bug when hand-rolled and are the primitive's entire job.
 *
 * `<SignIn>` handles both new and returning people here (`withSignUp`), because
 * this dialog opens from a marketing page where most arrivals have no account.
 * A footer link that navigated away to /sign-up would drop them out of exactly
 * the flow this component exists to preserve.
 */
export default function AuthDialog({
  open,
  onOpenChange,
  site,
  intent = "sign-in",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The address they pasted, carried through to the studio on the far side. */
  site: string | null;
  intent?: AuthIntent;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const copy = authCopy(intent, site);
  const redirect = studioHref(site);

  /**
   * Put focus back where it came from.
   *
   * Radix returns focus to its own `<Dialog.Trigger>` on close, and this dialog
   * has none — `open` is owned by whoever raised it, because the hero's box
   * decides between a dialog and a navigation only after Clerk has answered
   * whether there is already a session. With no trigger to return to, focus
   * lands on `<body>`, and somebody who tabbed to "Sign in" and pressed Escape
   * is dropped at the top of the document with their place in the page gone.
   *
   * `onOpenAutoFocus` fires before Radix moves focus into the card, so the
   * active element at that moment is still the control that opened it.
   */
  const rememberOpener = useCallback(() => {
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement ? active : null;
  }, []);

  const restoreOpener = useCallback((event: Event) => {
    const opener = openerRef.current;
    // Gone from the DOM — a menu that closed behind it, say. Radix's own
    // fallback is better than focusing something detached.
    if (!opener?.isConnected) return;

    event.preventDefault();
    opener.focus({ preventScroll: true });
  }, []);

  /**
   * Clerk mounts its floating bits — the provider menu, a country picker on a
   * phone field — through a portal, and by default that portal lands on
   * `document.body`, which is outside the dialog. Radix makes everything
   * outside inert while the dialog is open, so those would render and then
   * refuse to be clicked. Pointing Clerk's portals at the card puts them back
   * inside the trap, where they both work and are reachable by keyboard.
   */
  const getContainer = useCallback(() => cardRef.current, []);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* The overlay is also the scroll container, and the card is centred by
            a flex child inside it rather than by a translate. That leaves
            `transform` free for the open animation, and it means a card taller
            than a short laptop viewport scrolls with its top edge intact
            instead of being clipped off the screen. */}
        <Dialog.Overlay className="auth-dialog-overlay fixed inset-0 z-[80] overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-3 sm:p-6">
            <Dialog.Content
              ref={cardRef}
              onOpenAutoFocus={rememberOpener}
              onCloseAutoFocus={restoreOpener}
              className="auth-dialog-card w-full max-w-[60rem] focus:outline-none"
            >
              <UNSAFE_PortalProvider getContainer={getContainer}>
                <AuthPanel
                  site={site}
                  eyebrow={copy.eyebrow}
                  heading={
                    <Dialog.Title className={authHeadingClass}>
                      {copy.heading}
                    </Dialog.Title>
                  }
                  blurb={
                    <Dialog.Description className={authBlurbClass}>
                      {copy.blurb}
                    </Dialog.Description>
                  }
                  className="max-h-[calc(100dvh-1.5rem)] sm:max-h-[min(46rem,calc(100dvh-3rem))]"
                  close={
                    <Dialog.Close
                      aria-label="Close"
                      className="absolute right-2.5 top-2.5 z-20 grid size-11 place-items-center rounded-full text-mute outline-none transition-colors duration-200 hover:bg-paper hover:text-graphite focus-visible:ring-2 focus-visible:ring-graphite focus-visible:ring-offset-2 focus-visible:ring-offset-paper-lift"
                    >
                      {/* A chip rather than a bare glyph: on a phone this
                          corner sits over the photograph, where an unbacked
                          mark would disappear into whichever frame is up. */}
                      <span className="grid size-8 place-items-center rounded-full bg-paper-lift/85 ring-1 ring-rule backdrop-blur-sm">
                        <X weight="bold" aria-hidden className="size-4" />
                      </span>
                    </Dialog.Close>
                  }
                >
                  <SignIn
                    routing="hash"
                    withSignUp
                    forceRedirectUrl={redirect}
                    signUpForceRedirectUrl={redirect}
                    appearance={paperClerkForm}
                    fallback={<AuthFormSkeleton />}
                  />
                </AuthPanel>
              </UNSAFE_PortalProvider>
            </Dialog.Content>
          </div>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

