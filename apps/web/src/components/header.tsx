import { Link } from "@tanstack/react-router";

export default function Header() {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          cozi
        </Link>
        <span className="text-xs text-muted-foreground">Pagos y compras en México</span>
      </div>
    </header>
  );
}
