import type { Doc } from "../_generated/dataModel";

export function isVerifiedReceivingAccount(
  account: Doc<"bankAccounts"> | null,
): account is Doc<"bankAccounts"> & { peyBankAccountId: string } {
  return account?.status === "verified" && Boolean(account.peyBankAccountId);
}
