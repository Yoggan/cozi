import { Form } from "@/components/cozi";
import { authClient } from "@/lib/auth-client";

export default function SignOutForm() {
  return (
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
  );
}
