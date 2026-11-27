import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalQuery, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { DEFAULT_BUSINESS_TIME_ZONE, businessCalendar, isBusinessDay } from "./lib/businessDay";

/**
 * Maximum number of orders scanned in a single Convex query transaction.
 * Full-day totals and CSV exports explicitly paginate across pages of this size
 * so busy days never hit Convex read/return limits or silently truncate totals.
 */
export const CLOSEOUT_SCAN_PAGE_SIZE = 100;

const CSV_HEADER = "fecha,zona_horaria,pedido,pagado_en_utc,estado,total_mxn,propina_mxn";

async function requireOwnedBusiness(
  ctx: QueryCtx,
  businessId: Id<"businesses">,
): Promise<Doc<"businesses">> {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new ConvexError("Inicia sesión para continuar");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_auth_user", (q) => q.eq("authUserId", identity.subject))
    .unique();

  if (!user) {
    throw new ConvexError("Completa tu perfil antes de continuar");
  }

  const business = await ctx.db.get(businessId);

  if (!business || business.ownerId !== user._id) {
    throw new ConvexError("Negocio no encontrado");
  }

  return business;
}

function resolveCloseoutWindow(
  business: Doc<"businesses">,
  requestedDay: string | undefined,
  now: number,
) {
  if (!Number.isFinite(new Date(now).getTime())) {
    throw new ConvexError("Elige una fecha válida");
  }

  const timeZone = business.timeZone ?? DEFAULT_BUSINESS_TIME_ZONE;
  const calendar = businessCalendar(timeZone);
  const day = requestedDay ?? calendar.dayAt(now);

  if (!isBusinessDay(day)) {
    throw new ConvexError("Elige una fecha válida");
  }

  const { start, end } = calendar.bounds(day);

  return { day, timeZone, start, end };
}

function clampPageSize(requested: number | undefined): number {
  const value = requested ?? CLOSEOUT_SCAN_PAGE_SIZE;

  if (!Number.isFinite(value)) {
    return CLOSEOUT_SCAN_PAGE_SIZE;
  }

  return Math.min(Math.max(Math.floor(value), 1), CLOSEOUT_SCAN_PAGE_SIZE);
}

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

/**
 * Bounded single-page aggregation for `getDailySummary`.
 * Reads at most `CLOSEOUT_SCAN_PAGE_SIZE` orders indexed by `paidAt`
 * (provider settlement timestamp) within the business-local day bounds.
 */
