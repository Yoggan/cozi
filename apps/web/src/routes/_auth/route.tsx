import { api } from "@cozi/backend/convex/_generated/api";
import { Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { useState } from "react";

import { Page } from "@/components/cozi";
import Loader from "@/components/loader";
import Onboarding from "@/components/onboarding";
import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import { ProfileContext, needsOnboarding } from "@/lib/profile";

export const Route = createFileRoute("/_auth")({ component: AuthLayout });

function AuthLayout() {
  const { token } = Route.useRouteContext();
  const { isAuthenticated, isLoading } = useConvexAuth();

  if (isAuthenticated) {
    return <ProfileGate />;
  }

  if (isLoading && token) {
    return <Loader />;
  }

  return <AuthScreen />;
}

function AuthScreen() {
  const [signUp, setSignUp] = useState(false);

  const oauthError = useLocation({
    select: (location) => new URLSearchParams(location.searchStr).has("error"),
  });

  return (
    <Page
      title={signUp ? "Crea tu cuenta" : "Entra a Cozi"}
      subtitle="Envía y cobra con tu @handle."
    >
      {oauthError && (
        <p role="alert" className="text-sm text-destructive">
          No pudimos iniciar sesión con Google. Intenta de nuevo.
        </p>
      )}
      {signUp ? (
        <SignUpForm onSwitchToSignIn={() => setSignUp(false)} />
      ) : (
        <SignInForm onSwitchToSignUp={() => setSignUp(true)} />
      )}
    </Page>
  );
}

function ProfileGate() {
  const profile = useQuery(api.users.getMe);

  if (profile === undefined) {
    return <Loader />;
  }

  if (!profile || needsOnboarding(profile)) {
    return <Onboarding profile={profile} />;
  }

  return (
    <ProfileContext.Provider value={profile}>
      <Outlet />
    </ProfileContext.Provider>
  );
}
