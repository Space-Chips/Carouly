/**
 * What stands in the form's place while Clerk's script arrives.
 *
 * Clerk's form is not in the HTML — it mounts from a script on its own CDN,
 * which on a cold visit is a real pause, and without this the card opens as a
 * heading over an empty white column that looks like something failed.
 *
 * Shaped like the thing it is waiting for — a provider button, a rule, a field,
 * a submit — so the panel opens at very nearly its final height and does not
 * resize under somebody's cursor a moment later. Hidden from screen readers,
 * which get the real form the moment it exists.
 */
export default function AuthFormSkeleton() {
  return (
    <div aria-hidden className="space-y-4">
      <div className="h-11 animate-pulse rounded-xl bg-paper" />
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-rule" />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-mute">
          or
        </span>
        <span className="h-px flex-1 bg-rule" />
      </div>
      <div className="h-3 w-24 animate-pulse rounded bg-paper" />
      <div className="h-11 animate-pulse rounded-xl bg-paper" />
      <div className="h-11 animate-pulse rounded-xl bg-paper" />
    </div>
  );
}
