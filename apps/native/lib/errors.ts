import { ConvexError } from "convex/values";

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError) {
    const data: unknown = error.data;

    if (typeof data === "string" && data.trim().length > 0) {
      return data;
    }

    if (typeof data === "object" && data !== null && "message" in data) {
      const message: unknown = data.message;

      if (typeof message === "string" && message.trim().length > 0) {
        return message;
      }
    }
  }

  if (error instanceof Error) {
    const match = /Uncaught ConvexError:\s*(.+?)(?:\n|$)/.exec(error.message);

    if (match?.[1]?.trim()) {
      return match[1].trim();
    }

    if (!error.message.startsWith("[CONVEX ") && error.message.trim().length > 0) {
      return error.message;
    }
  }

  return fallback;
}
