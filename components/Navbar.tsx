"use client";

import { SignedOut, SignInButton, SignedIn, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";

import LandingNav from "@/components/landing/LandingNav";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/carousels", label: "Carousels" },
  { href: "/keywords", label: "Keywords" },
  { href: "/settings", label: "Settings" },
];

const Navbar = () => {
  const pathname = usePathname();

  // The marketing page runs a floating island nav instead of this bar. Keeping
  // the switch here means layout.tsx still mounts exactly one nav.
  if (pathname === "/") return <LandingNav />;

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-background/80 backdrop-blur-md">
      <div className="flex justify-between items-center p-4 gap-4 h-16 max-w-7xl mx-auto">
        <Link href="/" className="text-lg font-bold tracking-tight uppercase">
          Carouly
        </Link>

        <div className="flex gap-6 items-center text-sm">
          <SignedIn>
            {links.map((link) => {
              const active = pathname.startsWith(link.href);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative py-1 transition-colors ${
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {link.label}
                  {/* The underline grows from the centre rather than appearing. */}
                  <span
                    className={`absolute -bottom-0.5 left-0 h-px w-full origin-center bg-orange-500 transition-transform duration-300 ${
                      active ? "scale-x-100" : "scale-x-0"
                    }`}
                  />
                </Link>
              );
            })}
            <UserButton />
          </SignedIn>

          <SignedOut>
            <SignInButton>
              <Button size="sm">Sign in</Button>
            </SignInButton>
          </SignedOut>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
