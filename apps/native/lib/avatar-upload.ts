import type { Id } from "@cozi/backend/convex/_generated/dataModel";
import { uploadImage } from "@cozi/backend/image-upload";

/** Debe coincidir con el límite que valida `setAvatar`. */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

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

  return await uploadImage(blob, blob.type || "image/jpeg", generateUploadUrl);
}
