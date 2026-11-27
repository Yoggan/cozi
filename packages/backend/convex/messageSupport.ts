import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const REVIEW_QUEUE_LIMIT = 10;

async function getReviewer(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    return null;
  }

  return await ctx.db
    .query("messageSupportReviewers")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

export const listPendingReports = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getReviewer(ctx))) {
      return null;
    }

    const reports = await ctx.db
      .query("messageReports")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(REVIEW_QUEUE_LIMIT);

    return await Promise.all(
      reports.map(async (report) => {
        const messages = await Promise.all(report.evidenceIds.map((id) => ctx.db.get(id)));

        return {
          reportId: report._id,
          createdAt: report._creationTime,
          reporterId: report.reporterId,
          reportedId: report.reportedId,
          evidence: messages
            .filter(
              (message): message is Doc<"messages"> =>
                message !== null && message.threadId === report.threadId,
            )
            .map((message) => ({
              messageId: message._id,
              text: message.text,
              createdAt: message.createdAt,
              fromReporter: message.senderId === report.reporterId,
            })),
        };
      }),
    );
  },
});

export const markReportReviewed = mutation({
  args: { reportId: v.id("messageReports") },
  handler: async (ctx, { reportId }) => {
    const reviewer = await getReviewer(ctx);

    if (!reviewer) {
      throw new ConvexError("No tienes acceso a los reportes");
    }

    const report = await ctx.db.get(reportId);

    if (!report) {
      throw new ConvexError("Reporte no encontrado");
    }

    if (report.status === "reviewed") {
      return;
    }

    await ctx.db.patch(reportId, {
      status: "reviewed",
      reviewedBy: reviewer.tokenIdentifier,
      reviewedAt: Date.now(),
    });
  },
});
