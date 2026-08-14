import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { CreditGate } from "@/lib/credits/gates";
import { credits, STARTER_GRANT } from "@/lib/credits/prices";
import { createSupabaseAdminClient } from "@/lib/supabase";

/**
 * The balance, and the only ways it moves.
 *
 * Every write goes through `spend_credits` or `grant_credits` in the database
 * (see supabase_schema.sql) rather than through a select-then-update here. That
 * is not ceremony: two renders queued in the same second would both read a
 * sufficient balance and both spend it, and the person would have paid for one
 * of them. The conditional update inside the function is the lock, and Postgres
 * is the only place in this system that can hold one.
 *
 * Server only, and marked as such — the service-role client bypasses RLS, and
 * every caller here is trusted to have established who the user is first.
 */

export type Account = {
  balance: number;
  grantedTotal: number;
  spentTotal: number;
};

export type Entry = {
  id: string;
  createdAt: string;
  delta: number;
  balanceAfter: number;
  kind: "grant" | "purchase" | "spend" | "refund" | "adjustment";
  operation: string | null;
  detail: string | null;
};

/**
 * No Supabase credentials, so nothing can be metered.
 *
 * The same shape as `dryRun()` in lib/tools/fal.ts and for the same reason: the
 * whole studio has to be runnable from a script with nothing configured, and a
 * developer with no database should get a working agent rather than a billing
 * error. It is not a hole in a deployment — without the service key the
 * recorder keeps nothing and the render queue cannot accept a job, so there is
 * no free render to be had here that is not already impossible.
 */
export const unmetered = () => {
  try {
    createSupabaseAdminClient();
    return false;
  } catch {
    return true;
  }
};

const client = (): SupabaseClient | null => {
  try {
    return createSupabaseAdminClient();
  } catch {
    return null;
  }
};

/**
 * The balance shown when there is nothing to read it from.
 *
 * Generous rather than zero, and only reachable with no database configured. A
 * zero would render the studio as a permanently blocked screen for a developer
 * whose only mistake was not having Supabase set up, which teaches nothing
 * about the credit system except that it is in the way.
 */
const UNMETERED_BALANCE = 999_999;

export const getAccount = async (userId: string): Promise<Account> => {
  const supabase = client();

  if (!supabase) {
    return {
      balance: UNMETERED_BALANCE,
      grantedTotal: UNMETERED_BALANCE,
      spentTotal: 0,
    };
  }

  const { data, error } = await supabase
    .from("credit_accounts")
    .select("balance, granted_total, spent_total")
    .eq("user_id", userId)
    .maybeSingle();

  // An unreadable account is not an empty one, and must not be presented as a
  // person who has spent everything — but it also cannot hand out work. Zero
  // fails closed, and the error says which of the two happened.
  if (error) {
    console.error("[credits] could not read the account:", error.message);
    return { balance: 0, grantedTotal: 0, spentTotal: 0 };
  }

  const row = data as
    | { balance: number; granted_total: number; spent_total: number }
    | null;

  return {
    balance: row?.balance ?? 0,
    grantedTotal: row?.granted_total ?? 0,
    spentTotal: row?.spent_total ?? 0,
  };
};

export const getBalance = async (userId: string): Promise<number> =>
  (await getAccount(userId)).balance;

// ----------------------------------------------------------------- spend ---

export type SpendResult = {
  ok: boolean;
  /** The balance after the attempt, whether or not it succeeded. */
  balance: number;
  charged: number;
  /** The key had already been charged; this call changed nothing. */
  replayed: boolean;
};

/**
 * Take credits for a piece of work, or report that they are not there.
 *
 * Returns rather than throws. Running out mid-run is an ordinary thing that
 * happens to a real customer, and the caller needs the balance back to say how
 * far short they are — `assertCredits` is the throwing wrapper for the places
 * that want one.
 *
 * `key` makes the charge idempotent. Pass one wherever the same work can be
 * attempted twice: a render job handed to a second worker after the first was
 * killed has to cost what one render costs.
 */
export const spend = async ({
  userId,
  amount,
  operation,
  detail,
  key,
}: {
  userId: string;
  amount: number;
  operation?: string;
  detail?: string;
  key?: string;
}): Promise<SpendResult> => {
  const supabase = client();

  if (!supabase) {
    return { ok: true, balance: UNMETERED_BALANCE, charged: 0, replayed: false };
  }

  const { data, error } = await supabase.rpc("spend_credits", {
    p_user_id: userId,
    p_amount: Math.max(0, Math.round(amount)),
    p_operation: operation ?? null,
    p_detail: detail ?? null,
    p_key: key ?? null,
  });

  if (error) {
    // Fails closed. An unreachable ledger means we cannot know whether this is
    // affordable, and the wrong guess spends real money at the video provider.
    console.error("[credits] spend failed:", error.message);
    return { ok: false, balance: 0, charged: 0, replayed: false };
  }

  const result = data as {
    ok: boolean;
    balance: number;
    charged: number;
    replayed: boolean;
  };

  return result;
};

