import { ConvexError } from "convex/values";

import type { Id } from "./convex/_generated/dataModel";

const MAX_PRODUCT_PHOTO_BYTES = 5 * 1024 * 1024;
const PRODUCT_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const PRODUCT_PHOTO_ACCEPT = PRODUCT_PHOTO_TYPES.join(",");

export function getProductPhotoValidationError(
  size: number,
  contentType: string | undefined,
): string | null {
  if (!contentType || !PRODUCT_PHOTO_TYPES.includes(contentType) || size === 0) {
    return "Elige una foto en formato JPG, PNG o WebP";
  }

  if (size > MAX_PRODUCT_PHOTO_BYTES) {
    return "La foto no puede pasar de 5 MB";
  }

  return null;
}

export function validateProductPhoto(size: number, contentType: string | undefined) {
  const message = getProductPhotoValidationError(size, contentType);

  if (message) {
    throw new ConvexError(message);
  }
}

function isUploadResponse(value: unknown): value is { storageId: Id<"_storage"> } {
  return (
    typeof value === "object" &&
    value !== null &&
    "storageId" in value &&
    typeof value.storageId === "string"
  );
}

export async function uploadImage(
  blob: Blob,
  contentType: string,
  generateUploadUrl: () => Promise<string>,
): Promise<Id<"_storage">> {
  const uploadUrl = await generateUploadUrl();

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: blob,
  });

  if (!response.ok) {
    throw new ConvexError("No pudimos subir la foto");
  }

  const body: unknown = await response.json();

  if (!isUploadResponse(body)) {
    throw new ConvexError("No pudimos subir la foto");
  }

  return body.storageId;
}
