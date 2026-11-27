import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import type { Infer } from "convex/values";

/** Canales desde los que nace una orden. */
export const orderChannelValidator = v.union(
  v.literal("pos"),
  v.literal("whatsapp"),
  v.literal("instagram"),
  v.literal("p2p"),
);

export const orderStatusValidator = v.union(
  v.literal("draft"),
  v.literal("awaiting_payment"),
  v.literal("paid"),
  v.literal("fulfilled"),
  v.literal("cancelled"),
  v.literal("expired"),
);

export const paymentMethodValidator = v.union(
  v.literal("codi_qr"),
  v.literal("codi_push"),
  v.literal("payment_link"),
);

export const paymentStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("expired"),
  v.literal("refunded"),
);

export const bankAccountTypeValidator = v.union(v.literal("clabe"), v.literal("card"));

export const bankAccountStatusValidator = v.union(
  v.literal("pending"),
  v.literal("verified"),
  v.literal("rejected"),
  v.literal("disabled"),
);

export const businessStatusValidator = v.union(v.literal("active"), v.literal("paused"));

export const businessPromptStateValidator = v.union(
  v.literal("pending"),
  v.literal("dismissed"),
  v.literal("completed"),
);

export const handleOwnerTypeValidator = v.union(v.literal("user"), v.literal("business"));

export const chatChannelValidator = v.union(v.literal("whatsapp"), v.literal("instagram"));

export const chatSessionStatusValidator = v.union(
  v.literal("bot"),
  v.literal("human"),
  v.literal("closed"),
);

export const billSplitModeValidator = v.union(v.literal("equal"), v.literal("custom"));

export const billSplitStatusValidator = v.union(
  v.literal("open"),
  v.literal("partially_paid"),
  v.literal("settled"),
  v.literal("cancelled"),
);

export type OrderChannel = Infer<typeof orderChannelValidator>;

export type OrderStatus = Infer<typeof orderStatusValidator>;

export type PaymentMethod = Infer<typeof paymentMethodValidator>;

export type PaymentStatus = Infer<typeof paymentStatusValidator>;

export type BankAccountType = Infer<typeof bankAccountTypeValidator>;

export type BankAccountStatus = Infer<typeof bankAccountStatusValidator>;

export type BillSplitMode = Infer<typeof billSplitModeValidator>;

export type BillSplitStatus = Infer<typeof billSplitStatusValidator>;

/** Snapshot de precio: la orden no cambia si el producto cambia después. */
export const orderItemValidator = v.object({
  productId: v.optional(v.id("products")),
  name: v.string(),
  unitPriceCents: v.number(),
  quantity: v.number(),
  totalCents: v.number(),
  note: v.optional(v.string()),
});

export const orderCustomerValidator = v.object({
  name: v.optional(v.string()),
  phone: v.optional(v.string()),
  handle: v.optional(v.string()),
});

const chatMessageValidator = v.object({
  role: v.union(v.literal("customer"), v.literal("assistant"), v.literal("system")),
  text: v.string(),
  at: v.number(),
  orderId: v.optional(v.id("orders")),
});

