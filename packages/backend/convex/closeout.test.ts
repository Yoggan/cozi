import { expect, test } from "vitest";

import { createTestBackend, createUser, setupMealBusiness } from "../test-utils/harness";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { CLOSEOUT_SCAN_PAGE_SIZE } from "./closeout";
import { businessCalendar } from "./lib/businessDay";

test("closeout includes only this business's orders paid during the local day", async () => {
  const t = createTestBackend();

  const owner = await createUser(t, {
    subject: "closeout-owner",
    name: "Renata Ibarra",
    email: "renata@example.com",
    handle: "renata_closeout",
  });

  const buyer = await createUser(t, {
    subject: "closeout-buyer",
    name: "Pablo Núñez",
    email: "pablo@example.com",
    handle: "pablo_closeout",
  });

  const { businessId } = await setupMealBusiness(owner.client, {
    name: "Café del Norte",
    handle: "cafe_del_norte",
  });

  const other = await setupMealBusiness(buyer.client, {
    name: "Café del Sur",
    handle: "cafe_del_sur",
  });

  const beforeMidnight = Date.parse("2026-11-26T06:30:00Z");
  expect(
    await owner.client.action(api.closeout.getDailySummary, { businessId, now: beforeMidnight }),
  ).toMatchObject({
    day: "2026-11-26",
    timeZone: "America/Mexico_City",
    paidOrderCount: 0,
    awaitingFulfillmentCount: 0,
  });

  await expect(
    buyer.client.mutation(api.businesses.update, { businessId, timeZone: "America/Hermosillo" }),
  ).rejects.toThrow("Negocio no encontrado");

  await owner.client.mutation(api.businesses.update, {
    businessId,
    timeZone: "America/Hermosillo",
  });

  expect(
    await owner.client.action(api.closeout.getDailySummary, { businessId, now: beforeMidnight }),
  ).toMatchObject({
    day: "2026-11-25",
    timeZone: "America/Hermosillo",
    paidOrderCount: 0,
    awaitingFulfillmentCount: 0,
  });

  const start = Date.parse("2026-11-25T07:00:00Z");
  const end = Date.parse("2026-11-26T07:00:00Z");

  const orderId = await t.run(async (ctx) => {
    const order = {
      businessId,
      sellerId: owner.userId,
      buyerId: buyer.userId,
      channel: "pos",
      status: "paid",
      items: [],
      subtotalCents: 1000,
      discountCents: 0,
      tipCents: 225,
      totalCents: 1225,
      currency: "MXN",
      customer: { name: "Cliente de prueba" },
      paidAt: start,
      createdAt: start - 3_600_000,
      updatedAt: start,
    } satisfies Omit<Doc<"orders">, "_id" | "_creationTime" | "publicId">;

    const paid = await ctx.db.insert("orders", { ...order, publicId: "paid-at-start" });
    await ctx.db.insert("orders", {
      ...order,
      publicId: "delivered-at-end",
      status: "fulfilled",
      tipCents: 0,
      totalCents: 1000,
      paidAt: end - 1,
      fulfilledAt: end + 5000,
    });
    await ctx.db.insert("orders", { ...order, publicId: "prior-day", paidAt: start - 1 });
    await ctx.db.insert("orders", { ...order, publicId: "next-day", paidAt: end });
    await ctx.db.insert("orders", {
      ...order,
      publicId: "unpaid",
      status: "awaiting_payment",
      paidAt: undefined,
      createdAt: start,
    });
    await ctx.db.insert("orders", {
      ...order,
      publicId: "other-business",
      businessId: other.businessId,
      sellerId: buyer.userId,
    });
    await ctx.db.insert("orders", {
      ...order,
      publicId: "personal-order",
      businessId: undefined,
      channel: "p2p",
    });

    return paid;
  });

  const args = { businessId, day: "2026-11-25", now: end + 3_600_000 };

  const summary = await owner.client.action(api.closeout.getDailySummary, args);
  expect(summary).toEqual({
    day: "2026-11-25",
    timeZone: "America/Hermosillo",
    totalPaidCents: 2225,
    tipCents: 225,
    paidOrderCount: 2,
    awaitingFulfillmentCount: 1,
  });

  const awaiting = await owner.client.query(api.closeout.listAwaitingFulfillment, {
    ...args,
    paginationOpts: { numItems: 25, cursor: null },
  });

  expect(awaiting.isDone).toBe(true);
  expect(awaiting.page).toEqual([
    {
      publicId: "paid-at-start",
      customerName: "Cliente de prueba",
      totalCents: 1225,
      paidAt: start,
    },
  ]);

  const exported = await owner.client.action(api.closeout.exportDailyCsv, args);
  expect(exported).toEqual({
    day: "2026-11-25",
    timeZone: "America/Hermosillo",
    filename: "corte-2026-11-25.csv",
    rowCount: 2,
    csv: [
      "fecha,zona_horaria,pedido,pagado_en_utc,estado,total_mxn,propina_mxn",
      "2026-11-25,America/Hermosillo,delivered-at-end,2026-11-26T06:59:59.999Z,Entregado,10.00,0.00",
      "2026-11-25,America/Hermosillo,paid-at-start,2026-11-25T07:00:00.000Z,Por entregar,12.25,2.25",
      "",
    ].join("\r\n"),
  });

  await owner.client.mutation(api.orders.fulfill, { orderId });

  const fulfilledSummary = await owner.client.action(api.closeout.getDailySummary, args);
  expect(fulfilledSummary).toEqual({
    ...summary,
    awaitingFulfillmentCount: 0,
  });

  const fulfilledAwaiting = await owner.client.query(api.closeout.listAwaitingFulfillment, {
    ...args,
    paginationOpts: { numItems: 25, cursor: null },
  });

  expect(fulfilledAwaiting.page).toEqual([]);

  const fulfilledExport = await owner.client.action(api.closeout.exportDailyCsv, args);
  expect(fulfilledExport).toEqual({
    ...exported,
    csv: exported.csv.replace("Por entregar", "Entregado"),
  });

  // Owner-only enforcement across summary, awaiting list, and CSV export.
  await expect(buyer.client.action(api.closeout.getDailySummary, args)).rejects.toThrow(
    "Negocio no encontrado",
  );
  await expect(
    buyer.client.query(api.closeout.listAwaitingFulfillment, {
      ...args,
      paginationOpts: { numItems: 25, cursor: null },
    }),
  ).rejects.toThrow("Negocio no encontrado");
  await expect(buyer.client.action(api.closeout.exportDailyCsv, args)).rejects.toThrow(
    "Negocio no encontrado",
  );

  await expect(t.action(api.closeout.getDailySummary, args)).rejects.toThrow("Inicia sesión");
  await expect(
    t.query(api.closeout.listAwaitingFulfillment, {
      ...args,
      paginationOpts: { numItems: 25, cursor: null },
    }),
  ).rejects.toThrow("Inicia sesión");
  await expect(t.action(api.closeout.exportDailyCsv, args)).rejects.toThrow("Inicia sesión");

  await expect(
    owner.client.action(api.closeout.getDailySummary, { ...args, day: "2026-02-30" }),
  ).rejects.toThrow("Elige una fecha válida");
  await expect(
    owner.client.action(api.closeout.exportDailyCsv, { ...args, day: "2026-02-30" }),
  ).rejects.toThrow("Elige una fecha válida");
});

