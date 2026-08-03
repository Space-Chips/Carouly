import Link from "next/link";

const columns = [
  {
    heading: "Product",
    links: [
      { href: "#example", label: "What it posts" },
      { href: "#run", label: "How it works" },
      { href: "#why", label: "Why it gets saved" },
      { href: "#faq", label: "Questions" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-hair bg-ink">
      <div className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className="max-w-sm">
            <p className="text-base font-semibold tracking-tight text-bone">
              Carouly
            </p>
            <p className="pretty mt-3 text-sm leading-relaxed text-dim">
              Built for brands that know they should post every day and keep
              not doing it.
            </p>
          </div>

          {columns.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-dim">
                {column.heading}
              </p>
              <ul className="mt-4 space-y-3">
                {column.links.map((link) => (
                  <li key={link.href}>
                    {link.href.startsWith("#") ? (
                      <a
                        href={link.href}
                        className="rounded-sm text-sm text-dim outline-none transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-bone focus-visible:ring-2 focus-visible:ring-ember"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="rounded-sm text-sm text-dim outline-none transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-bone focus-visible:ring-2 focus-visible:ring-ember"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <p className="mt-16 font-mono text-xs text-dim">
          © {new Date().getFullYear()} Carouly
        </p>
      </div>
    </footer>
  );
}
