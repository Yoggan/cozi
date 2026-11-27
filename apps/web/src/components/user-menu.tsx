import { buttonVariants } from "@cozi/ui/components/button";
import { Link } from "@tanstack/react-router";
import { CircleUserRound } from "lucide-react";

export default function UserMenu() {
  return (
    <Link
      to="/profile"
      aria-label="Perfil"
      className={buttonVariants({ variant: "ghost", size: "icon" })}
      activeProps={{ className: "bg-highlight text-highlight-foreground" }}
    >
      <CircleUserRound aria-hidden="true" className="size-5" />
    </Link>
  );
}
