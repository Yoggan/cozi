import { api } from "@cozi/backend/convex/_generated/api";
import { buttonVariants } from "@cozi/ui/components/button";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { toast } from "sonner";

import BankAccounts from "@/components/bank-accounts";
import { Field, Form, Page, field } from "@/components/cozi";
import { BusinessFields, businessFields } from "@/components/onboarding";
import { useProfile } from "@/lib/profile";

export const Route = createFileRoute("/_auth/business/")({ component: Business });

function Business() {
  const { business } = useProfile();
  const create = useMutation(api.businesses.create);
  const update = useMutation(api.businesses.update);

  if (!business) {
    return (
      <Page title="Crea tu negocio" subtitle="Publica tu catálogo y recibe pagos con Cozi.">
        <Form
          submit="Crear negocio"
          onSubmit={async (data) => {
            await create(businessFields(data));
            toast.success("Negocio creado");
          }}
        >
          <BusinessFields />
        </Form>
      </Page>
    );
  }

  return (
    <Page title={business.name} subtitle={business.handle ? `@${business.handle}` : undefined} wide>
      <nav aria-label="Gestionar negocio" className="flex flex-wrap gap-2">
        <Link to="/business/new-order" className={buttonVariants()}>
          Nuevo pedido
        </Link>
        <Link to="/business/orders" className={buttonVariants({ variant: "secondary" })}>
          Pedidos
        </Link>
        <Link to="/business/closeout" className={buttonVariants({ variant: "secondary" })}>
          Corte diario
        </Link>
        <Link to="/business/catalog" className={buttonVariants({ variant: "secondary" })}>
          Catálogo
        </Link>
        <Link to="/messages" className={buttonVariants({ variant: "secondary" })}>
          Mensajes
        </Link>
        {business.handle && (
          <Link
            to="/b/$handle"
            params={{ handle: business.handle }}
            className={buttonVariants({ variant: "ghost" })}
          >
            Ver página pública
          </Link>
        )}
      </nav>
      <div className="grid items-start gap-6 md:grid-cols-2">
        <Form
          id="configurar-pedidos"
          submit="Guardar negocio"
          onSubmit={async (data) => {
            await update({
              businessId: business._id,
              name: field(data, "name"),
              category: field(data, "category"),
              status: data.has("active") ? "active" : "paused",
              acceptingOrders: data.has("takingOrders"),
              tipsEnabled: data.has("tips"),
            });
            toast.success("Negocio actualizado");
          }}
        >
          <h2 className="section-title">Perfil del negocio</h2>
          <Field
            name="name"
            label="Nombre"
            defaultValue={business.name}
            minLength={2}
            maxLength={50}
            required
          />
          <Field
            name="category"
            label="Categoría"
            defaultValue={business.category ?? ""}
            maxLength={40}
          />
          <label className="flex items-center gap-2">
            <input type="checkbox" name="active" defaultChecked={business.status === "active"} />{" "}
            Publicar mi negocio
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="takingOrders" defaultChecked={business.acceptingOrders} />{" "}
            Aceptar pedidos
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="tips" defaultChecked={business.tipsEnabled} /> Permitir
            propinas
          </label>
        </Form>
        <div id="cuenta-receptora" className="stack">
          <h2 className="section-title">Cuenta bancaria del negocio</h2>
          <BankAccounts businessId={business._id} />
        </div>
      </div>
    </Page>
  );
}