export const getSummaryPage = internalQuery({
  args: {
    businessId: v.id("businesses"),
    day: v.optional(v.string()),
    now: v.number(),
    cursor: v.union(v.string(), v.null()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const business = await requireOwnedBusiness(ctx, args.businessId);
    const { day, timeZone, start, end } = resolveCloseoutWindow(business, args.day, args.now);
    const numItems = clampPageSize(args.pageSize);

    const page = await ctx.db
      .query("orders")
      .withIndex("by_business_paid_at", (q) =>
        q.eq("businessId", business._id).gte("paidAt", start).lt("paidAt", end),
      )
      .order("desc")
      .paginate({ numItems, cursor: args.cursor });

    let totalPaidCents = 0;
    let tipCents = 0;
    let paidOrderCount = 0;
    let awaitingFulfillmentCount = 0;

    for (const order of page.page) {
      if (order.paidAt === undefined || (order.status !== "paid" && order.status !== "fulfilled")) {
        continue;
      }

      totalPaidCents += order.totalCents;
      tipCents += order.tipCents;
      paidOrderCount += 1;

      if (order.status === "paid") {
        awaitingFulfillmentCount += 1;
      }
    }

    return {
      day,
      timeZone,
      totalPaidCents,
      tipCents,
      paidOrderCount,
      awaitingFulfillmentCount,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export type DailySummaryResult = {
  day: string;
  timeZone: string;
  totalPaidCents: number;
  tipCents: number;
  paidOrderCount: number;
  awaitingFulfillmentCount: number;
};

/**
 * On-demand daily closeout totals for the business owner.
 * Paginates across all paid orders in the selected business-local day so
 * full-day totals are never truncated while each underlying query stays bounded.
 */
export const getDailySummary = action({
  args: {
    businessId: v.id("businesses"),
    day: v.optional(v.string()),
    now: v.number(),
  },
  handler: async (ctx, args): Promise<DailySummaryResult> => {
    let cursor: string | null = null;
    let resolvedDay = args.day;
    let timeZone = DEFAULT_BUSINESS_TIME_ZONE;
    let totalPaidCents = 0;
    let tipCents = 0;
    let paidOrderCount = 0;
    let awaitingFulfillmentCount = 0;

    while (true) {
      const page: {
        day: string;
        timeZone: string;
        totalPaidCents: number;
        tipCents: number;
        paidOrderCount: number;
        awaitingFulfillmentCount: number;
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.closeout.getSummaryPage, {
        businessId: args.businessId,
        day: resolvedDay,
        now: args.now,
        cursor,
      });

      resolvedDay = page.day;
      timeZone = page.timeZone;
      totalPaidCents += page.totalPaidCents;
      tipCents += page.tipCents;
      paidOrderCount += page.paidOrderCount;
      awaitingFulfillmentCount += page.awaitingFulfillmentCount;

      if (page.isDone) {
        break;
      }

      cursor = page.continueCursor;
    }

    return {
      day: resolvedDay ?? "",
      timeZone,
      totalPaidCents,
      tipCents,
      paidOrderCount,
      awaitingFulfillmentCount,
    };
  },
});

/**
 * Reactive, bounded paginated list of paid orders still awaiting fulfillment
 * for the selected business-local day.
 */
export const listAwaitingFulfillment = query({
  args: {
    businessId: v.id("businesses"),
    day: v.optional(v.string()),
    now: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const business = await requireOwnedBusiness(ctx, args.businessId);
    const { start, end } = resolveCloseoutWindow(business, args.day, args.now);
    const numItems = clampPageSize(args.paginationOpts.numItems);

    const result = await ctx.db
      .query("orders")
      .withIndex("by_business_status_paid_at", (q) =>
        q
          .eq("businessId", business._id)
          .eq("status", "paid")
          .gte("paidAt", start)
          .lt("paidAt", end),
      )
      .order("desc")
      .paginate({ ...args.paginationOpts, numItems });

    return {
      ...result,
      page: result.page
        .filter((order): order is Doc<"orders"> & { paidAt: number } => order.paidAt !== undefined)
        .map((order) => ({
          publicId: order.publicId,
          customerName: order.customer.name ?? order.customer.handle ?? null,
          totalCents: order.totalCents,
          paidAt: order.paidAt,
        })),
    };
  },
});

/**
 * Bounded single-page CSV row builder for `exportDailyCsv`.
 * Uses the exact same business-local day bounds as `getSummaryPage`.
 */
export const getExportPage = internalQuery({
  args: {
    businessId: v.id("businesses"),
    day: v.optional(v.string()),
    now: v.number(),
    cursor: v.union(v.string(), v.null()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const business = await requireOwnedBusiness(ctx, args.businessId);
    const { day, timeZone, start, end } = resolveCloseoutWindow(business, args.day, args.now);
    const numItems = clampPageSize(args.pageSize);

    const page = await ctx.db
      .query("orders")
      .withIndex("by_business_paid_at", (q) =>
        q.eq("businessId", business._id).gte("paidAt", start).lt("paidAt", end),
      )
      .order("desc")
      .paginate({ numItems, cursor: args.cursor });

    const rows: Array<string> = [];

    for (const order of page.page) {
      if (order.paidAt === undefined || (order.status !== "paid" && order.status !== "fulfilled")) {
        continue;
      }

      const stateLabel = order.status === "paid" ? "Por entregar" : "Entregado";

      rows.push(
        [
          escapeCsvCell(day),
          escapeCsvCell(timeZone),
          escapeCsvCell(order.publicId),
          escapeCsvCell(new Date(order.paidAt).toISOString()),
          escapeCsvCell(stateLabel),
          (order.totalCents / 100).toFixed(2),
          (order.tipCents / 100).toFixed(2),
        ].join(","),
      );
    }

    return {
      day,
      timeZone,
      rows,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export type DailyCsvExportResult = {
  day: string;
  timeZone: string;
  filename: string;
  csv: string;
  rowCount: number;
};

/**
 * On-demand CSV export for the selected business-local day.
 * Separated from the on-screen summary so CSV is only generated when requested
 * and explicitly paginates across all paid orders in the day.
 */
export const exportDailyCsv = action({
  args: {
    businessId: v.id("businesses"),
    day: v.optional(v.string()),
    now: v.number(),
  },
  handler: async (ctx, args): Promise<DailyCsvExportResult> => {
    let cursor: string | null = null;
    let resolvedDay = args.day;
    let timeZone = DEFAULT_BUSINESS_TIME_ZONE;
    const csvRows = [CSV_HEADER];

    while (true) {
      const page: {
        day: string;
        timeZone: string;
        rows: Array<string>;
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.closeout.getExportPage, {
        businessId: args.businessId,
        day: resolvedDay,
        now: args.now,
        cursor,
      });

      resolvedDay = page.day;
      timeZone = page.timeZone;

      for (const row of page.rows) {
        csvRows.push(row);
      }

      if (page.isDone) {
        break;
      }

      cursor = page.continueCursor;
    }

    const day = resolvedDay ?? "";

    return {
      day,
      timeZone,
      filename: `corte-${day}.csv`,
      csv: `${csvRows.join("\r\n")}\r\n`,
      rowCount: csvRows.length - 1,
    };
  },
});
