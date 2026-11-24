import { expect, test } from "e2e";

/**
 * Alta de cuenta y edición del perfil. No usa modelo: todo se localiza por
 * `testID`, así que el resultado es el mismo en cada corrida.
 *
 * La foto de perfil queda fuera a propósito: elegir una imagen pasa por el
 * selector del sistema, que no forma parte de la app.
 */
test("crea una cuenta y cambia el nombre del perfil", async ({ app, screen }) => {
  const email = `e2e.${Date.now().toString(36)}@cozi.test`;

  await app.open();

  await screen.getByTestId("auth-mode-signup").tap();
  await screen.getByTestId("auth-name").fill("Prueba E2E");
  await screen.getByTestId("auth-email").fill(email);
  await screen.getByTestId("auth-password").fill("CoziTest123");
  await screen.getByTestId("auth-submit").tap();

  await screen.getByTestId("onboarding-skip").tap();

  await screen.getByTestId("home-account").tap();
  await expect(screen.getByTestId("profile-name")).toHaveText("Prueba E2E");

  await screen.getByTestId("profile-edit").tap();
  await screen.getByTestId("edit-profile-name").fill("Prueba Renombrada");
  await screen.getByTestId("edit-profile-save").tap();

  await expect(screen.getByTestId("profile-name")).toHaveText("Prueba Renombrada");
});
