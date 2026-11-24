/** expo-router entrega un parámetro repetido como arreglo; las pantallas usan el primero. */
export function firstParam(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  return Array.isArray(value) && typeof value[0] === "string" ? value[0] : undefined;
}
