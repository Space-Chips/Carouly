import "server-only";

import type { RunEvent } from "@/lib/agent/events";
import type { CreditGate } from "@/lib/credits/gates";
import { refund as refundCredits, spend } from "@/lib/credits/ledger";
import { COSTS, type Operation } from "@/lib/credits/prices";

/**
 * A run's purse.
 *
 * The agent needs to spend credits from inside a tool, mid-stream, and it needs
 * the person watching to see the balance move as it happens. Handing every tool
 * a user id and a Supabase client would have got the first of those and none of
 * the second, so this wraps both: it charges, it announces, and it refuses.
 *
 * Refusing is the interesting part. `charge` throws rather than returning false,
 * because there is no useful thing a tool can do with "no" — it cannot half
 * render — and because a throw unwinds the agent loop the same way `AskUser`
 * does. Both are the same kind of event: the turn is over and what happens next
 * is a person's decision.
 */

/** Raised when the balance will not cover the work a tool is about to do. */
export class NeedsCredits extends Error {
  constructor(
    readonly gate: CreditGate,
    readonly need: number,
    readonly have: number
  ) {
    super(`needs ${need} credits, has ${have}`);
    this.name = "NeedsCredits";
  }
}

export type Wallet = {
  /** What is left, as of the last charge. Cheap: no round trip. */
  balance: () => number;
  /**
   * Take credits for a piece of work. Throws `NeedsCredits` if they are not
   * there, having spent nothing.
   */
  charge: (
    operation: Operation,
    options?: {
      /** Overrides the list price. Used by renders, which are priced per second. */
      amount?: number;
      /** What it was for, in the person's words. Shows up in their history. */
      detail?: string;
      /** Makes the charge safe to retry. See lib/credits/ledger.ts. */
      key?: string;
      /** Which copy the studio shows if this is the charge that fails. */
      gate?: CreditGate;
    }
  ) => Promise<void>;
  /**
   * Put credits back for work that produced nothing.
   *
   * Only for that. A cut somebody dislikes is still a cut — the seconds were
   * generated and the provider billed for them — but a render that threw before
   * a frame existed has to cost nothing, or the meter is a slot machine.
   */
  refund: (amount: number, detail?: string) => Promise<void>;
  /** Would this charge go through right now? For quoting, never for gating. */
  canAfford: (amount: number) => boolean;
};

/**
 * A wallet that charges nothing and always says yes.
 *
 * For runs with no signed-in user — `npm run flow`, a script, an integration
 * test. The alternative was making every tool check whether it had a wallet
 * before using it, which is the sort of `if` that eventually gets the polarity
 * wrong on the one path that spends money.
 */
export const freeWallet = (): Wallet => ({
  balance: () => Number.POSITIVE_INFINITY,
  charge: async () => {},
  refund: async () => {},
  canAfford: () => true,
});

export const makeWallet = ({
  userId,
  balance,
  emit,
}: {
  userId: string;
  /** The balance read once when the turn started, so the first quote is free. */
  balance: number;
  emit: (event: RunEvent) => void;
}): Wallet => {
  let current = balance;

  return {
    balance: () => current,
    canAfford: (amount) => current >= amount,

    charge: async (operation, options = {}) => {
      const amount =
        options.amount ?? (COSTS as Record<string, number>)[operation] ?? 0;

      if (amount <= 0) return;

      const result = await spend({
        userId,
        amount,
        operation,
        detail: options.detail,
        key: options.key,
      });

      current = result.balance;

      if (!result.ok) {
        // Announced before throwing, so the meter shows the true balance next
        // to the card explaining why it stopped. A card that says "you need 240"
        // beside a meter still showing a stale number is an argument with
        // itself.
        emit({ t: "credits", balance: current, charged: 0 });
        throw new NeedsCredits(options.gate ?? "run", amount, current);
      }

      emit({
        t: "credits",
        balance: current,
        charged: result.charged,
        operation,
      });
    },

    refund: async (amount, detail) => {
      if (amount <= 0) return;

      // Never allowed to take a run down with it. The person is already being
      // told something went wrong; a second failure about the refund of the
      // first is noise, and the ledger entry is recoverable by hand.
      try {
        const { balance: next } = await refundCredits({
          userId,
          amount,
          detail,
        });

        current = next;
        emit({ t: "credits", balance: current, charged: -amount });
      } catch (error) {
        console.error("[credits] refund failed:", error);
      }
    },
  };
};
