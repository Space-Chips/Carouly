/** One eyebrow treatment, so every section opens the same way. */
export default function SectionLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <p className="flex items-center gap-3 text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
      <span className="h-px w-6 bg-orange-500/50" />
      {children}
    </p>
  );
}
