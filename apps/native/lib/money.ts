export function formatMxn(cents: number): string {
  const amount = cents / 100;

  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

/** Convierte "123.45" o "1,234.5" a centavos. Devuelve null si no es válido. */
export function parseAmountToCents(value: string): number | null {
  const normalized = value.replaceAll(",", "").replaceAll(/[^\d.]/g, "");

  if (!normalized || normalized === ".") {
    return null;
  }

  const amount = Number(normalized);

  if (!Number.isFinite(amount)) {
    return null;
  }

  return Math.round(amount * 100);
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
