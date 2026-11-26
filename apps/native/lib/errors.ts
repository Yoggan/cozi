import { ConvexError } from "convex/values";

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError) {
    const data: unknown = error.data;

    if (typeof data === "string") {
      const trimmed = data.trim();

      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    if (typeof data === "object" && data !== null && "message" in data) {
      const message: unknown = data.message;

      if (typeof message === "string") {
        const trimmed = message.trim();

        if (trimmed.length > 0) {
          return trimmed;
        }
      }
    }
  }

  return fallback;
}
