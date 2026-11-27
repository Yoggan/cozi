import { ConvexError } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const REPORT_EVIDENCE_LIMIT = 20;
const MESSAGING_UNAVAILABLE = "No se pueden enviar mensajes en esta conversación";

function findBlock(ctx: QueryCtx | MutationCtx, blockerId: Id<"users">, blockedId: Id<"users">) {
  return ctx.db
    .query("messageBlocks")
    .withIndex("by_blockerId_and_blockedId", (q) =>
      q.eq("blockerId", blockerId).eq("blockedId", blockedId),
    )
    .unique();
}

export async function readBlockState(
  ctx: QueryCtx | MutationCtx,
  viewerId: Id<"users">,
  counterpartId: Id<"users">,
) {
  const [outgoing, incoming] = await Promise.all([
    findBlock(ctx, viewerId, counterpartId),
    findBlock(ctx, counterpartId, viewerId),
  ]);

  return { blockedByViewer: outgoing !== null, canSend: outgoing === null && incoming === null };
}

export async function requireMessagingAvailable(
  ctx: MutationCtx,
  viewerId: Id<"users">,
  counterpartId: Id<"users">,
) {
  if (!(await readBlockState(ctx, viewerId, counterpartId)).canSend) {
    throw new ConvexError(MESSAGING_UNAVAILABLE);
  }
}

export async function setBlock(
  ctx: MutationCtx,
  viewerId: Id<"users">,
  counterpartId: Id<"users">,
  blocked: boolean,
) {
  if (counterpartId === viewerId) {
    throw new ConvexError("No puedes bloquear tu propia cuenta");
  }

  const existing = await findBlock(ctx, viewerId, counterpartId);

  if (blocked && !existing) {
    await ctx.db.insert("messageBlocks", { blockerId: viewerId, blockedId: counterpartId });
  } else if (!blocked && existing) {
    await ctx.db.delete(existing._id);
  }
}

async function readReportState(
  ctx: QueryCtx | MutationCtx,
  threadId: Id<"messageThreads">,
  reporterId: Id<"users">,
  counterpartId: Id<"users">,
) {
  const [latestReport, source] = await Promise.all([
    ctx.db
      .query("messageReports")
      .withIndex("by_threadId_and_reporterId", (q) =>
        q.eq("threadId", threadId).eq("reporterId", reporterId),
      )
      .order("desc")
      .first(),
    ctx.db
      .query("messages")
      .withIndex("by_threadId_and_senderId", (q) =>
        q.eq("threadId", threadId).eq("senderId", counterpartId),
      )
      .order("desc")
      .first(),
  ]);

  if (latestReport?.status === "pending") {
    return { status: "pending" as const, source };
  }

  if (latestReport && latestReport.sourceMessageId === source?._id) {
    return { status: "reviewed" as const, source };
  }

  return { status: "available" as const, source };
}

export async function readModerationState(
  ctx: QueryCtx,
  threadId: Id<"messageThreads">,
  viewerId: Id<"users">,
  counterpartId: Id<"users">,
) {
  const [blockState, report] = await Promise.all([
    readBlockState(ctx, viewerId, counterpartId),
    readReportState(ctx, threadId, viewerId, counterpartId),
  ]);

  return {
    ...blockState,
    canBlockOrReport: counterpartId !== viewerId,
    reportStatus: report.status,
  };
}

export async function submitReport(
  ctx: MutationCtx,
  threadId: Id<"messageThreads">,
  reporterId: Id<"users">,
  counterpartId: Id<"users">,
) {
  if (counterpartId === reporterId) {
    throw new ConvexError("No puedes reportar tu propia cuenta");
  }

  const { status, source } = await readReportState(ctx, threadId, reporterId, counterpartId);

  if (status !== "available") {
    return;
  }

  const evidence = await ctx.db
    .query("messages")
    .withIndex("by_thread_created", (q) => q.eq("threadId", threadId))
    .order("desc")
    .take(REPORT_EVIDENCE_LIMIT);

  const evidenceIds = evidence.map((message) => message._id);

  if (source && !evidenceIds.includes(source._id)) {
    evidenceIds.splice(REPORT_EVIDENCE_LIMIT - 1, 1, source._id);
  }

  await ctx.db.insert("messageReports", {
    threadId,
    reporterId,
    reportedId: counterpartId,
    sourceMessageId: source?._id,
    evidenceIds: evidenceIds.reverse(),
    status: "pending",
  });
}
