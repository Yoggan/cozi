import { HANDLE_PATTERN, normalizeHandle } from "@cozi/backend/convex/lib/identifiers";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ConvexError } from "convex/values";

import { Field, Form, Page, field } from "@/components/cozi";
import { buttonVariants } from "@cozi/ui/components/button";

export const Route = createFileRoute("/")({ component: HomePage });

function HomePage() {
  const navigate = useNavigate();

  return (
    <Page
      title="Paga y cobra con tu @handle"
      subtitle="Encuentra a tu gente y compra en negocios de Cozi."
    >
      <Link to="/dashboard" className={buttonVariants({ size: "lg" })}>
        Entra a Cozi
      </Link>
      <Form
        submit="Buscar negocio"
        variant="secondary"
        onSubmit={async (data) => {
          const handle = normalizeHandle(field(data, "handle"));

          if (!HANDLE_PATTERN.test(handle)) {
            throw new ConvexError("Escribe un @handle válido.");
          }

          await navigate({ to: "/b/$handle", params: { handle } });
        }}
      >
        <Field
          name="handle"
          label="@handle del negocio"
          placeholder="@nombre_del_negocio"
          required
          maxLength={21}
          autoCapitalize="none"
          autoCorrect="off"
        />
      </Form>
    </Page>
  );
}
