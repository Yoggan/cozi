import { describe, expect, test, vi } from "vitest";

import { createTestBackend, createUser, setupMealBusiness } from "../test-utils/harness";
import { api } from "./_generated/api";

describe("E2E: in-app messaging attached to orders and businesses", () => {
  test("reuses the order thread, blocks outsiders, and tracks unread counts", async () => {
    const t = createTestBackend();

    const sender = await createUser(t, {
      subject: "auth_chat_sender",
      name: "Sofía Morales",
      email: "sofia@gmail.com",
      handle: "sofia_m",
    });

    const receiver = await createUser(t, {
      subject: "auth_chat_receiver",
      name: "Jorge Castro",
      email: "jorge@gmail.com",
      handle: "jorge_c",
    });

    const outsider = await createUser(t, {
      subject: "auth_chat_outsider",
      name: "Diego Pérez",
      email: "diego@gmail.com",
      handle: "diego_p",
    });

    const transfer = await sender.client.mutation(api.p2p.createTransfer, {
      recipientHandle: "jorge_c",
      amountCents: 25_000,
      note: "Boleto de cine",
    });

    const initialState = await sender.client.query(api.messages.getOrderThreadState, {
      orderPublicId: transfer.publicId,
    });

    expect(initialState).toEqual({ canMessage: true, threadId: null });

    // Cualquiera de los dos abre el hilo y el otro lo reutiliza.
    const opened = await sender.client.mutation(api.messages.getOrCreateOrderThread, {
      orderPublicId: transfer.publicId,
    });

    const reused = await receiver.client.mutation(api.messages.getOrCreateOrderThread, {
      orderPublicId: transfer.publicId,
    });

    expect(reused.threadId).toBe(opened.threadId);

    // Solo los participantes pueden leer o escribir.
    await expect(
      outsider.client.mutation(api.messages.getOrCreateOrderThread, {
        orderPublicId: transfer.publicId,
      }),
    ).rejects.toThrow("No tienes acceso a esta conversación");
    await expect(
      outsider.client.query(api.messages.getThread, { threadId: opened.threadId }),
    ).resolves.toBeNull();
    await expect(
      outsider.client.mutation(api.messages.sendMessage, {
        threadId: opened.threadId,
        text: "Hola",
      }),
    ).rejects.toThrow("Conversación no encontrada");
    await expect(
      outsider.client.mutation(api.messages.markRead, { threadId: opened.threadId }),
    ).rejects.toThrow("Conversación no encontrada");

    const sent = await sender.client.mutation(api.messages.sendMessage, {
      threadId: opened.threadId,
      text: "  ¿Te va bien a las 7?  ",
    });

    expect(sent.messageId).toBeTruthy();

    const senderThreads = await sender.client.query(api.messages.listThreads, {});
    expect(senderThreads).toHaveLength(1);
    expect(senderThreads[0]).toMatchObject({
      threadId: opened.threadId,
      viewerRole: "customer",
      counterpartName: "Jorge Castro",
      counterpartHandle: "jorge_c",
      unreadCount: 0,
    });
    expect(senderThreads[0].lastMessage?.text).toBe("¿Te va bien a las 7?");
    expect(senderThreads[0].order?.publicId).toBe(transfer.publicId);
    expect(senderThreads[0].order?.amountCents).toBe(25_000);
    expect(senderThreads[0].order?.concept).toBe("Boleto de cine");

    const receiverThreads = await receiver.client.query(api.messages.listThreads, {});
    expect(receiverThreads[0].viewerRole).toBe("owner");
    expect(receiverThreads[0].counterpartName).toBe("Sofía Morales");
    expect(receiverThreads[0].unreadCount).toBe(1);

    const conversation = await receiver.client.query(api.messages.getThread, {
      threadId: opened.threadId,
    });

    expect(conversation?.messages.map((message) => message.text)).toEqual(["¿Te va bien a las 7?"]);
    expect(conversation?.messages[0]?.isMine).toBe(false);
    expect(conversation?.unreadCount).toBe(1);

    await receiver.client.mutation(api.messages.markRead, { threadId: opened.threadId });
    expect((await receiver.client.query(api.messages.listThreads, {}))[0]?.unreadCount).toBe(0);

    const stateAfter = await sender.client.query(api.messages.getOrderThreadState, {
      orderPublicId: transfer.publicId,
    });

    expect(stateAfter.threadId).toBe(opened.threadId);

    // Validación de texto: no vacío y máximo 1000 caracteres.
    await expect(
      sender.client.mutation(api.messages.sendMessage, {
        threadId: opened.threadId,
        text: "   ",
      }),
    ).rejects.toThrow("Escribe un mensaje");
    await expect(
      sender.client.mutation(api.messages.sendMessage, {
        threadId: opened.threadId,
        text: "x".repeat(1001),
      }),
    ).rejects.toThrow("1000 caracteres");
  });

  test("a request whose payer has no Cozi account cannot open a thread", async () => {
    const t = createTestBackend();

    const requester = await createUser(t, {
      subject: "auth_chat_requester",
      name: "Lucía Vega",
      email: "lucia@gmail.com",
      handle: "lucia_v",
    });

    const request = await requester.client.mutation(api.p2p.createRequest, {
      amountCents: 15_000,
      note: "Uber al aeropuerto",
    });

    await expect(
      requester.client.mutation(api.messages.getOrCreateOrderThread, {
        orderPublicId: request.publicId,
      }),
    ).rejects.toThrow("El comprador aún no tiene cuenta en Cozi");

    await expect(
      requester.client.query(api.messages.getOrderThreadState, {
        orderPublicId: request.publicId,
      }),
    ).resolves.toEqual({ canMessage: false, threadId: null });
  });

  test("a customer opens a business thread and the owner replies from the inbox", async () => {
    const t = createTestBackend();

    const owner = await createUser(t, {
      subject: "auth_chat_business_owner",
      name: "María Torres",
      email: "maria@fondamaria.mx",
      handle: "maria_fonda",
    });

    const customer = await createUser(t, {
      subject: "auth_chat_business_customer",
      name: "Ana López",
      email: "ana@gmail.com",
      handle: "ana_lopez",
    });

    const fonda = await setupMealBusiness(owner.client, {
      name: "Fonda María",
      handle: "fonda_maria",
      acceptingOrders: true,
      tipsEnabled: false,
    });

    await expect(
      owner.client.mutation(api.messages.getOrCreateBusinessThread, {
        businessId: fonda.businessId,
      }),
    ).rejects.toThrow("No puedes iniciar una conversación con tu propio negocio");

    const opened = await customer.client.mutation(api.messages.getOrCreateBusinessThread, {
      businessId: fonda.businessId,
    });

    const reused = await customer.client.mutation(api.messages.getOrCreateBusinessThread, {
      businessId: fonda.businessId,
    });

    expect(reused.threadId).toBe(opened.threadId);

    await customer.client.mutation(api.messages.sendMessage, {
      threadId: opened.threadId,
      text: "¿Tienen mesa para 4 hoy?",
    });

    const ownerThreads = await owner.client.query(api.messages.listThreads, {});
    expect(ownerThreads).toHaveLength(1);
    expect(ownerThreads[0]).toMatchObject({
      threadId: opened.threadId,
      viewerRole: "owner",
      counterpartName: "Ana López",
      counterpartHandle: "ana_lopez",
      unreadCount: 1,
    });
    expect(ownerThreads[0].business?.name).toBe("Fonda María");
    expect(ownerThreads[0].business?.handle).toBe("fonda_maria");

    const customerThreads = await customer.client.query(api.messages.listThreads, {});
    expect(customerThreads[0].viewerRole).toBe("customer");
    expect(customerThreads[0].counterpartName).toBe("Fonda María");
    expect(customerThreads[0].counterpartHandle).toBe("fonda_maria");
    expect(customerThreads[0].unreadCount).toBe(0);

    await owner.client.mutation(api.messages.sendMessage, {
      threadId: opened.threadId,
      text: "Sí, a las 2 pm.",
    });

    const customerInbox = await customer.client.query(api.messages.listThreads, {});
    expect(customerInbox[0].unreadCount).toBe(1);
    expect(customerInbox[0].lastMessage?.text).toBe("Sí, a las 2 pm.");
  });
});

