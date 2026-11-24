import type { Id } from "@cozi/backend/convex/_generated/dataModel";

/** Debe coincidir con el límite que valida `setAvatar`. */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

function isUploadResponse(value: unknown): value is { storageId: Id<"_storage"> } {
  return (
    typeof value === "object" &&
    value !== null &&
    "storageId" in value &&
    typeof value.storageId === "string"
  );
}

/**
 * Sube una imagen local a Convex Storage y devuelve el id del archivo.
 * El `uploadUrl` lo emite `api.users.generateAvatarUploadUrl`.
 */
export async function uploadAvatar(
  uri: string,
  generateUploadUrl: () => Promise<string>,
): Promise<Id<"_storage">> {
  const local = await fetch(uri);
  const blob = await local.blob();
  const uploadUrl = await generateUploadUrl();

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": blob.type || "image/jpeg" },
    body: blob,
  });

  if (!response.ok) {
    throw new Error("No pudimos subir la foto");
  }

  const body: unknown = await response.json();

  if (!isUploadResponse(body)) {
    throw new Error("No pudimos subir la foto");
  }

  return body.storageId;
}
