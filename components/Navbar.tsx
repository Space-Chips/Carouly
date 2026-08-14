"use client";

import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";

import LandingNav from "@/components/landing/LandingNav";
import { Button } from "@/components/ui/button";

/**
 * Two grounds, one bar.
 *
 * The studio runs on paper like the marketing site; the older carousel screens
 * are still on the dark app surface. Rather than ship two navs that drift apart,
 * this one reads which ground it is standing on and takes its inks from there.
 *
 * Credits are a link rather than a live meter. Every screen this bar appears on
 * already renders the balance from the server — the dashboard banner, the panel
 * in Settings — so a meter here would mean a client fetch on each of them to
 * duplicate something already on the page. The live one belongs in the studio,
 * which is the only place where the number moves while you are looking at it.
 */
const links = [
  { href: "/studio", label: "Studio" },
  { href: "/credits", label: "Credits" },
  { href: "/settings", label: "Settings" },
];

const PAPER_ROUTES = ["/settings", "/credits"];

const Navbar = () => {
  const pathname = usePathname();

  // The marketing page runs a floating island nav instead of this bar. Keeping
  // the switch here means layout.tsx still mounts exactly one nav.
  if (pathname === "/") return <LandingNav />;

  // The studio has no top bar at all. It carries its own rail with the brand and
  // the account on it, and a second header above that would have said "Carouly"
  // twice and cost the transcript 64px it has better uses for.
  if (pathname.startsWith("/studio")) return null;

  // Neither do the auth screens. They are a single focused task on paper, and
  // this bar is the dark app's — dropped on top of them it arrives as a black
  // strip above a light page, offering a "Sign in" button to somebody already
  // looking at the sign-in form. They carry their own wordmark home instead.
  if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) {
    return null;
  }

  const paper = PAPER_ROUTES.some((route) => pathname.startsWith(route));

  return (
    <header
      className={`sticky top-0 z-40 border-b backdrop-blur-md ${
        paper ? "border-rule bg-paper/85" : "border-white/10 bg-background/80"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-none items-center justify-between gap-4 px-5">
        <Link
          href="/"
          className={`text-lg font-bold uppercase tracking-tight ${
            paper ? "text-graphite" : ""
          }`}
        >
          Carouly
        </Link>

        <div className="flex items-center gap-6 text-sm">
          <Show when="signed-in">
            {links.map((link) => {
              const active = pathname.startsWith(link.href);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative py-1 transition-colors duration-200 ${
                    active
                      ? paper
                        ? "text-graphite"
                        : "text-foreground"
                      : paper
                        ? "text-mute hover:text-graphite"
                        : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {link.label}
                  {/* The underline grows from the centre rather than appearing. */}
                  <span
                    className={`absolute -bottom-0.5 left-0 h-px w-full origin-center bg-ember transition-transform duration-300 ${
                      active ? "scale-x-100" : "scale-x-0"
                    }`}
                  />
                </Link>
              );
            })}
            <UserButton />
          </Show>

          <Show when="signed-out">
            <SignInButton>
              <Button size="sm">Sign in</Button>
            </SignInButton>
          </Show>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
