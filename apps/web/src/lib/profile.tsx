import type { api } from "@cozi/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { createContext, useContext } from "react";

export type Profile = NonNullable<FunctionReturnType<typeof api.users.getMe>>;

export const ProfileContext = createContext<Profile | null>(null);

export function useProfile() {
  const profile = useContext(ProfileContext);

  if (!profile) {
    throw new Error("Falta el perfil de Cozi");
  }

  return profile;
}

export function needsOnboarding(profile: Profile) {
  return (
    !profile.handle ||
    (profile.accountType === "business" ? !profile.business : !profile.onboardingCompleted)
  );
}
