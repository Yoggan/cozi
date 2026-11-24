import { describe, expect, test } from "vitest";

import {
  createTestBackend,
  createUser,
  linkReceivingClabe,
  sendSignedPeyWebhook,
  setupMealBusiness,
} from "../test-utils/harness";
import { api } from "./_generated/api";

describe("E2E: Post-payment bill splitting between multiple users", () => {
  test("user pays meal business ($1,000 MXN), splits equally among 3 users with exact centavo remainder, and tracks settlement to completion via webhooks", async () => {
    const t = createTestBackend();

    const owner = await createUser(t, {
      subject: "auth_owner_fonda",
      name: "María Torres",
      email: "maria@fondamaria.mx",
      handle: "maria_fonda",
    });

    const ana = await createUser(t, {
      subject: "auth_ana_split",
      name: "Ana López",
      email: "ana@gmail.com",
      handle: "ana_lopez",
    });

    const beto = await createUser(t, {
      subject: "auth_beto_split",
      name: "Beto García",
      email: "beto@gmail.com",
      handle: "beto_garcia",
    });

    const carla = await createUser(t, {
      subject: "auth_carla_split",
      name: "Carla Ruiz",
      email: "carla@gmail.com",
      handle: "carla_ruiz",
    });

    const diego = await createUser(t, {
      subject: "auth_diego_outside",
      name: "Diego Pérez",
      email: "diego@gmail.com",
      handle: "diego_perez",
    });

    // Ana vincula su cuenta receptora personal para cobrarle a sus amigos.
    await linkReceivingClabe(ana.client, {
      clabe: "012180015826225713",
      holderName: "Ana Lopez",
    });

    // Ana tiene guardado a Beto en su agenda de contactos.
    await ana.client.mutation(api.contacts.save, {
      handle: "beto_garcia",
      nickname: "Beto",
    });

    const fonda = await setupMealBusiness(owner.client, {
      name: "Fonda María",
      handle: "fonda_maria",
      clabe: "014180015826225719",
      tipsEnabled: true,
      acceptingOrders: true,
      menu: [
        { name: "Mole poblano con pollo", priceCents: 25_000, stock: 20 },
        { name: "Jarra de jamaica", priceCents: 15_000, stock: 10 },
      ],
    });

    const [mole, jamaica] = fonda.products;

    // 1. Ana paga la cena grupal: 3 moles ($750) + 1 jarra ($150) + $100 propina = $1,000.00 MXN.
    const mealOrder = await ana.client.mutation(api.orders.createBusinessOrder, {
      businessId: fonda.businessId,
      items: [
        { productId: mole.productId, quantity: 3 },
        { productId: jamaica.productId, quantity: 1 },
      ],
      tipCents: 10_000,
      note: "Cena viernes",
    });

    expect(mealOrder.totalCents).toBe(100_000);

    // No se puede dividir antes de pagar.
    await expect(
      ana.client.mutation(api.splits.createForOrder, {
        sourceOrderId: mealOrder.orderId,
        mode: "equal",
        participants: [{ handle: "beto_garcia" }, { handle: "carla_ruiz" }],
      }),
    ).rejects.toThrow("La orden debe estar pagada antes de dividir la cuenta");

    // Ana genera link de pago y Pey confirma el pago de la cena.
    await ana.client.action(api.pey.actions.createPaymentLink, {
      orderId: mealOrder.orderId,
    });

    const mealPending = await ana.client.query(api.orders.getByPublicId, {
      publicId: mealOrder.publicId,
    });

    const mealPaymentLinkId = mealPending?.payment?.peyReference ?? "";

    const mealWebhook = await sendSignedPeyWebhook(t, {
      type: "payment_link.status_updated",
      data: {
        paymentLinkId: mealPaymentLinkId,
        status: "paid",
        amount: 1000,
        currency: "MXN",
      },
    });

    expect(mealWebhook.status).toBe(200);
    expect(mealWebhook.body).toEqual({ ok: true, outcome: "processed" });

    // 2. Ana divide los $1,000.00 MXN en partes iguales entre 3 (Ana + Beto + Carla).
    // 100000 / 3 = 33333 con residuo 1 centavo -> Ana absorbe 33334; Beto y Carla pagan 33333 c/u.
    const split = await ana.client.mutation(api.splits.createForOrder, {
      sourceOrderId: mealOrder.orderId,
      mode: "equal",
      includeCreator: true,
      participants: [{ handle: "@beto_garcia" }, { handle: "carla_ruiz" }],
    });

    expect(split.totalCents).toBe(100_000);
    expect(split.creatorShareCents).toBe(33_334);
    expect(split.requestedTotalCents).toBe(66_666);
    expect(split.creatorShareCents + split.requestedTotalCents).toBe(100_000);
    expect(split.shares).toHaveLength(2);
    expect(split.shares.map((s) => ({ handle: s.handle, amountCents: s.amountCents }))).toEqual([
      { handle: "beto_garcia", amountCents: 33_333 },
      { handle: "carla_ruiz", amountCents: 33_333 },
    ]);

    // Contacto guardado actualiza `lastUsedAt`.
    const anaContacts = await ana.client.query(api.contacts.list, {});
    expect(anaContacts[0]?.lastUsedAt).not.toBeNull();

    // Privacidad: Ana, Beto y Carla ven la división; Diego (ajeno) recibe null.
    const betoSplitView = await beto.client.query(api.splits.getById, {
      billSplitId: split.billSplitId,
    });

    expect(betoSplitView?.status).toBe("open");
    expect(betoSplitView?.businessName).toBe("Fonda María");
    expect(betoSplitView?.remainingCents).toBe(66_666);

    const diegoSplitView = await diego.client.query(api.splits.getById, {
      billSplitId: split.billSplitId,
    });

    expect(diegoSplitView).toBeNull();

    // La orden original expone el resumen de la división activa.
    const sourceOrderWithSplit = await ana.client.query(api.orders.getByPublicId, {
      publicId: mealOrder.publicId,
    });

    expect(sourceOrderWithSplit?.activeSplit?.billSplitId).toBe(split.billSplitId);
    expect(sourceOrderWithSplit?.activeSplit?.status).toBe("open");

    // 3. Beto paga su parte ($333.33 MXN) vía CoDi QR + webhook firmado.
    const betoShare = split.shares.find((s) => s.handle === "beto_garcia");
    const carlaShare = split.shares.find((s) => s.handle === "carla_ruiz");

    if (!betoShare || !carlaShare) {
      throw new Error("Expected both participant shares");
    }

    await beto.client.action(api.pey.actions.createCodiCharge, {
      orderId: betoShare.orderId,
      method: "qr",
    });

    const betoOrder = await beto.client.query(api.orders.getByPublicId, {
      publicId: betoShare.publicId,
    });

    const betoWebhook = await sendSignedPeyWebhook(t, {
      type: "codi.qr.payment_received",
      data: {
        codiQrId: betoOrder?.payment?.peyReference ?? "",
        amount: 333.33,
        currency: "MXN",
      },
    });

    expect(betoWebhook.status).toBe(200);
    expect(betoWebhook.body).toEqual({ ok: true, outcome: "processed" });

    // La división pasa a `partially_paid`.
    const afterBeto = await ana.client.query(api.splits.getBySourceOrder, {
      sourceOrderId: mealOrder.orderId,
    });

    expect(afterBeto?.status).toBe("partially_paid");
    expect(afterBeto?.paidParticipantCount).toBe(1);
    expect(afterBeto?.collectedCents).toBe(33_333);
    expect(afterBeto?.remainingCents).toBe(33_333);
    expect(afterBeto?.settledAt).toBeNull();

    // Ya no puede cancelarse una división con pagos parciales.
    await expect(
      ana.client.mutation(api.splits.cancel, { billSplitId: split.billSplitId }),
    ).rejects.toThrow("No puedes cancelar una división que ya tiene pagos");

    // 4. Carla paga su parte ($333.33 MXN) vía Payment Link + webhook firmado.
    await carla.client.action(api.pey.actions.createPaymentLink, {
      orderId: carlaShare.orderId,
    });

    const carlaOrder = await carla.client.query(api.orders.getByPublicId, {
      publicId: carlaShare.publicId,
    });

    const carlaWebhook = await sendSignedPeyWebhook(t, {
      type: "payment_link.status_updated",
      data: {
        paymentLinkId: carlaOrder?.payment?.peyReference ?? "",
        status: "paid",
        amount: 333.33,
        currency: "MXN",
      },
    });

    expect(carlaWebhook.status).toBe(200);
    expect(carlaWebhook.body).toEqual({ ok: true, outcome: "processed" });

    // Reentrega duplicada del webhook de Carla no infla `collectedCents`.
    const carlaDup = await sendSignedPeyWebhook(
      t,
      {
        type: "payment_link.status_updated",
        data: {
          paymentLinkId: carlaOrder?.payment?.peyReference ?? "",
          status: "paid",
          amount: 333.33,
          currency: "MXN",
        },
      },
      { webhookId: carlaWebhook.webhookId },
    );

    expect(carlaDup.body).toEqual({ ok: true, outcome: "duplicate" });

    // 5. La división queda `settled` con los $666.66 MXN recolectados.
    const settledSplit = await ana.client.query(api.splits.getById, {
      billSplitId: split.billSplitId,
    });

    expect(settledSplit?.status).toBe("settled");
    expect(settledSplit?.paidParticipantCount).toBe(2);
    expect(settledSplit?.collectedCents).toBe(66_666);
    expect(settledSplit?.remainingCents).toBe(0);
    expect(settledSplit?.settledAt).not.toBeNull();
    expect(settledSplit?.shares.every((s) => s.status === "paid")).toBe(true);

    const mySplits = await ana.client.query(api.splits.listMine, {});
    expect(mySplits).toHaveLength(1);
    expect(mySplits[0]?.status).toBe("settled");
  });

  test("custom itemized bill split and equal split excluding creator distribute exact centavos", async () => {
    const t = createTestBackend();

    const owner = await createUser(t, {
      subject: "auth_owner_custom",
      name: "Raúl Vega",
      email: "raul@ramenhouse.mx",
      handle: "raul_ramen",
    });

    const ana = await createUser(t, {
      subject: "auth_ana_custom",
      name: "Ana López",
      email: "ana@gmail.com",
      handle: "ana_custom",
    });

    const beto = await createUser(t, {
      subject: "auth_beto_custom",
      name: "Beto García",
      email: "beto@gmail.com",
      handle: "beto_custom",
      phone: "+525599887766",
    });

    const carla = await createUser(t, {
      subject: "auth_carla_custom",
      name: "Carla Ruiz",
      email: "carla@gmail.com",
      handle: "carla_custom",
    });

    await createUser(t, {
      subject: "auth_diego_custom",
      name: "Diego Pérez",
      email: "diego@gmail.com",
      handle: "diego_custom",
    });

    await linkReceivingClabe(ana.client, {
      clabe: "012180015826225713",
      holderName: "Ana Lopez",
    });

    const ramen = await setupMealBusiness(owner.client, {
      name: "Ramen House",
      handle: "ramen_house",
      clabe: "014180015826225719",
      menu: [
        { name: "Tonkotsu Ramen", priceCents: 25_000 },
        { name: "Combo Especial", priceCents: 35_000 },
        { name: "Postre compartido", priceCents: 10_000 },
      ],
    });

    const [tonkotsu, combo, dessert] = ramen.products;

    // Escenario A: División personalizada ($850 MXN: Ana $250, Beto $350, Carla $250).
    const dinner = await ana.client.mutation(api.orders.createBusinessOrder, {
      businessId: ramen.businessId,
      items: [
        { productId: tonkotsu.productId, quantity: 2 },
        { productId: combo.productId, quantity: 1 },
      ],
    });

    const dinnerPayment = await ana.client.action(api.pey.actions.createPaymentLink, {
      orderId: dinner.orderId,
    });

    await ana.client.action(api.pey.actions.refreshPayment, {
      paymentId: dinnerPayment.paymentId,
    });

    const customSplit = await ana.client.mutation(api.splits.createForOrder, {
      sourceOrderId: dinner.orderId,
      mode: "custom",
      participants: [
        { handle: "beto_custom", amountCents: 35_000 },
        { handle: "carla_custom", amountCents: 25_000 },
      ],
      note: "Ramen por platillo",
    });

    expect(customSplit.creatorShareCents).toBe(25_000);
    expect(customSplit.requestedTotalCents).toBe(60_000);

    // Beto paga vía CoDi push y Carla vía Payment Link.
    const betoPush = await ana.client.action(api.pey.actions.createCodiCharge, {
      orderId: customSplit.shares[0].orderId,
      method: "push",
      payerPhone: "5599887766",
    });

    expect(betoPush.method).toBe("codi_push");
    await beto.client.action(api.pey.actions.refreshPayment, {
      paymentId: betoPush.paymentId,
    });

    const carlaLink = await carla.client.action(api.pey.actions.createPaymentLink, {
      orderId: customSplit.shares[1].orderId,
    });

    await carla.client.action(api.pey.actions.refreshPayment, {
      paymentId: carlaLink.paymentId,
    });

    const settledCustom = await ana.client.query(api.splits.getById, {
      billSplitId: customSplit.billSplitId,
    });

    expect(settledCustom?.status).toBe("settled");
    expect(settledCustom?.collectedCents).toBe(60_000);

    // Escenario B: División equitativa excluyendo al creador ($100 MXN entre 3 amigos: 3334 + 3333 + 3333).
    const dessertOrder = await ana.client.mutation(api.orders.createBusinessOrder, {
      businessId: ramen.businessId,
      items: [{ productId: dessert.productId, quantity: 1 }],
    });

    const dessertPayment = await ana.client.action(api.pey.actions.createPaymentLink, {
      orderId: dessertOrder.orderId,
    });

    await ana.client.action(api.pey.actions.refreshPayment, {
      paymentId: dessertPayment.paymentId,
    });

    const excludedSplit = await ana.client.mutation(api.splits.createForOrder, {
      sourceOrderId: dessertOrder.orderId,
      mode: "equal",
      includeCreator: false,
      participants: [
        { handle: "beto_custom" },
        { handle: "carla_custom" },
        { handle: "diego_custom" },
      ],
    });

    expect(excludedSplit.creatorShareCents).toBe(0);
    expect(excludedSplit.requestedTotalCents).toBe(10_000);
    expect(excludedSplit.shares.map((s) => s.amountCents)).toEqual([3334, 3333, 3333]);
  });

  test("enforces split guardrails and allows cancelling an open split to re-split cleanly", async () => {
    const t = createTestBackend();

    const owner = await createUser(t, {
      subject: "auth_owner_split_guard",
      name: "Chef Pablo",
      email: "pablo@pizzeria.mx",
      handle: "chef_pablo",
    });

    const ana = await createUser(t, {
      subject: "auth_ana_split_guard",
      name: "Ana López",
      email: "ana@gmail.com",
      handle: "ana_guard",
    });

    const beto = await createUser(t, {
      subject: "auth_beto_split_guard",
      name: "Beto García",
      email: "beto@gmail.com",
      handle: "beto_guard",
    });

    const pizzeria = await setupMealBusiness(owner.client, {
      name: "Pizzería Nápoles",
      handle: "pizzeria_napoles",
      clabe: "012180015826225713",
      menu: [{ name: "Pizza Margherita", priceCents: 20_000 }],
    });

    const pizzaOrder = await ana.client.mutation(api.orders.createBusinessOrder, {
      businessId: pizzeria.businessId,
      items: [{ productId: pizzeria.products[0].productId, quantity: 1 }],
    });

    const link = await ana.client.action(api.pey.actions.createPaymentLink, {
      orderId: pizzaOrder.orderId,
    });

    await ana.client.action(api.pey.actions.refreshPayment, {
      paymentId: link.paymentId,
    });

    // Otro usuario (dueño o amigo) no puede dividir la orden de Ana.
    await expect(
      beto.client.mutation(api.splits.createForOrder, {
        sourceOrderId: pizzaOrder.orderId,
        mode: "equal",
        participants: [{ handle: "ana_guard" }],
      }),
    ).rejects.toThrow("Solo quien pagó la orden puede dividir la cuenta");

    // No se puede dividir con un negocio (ADR 0002).
    await expect(
      ana.client.mutation(api.splits.createForOrder, {
        sourceOrderId: pizzaOrder.orderId,
        mode: "equal",
        participants: [{ handle: "pizzeria_napoles" }],
      }),
    ).rejects.toThrow("Solo puedes dividir la cuenta con personas");

    // No se puede incluirse a sí mismo ni repetir handles.
    await expect(
      ana.client.mutation(api.splits.createForOrder, {
        sourceOrderId: pizzaOrder.orderId,
        mode: "equal",
        participants: [{ handle: "ana_guard" }],
      }),
    ).rejects.toThrow("No puedes incluirte como deudor");

    await expect(
      ana.client.mutation(api.splits.createForOrder, {
        sourceOrderId: pizzaOrder.orderId,
        mode: "equal",
        participants: [{ handle: "beto_guard" }, { handle: "beto_guard" }],
      }),
    ).rejects.toThrow("está repetido");

    // En custom, la suma no puede superar el total ni ser menor a $10 MXN.
    await expect(
      ana.client.mutation(api.splits.createForOrder, {
        sourceOrderId: pizzaOrder.orderId,
        mode: "custom",
        participants: [{ handle: "beto_guard", amountCents: 25_000 }],
      }),
    ).rejects.toThrow("no puede superar el total");

    await expect(
      ana.client.mutation(api.splits.createForOrder, {
        sourceOrderId: pizzaOrder.orderId,
        mode: "custom",
        participants: [{ handle: "beto_guard", amountCents: 500 }],
      }),
    ).rejects.toThrow("al menos $10 MXN");

    // Crear división válida y verificar bloqueo contra duplicado.
    const firstSplit = await ana.client.mutation(api.splits.createForOrder, {
      sourceOrderId: pizzaOrder.orderId,
      mode: "custom",
      participants: [{ handle: "beto_guard", amountCents: 8000 }],
    });

    await expect(
      ana.client.mutation(api.splits.createForOrder, {
        sourceOrderId: pizzaOrder.orderId,
        mode: "equal",
        participants: [{ handle: "beto_guard" }],
      }),
    ).rejects.toThrow("ya tiene una división de cuenta activa");

    // Cancelar mientras está abierta cancela las órdenes hijas y permite volver a dividir.
    const cancelled = await ana.client.mutation(api.splits.cancel, {
      billSplitId: firstSplit.billSplitId,
    });

    expect(cancelled.status).toBe("cancelled");

    const cancelledChildOrder = await beto.client.query(api.orders.getByPublicId, {
      publicId: firstSplit.shares[0].publicId,
    });

    expect(cancelledChildOrder?.status).toBe("cancelled");

    const secondSplit = await ana.client.mutation(api.splits.createForOrder, {
      sourceOrderId: pizzaOrder.orderId,
      mode: "equal",
      participants: [{ handle: "beto_guard" }],
    });

    expect(secondSplit.shares[0]?.amountCents).toBe(10_000);
  });
});
