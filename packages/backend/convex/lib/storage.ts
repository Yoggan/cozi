import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Un archivo que ya pertenece a una cuenta, negocio, producto o subida pendiente
 * no se puede reclamar ni borrar desde otra mutación.
 */
export async function isStorageReferenced(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  excludePendingId?: Id<"pendingProductPhotos">,
): Promise<boolean> {
  const [avatar, logo, productImage, pendingPhotos] = await Promise.all([
    ctx.db
      .query("users")
      .withIndex("by_avatar_storage", (q) => q.eq("avatarStorageId", storageId))
      .first(),
    ctx.db
      .query("businesses")
      .withIndex("by_logo_storage", (q) => q.eq("logoStorageId", storageId))
      .first(),
    ctx.db
      .query("products")
      .withIndex("by_image_storage", (q) => q.eq("imageStorageId", storageId))
      .first(),
    ctx.db
      .query("pendingProductPhotos")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .take(2),
  ]);

  const otherPending = pendingPhotos.find((row) => row._id !== excludePendingId);

  return Boolean(avatar ?? logo ?? productImage ?? otherPending);
}
