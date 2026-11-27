import { buttonVariants } from "@cozi/ui/components/button";
import { Link } from "@tanstack/react-router";
import { UserCircleIcon } from "@phosphor-icons/react";

export default function UserMenu() {
  return (
    <Link
      to="/profile"
      aria-label="Perfil"
      className={buttonVariants({ variant: "ghost", size: "icon" })}
      activeProps={{ className: "bg-highlight text-highlight-foreground" }}
    >
      <UserCircleIcon aria-hidden="true" className="size-5" />
    </Link>
  );
}
