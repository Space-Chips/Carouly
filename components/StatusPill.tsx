const styles: Record<string, string> = {
  draft: "bg-white/10 text-muted-foreground",
  ready: "bg-sky-500/15 text-sky-300",
  publishing: "bg-amber-500/15 text-amber-300",
  published: "bg-emerald-500/15 text-emerald-300",
  failed: "bg-red-500/15 text-red-300",
  pending: "bg-white/10 text-muted-foreground",
  skipped: "bg-white/10 text-muted-foreground",
};

export default function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`px-2 py-1 rounded text-xs uppercase tracking-wide whitespace-nowrap ${
        styles[status] ?? styles.draft
      }`}
    >
      {status}
    </span>
  );
}
