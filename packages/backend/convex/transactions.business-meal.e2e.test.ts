import { describe, expect, test } from "vitest";

import {
  createTestBackend,
  createUser,
  sendSignedPeyWebhook,
  setupMealBusiness,
} from "../test-utils/harness";
import { api } from "./_generated/api";

describe("E2E: User paying a meal business", () => {
  test("buyer orders a meal, pays with CoDi QR, settles via signed Pey webhook, decrements stock, and business fulfills", async () => {
    const t = createTestBackend();

    const owner = await createUser(t, {
      subject: "auth_owner_taqueria",
      name: "Carlos Méndez",
      email: "carlos@taqueriaelsol.mx",
      handle: "carlos_sol",
    });

    const diner = await createUser(t, {
      subject: "auth_diner_ana",
      name: "Ana López",
      email: "ana@gmail.com",
      handle: "ana_lopez",
      phone: "+525512345678",
    });

    const taqueria = await setupMealBusiness(owner.client, {
      name: "Taquería El Sol",
      handle: "taqueria_el_sol",
      category: "Restaurante",
      clabe: "012180015826225713",
      holderName: "Taqueria El Sol SA",
      tipsEnabled: true,
      acceptingOrders: true,
      menu: [
        { name: "Orden de tacos al pastor", priceCents: 12_000, stock: 10 },
        { name: "Agua de horchata", priceCents: 4500, stock: 5 },
      ],
    });

    const [tacos, horchata] = taqueria.products;

    // 1. El cliente descubre el negocio por @handle y consulta el menú.
    const directoryView = await diner.client.query(api.businesses.getByHandle, {
      handle: "@taqueria_el_sol",
    });

    expect(directoryView).not.toBeNull();
    expect(directoryView?.name).toBe("Taquería El Sol");
    expect(directoryView?.hasReceivingAccount).toBe(true);
    expect(directoryView?.acceptingOrders).toBe(true);
    expect(directoryView?.products).toHaveLength(2);

    // 2. El cliente crea su orden de comida: 2 tacos ($240) + 2 horchatas ($90) + $33 propina = $363 MXN.
    const createdOrder = await diner.client.mutation(api.orders.createBusinessOrder, {
      businessId: taqueria.businessId,
      channel: "pos",
      items: [
        { productId: tacos.productId, quantity: 2, note: "Con piña y cebolla" },
        { productId: horchata.productId, quantity: 2 },
      ],
      tipCents: 3300,
      note: "Mesa 4",
    });

    expect(createdOrder.subtotalCents).toBe(33_000);
    expect(createdOrder.tipCents).toBe(3300);
    expect(createdOrder.discountCents).toBe(0);
    expect(createdOrder.totalCents).toBe(36_300);

    // 3. El precio en la orden es un snapshot: subir el precio del menú después no altera la cuenta abierta.
    await owner.client.mutation(api.products.update, {
      productId: tacos.productId,
      priceCents: 15_000,
    });

    // 4. El cliente inicia el cobro CoDi QR hacia la cuenta verificada del restaurante.
    const charge = await diner.client.action(api.pey.actions.createCodiCharge, {
      orderId: createdOrder.orderId,
      method: "qr",
    });

    expect(charge.method).toBe("codi_qr");
    expect(charge.status).toBe("pending");
    expect(charge.amountCents).toBe(36_300);
    expect(charge.reused).toBe(false);

    // Idempotencia: repetir la acción reutiliza el mismo intento de pago.
    const reusedCharge = await diner.client.action(api.pey.actions.createCodiCharge, {
      orderId: createdOrder.orderId,
      method: "qr",
    });

    expect(reusedCharge.paymentId).toBe(charge.paymentId);
    expect(reusedCharge.reused).toBe(true);

    const pendingOrder = await diner.client.query(api.orders.getByPublicId, {
      publicId: createdOrder.publicId,
    });

    expect(pendingOrder?.status).toBe("awaiting_payment");
    expect(pendingOrder?.payment?.peyReference).toBeTruthy();
    const codiQrId = pendingOrder?.payment?.peyReference ?? "";

    // 5. Pey confirma el pago CoDi QR mediante webhook firmado (monto en pesos MXN: 363).
    const webhookRes = await sendSignedPeyWebhook(t, {
      type: "codi.qr.payment_received",
      data: {
        codiQrId,
        transactionId: "tx_meal_001",
        amount: 363,
        currency: "MXN",
        status: "paid",
      },
    });

    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body).toEqual({ ok: true, outcome: "processed" });

    // 6. La orden queda pagada y el inventario se descuenta exactamente una vez.
    const paidOrder = await diner.client.query(api.orders.getByPublicId, {
      publicId: createdOrder.publicId,
    });

    expect(paidOrder?.status).toBe("paid");
    expect(paidOrder?.paidAt).not.toBeNull();
    expect(paidOrder?.payment?.status).toBe("succeeded");

    const updatedMenu = await diner.client.query(api.products.listByBusiness, {
      businessId: taqueria.businessId,
    });

    expect(updatedMenu.find((p) => p._id === tacos.productId)?.stock).toBe(8);
    expect(updatedMenu.find((p) => p._id === horchata.productId)?.stock).toBe(3);

    await expect(
      owner.client.mutation(api.products.update, {
        productId: tacos.productId,
        stock: 12,
        expectedStock: 10,
      }),
    ).rejects.toThrow("El inventario cambió");

    await owner.client.mutation(api.products.update, {
      productId: tacos.productId,
      name: "Tacos al pastor",
    });

    // 7. Reentrega duplicada del mismo webhook no vuelve a descontar inventario.
    const duplicateRes = await sendSignedPeyWebhook(
      t,
      {
        type: "codi.qr.payment_received",
        data: {
          codiQrId,
          transactionId: "tx_meal_001",
          amount: 363,
          currency: "MXN",
          status: "paid",
        },
      },
      { webhookId: webhookRes.webhookId },
    );

    expect(duplicateRes.status).toBe(200);
    expect(duplicateRes.body).toEqual({ ok: true, outcome: "duplicate" });

    const menuAfterDup = await diner.client.query(api.products.listByBusiness, {
      businessId: taqueria.businessId,
    });

    expect(menuAfterDup.find((p) => p._id === tacos.productId)?.stock).toBe(8);

    // 8. La actividad del usuario muestra el nombre y @handle del negocio, no el personal del dueño.
    const activity = await diner.client.query(api.p2p.listActivity, { limit: 10 });
    expect(activity[0]?.counterpartName).toBe("Taquería El Sol");
    expect(activity[0]?.counterpartHandle).toBe("taqueria_el_sol");
    expect(activity[0]?.direction).toBe("out");
    expect(activity[0]?.status).toBe("paid");

    // 9. El negocio consulta sus órdenes y marca la comida como entregada.
    const businessOrders = await owner.client.query(api.orders.listBusinessOrders, {
      businessId: taqueria.businessId,
      status: "paid",
    });

    expect(businessOrders).toHaveLength(1);
    expect(businessOrders[0]?.orderId).toBe(createdOrder.orderId);

    const fulfilled = await owner.client.mutation(api.orders.fulfill, {
      orderId: createdOrder.orderId,
    });

    expect(fulfilled.status).toBe("fulfilled");

    const finalOrder = await diner.client.query(api.orders.getByPublicId, {
      publicId: createdOrder.publicId,
    });

    expect(finalOrder?.status).toBe("fulfilled");
    expect(finalOrder?.fulfilledAt).not.toBeNull();
  });

  test("merchant creates POS order with custom item and discount, buyer settles via Payment Link + refreshPayment fallback", async () => {
    const t = createTestBackend();

    const owner = await createUser(t, {
      subject: "auth_owner_bistro",
      name: "Sofía Ruiz",
      email: "sofia@bistromx.com",
      handle: "sofia_bistro",
    });

    const diner = await createUser(t, {
      subject: "auth_diner_beto",
      name: "Beto García",
      email: "beto@gmail.com",
      handle: "beto_garcia",
    });

    const bistro = await setupMealBusiness(owner.client, {
      name: "Bistro Roma",
      handle: "bistro_roma",
      clabe: "012180015826225713",
      tipsEnabled: false,
      acceptingOrders: true,
    });

    // El negocio crea un pedido POS con concepto personalizado y descuento para @beto_garcia.
    const order = await owner.client.mutation(api.orders.createBusinessOrder, {
      businessId: bistro.businessId,
      channel: "pos",
      buyerHandle: "beto_garcia",
      items: [{ name: "Menú ejecutivo del día", unitPriceCents: 18_000, quantity: 1 }],
      discountCents: 2000,
      note: "Descuento cliente frecuente",
    });

    expect(order.subtotalCents).toBe(18_000);
    expect(order.discountCents).toBe(2000);
    expect(order.totalCents).toBe(16_000);

    // El negocio genera un link de pago.
    const link = await owner.client.action(api.pey.actions.createPaymentLink, {
      orderId: order.orderId,
      expiresInMinutes: 60,
    });

    expect(link.method).toBe("payment_link");
    expect(link.checkoutUrl).toContain(`/pay/${order.publicId}`);

    // Simula pérdida de webhook: el comprador ejecuta refreshPayment como reconciliación.
    const refreshed = await diner.client.action(api.pey.actions.refreshPayment, {
      paymentId: link.paymentId,
    });

    expect(refreshed.status).toBe("succeeded");

    const settledOrder = await diner.client.query(api.orders.getByPublicId, {
      publicId: order.publicId,
    });

    expect(settledOrder?.status).toBe("paid");
    expect(settledOrder?.totalCents).toBe(16_000);
  });

  test("webhook rejects invalid signatures and refuses amount mismatches without settling the order", async () => {
    const t = createTestBackend();

    const owner = await createUser(t, {
      subject: "auth_owner_cafe",
      name: "Luis Ortiz",
      email: "luis@cafeluz.mx",
      handle: "luis_cafe",
    });

    const diner = await createUser(t, {
      subject: "auth_diner_clara",
      name: "Clara Díaz",
      email: "clara@gmail.com",
      handle: "clara_diaz",
    });

    const cafe = await setupMealBusiness(owner.client, {
      name: "Café Luz",
      handle: "cafe_luz",
      clabe: "012180015826225713",
      menu: [{ name: "Chilaquiles verdes", priceCents: 14_500, stock: 4 }],
    });

    const order = await diner.client.mutation(api.orders.createBusinessOrder, {
      businessId: cafe.businessId,
      items: [{ productId: cafe.products[0].productId, quantity: 1 }],
    });

    await diner.client.action(api.pey.actions.createCodiCharge, {
      orderId: order.orderId,
      method: "qr",
    });

    const pending = await diner.client.query(api.orders.getByPublicId, {
      publicId: order.publicId,
    });

    const ref = pending?.payment?.peyReference ?? "";

    // Firma inválida -> 401.
    const badSig = await sendSignedPeyWebhook(
      t,
      {
        type: "codi.qr.payment_received",
        data: { codiQrId: ref, amount: 145, currency: "MXN" },
      },
      { overrideSignature: "v1,aW52YWxpZF9zaWduYXR1cmU=" },
    );

    expect(badSig.status).toBe(401);

    // Firma válida pero monto distinto ($100 en vez de $145) -> mismatch, orden sigue sin pagarse.
    const mismatch = await sendSignedPeyWebhook(t, {
      type: "codi.qr.payment_received",
      data: { codiQrId: ref, amount: 100, currency: "MXN" },
    });

    expect(mismatch.status).toBe(200);
    expect(mismatch.body).toEqual({ ok: false, outcome: "mismatch" });

    const stillPending = await diner.client.query(api.orders.getByPublicId, {
      publicId: order.publicId,
    });

    expect(stillPending?.status).toBe("awaiting_payment");

    const products = await diner.client.query(api.products.listByBusiness, {
      businessId: cafe.businessId,
    });

    expect(products[0]?.stock).toBe(3);
  });

  test("enforces business order guardrails: paused business, missing bank account, stock limits, tips disabled, unauthorized access, and cancellation", async () => {
    const t = createTestBackend();

    const owner = await createUser(t, {
      subject: "auth_owner_guard",
      name: "Elena Soto",
      email: "elena@cocinaverde.mx",
      handle: "elena_cocina",
    });

    const buyer = await createUser(t, {
      subject: "auth_buyer_guard",
      name: "Diego Ramos",
      email: "diego@gmail.com",
      handle: "diego_ramos",
    });

    const stranger = await createUser(t, {
      subject: "auth_stranger_guard",
      name: "Marco Silva",
      email: "marco@gmail.com",
      handle: "marco_silva",
    });

    // Negocio sin cuenta bancaria y sin aceptar propinas ni pedidos inicialmente.
    const kitchen = await setupMealBusiness(owner.client, {
      name: "Cocina Verde",
      handle: "cocina_verde",
      tipsEnabled: false,
      acceptingOrders: false,
      menu: [{ name: "Ensalada César", priceCents: 13_000, stock: 2 }],
    });

    const salad = kitchen.products[0];

    // No acepta pedidos todavía.
    await expect(
      buyer.client.mutation(api.orders.createBusinessOrder, {
        businessId: kitchen.businessId,
        items: [{ productId: salad.productId, quantity: 1 }],
      }),
    ).rejects.toThrow("El negocio no está aceptando pedidos");

    // Abrimos pedidos.
    await owner.client.mutation(api.businesses.update, {
      businessId: kitchen.businessId,
      acceptingOrders: true,
    });

    // Excede inventario.
    await expect(
      buyer.client.mutation(api.orders.createBusinessOrder, {
        businessId: kitchen.businessId,
        items: [{ productId: salad.productId, quantity: 3 }],
      }),
    ).rejects.toThrow("No hay suficiente inventario");

    // Propinas desactivadas.
    await expect(
      buyer.client.mutation(api.orders.createBusinessOrder, {
        businessId: kitchen.businessId,
        items: [{ productId: salad.productId, quantity: 1 }],
        tipCents: 1500,
      }),
    ).rejects.toThrow("Este negocio no acepta propinas");

    // Comprador no puede agregar conceptos personalizados ni descuentos.
    await expect(
      buyer.client.mutation(api.orders.createBusinessOrder, {
        businessId: kitchen.businessId,
        items: [{ name: "Plato gratis", unitPriceCents: 100, quantity: 1 }],
      }),
    ).rejects.toThrow("Solo el negocio puede agregar conceptos personalizados");

    await expect(
      buyer.client.mutation(api.orders.createBusinessOrder, {
        businessId: kitchen.businessId,
        items: [{ productId: salad.productId, quantity: 1 }],
        discountCents: 1000,
      }),
    ).rejects.toThrow("Solo el negocio puede aplicar descuentos");

    // Crea orden válida, pero falla al cobrar porque el negocio no tiene cuenta bancaria verificada.
    const order = await buyer.client.mutation(api.orders.createBusinessOrder, {
      businessId: kitchen.businessId,
      items: [{ productId: salad.productId, quantity: 1 }],
    });

    await expect(
      buyer.client.action(api.pey.actions.createCodiCharge, {
        orderId: order.orderId,
        method: "qr",
      }),
    ).rejects.toThrow("El negocio aún no puede recibir pagos");

    // Un tercero no puede ver ni cobrar la orden.
    const strangerView = await stranger.client.query(api.orders.getByPublicId, {
      publicId: order.publicId,
    });

    expect(strangerView).toBeNull();

    await expect(
      stranger.client.action(api.pey.actions.createPaymentLink, {
        orderId: order.orderId,
      }),
    ).rejects.toThrow("No tienes acceso a esta orden");

    // El comprador cancela la orden abierta y ya no puede cobrarse.
    const cancelled = await buyer.client.mutation(api.orders.cancel, {
      orderId: order.orderId,
    });

    expect(cancelled.status).toBe("cancelled");

    await expect(
      buyer.client.action(api.pey.actions.createPaymentLink, {
        orderId: order.orderId,
      }),
    ).rejects.toThrow("La orden está cerrada");
  });
});
