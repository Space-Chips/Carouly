import SiteFooter from "@/components/landing/SiteFooter";

/**
 * Shared shell for the legal pages: one narrow measure, one type rhythm, and
 * the same footer as the marketing page so there is always a way back.
 */
export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <main className="max-w-none px-0 pt-0">
        <div className="mx-auto w-full max-w-2xl px-6 py-24 [&_h2]:mt-12 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-bone [&_li]:mt-3 [&_p]:mt-4 [&_p]:leading-relaxed [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6">
          {children}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
