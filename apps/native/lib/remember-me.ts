import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";

const REMEMBER_ME_KEY = "cozi.auth.rememberMe.v1";
const REMEMBERED_EMAIL_KEY = "cozi.auth.rememberedEmail.v1";
const EPHEMERAL_SESSION_KEY = "cozi.auth.ephemeralSession.v1";

export async function loadRememberMe(): Promise<{ rememberMe: boolean; email: string }> {
  try {
    const [storedRememberMe, storedEmail] = await Promise.all([
      getItemAsync(REMEMBER_ME_KEY),
      getItemAsync(REMEMBERED_EMAIL_KEY),
    ]);

    return { rememberMe: storedRememberMe !== "0", email: storedEmail ?? "" };
  } catch {
    // SecureStore is unavailable (for example on web): fall back to defaults.
    return { rememberMe: true, email: "" };
  }
}

export async function saveRememberMeOnSignIn(rememberMe: boolean, email: string): Promise<void> {
  try {
    await setItemAsync(REMEMBER_ME_KEY, rememberMe ? "1" : "0");

    if (rememberMe) {
      await setItemAsync(REMEMBERED_EMAIL_KEY, email.trim());
      await deleteItemAsync(EPHEMERAL_SESSION_KEY);
      return;
    }

    await deleteItemAsync(REMEMBERED_EMAIL_KEY);
    await setItemAsync(EPHEMERAL_SESSION_KEY, "1");
  } catch {
    // SecureStore is unavailable (for example on web): the preference is not persisted.
  }
}

export async function consumeEphemeralSessionFlag(): Promise<boolean> {
  try {
    if ((await getItemAsync(EPHEMERAL_SESSION_KEY)) !== "1") {
      return false;
    }

    await deleteItemAsync(EPHEMERAL_SESSION_KEY);
    return true;
  } catch {
    // SecureStore is unavailable (for example on web): no session to end.
    return false;
  }
}