test("closeout paginates accurately above the single-page scan limit without truncating totals or CSV", async () => {
  const t = createTestBackend();

  const owner = await createUser(t, {
    subject: "busy-owner",
    name: "Lucía Paredes",
    email: "lucia@example.com",
    handle: "lucia_busy",
  });

  const { businessId } = await setupMealBusiness(owner.client, {
    name: "Taquería Central",
    handle: "taqueria_central",
  });

  const day = "2026-11-25";
  const { start, end } = businessCalendar("America/Mexico_City").bounds(day);
  const totalOrdersInDay = CLOSEOUT_SCAN_PAGE_SIZE + 35;

  let expectedTotalPaidCents = 0;
  let expectedTipCents = 0;
  let expectedAwaitingCount = 0;

  await t.run(async (ctx) => {
    for (let index = 0; index < totalOrdersInDay; index += 1) {
      const awaiting = index % 3 === 0;
      const subtotalCents = 1000 + index * 10;
      const tipCents = (index % 5) * 25;
      const totalCents = subtotalCents + tipCents;
      const paidAt = start + index * 1000;

      expectedTotalPaidCents += totalCents;
      expectedTipCents += tipCents;

      if (awaiting) {
        expectedAwaitingCount += 1;
      }

      await ctx.db.insert("orders", {
        publicId: `ord-${String(index).padStart(4, "0")}`,
        businessId,
        sellerId: owner.userId,
        channel: "pos",
        status: awaiting ? "paid" : "fulfilled",
        items: [],
        subtotalCents,
        discountCents: 0,
        tipCents,
        totalCents,
        currency: "MXN",
        customer: { name: `Cliente ${index}` },
        paidAt,
        fulfilledAt: awaiting ? undefined : paidAt + 500,
        createdAt: paidAt - 1000,
        updatedAt: paidAt,
      });
    }

    // Boundary orders strictly outside the local day must be excluded.
    await ctx.db.insert("orders", {
      publicId: "ord-before-day",
      businessId,
      sellerId: owner.userId,
      channel: "pos",
      status: "paid",
      items: [],
      subtotalCents: 50_000,
      discountCents: 0,
      tipCents: 5000,
      totalCents: 55_000,
      currency: "MXN",
      customer: { name: "Ayer" },
      paidAt: start - 1,
      createdAt: start - 2000,
      updatedAt: start - 1,
    });

    await ctx.db.insert("orders", {
      publicId: "ord-after-day",
      businessId,
      sellerId: owner.userId,
      channel: "pos",
      status: "paid",
      items: [],
      subtotalCents: 60_000,
      discountCents: 0,
      tipCents: 6000,
      totalCents: 66_000,
      currency: "MXN",
      customer: { name: "Mañana" },
      paidAt: end,
      createdAt: end - 1000,
      updatedAt: end,
    });
  });

  const args = { businessId, day, now: end + 1000 };

  // Confirm a single internal page scan is bounded and does not scan the entire day at once.
  const firstSummaryPage = await owner.client.query(internal.closeout.getSummaryPage, {
    ...args,
    cursor: null,
  });

  expect(firstSummaryPage.isDone).toBe(false);
  expect(firstSummaryPage.paidOrderCount).toBe(CLOSEOUT_SCAN_PAGE_SIZE);

  // Full-day summary action must aggregate all pages with exact totals.
  const summary = await owner.client.action(api.closeout.getDailySummary, args);
  expect(summary).toEqual({
    day,
    timeZone: "America/Mexico_City",
    totalPaidCents: expectedTotalPaidCents,
    tipCents: expectedTipCents,
    paidOrderCount: totalOrdersInDay,
    awaitingFulfillmentCount: expectedAwaitingCount,
  });

  // On-demand CSV export must include every paid order in the day (no truncation).
  const exported = await owner.client.action(api.closeout.exportDailyCsv, args);
  expect(exported.day).toBe(day);
  expect(exported.rowCount).toBe(totalOrdersInDay);
  const lines = exported.csv.trimEnd().split("\r\n");
  expect(lines).toHaveLength(totalOrdersInDay + 1);
  expect(lines[1]).toContain(`ord-${String(totalOrdersInDay - 1).padStart(4, "0")}`);
  expect(lines[totalOrdersInDay]).toContain("ord-0000");

  // Reactive awaiting-fulfillment list must paginate across all pending orders cleanly.
  const seenPublicIds = new Set<string>();
  let cursor: string | null = null;
  let pages = 0;

  while (true) {
    const page = await owner.client.query(api.closeout.listAwaitingFulfillment, {
      ...args,
      paginationOpts: { numItems: 20, cursor },
    });

    pages += 1;
    expect(page.page.length).toBeLessThanOrEqual(20);

    for (const row of page.page) {
      seenPublicIds.add(row.publicId);
    }

    if (page.isDone) {
      break;
    }

    cursor = page.continueCursor;
  }

  expect(pages).toBeGreaterThan(1);
  expect(seenPublicIds.size).toBe(expectedAwaitingCount);
});

test.each([
  ["2026-03-08", "2026-03-08T08:00:00Z", "2026-03-09T07:00:00Z"],
  ["2026-11-01", "2026-11-01T07:00:00Z", "2026-11-02T08:00:00Z"],
])("Tijuana closeout uses both local midnights on %s", (day, start, end) => {
  expect(businessCalendar("America/Tijuana").bounds(day)).toEqual({
    start: Date.parse(start),
    end: Date.parse(end),
  });
});
