import { expect, test } from "vitest";

import { createTestBackend } from "../test-utils/harness";
import { api } from "./_generated/api";

test("el onboarding de negocio guarda el perfil solo si puede crear el negocio", async () => {
  const t = createTestBackend();
  const client = t.withIdentity({ subject: "new_merchant", name: "Ana", email: "ana@cozi.test" });

  const profile = {
    accountType: "business" as const,
    displayName: "Ana Pérez",
    handle: "ana_perez",
  };

  await expect(
    client.mutation(api.users.finishOnboarding, {
      ...profile,
      business: { name: "Pan de Ana", handle: profile.handle },
    }),
  ).rejects.toThrow("Ese @handle ya está ocupado");
  expect(await client.query(api.users.getMe, {})).toBeNull();

  await client.mutation(api.users.finishOnboarding, {
    ...profile,
    business: { name: "Pan de Ana", handle: "pan_de_ana" },
  });
  expect(await client.query(api.users.getMe, {})).toMatchObject({
    handle: profile.handle,
    accountType: "business",
    onboardingCompleted: true,
    business: { handle: "pan_de_ana" },
  });
});
