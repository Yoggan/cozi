import { AuthFields, GoogleSignIn } from "@/components/sign-in-form";
import { Form, field } from "@/components/cozi";
import { authClient } from "@/lib/auth-client";

export default function SignUpForm({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }) {
  return (
    <div className="panel space-y-4">
      <Form
        className="stack"
        submit="Crea tu cuenta"
        fallback="No pudimos crear tu cuenta. Revisa tu correo y usa una contraseña de al menos 8 caracteres."
        onSubmit={async (data) => {
          const { error } = await authClient.signUp.email({
            name: field(data, "name"),
            email: field(data, "email"),
            password: String(data.get("password") ?? ""),
          });

          if (error) {
            throw new Error(error.code);
          }
        }}
      >
        <AuthFields signup />
      </Form>
      <GoogleSignIn />
      <button
        type="button"
        className="min-h-11 text-sm font-semibold underline underline-offset-4"
        onClick={onSwitchToSignIn}
      >
        Ya tengo cuenta
      </button>
    </div>
  );
}
