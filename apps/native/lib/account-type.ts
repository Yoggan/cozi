import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";

export type AccountType = "personal" | "business";

const PENDING_ACCOUNT_TYPE_KEY = "cozi.pendingAccountType.v1";

/** Se escribe antes del signup y lo consume `ensureProfile`. */
export async function setPendingAccountType(type: AccountType) {
  await setItemAsync(PENDING_ACCOUNT_TYPE_KEY, type);
}

export async function clearPendingAccountType() {
  try {
    await deleteItemAsync(PENDING_ACCOUNT_TYPE_KEY);
  } catch {
    // Best effort: a stale flag can only misclassify a later signup.
  }
}

export async function consumePendingAccountType(): Promise<AccountType> {
  try {
    const value = await getItemAsync(PENDING_ACCOUNT_TYPE_KEY);

    if (value === "business") {
      return "business";
    }

    return "personal";
  } catch {
    return "personal";
  } finally {
    void deleteItemAsync(PENDING_ACCOUNT_TYPE_KEY).catch(() => {});
  }
}
