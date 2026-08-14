import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] max-w-none items-center px-6 pt-0">
      <div className="mx-auto w-full max-w-6xl">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember">
          404
        </p>
        <h1 className="heading-ink balance mt-6 max-w-[680px] text-4xl font-bold tracking-tight sm:text-5xl">
          This page never got published.
        </h1>
        <p className="pretty mt-6 max-w-xl text-lg text-dim">
          The link is wrong or the page moved. Everything the product does still
          starts from one of these.
        </p>

        <div className="mt-10 flex flex-wrap gap-6">
          <Link
            href="/"
            className="rounded-full bg-ember px-6 py-3 text-base font-semibold text-white outline-none transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-ember-lit active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            Back to the start
          </Link>
          <Link
            href="/studio"
            className="rounded-full px-6 py-3 text-base text-dim outline-none transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-bone focus-visible:ring-2 focus-visible:ring-ember"
          >
            Open the studio
          </Link>
        </div>
      </div>
    </main>
  );
}
