import { internalMutation } from "../_generated/server";
import { getPaymentLookup } from "./paymentLookup";

const MINUTE_MS = 60_000;
const RECONCILIATION_MIN_AGE_MS = 5 * MINUTE_MS;
const RECONCILIATION_BATCH_PER_STATUS = 5;

// The last delay gives the final lookup time to settle before support review.
const RECONCILIATION_DELAYS_MINUTES = [5, 15, 60, 240, 720, 5];

/** Claims at most 20 attempts, reserving room for both new checks and retries. */
export const claimReconciliationBatch = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const batch = [];

    for (const status of ["pending", "processing"] as const) {
      const fresh = await ctx.db
        .query("payments")
        .withIndex("by_status_reconciliationIssue_nextReconciliationAt_createdAt", (q) =>
          q
            .eq("status", status)
            .eq("reconciliationIssue", undefined)
            .eq("nextReconciliationAt", undefined)
            .lte("createdAt", now - RECONCILIATION_MIN_AGE_MS),
        )
        .take(RECONCILIATION_BATCH_PER_STATUS);

      const retries = await ctx.db
        .query("payments")
        .withIndex("by_status_reconciliationIssue_nextReconciliationAt_createdAt", (q) =>
          q
            .eq("status", status)
            .eq("reconciliationIssue", undefined)
            .gt("nextReconciliationAt", undefined)
            .lte("nextReconciliationAt", now),
        )
        .take(RECONCILIATION_BATCH_PER_STATUS);

      for (const payment of [...fresh, ...retries]) {
        const lookup = getPaymentLookup(payment);
        const attempts = payment.reconciliationAttempts ?? 0;
        const delayMinutes = RECONCILIATION_DELAYS_MINUTES[attempts];

        if (!lookup || lookup.id.startsWith("mock_") || delayMinutes === undefined) {
          await ctx.db.patch(payment._id, {
            reconciliationIssue: !lookup
              ? "missing_reference"
              : lookup.id.startsWith("mock_")
                ? "mock_reference"
                : "retry_limit",
            nextReconciliationAt: undefined,
          });
          continue;
        }

        // Commit the retry window before I/O so overlapping runs cannot claim it.
        const attempt = attempts + 1;
        await ctx.db.patch(payment._id, {
          reconciliationAttempts: attempt,
          nextReconciliationAt: now + delayMinutes * MINUTE_MS,
        });
        batch.push({ paymentId: payment._id, lookup, attempt, amountCents: payment.amountCents });
      }
    }

    return batch;
  },
});
