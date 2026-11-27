import { ConvexError } from "convex/values";

import type { OrderStatus } from "../schema";
import { isOrderOpen } from "./stateMachines";

// La vigencia del cobro es local: Pey solo vence cada QR o push, no la orden.
export const DEFAULT_EXPIRY_MINUTES = 24 * 60;
export const MAX_EXPIRY_MINUTES = 7 * 24 * 60;

/** Guardado en `orders.expiresAt` para los cobros que no vencen. */
export const NEVER_EXPIRES = 0;

/** `0` means the cobro never expires. */
export function expiryFromMinutes(minutes: number | undefined, now: number): number {
  if (minutes === undefined) {
    return now + DEFAULT_EXPIRY_MINUTES * 60 * 1000;
  }

  if (minutes === 0) {
    return NEVER_EXPIRES;
  }

  if (!Number.isFinite(minutes) || minutes < 5 || minutes > MAX_EXPIRY_MINUTES) {
    throw new ConvexError("La vigencia del cobro debe estar entre 5 minutos y 7 días");
  }

  return now + Math.round(minutes) * 60 * 1000;
}

/**
 * Órdenes anteriores a esta función no tienen `expiresAt`. A los cobros P2P
 * se les aplica la vigencia por defecto; envíos y pedidos de negocio no se
 * marcan retroactivamente.
 */
export function orderDeadline(order: {
  expiresAt?: number;
  createdAt: number;
  p2pKind?: "send" | "request";
}): number {
  if (order.expiresAt !== undefined) {
    return order.expiresAt;
  }

  if (order.p2pKind === "request") {
    return order.createdAt + DEFAULT_EXPIRY_MINUTES * 60 * 1000;
  }

  return NEVER_EXPIRES;
}

export function effectiveOrderStatus(
  status: OrderStatus,
  deadline: number,
  now: number,
): OrderStatus {
  if (isOrderOpen(status) && deadline !== NEVER_EXPIRES && deadline <= now) {
    return "expired";
  }

  return status;
}
