import { describe, expect, test } from "vitest";

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