/** Add credits: the signup grant, a purchase, a refund. Never fails on funds. */
export const grant = async ({
  userId,
  amount,
  kind = "grant",
  detail,
  key,
}: {
  userId: string;
  amount: number;
  kind?: "grant" | "purchase" | "refund" | "adjustment";
  detail?: string;
  key?: string;
}): Promise<{ balance: number; added: number; replayed: boolean }> => {
  const supabase = client();

  if (!supabase) {
    return { balance: UNMETERED_BALANCE, added: 0, replayed: false };
  }

  const { data, error } = await supabase.rpc("grant_credits", {
    p_user_id: userId,
    p_amount: Math.max(1, Math.round(amount)),
    p_kind: kind,
    p_detail: detail ?? null,
    p_key: key ?? null,
  });

  if (error) {
    // Loud, because this one loses money in the customer's direction: a
    // purchase that was paid for and not credited. The Stripe webhook retries
    // on a non-2xx, which is why callers there must surface this rather than
    // swallow it.
    console.error("[credits] grant failed:", error.message);
    throw new Error(`Could not add credits: ${error.message}`);
  }

  return data as { balance: number; added: number; replayed: boolean };
};

/**
 * Hand back what a failed render took.
 *
 * Only for work that produced nothing. A cut that came back is charged even if
 * the person dislikes it — the seconds were generated and the provider billed
 * for them — but a job that exhausted its retries never made a frame anyone can
 * watch, and charging for that is indefensible.
 */
export const refund = async ({
  userId,
  amount,
  detail,
  key,
}: {
  userId: string;
  amount: number;
  detail?: string;
  key?: string;
}) => grant({ userId, amount, kind: "refund", detail, key });

/**
 * The starter grant, once per account.
 *
 * Keyed on the user id, so the Clerk webhook can deliver `user.created` twice —
 * which it does — without doubling it, and so calling this defensively from
 * anywhere else is free.
 */
export const ensureStarterGrant = async (userId: string) =>
  grant({
    userId,
    amount: STARTER_GRANT,
    detail: "Welcome credits",
    key: `signup:${userId}`,
  });

/**
 * The account, opening it with its welcome credits if it has never been opened.
 *
 * What everything user-facing should call. The Clerk webhook does the same
 * thing on `user.created`, and this is the belt to its braces: a webhook that
 * has not been configured yet — which is every local checkout, and every
 * deployment for the ten minutes before somebody sets it up — would otherwise
 * put a brand new account in front of the studio with nothing to spend and no
 * way to tell that from having spent it.
 *
 * Safe to call on every page render. The grant is keyed on the user id, so
 * somebody who has legitimately spent their fifty credits gets no second helping
 * — this only ever fires for an account that has never had one.
 */
export const openAccount = async (userId: string): Promise<Account> => {
  const account = await getAccount(userId);

  // Never granted anything, so this is a first visit rather than an empty one.
  if (account.grantedTotal > 0 || account.spentTotal > 0) return account;

  try {
    const { balance } = await ensureStarterGrant(userId);
    return { balance, grantedTotal: STARTER_GRANT, spentTotal: 0 };
  } catch {
    // A grant that cannot be written is worth neither a broken page nor a
    // second attempt on this request. The webhook will retry, and the balance
    // shown is the true one either way.
    return account;
  }
};

// --------------------------------------------------------------- history ---

export const history = async (
  userId: string,
  limit = 25
): Promise<Entry[]> => {
  const supabase = client();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("credit_entries")
    .select("id, created_at, delta, balance_after, kind, operation, detail")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[credits] could not read the history:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const entry = row as {
      id: string;
      created_at: string;
      delta: number;
      balance_after: number;
      kind: Entry["kind"];
      operation: string | null;
      detail: string | null;
    };

    return {
      id: entry.id,
      createdAt: entry.created_at,
      delta: entry.delta,
      balanceAfter: entry.balance_after,
      kind: entry.kind,
      operation: entry.operation,
      detail: entry.detail,
    };
  });
};

// ----------------------------------------------------------------- guard ---

/**
 * Thrown when the balance will not cover what was asked for.
 *
 * Carries all three numbers so the UI can name the shortfall rather than saying
 * "insufficient credits" and making the person go and look their balance up.
 */
export class InsufficientCreditsError extends Error {
  readonly gate: CreditGate;
  readonly need: number;
  readonly have: number;

  constructor(gate: CreditGate, need: number, have: number, message?: string) {
    super(
      message ??
        `This needs ${credits(need)} and there ${
          have === 1 ? "is" : "are"
        } ${credits(have)} on the account.`
    );
    this.name = "InsufficientCreditsError";
    this.gate = gate;
    this.need = need;
    this.have = have;
  }
}

export const isInsufficientCredits = (
  error: unknown
): error is InsufficientCreditsError =>
  error instanceof InsufficientCreditsError ||
  (error instanceof Error && error.name === "InsufficientCreditsError");

/**
 * Charge for something, or throw with enough detail to sell the top-up.
 *
 * The throwing counterpart to `spend`, for server actions — where an
 * exception is the only way back to the caller and the UI is a redirect.
 */
export const charge = async ({
  userId,
  amount,
  gate,
  operation,
  detail,
  key,
}: {
  userId: string;
  amount: number;
  gate: CreditGate;
  operation?: string;
  detail?: string;
  key?: string;
}): Promise<number> => {
  const result = await spend({ userId, amount, operation, detail, key });

  if (!result.ok) {
    throw new InsufficientCreditsError(gate, amount, result.balance);
  }

  return result.balance;
};