async function setupGuardrailThreads() {
  const t = createTestBackend();

  const customer = await createUser(t, {
    subject: "auth_guardrails_customer",
    name: "Ana",
    email: "ana@example.com",
    handle: "ana_guardrails",
  });

  const owner = await createUser(t, {
    subject: "auth_guardrails_owner",
    name: "María",
    email: "maria@example.com",
    handle: "maria_guardrails",
  });

  const business = await owner.client.mutation(api.businesses.create, { name: "Fonda María" });

  const reverseBusiness = await customer.client.mutation(api.businesses.create, {
    name: "Fonda Ana",
  });

  const createOrder = async () =>
    await customer.client.mutation(api.p2p.createTransfer, {
      recipientHandle: owner.handle,
      amountCents: 25_000,
    });

  const order = await createOrder();

  const { threadId: orderThread } = await customer.client.mutation(
    api.messages.getOrCreateOrderThread,
    { orderPublicId: order.publicId },
  );

  const { threadId: businessThread } = await customer.client.mutation(
    api.messages.getOrCreateBusinessThread,
    { businessId: business.businessId },
  );

  return {
    t,
    customer,
    owner,
    business,
    reverseBusiness,
    order,
    createOrder,
    orderThread,
    businessThread,
  };
}

describe("Messaging guardrails", () => {
  test("shares the sender limit across order and business threads and refills it", async () => {
    const { customer, owner, orderThread, businessThread } = await setupGuardrailThreads();
    vi.useFakeTimers({ toFake: ["Date"] });

    try {
      const attempts = await Promise.allSettled(
        Array.from({ length: 12 }, (_, index) =>
          customer.client.mutation(api.messages.sendMessage, {
            threadId: index % 2 === 0 ? orderThread : businessThread,
            text: `Mensaje ${index}`,
          }),
        ),
      );

      expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(10);
      const failures = attempts.filter((attempt) => attempt.status === "rejected");
      expect(failures).toHaveLength(2);

      for (const failure of failures) {
        expect(failure.reason).toHaveProperty(
          "message",
          expect.stringContaining("demasiados mensajes"),
        );
      }

      const order = await owner.client.query(api.messages.getThread, { threadId: orderThread });

      const business = await owner.client.query(api.messages.getThread, {
        threadId: businessThread,
      });

      expect((order?.messages.length ?? 0) + (business?.messages.length ?? 0)).toBe(10);

      await owner.client.mutation(api.messages.sendMessage, {
        threadId: businessThread,
        text: "Respuesta",
      });
      vi.setSystemTime(Date.now() + 3000);
      await customer.client.mutation(api.messages.sendMessage, {
        threadId: orderThread,
        text: "Otro mensaje",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test("blocks both directions across thread entry points while preserving existing history", async () => {
    const {
      t,
      customer,
      owner,
      order,
      createOrder,
      business,
      reverseBusiness,
      orderThread,
      businessThread,
    } = await setupGuardrailThreads();

    const blockedError = "No se pueden enviar mensajes";
    await customer.client.mutation(api.messages.sendMessage, {
      threadId: orderThread,
      text: "Historial de orden",
    });
    await owner.client.mutation(api.messages.sendMessage, {
      threadId: businessThread,
      text: "Historial de negocio",
    });
    await owner.client.mutation(api.messages.setCounterpartBlocked, {
      threadId: businessThread,
      blocked: true,
    });
    await owner.client.mutation(api.messages.setCounterpartBlocked, {
      threadId: orderThread,
      blocked: true,
    });
    expect(await t.run((ctx) => ctx.db.query("messageBlocks").take(2))).toHaveLength(1);

    for (const threadId of [orderThread, businessThread]) {
      for (const { client } of [customer, owner]) {
        await expect(
          client.mutation(api.messages.sendMessage, { threadId, text: "Bloqueado" }),
        ).rejects.toThrow(blockedError);
        const thread = await client.query(api.messages.getThread, { threadId });
        expect(thread?.canSend).toBe(false);
        expect(thread?.messages).toHaveLength(1);
        await client.mutation(api.messages.markRead, { threadId });
      }
    }

    await expect(customer.client.query(api.messages.listThreads, {})).resolves.toHaveLength(2);
    await expect(
      customer.client.query(api.messages.getOrderThreadState, { orderPublicId: order.publicId }),
    ).resolves.toEqual({ canMessage: true, threadId: orderThread });
    await expect(
      owner.client.mutation(api.messages.getOrCreateOrderThread, { orderPublicId: order.publicId }),
    ).resolves.toEqual({ threadId: orderThread });
    await expect(
      customer.client.mutation(api.messages.getOrCreateBusinessThread, {
        businessId: business.businessId,
      }),
    ).resolves.toEqual({ threadId: businessThread });

    const anotherOrder = await createOrder();
    await expect(
      customer.client.query(api.messages.getOrderThreadState, {
        orderPublicId: anotherOrder.publicId,
      }),
    ).resolves.toEqual({ canMessage: false, threadId: null });
    await expect(
      customer.client.mutation(api.messages.getOrCreateOrderThread, {
        orderPublicId: anotherOrder.publicId,
      }),
    ).rejects.toThrow(blockedError);
    await expect(
      owner.client.mutation(api.messages.getOrCreateBusinessThread, {
        businessId: reverseBusiness.businessId,
      }),
    ).rejects.toThrow(blockedError);

    await customer.client.mutation(api.messages.setCounterpartBlocked, {
      threadId: orderThread,
      blocked: false,
    });
    await expect(
      customer.client.mutation(api.messages.sendMessage, {
        threadId: orderThread,
        text: "Bloqueado",
      }),
    ).rejects.toThrow(blockedError);
    await owner.client.mutation(api.messages.setCounterpartBlocked, {
      threadId: orderThread,
      blocked: false,
    });
    await customer.client.mutation(api.messages.sendMessage, {
      threadId: businessThread,
      text: "Disponible",
    });
    await owner.client.mutation(api.messages.sendMessage, {
      threadId: orderThread,
      text: "Disponible",
    });
  });

  test("deduplicates reports and confines support review to captured evidence", async () => {
    const { t, customer, owner, orderThread } = await setupGuardrailThreads();

    const outsider = await createUser(t, {
      subject: "auth_guardrails_outsider",
      name: "Diego",
      email: "diego@example.com",
      handle: "diego_guardrails",
    });

    const supportSubject = "auth_guardrails_support";
    await createUser(t, {
      subject: supportSubject,
      name: "Soporte",
      email: "soporte@example.com",
      handle: "soporte_guardrails",
    });
    const tokenIdentifier = `https://auth.example.com|${supportSubject}`;
    const support = t.withIdentity({ subject: supportSubject, tokenIdentifier });

    const reviewerId = await t.run((ctx) =>
      ctx.db.insert("messageSupportReviewers", { tokenIdentifier }),
    );

    await expect(
      outsider.client.mutation(api.messages.setCounterpartBlocked, {
        threadId: orderThread,
        blocked: true,
      }),
    ).rejects.toThrow("Conversación no encontrada");
    await expect(
      outsider.client.mutation(api.messages.reportThread, { threadId: orderThread }),
    ).rejects.toThrow("Conversación no encontrada");
    await owner.client.mutation(api.messages.sendMessage, {
      threadId: orderThread,
      text: "Mensaje reportado",
    });

    const reportArgs = { threadId: orderThread };
    await Promise.all([
      customer.client.mutation(api.messages.reportThread, reportArgs),
      customer.client.mutation(api.messages.reportThread, reportArgs),
    ]);
    await owner.client.mutation(api.messages.sendMessage, {
      threadId: orderThread,
      text: "Mensaje posterior",
    });

    const reports = await support.query(api.messageSupport.listPendingReports, {});
    expect(reports).toHaveLength(1);
    const report = reports?.[0];

    if (!report) {
      throw new Error("Expected a pending report");
    }

    expect(report.reporterId).toBe(customer.userId);
    expect(report.reportedId).toBe(owner.userId);
    expect(report.evidence.map(({ text }) => text)).toEqual(["Mensaje reportado"]);
    await expect(support.query(api.messages.getThread, reportArgs)).resolves.toBeNull();
    await expect(support.query(api.messages.listThreads, {})).resolves.toEqual([]);
    await expect(customer.client.query(api.messages.getThread, reportArgs)).resolves.toMatchObject({
      reportedByViewer: true,
    });
    await expect(owner.client.query(api.messages.getThread, reportArgs)).resolves.toMatchObject({
      reportedByViewer: false,
    });

    const reviewArgs = { reportId: report.reportId };

    for (const client of [t, customer.client, outsider.client]) {
      await expect(client.query(api.messageSupport.listPendingReports, {})).resolves.toBeNull();
      await expect(
        client.mutation(api.messageSupport.markReportReviewed, reviewArgs),
      ).rejects.toThrow("No tienes acceso a los reportes");
    }

    await support.mutation(api.messageSupport.markReportReviewed, reviewArgs);
    const reviewed = await t.run((ctx) => ctx.db.get(report.reportId));
    expect(reviewed).toMatchObject({
      status: "reviewed",
      reviewedBy: tokenIdentifier,
      reviewedAt: expect.any(Number),
    });
    await support.mutation(api.messageSupport.markReportReviewed, reviewArgs);
    await customer.client.mutation(api.messages.reportThread, reportArgs);
    await expect(t.run((ctx) => ctx.db.get(report.reportId))).resolves.toEqual(reviewed);
    await expect(support.query(api.messageSupport.listPendingReports, {})).resolves.toEqual([]);

    await t.run((ctx) => ctx.db.delete(reviewerId));
    await expect(support.query(api.messageSupport.listPendingReports, {})).resolves.toBeNull();
    await expect(
      support.mutation(api.messageSupport.markReportReviewed, reviewArgs),
    ).rejects.toThrow("No tienes acceso a los reportes");
  });
});
