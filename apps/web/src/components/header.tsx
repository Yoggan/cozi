import { api } from "@cozi/backend/convex/_generated/api";
import { buttonVariants } from "@cozi/ui/components/button";
import { Link } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { WalletIcon, ChatCircleTextIcon, ReceiptIcon, StorefrontIcon } from "@phosphor-icons/react";

import UserMenu from "@/components/user-menu";
import { needsOnboarding } from "@/lib/profile";

const personalNav = [
  { to: "/dashboard", label: "Inicio", Icon: WalletIcon },
  { to: "/activity", label: "Actividad", Icon: ReceiptIcon },
  { to: "/messages", label: "Mensajes", Icon: ChatCircleTextIcon },
] as const;

const businessNav = [
  { to: "/dashboard", label: "Inicio", Icon: WalletIcon },
  { to: "/business", label: "Negocio", Icon: StorefrontIcon },
  { to: "/messages", label: "Mensajes", Icon: ChatCircleTextIcon },
] as const;

export default function Header() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const profile = useQuery(api.users.getMe, isAuthenticated ? {} : "skip");
  const ready = profile && !needsOnboarding(profile);
  const nav = profile?.accountType === "business" ? businessNav : personalNav;

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex min-h-17 max-w-5xl items-center justify-between gap-2 px-4 sm:px-8">
        <Link
          to={isAuthenticated ? "/dashboard" : "/"}
          aria-label="Cozi, inicio"
          className="shrink-0 text-[2rem] leading-none font-extrabold tracking-[-0.09em]"
        >
          cozi
        </Link>
        {ready && (
          <nav aria-label="Principal" className="flex min-w-0 items-center gap-1 whitespace-nowrap">
            {nav.map(({ to, label, Icon }) => (
              <Link
                to={to}
                key={to}
                className={buttonVariants({
                  variant: "ghost",
                  size: "icon",
                  className: "sm:w-auto sm:px-4",
                })}
                aria-label={label}
                activeOptions={{ exact: to !== "/business" }}
                activeProps={{
                  className:
                    "bg-foreground/7 text-foreground hover:bg-foreground/7 dark:bg-foreground/10 dark:hover:bg-foreground/10",
                }}
                // 60% in light too: the guide's 50% fails 4.5:1 for the visible labels.
                inactiveProps={{ className: "text-foreground/60" }}
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      aria-hidden="true"
                      weight={isActive ? "fill" : "regular"}
                      className="size-5"
                    />
                    <span className="hidden sm:inline">{label}</span>
                  </>
                )}
              </Link>
            ))}
          </nav>
        )}
        {ready && <UserMenu />}
        {!isAuthenticated && !isLoading && (
          <Link to="/dashboard" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Inicia sesión
          </Link>
        )}
      </div>
    </header>
  );
}
