import { api } from "@cozi/backend/convex/_generated/api";
import { buttonVariants } from "@cozi/ui/components/button";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { z } from "zod";

import Appearance from "@/components/appearance";
import { Avatar, Field, Form, Page, field } from "@/components/cozi";
import { authClient } from "@/lib/auth-client";
import { useProfile } from "@/lib/profile";

export const Route = createFileRoute("/_auth/profile")({ component: ProfilePage });

function ProfilePage() {
  const profile = useProfile();
  const update = useMutation(api.users.updateProfile);
  const uploadUrl = useMutation(api.users.generateAvatarUploadUrl);
  const setAvatar = useMutation(api.users.setAvatar);
  const removeAvatar = useMutation(api.users.removeAvatar);

  return (
    <Page title="Perfil">
      <div className="panel flex items-center gap-3">
        <Avatar name={profile.displayName} src={profile.avatarUrl} />
        <div className="min-w-0">
          <h2 className="section-title break-words">{profile.displayName}</h2>
          <p className="text-sm text-muted-foreground">
            @{profile.handle} · {profile.accountType === "business" ? "Negocio" : "Personal"}
          </p>
        </div>
      </div>
      <nav aria-label="Opciones de cuenta" className="flex flex-wrap gap-2">
        <Link to="/accounts" className={buttonVariants({ variant: "secondary" })}>
          Cuenta bancaria
        </Link>
        <Link to="/contacts" className={buttonVariants({ variant: "secondary" })}>
          Contactos
        </Link>
        <Link to="/business" className={buttonVariants({ variant: "secondary" })}>
          Mi negocio
        </Link>
      </nav>
      <Form
        submit="Guardar perfil"
        onSubmit={async (data) => {
          await update({
            displayName: field(data, "displayName"),
            handle: field(data, "handle"),
            bio: field(data, "bio"),
          });
          toast.success("Perfil actualizado");
        }}
      >
        <h2 className="section-title">Editar perfil</h2>
        <Field
          name="displayName"
          label="Tu nombre"
          defaultValue={profile.displayName}
          minLength={2}
          maxLength={50}
          required
        />
        <Field
          name="handle"
          label="Tu @handle"
          defaultValue={profile.handle ?? ""}
          maxLength={21}
          required
          autoCapitalize="none"
          autoCorrect="off"
          pattern="@?[a-zA-Z0-9_]{3,20}"
        />
        <Field name="bio" label="Bio" defaultValue={profile.bio ?? ""} maxLength={160} />
      </Form>
      <section className="panel stack">
        <Form
          className="stack"
          submit="Guardar foto"
          variant="secondary"
          fallback="No pudimos guardar tu foto."
          onSubmit={async (data) => {
            const photo = data.get("photo");

            if (
              !photo ||
              typeof photo === "string" ||
              !photo.type.startsWith("image/") ||
              photo.size === 0
            ) {
              throw new ConvexError("Elige una imagen.");
            }

            if (photo.size > 5 * 1024 * 1024) {
              throw new ConvexError("La foto no puede pasar de 5 MB.");
            }

            const response = await fetch(await uploadUrl({}), {
              method: "POST",
              headers: { "Content-Type": photo.type },
              body: photo,
            });

            if (!response.ok) {
              throw new Error("Falló la carga de la imagen");
            }

            const { storageId } = z
              .object({
                storageId: z.custom<Parameters<typeof setAvatar>[0]["storageId"]>(
                  (value) => typeof value === "string",
                ),
              })
              .parse(await response.json());

            const result = await setAvatar({ storageId, expectedUserId: profile._id });

            if (result.status === "rejected") {
              throw new ConvexError(result.message);
            }

            toast.success("Foto actualizada");
          }}
        >
          <Field
            name="photo"
            label="Cambiar foto de perfil"
            type="file"
            accept="image/*"
            required
          />
        </Form>
        {profile.avatarUrl && (
          <Form
            className="stack"
            submit="Quitar foto"
            variant="ghost"
            onSubmit={() => removeAvatar({})}
          />
        )}
      </section>
      <Appearance />
      <Form
        className="stack"
        submit="Cerrar sesión"
        variant="ghost"
        fallback="No pudimos cerrar tu sesión. Intenta de nuevo."
        onSubmit={async () => {
          const { error } = await authClient.signOut();

          if (error) {
            throw new Error(error.code);
          }

          window.location.assign("/");
        }}
      />
    </Page>
  );
}