export default defineSchema({
  /**
   * Perfil de dominio. La identidad y las sesiones viven en el componente
   * Better Auth; aquí solo se enlaza con `authUserId` (identity.subject).
   */
  users: defineTable({
    authUserId: v.string(),
    displayName: v.string(),
    phone: v.optional(v.string()), // E.164
    phoneVerified: v.boolean(),
    avatarStorageId: v.optional(v.id("_storage")),
    bio: v.optional(v.string()),
    // Solo existe en cuentas creadas después del onboarding de negocios.
    businessPromptState: v.optional(businessPromptStateValidator),
    accountType: v.optional(v.union(v.literal("personal"), v.literal("business"))),
    onboardingCompletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_auth_user", ["authUserId"])
    .index("by_phone", ["phone"])
    .index("by_avatar_storage", ["avatarStorageId"]),

  /**
   * Registro único de handles para que `@usuario` y `@negocio` compartan
   * namespace. Es la fuente de verdad del routing de cozi.mx/@handle.
   */
  handles: defineTable({
    handle: v.string(), // minúsculas, sin @
    ownerType: handleOwnerTypeValidator,
    userId: v.optional(v.id("users")),
    businessId: v.optional(v.id("businesses")),
    createdAt: v.number(),
  })
    .index("by_handle", ["handle"])
    .index("by_user", ["userId"])
    .index("by_business", ["businessId"]),

  /**
   * Agenda personal de @handles. `nickname` es solo para el dueño; el perfil
   * real sigue viviendo en `users` y puede cambiar sin romper el contacto.
   */
  contacts: defineTable({
    ownerId: v.id("users"),
    handleId: v.id("handles"),
    nickname: v.optional(v.string()),
    lastUsedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_handle", ["ownerId", "handleId"]),

  /**
   * Cuenta receptora en Pey. Nunca guardamos CLABE/tarjeta completa:
   * Pey es la fuente de verdad y aquí solo queda la referencia y la máscara.
   */
  bankAccounts: defineTable({
    userId: v.id("users"),
    businessId: v.optional(v.id("businesses")),
    peyBankAccountId: v.optional(v.string()),
    accountType: bankAccountTypeValidator,
    accountNumberMasked: v.string(), // "•••• 1234"
    holderName: v.string(),
    institution: v.optional(v.string()),
    status: bankAccountStatusValidator,
    providerStatus: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    isDefault: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    verifiedAt: v.optional(v.number()),
    lastCheckedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_business", ["businessId"])
    .index("by_pey_account", ["peyBankAccountId"])
    .index("by_status", ["status"]),

  businesses: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    status: businessStatusValidator,
    acceptingOrders: v.boolean(),
    tipsEnabled: v.boolean(),
    defaultBankAccountId: v.optional(v.id("bankAccounts")),
    channels: v.object({
      whatsapp: v.optional(
        v.object({
          phoneNumberId: v.string(),
          displayName: v.optional(v.string()),
          enabled: v.boolean(),
        }),
      ),
      instagram: v.optional(
        v.object({
          accountId: v.string(),
          username: v.optional(v.string()),
          enabled: v.boolean(),
        }),
      ),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_logo_storage", ["logoStorageId"])
    .index("by_status", ["status"])
    .index("by_whatsapp_phone_number_id", ["channels.whatsapp.phoneNumberId"])
    .index("by_instagram_account_id", ["channels.instagram.accountId"]),

  products: defineTable({
    businessId: v.id("businesses"),
    name: v.string(),
    description: v.optional(v.string()),
    priceCents: v.number(), // MXN en centavos, nunca floats
    sku: v.optional(v.string()),
    category: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    stock: v.optional(v.number()), // undefined = sin control de inventario
    active: v.boolean(),
    source: v.union(v.literal("manual"), v.literal("vision")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_business", ["businessId"])
    .index("by_image_storage", ["imageStorageId"])
    .index("by_business_active", ["businessId", "active"])
    .index("by_business_sku", ["businessId", "sku"]),

  /**
   * Una orden es el contrato con el comprador. `publicId` es el token
   * improbable que se usa en cozi.mx/pagar/:publicId; no se expone el _id.
   */
  orders: defineTable({
    publicId: v.string(),
    businessId: v.optional(v.id("businesses")), // ausente en P2P
    sellerId: v.id("users"), // receptor; en negocio es el dueño
    buyerId: v.optional(v.id("users")), // si el comprador ya es usuario Cozi
    channel: orderChannelValidator,
    // "send" = lo inicia el pagador; "request" = lo inicia el receptor.
    p2pKind: v.optional(v.union(v.literal("send"), v.literal("request"))),
    status: orderStatusValidator,
    items: v.array(orderItemValidator),
    subtotalCents: v.number(),
    discountCents: v.number(),
    tipCents: v.number(),
    totalCents: v.number(),
    currency: v.literal("MXN"),
    customer: orderCustomerValidator,
    note: v.optional(v.string()),
    chatSessionId: v.optional(v.id("chatSessions")),
    billSplitId: v.optional(v.id("billSplits")),
    paymentId: v.optional(v.id("payments")), // intento vigente o el pagado
    paidAt: v.optional(v.number()),
    fulfilledAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_public_id", ["publicId"])
    .index("by_business_created", ["businessId", "createdAt"])
    .index("by_business_status_created", ["businessId", "status", "createdAt"])
    .index("by_business_channel_created", ["businessId", "channel", "createdAt"])
    .index("by_seller_created", ["sellerId", "createdAt"])
    .index("by_buyer_created", ["buyerId", "createdAt"])
    .index("by_chat_session", ["chatSessionId"])
    .index("by_bill_split", ["billSplitId"])
    .index("by_status_created", ["status", "createdAt"]),

  /**
   * División de una cuenta ya pagada entre varios usuarios mediante cobros P2P.
   * Los participantes se representan como órdenes P2P hijas indexadas por `billSplitId`.
   */
  billSplits: defineTable({
    sourceOrderId: v.id("orders"),
    creatorId: v.id("users"),
    businessId: v.optional(v.id("businesses")),
    mode: billSplitModeValidator,
    status: billSplitStatusValidator,
    totalCents: v.number(),
    creatorShareCents: v.number(),
    requestedTotalCents: v.number(),
    collectedCents: v.number(),
    participantCount: v.number(),
    paidParticipantCount: v.number(),
    currency: v.literal("MXN"),
    note: v.optional(v.string()),
    settledAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_source_order", ["sourceOrderId"])
    .index("by_creator_created", ["creatorId", "createdAt"]),

  /**
   * Intento de cobro. `attemptId` idempotencia el inicio; `peyReference` es
   * el id principal que devuelve Pey y la llave de conciliación del webhook.
   */
  payments: defineTable({
    orderId: v.id("orders"),
    businessId: v.optional(v.id("businesses")),
    attemptId: v.string(),
    method: paymentMethodValidator,
    status: paymentStatusValidator,
    amountCents: v.number(),
    currency: v.literal("MXN"),
    peyReference: v.optional(v.string()),
    peyPaymentId: v.optional(v.string()),
    peyPaymentLinkId: v.optional(v.string()),
    peyCodiId: v.optional(v.string()),
    peyTransactionId: v.optional(v.string()),
    checkoutUrl: v.optional(v.string()),
    qrImageUrl: v.optional(v.string()),
    deepLink: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    paidAt: v.optional(v.number()),
    reconciliationAttempts: v.optional(v.number()),
    nextReconciliationAt: v.optional(v.number()),
    reconciliationIssue: v.optional(
      v.union(
        v.literal("missing_reference"),
        v.literal("mock_reference"),
        v.literal("retry_limit"),
      ),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_order", ["orderId"])
    .index("by_attempt_id", ["attemptId"])
    .index("by_pey_reference", ["peyReference"])
    .index("by_pey_payment_id", ["peyPaymentId"])
    .index("by_pey_link_id", ["peyPaymentLinkId"])
    .index("by_pey_codi_id", ["peyCodiId"])
    .index("by_pey_transaction_id", ["peyTransactionId"])
    .index("by_status", ["status"])
    .index("by_status_reconciliationIssue_nextReconciliationAt_createdAt", [
      "status",
      "reconciliationIssue",
      "nextReconciliationAt",
      "createdAt",
    ])
    .index("by_reconciliationIssue", ["reconciliationIssue"])
    .index("by_business_created", ["businessId", "createdAt"]),

  /**
   * Conversación del agente de ventas. El historial se guarda embebido
   * (se recorta a los últimos N mensajes al escribir) para que una sola
   * lectura reconstruya el contexto del LLM.
   */
  chatSessions: defineTable({
    businessId: v.id("businesses"),
    channel: chatChannelValidator,
    externalThreadId: v.string(), // wa_id de WhatsApp o IGSID de Instagram
    participant: v.object({
      name: v.optional(v.string()),
      handle: v.optional(v.string()),
      phone: v.optional(v.string()),
    }),
    status: chatSessionStatusValidator,
    messages: v.array(chatMessageValidator),
    lastOrderId: v.optional(v.id("orders")),
    lastMessageAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_business_last_message", ["businessId", "lastMessageAt"])
    .index("by_channel_thread", ["channel", "externalThreadId"])
    .index("by_status", ["status"]),

  /**
   * Hilo de mensajería entre dos personas. Nace de una orden o de un negocio,
   * nunca de un @handle suelto. `chatSessions` sigue siendo el chat de ventas
   * con IA por WhatsApp/Instagram; estas tablas son la base del inbox en app.
   */
  messageThreads: defineTable({
    orderId: v.optional(v.id("orders")),
    businessId: v.optional(v.id("businesses")),
    customerId: v.id("users"),
    ownerId: v.id("users"),
    channel: v.literal("app"),
    externalThreadId: v.optional(v.string()), // futuro WhatsApp/Instagram
    customerLastReadAt: v.optional(v.number()),
    ownerLastReadAt: v.optional(v.number()),
    lastMessageAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_order", ["orderId"])
    .index("by_business_customer", ["businessId", "customerId"])
    .index("by_customer_last_message", ["customerId", "lastMessageAt"])
    .index("by_owner_last_message", ["ownerId", "lastMessageAt"]),

  /** Mensajes de texto de un hilo. Sin adjuntos ni notas de voz por ahora. */
  messages: defineTable({
    threadId: v.id("messageThreads"),
    senderId: v.id("users"),
    text: v.string(),
    createdAt: v.number(),
  }).index("by_thread_created", ["threadId", "createdAt"]),

  /**
   * Bitácora e idempotencia de webhooks de Pey. Evita doble descuento de
   * inventario cuando Pey reintenta la misma entrega.
   */
  peyWebhookEvents: defineTable({
    eventId: v.string(),
    type: v.string(),
    payloadHash: v.string(),
    reference: v.optional(v.string()),
    status: v.union(
      v.literal("received"),
      v.literal("processed"),
      v.literal("ignored"),
      v.literal("failed"),
    ),
    error: v.optional(v.string()),
    attempts: v.number(),
    receivedAt: v.number(),
    processedAt: v.optional(v.number()),
  })
    .index("by_event_id", ["eventId"])
    .index("by_status", ["status"]),
});
