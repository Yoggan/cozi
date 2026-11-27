import { describe, expect, it } from "vitest";

import { createTestBackend, createUser, setupMealBusiness } from "../test-utils/harness";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

const asOf = 1_800_000_000_000;

function orderFields(publicId: string, createdAt: number) {
  return {
    publicId,
    items: [],
    subtotalCents: 1000,
    discountCents: 0,
    tipCents: 0,
    totalCents: 1000,
    currency: "MXN" as const,
    customer: {},
    createdAt,
    updatedAt: createdAt,
  };
}

async function setup() {
  const t = createTestBackend();

  const owner = await createUser(t, {
    subject: "owner",
    name: "Ana",
    email: "ana@example.com",
    handle: "ana",
  });

  const customer = await createUser(t, {
    subject: "customer",
    name: "Beto",
    email: "beto@example.com",
    handle: "beto",
  });

  return { t, owner, customer };
}

describe("history pagination", () => {
  it("finds older movements by direction and kind and keeps tied page boundaries stable", async () => {
    const { t, owner, customer } = await setup();

    const ids = await t.run(async (ctx) => {
      const add = (
        fields: Pick<Doc<"orders">, "sellerId" | "buyerId" | "p2pKind">,
        name: string,
        time: number,
      ) =>
        ctx.db.insert("orders", {
          ...orderFields(name, time),
          ...fields,
          channel: "p2p",
          status: "paid",
        });

      await add(
        { sellerId: owner.userId, buyerId: customer.userId, p2pKind: "request" },
        "request",
        1,
      );
      await add({ sellerId: customer.userId, buyerId: owner.userId }, "outgoing", 2);
      await add({ sellerId: owner.userId, buyerId: owner.userId }, "both", 3);

      const tied = [];

      for (let index = 0; index < 60; index += 1) {
        tied.push(
          await add(
            index === 15
              ? { sellerId: customer.userId, buyerId: owner.userId }
              : { sellerId: owner.userId, buyerId: customer.userId },
            `tied-${index}`,
            4,
          ),
        );
      }

      return tied;
    });

    const list = (direction?: "in" | "out", kind?: "request") =>
      owner.client.query(api.p2p.listActivityPage, {
        direction,
        kind,
        paginationOpts: { numItems: 2, cursor: null },
      });

    expect((await list("out")).page.map((item) => item.publicId)).toEqual(["tied-15", "outgoing"]);
    expect((await list("in", "request")).page.map((item) => item.publicId)).toEqual(["request"]);
    expect((await list()).page[0]?.publicId).toMatch(/^tied-/u);

    const read = (cursor: string | null, endCursor?: string) =>
      owner.client.query(api.p2p.listActivityPage, {
        paginationOpts: { numItems: 20, cursor, endCursor },
      });

    const first = await read(null);
    const second = await read(first.continueCursor);
    const third = await read(second.continueCursor);
    const last = await read(third.continueCursor);

    const original = [...first.page, ...second.page, ...third.page, ...last.page].map(
      (item) => item.publicId,
    );

    expect(last.isDone).toBe(true);
    expect(original).toHaveLength(63);
    expect(new Set(original).size).toBe(63);
    expect(original.slice(-3)).toEqual(["both", "outgoing", "request"]);

    const boundary = first.page.at(-1)?.publicId;
    const boundaryId = ids[Number(boundary?.split("-").at(-1))];

    if (!boundaryId) {
      throw new Error("Expected the first page to end at a seeded tied order");
    }

    await t.run(async (ctx) => {
      await ctx.db.delete("orders", boundaryId);
      await ctx.db.insert("orders", {
        ...orderFields("new", 5),
        sellerId: customer.userId,
        buyerId: owner.userId,
        channel: "p2p",
        status: "paid",
      });
      await ctx.db.insert("orders", {
        ...orderFields("newest", 6),
        sellerId: customer.userId,
        buyerId: owner.userId,
        channel: "p2p",
        status: "paid",
      });
    });
    const refreshed = await read(null, first.continueCursor);
    expect(refreshed.page.map((item) => item.publicId)).toEqual([
      "newest",
      "new",
      ...original.slice(0, 19),
    ]);
    expect((await read(first.continueCursor)).page).toEqual(second.page);
  });

  it("filters business orders by effective status before filling pages", async () => {
    const { t, owner, customer } = await setup();

    const { businessId } = await setupMealBusiness(owner.client, {
      name: "Comedor",
      handle: "comedor",
    });

    await t.run(async (ctx) => {
      const add = (
        name: string,
        time: number,
        status: Doc<"orders">["status"],
        expiresAt?: number,
      ) =>
        ctx.db.insert("orders", {
          ...orderFields(name, time),
          businessId,
          sellerId: owner.userId,
          channel: "pos",
          status,
          expiresAt,
        });

      await add("expired-stored", 1, "expired");
      await add("pending", 2, "draft", asOf + 100);
      await add("expired-awaiting", 3, "awaiting_payment", asOf - 100);
      await add("expired-draft", 4, "draft", asOf);

      for (let index = 0; index < 280; index += 1) {
        await add(`paid-${index}`, 5 + index, "paid");
      }

      for (let index = 0; index < 10; index += 1) {
        await add(`awaiting-${index}`, 300 + index, "awaiting_payment");
      }
    });

    const list = (status: Doc<"orders">["status"], cursor: string | null = null) =>
      owner.client.query(api.orders.listBusinessOrdersPage, {
        businessId,
        status,
        asOf,
        paginationOpts: { numItems: 2, cursor },
      });

    const first = await list("expired");
    expect(first.page.map((item) => item.publicId)).toEqual(["expired-draft", "expired-awaiting"]);
    expect(first.isDone).toBe(false);
    const second = await list("expired", first.continueCursor);
    expect(second.page.map((item) => item.publicId)).toEqual(["expired-stored"]);
    expect(second.isDone).toBe(true);
    expect((await list("draft")).page.map((item) => item.publicId)).toEqual(["pending"]);
    expect((await list("paid")).page.map((item) => item.publicId)).toEqual([
      "paid-279",
      "paid-278",
    ]);

    const budgeted = await owner.client.query(api.orders.listBusinessOrdersPage, {
      businessId,
      status: "expired",
      asOf,
      paginationOpts: { numItems: 2, cursor: null, maximumRowsRead: 10 },
    });

    expect(budgeted.page).toEqual([]);
    expect(budgeted.isDone).toBe(false);
    expect((await list("expired", budgeted.continueCursor)).page).toEqual(first.page);

    await expect(
      customer.client.query(api.orders.listBusinessOrdersPage, {
        businessId,
        asOf,
        paginationOpts: { numItems: 2, cursor: null },
      }),
    ).rejects.toThrow("Negocio no encontrado");
  });

  it("searches older activity server-side and continues past empty budgeted pages", async () => {
    const { t, owner, customer } = await setup();

    await t.run(async (ctx) => {
      await ctx.db.insert("orders", {
        ...orderFields("old-cafe-in", 1),
        sellerId: owner.userId,
        buyerId: customer.userId,
        channel: "p2p",
        p2pKind: "request",
        status: "paid",
        customer: { name: "Beto", handle: "beto" },
        note: "Café de olla",
      });

      await ctx.db.insert("orders", {
        ...orderFields("old-tacos-out", 2),
        sellerId: customer.userId,
        buyerId: owner.userId,
        channel: "p2p",
        p2pKind: "send",
        status: "paid",
        note: "Tacos al pastor",
      });

      for (let index = 0; index < 55; index += 1) {
        await ctx.db.insert("orders", {
          ...orderFields(`recent-${index}`, 10 + index),
          sellerId: owner.userId,
          buyerId: customer.userId,
          channel: "p2p",
          p2pKind: "send",
          status: "paid",
          customer: { name: "Otro", handle: "otro" },
          note: "Renta mensual",
        });
      }
    });

    // Finds older records beyond the original 50-item cap with accent-insensitive multi-term search.
    const cafeSearch = await owner.client.query(api.p2p.listActivityPage, {
      search: "cafe @beto",
      paginationOpts: { numItems: 20, cursor: null },
    });

    expect(cafeSearch.page.map((item) => item.publicId)).toEqual(["old-cafe-in"]);
    expect(cafeSearch.isDone).toBe(true);

    // Combines server-side search with direction filter and resolves outgoing seller handle/name.
    const outgoingSearch = await owner.client.query(api.p2p.listActivityPage, {
      direction: "out",
      search: "beto tacos",
      paginationOpts: { numItems: 20, cursor: null },
    });

    expect(outgoingSearch.page.map((item) => item.publicId)).toEqual(["old-tacos-out"]);
    expect(outgoingSearch.isDone).toBe(true);

    // Sparse match beyond the scan budget returns an empty intermediate page with a cursor,
    // and continuing with that cursor reaches the older match.
    const searchPage = (cursor: string | null, maximumRowsRead: number) =>
      owner.client.query(api.p2p.listActivityPage, {
        search: "cafe",
        paginationOpts: { numItems: 20, cursor, maximumRowsRead },
      });

    const budgetedFirst = await searchPage(null, 10);

    expect(budgetedFirst.page).toEqual([]);
    expect(budgetedFirst.isDone).toBe(false);

    let cursor: string | null = budgetedFirst.continueCursor;
    let isDone = budgetedFirst.isDone;
    const found: Array<string> = [];

    while (!isDone) {
      const next = await searchPage(cursor, 25);

      found.push(...next.page.map((item) => item.publicId));
      cursor = next.continueCursor;
      isDone = next.isDone;
    }

    expect(found).toEqual(["old-cafe-in"]);

    // Page size is clamped consistently by the shared policy (max 50, min 1).
    const capped = await owner.client.query(api.p2p.listActivityPage, {
      paginationOpts: { numItems: 100, cursor: null },
    });

    expect(capped.page).toHaveLength(50);
    expect(capped.isDone).toBe(false);

    const floored = await owner.client.query(api.p2p.listActivityPage, {
      paginationOpts: { numItems: 0, cursor: null },
    });

    expect(floored.page).toHaveLength(1);
    expect(floored.isDone).toBe(false);
  });
});
