/**
 * The graph's node cache, in a table.
 *
 * This is the whole resumption mechanism, and it needed no change to the
 * executor to work. `execute()` already keys every node by a content hash of its
 * type and resolved params, already asks the store before running one, and
 * already writes the result back. Swapping the `Map` for a table therefore turns
 * "start the graph again" into "carry on from where it stopped": a worker that
 * ran out of time and is re-invoked recomputes only the node it never reached,
 * because every node before it answers from here.
 *
 * That property is what makes a 27-minute render survivable on a platform where
 * nothing may run longer than a few minutes.
 *
 * Failures are swallowed on purpose. A cache that is unreachable should make a
 * render slower, never fail it — the fallback is to recompute, which is exactly
 * what the cache was avoiding and never wrong.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { NodeStore } from "@/lib/workflow/graph";

export const tableStore = (supabase: SupabaseClient): NodeStore => ({
  async get(key) {
    const { data, error } = await supabase
      .from("render_cache")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    // `undefined` rather than `null`, because the executor treats `undefined` as
    // "not cached" and `null` as a legitimately cached null.
    if (error || !data) return undefined;
    return (data as { value: unknown }).value;
  },

  async set(key, value) {
    // Upsert rather than insert: two workers racing the same node is a wasted
    // computation, not a conflict worth raising. Whichever lands last wins and
    // both hold the same content-hashed value anyway.
    await supabase
      .from("render_cache")
      .upsert({ key, value }, { onConflict: "key" });
  },
});
