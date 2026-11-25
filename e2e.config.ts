import { mobile } from "@e2e-dev/mobile";
import type { E2EConfig } from "e2e";

/**
 * Los tests corren contra el deployment de desarrollo `useful-dogfish-610`.
 * La app instalada en el dispositivo tiene que apuntar ahí: se construye con
 * los `EXPO_PUBLIC_CONVEX_*` de `apps/native/.env`.
 *
 * El paquete de Android es el mismo que declara `apps/native/app.config.ts`.
 */
const app = { bundleId: "com.anonymous.cozi" };

export default {
  targets: [{ name: "android", engine: mobile({ platform: "android" }), app }],
  workers: 1,
} satisfies E2EConfig;
