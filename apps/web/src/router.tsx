import { ConvexQueryClient } from "@convex-dev/react-query";
import { Button } from "@cozi/ui/components/button";
import { QueryClient } from "@tanstack/react-query";
import { Link, createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import Loader from "./components/loader";
import { ENV } from "./env";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const convexUrl = ENV.VITE_CONVEX_URL;

  if (!convexUrl) {
    throw new Error("VITE_CONVEX_URL is not set");
  }

  const convexQueryClient = new ConvexQueryClient(convexUrl);

  const queryClient: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
      },
    },
  });

  convexQueryClient.connect(queryClient);

  const router = createTanStackRouter({
    routeTree,
    defaultPreload: "intent",
    defaultPendingComponent: () => <Loader />,
    defaultErrorComponent: () => (
      <main id="contenido" className="page-narrow">
        <h1 className="page-title">No pudimos cargar esta página</h1>
        <p className="text-muted-foreground">Vuelve a cargar la página para intentar de nuevo.</p>
        <Button onClick={() => window.location.reload()}>Volver a cargar</Button>
      </main>
    ),
    defaultNotFoundComponent: () => (
      <main id="contenido" className="page-narrow text-center">
        <h1 className="text-xl font-semibold">Página no encontrada</h1>
        <p className="mt-2 text-sm text-muted-foreground">Revisa el enlace e inténtalo de nuevo.</p>
        <Link to="/" className="mt-4 inline-block text-sm underline underline-offset-4">
          Volver al inicio
        </Link>
      </main>
    ),
    context: { queryClient, convexQueryClient },
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
