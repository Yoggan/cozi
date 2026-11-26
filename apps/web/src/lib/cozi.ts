import { ConvexError } from "convex/values";

const pesos = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const dates = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

export function money(cents: number) {
  return pesos.format(cents / 100);
}

export function dateTime(timestamp: number) {
  return dates.format(timestamp);
}

export function centsFromInput(input: string) {
  const value = input.trim().replace(",", ".");

  if (!/^\d+(\.\d{0,2})?$/.test(value)) {
    return null;
  }

  const cents = Math.round(Number(value) * 100);

  return Number.isSafeInteger(cents) ? cents : null;
}

export function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }

  return fallback;
}

export const orderLabels = {
  draft: "Por pagar",
  awaiting_payment: "Pendiente de pago",
  paid: "Pagado",
  fulfilled: "Entregado",
  cancelled: "Cancelado",
  expired: "Vencido",
};

export function paid(status: keyof typeof orderLabels) {
  return status === "paid" || status === "fulfilled";
}

export function payable(status: keyof typeof orderLabels) {
  return status === "draft" || status === "awaiting_payment";
}

export const accentOptions = {
  emerald: "Esmeralda",
  sky: "Cielo",
  indigo: "Índigo",
  amber: "Ámbar",
  rose: "Rosa",
  silver: "Plata",
};
