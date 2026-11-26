import { api } from "@cozi/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { Field, Form, Page, field } from "@/components/cozi";
import type { Profile } from "@/lib/profile";

export function BusinessFields() {
  return (
    <>
      <Field
        name="businessName"
        label="Nombre de tu negocio"
        required
        minLength={2}
        maxLength={50}
        autoComplete="organization"
      />
      <Field
        name="businessHandle"
        label="@handle del negocio"
        maxLength={21}
        autoCapitalize="none"
        autoCorrect="off"
        hint="Puedes dejarlo vacío para generarlo con el nombre."
      />
      <Field name="category" label="Categoría" maxLength={40} />
    </>
  );
}

export function businessFields(data: FormData) {
  return {
    name: field(data, "businessName"),
    handle: field(data, "businessHandle") || undefined,
    category: field(data, "category") || undefined,
  };
}

export default function Onboarding({ profile }: { profile: Profile | null }) {
  const authUser = useQuery(api.auth.getCurrentUser);
  const finishOnboarding = useMutation(api.users.finishOnboarding);
  const [accountType, setAccountType] = useState(profile?.accountType ?? "personal");
  const business = (profile?.accountType ?? accountType) === "business";

  return (
    <Page
      title="Configura tu cuenta"
      subtitle="Usa tu @handle para que te encuentren y te paguen en Cozi."
    >
      <Form
        submit="Continuar"
        onSubmit={(data) =>
          finishOnboarding({
            accountType: profile?.accountType ?? accountType,
            displayName: field(data, "displayName"),
            handle: field(data, "handle"),
            business: business && !profile?.business ? businessFields(data) : undefined,
          })
        }
      >
        {!profile && (
          <label className="field">
            Tipo de cuenta
            <select
              className="field-control"
              value={accountType}
              onChange={(event) =>
                setAccountType(event.target.value === "business" ? "business" : "personal")
              }
            >
              <option value="personal">Personal</option>
              <option value="business">Negocio</option>
            </select>
          </label>
        )}
        <Field
          name="displayName"
          label="Tu nombre"
          placeholder={authUser?.name ?? undefined}
          defaultValue={profile?.displayName ?? authUser?.name ?? ""}
          required
          minLength={2}
          maxLength={50}
        />
        <Field
          name="handle"
          label="Tu @handle"
          defaultValue={profile?.handle ?? ""}
          required
          minLength={3}
          maxLength={21}
          autoCapitalize="none"
          autoCorrect="off"
          pattern="@?[a-zA-Z0-9_]{3,20}"
          hint="Usa de 3 a 20 letras, números o guiones bajos."
        />
        {business && !profile?.business && <BusinessFields />}
      </Form>
    </Page>
  );
}
