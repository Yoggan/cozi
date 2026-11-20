export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

/** Normaliza un @handle: minúsculas, sin acentos ni símbolos. */
export function normalizeHandle(value: string): string {
  return value
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9_]/g, "")
    .slice(0, 20);
}

/** Propone un handle legible a partir del nombre o correo. */
export function handleBase(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email?.split("@")[0] || "cozi";
  const base = normalizeHandle(source)
    .replaceAll(/_+/g, "_")
    .replaceAll(/^_+|_+$/g, "");

  return (base.length >= 3 ? base : `cozi${base}`).slice(0, 20);
}
