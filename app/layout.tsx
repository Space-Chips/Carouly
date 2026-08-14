import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";

import Navbar from "@/components/Navbar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Carouly",
    template: "%s · Carouly",
  },
  description:
    "Paste your web address once. Every night it writes, designs and publishes a short vertical post that teaches something useful in your field.",
  applicationName: "Carouly",
  openGraph: {
    siteName: "Carouly",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    /* One appearance for every Clerk surface — sign-in, the user menu, the
       checkout drawer, the pricing table and the subscription sheet. The values
       are the same inks globals.css defines, so a card entry form opened from
       the paywall does not arrive as a white rectangle in the middle of a
       black app.

       `colorNeutral` is the one that matters most and the one it is easiest to
       miss. Clerk derives borders, dividers, icon fills, hover surfaces and the
       focus ring from it, and it defaults to black — so setting only the
       background and text colours leaves a dark panel with black icons drawn
       on it. Dark themes have to flip it to white and let Clerk build the
       alpha scale down from there. */
    <ClerkProvider
      /**
       * Where the auth screens live.
       *
       * Without these two, `auth.protect()` in middleware.ts has no in-app page
       * to send anyone to and falls back to Clerk's hosted Account Portal on
       * `*.accounts.dev` — which is how a visitor who pasted their address into
       * the hero ended up on a different domain, under a purple button, being
       * asked to "Sign in to My Application". The pages under app/(auth) existed
       * the whole time; nothing routed to them.
       *
       * Stated here rather than in .env.local on purpose: this is a fact about
       * where the routes are, so it belongs with the code that defines them
       * rather than in a file every deployment has to remember to set.
       */
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      appearance={{
        variables: {
          colorNeutral: "white",
          colorBackground: "#181818",
          colorForeground: "#ede9e3",
          colorMuted: "#1f1f1f",
          colorMutedForeground: "#8a857d",
          colorPrimary: "#c4552f",
          colorPrimaryForeground: "#ffffff",
          colorInput: "#1f1f1f",
          colorInputForeground: "#ede9e3",
          colorBorder: "#272727",
          colorShadow: "#000000",
          colorModalBackdrop: "rgba(0, 0, 0, 0.8)",
          colorSuccess: "#34d399",
          colorWarning: "#e08a4c",
          colorDanger: "#f87171",
          borderRadius: "0.625rem",
        },
      }}
    >
      {/* The product is dark by design — the shipped preset is a dark palette. */}
      <html lang="en" className="dark">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          {/* Visible only once focused, so keyboard users are not forced to
              tab through the whole nav on every page. */}
          <a
            href="#content"
            className="sr-only rounded-full bg-ember px-3 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60]"
          >
            Skip to content
          </a>
          <Navbar />
          {/* The skip target lives here rather than on each page's <main>, so
              every route in the app honours the link. */}
          <div id="content">{children}</div>
        </body>
      </html>
    </ClerkProvider>
  );
}
