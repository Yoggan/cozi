import { describe, expect, test } from "vitest";

import {
  createTestBackend,
  createUser,
  linkReceivingClabe,
  sendSignedPeyWebhook,
} from "../test-utils/harness";
import { api, internal } from "./_generated/api";

describe("E2E: P2P transfers, requests, and bank account activation webhooks", () => {
  test("P2P transfer (Enviar) settles end-to-end via signed CoDi webhook after bank account activation webhook", async () => {
    const t = createTestBackend();

    const sender = await createUser(t, {
      subject: "auth_p2p_sender",
      name: "Sofía Morales",
      email: "sofia@gmail.com",
      handle: "sofia_m",
    });
    const receiver = await createUser(t, {
      subject: "auth_p2p_receiver",
      name: "Jorge Castro",
      email: "jorge@gmail.com",
      handle: "jorge_c",
    });

    // Guardamos una cuenta inicialmente en estado PENDING (como ocurre en producción con Banxico).
    await t.mutation(internal.pey.mutations.saveBankAccount, {
      userId: receiver.userId,
      peyBankAccountId: "ba_live_pending_123",
      accountType: "clabe",
      accountNumberMasked: "•••• 5713",
      holderName: "Jorge Castro",
      institution: "BBVA",
      status: "pending",
      providerStatus: "PENDING",
      setDefault: true,
    });

    const transfer = await sender.client.mutation(api.p2p.createTransfer, {
      recipientHandle: "@jorge_c",
      amountCents: 25_000,
      note: "Boleto de cine",
    });

    // Mientras la cuenta está PENDING, no se puede iniciar el cobro.
    await expect(
      sender.client.action(api.pey.actions.createCodiCharge, {
        orderId: transfer.orderId,
        method: "qr",
      }),
    ).rejects.toThrow("Esa persona aún no puede recibir pagos");

    // Pey manda el webhook `bank.account.updated` con `codiStatus: "ACTIVE"`.
    const bankWebhook = await sendSignedPeyWebhook(t, {
      type: "bank.account.updated",
      data: {
        id: "ba_live_pending_123",
        codiStatus: "ACTIVE",
      },
    });
    expect(bankWebhook.status).toBe(200);
    expect(bankWebhook.body).toEqual({ ok: true, outcome: "bank_account_updated" });

    // Ahora sí se puede cobrar y liquidar la transferencia P2P.
    const charge = await sender.client.action(api.pey.actions.createCodiCharge, {
      orderId: transfer.orderId,
      method: "qr",
    });
    expect(charge.status).toBe("pending");

    const orderBefore = await sender.client.query(api.orders.getByPublicId, {
      publicId: transfer.publicId,
    });
    const paymentWebhook = await sendSignedPeyWebhook(t, {
      type: "codi.qr.payment_received",
      data: {
        codiQrId: orderBefore?.payment?.peyReference ?? "",
        amount: 250,
        currency: "MXN",
      },
    });
    expect(paymentWebhook.status).toBe(200);
    expect(paymentWebhook.body).toEqual({ ok: true, outcome: "processed" });

    const receiverView = await receiver.client.query(api.p2p.getOrder, {
      publicId: transfer.publicId,
    });
    expect(receiverView?.status).toBe("paid");
    expect(receiverView?.direction).toBe("in");
    expect(receiverView?.counterpartHandle).toBe("sofia_m");
  });

  test("P2P request (Cobrar) settles via Payment Link webhook", async () => {
    const t = createTestBackend();

    const requester = await createUser(t, {
      subject: "auth_p2p_req",
      name: "Lucía Vega",
      email: "lucia@gmail.com",
      handle: "lucia_v",
    });
    const payer = await createUser(t, {
      subject: "auth_p2p_payer",
      name: "Mateo Cruz",
      email: "mateo@gmail.com",
      handle: "mateo_c",
    });

    await linkReceivingClabe(requester.client, {
      clabe: "012180015826225713",
      holderName: "Lucia Vega",
    });

    const request = await requester.client.mutation(api.p2p.createRequest, {
      payerHandle: "mateo_c",
      amountCents: 15_000,
      note: "Uber al aeropuerto",
    });

    await requester.client.action(api.pey.actions.createPaymentLink, {
      orderId: request.orderId,
      expiresInMinutes: 120,
    });

    const pending = await payer.client.query(api.orders.getByPublicId, {
      publicId: request.publicId,
    });

    const webhook = await sendSignedPeyWebhook(t, {
      type: "payment_link.status_updated",
      data: {
        paymentLinkId: pending?.payment?.peyReference ?? "",
        status: "paid",
        amount: 150,
        currency: "MXN",
      },
    });
    expect(webhook.status).toBe(200);
    expect(webhook.body).toEqual({ ok: true, outcome: "processed" });

    const paid = await payer.client.query(api.p2p.getOrder, {
      publicId: request.publicId,
    });
    expect(paid?.status).toBe("paid");
    expect(paid?.direction).toBe("out");
  });
});
