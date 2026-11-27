import { api } from "@cozi/backend/convex/_generated/api";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { Link } from "expo-router";
import type { Href } from "expo-router";
import { Text, cn, useThemeColor } from "heroui-native";
import { Pressable, View } from "react-native";

import { useAppTheme } from "@/contexts/app-theme-context";
import type { Profile } from "@/contexts/profile-context";

const destinations = {
  catalog: "/business-catalog",
  linkAccount: { pathname: "/business", params: { section: "receiving-account" } },
  orders: { pathname: "/business", params: { section: "orders" } },
  businessStatus: { pathname: "/business", params: { section: "business-status" } },
} satisfies Record<string, Href>;

const icons = {
  complete: "checkmark-circle",
  todo: "ellipse-outline",
  pending: "time-outline",
  rejected: "alert-circle-outline",
} as const;

const accountSteps = {
  verified: { status: "complete", title: "Cuenta receptora verificada" },
  pending: {
    status: "pending",
    title: "Cuenta en verificación",
    hint: "Banxico suele validar tu cuenta en 1 a 5 días hábiles.",
    label: "Consultar estado",
  },
  rejected: {
    status: "rejected",
    title: "Verificación rechazada",
    hint: "Revisa los datos y vincula una cuenta para volver a intentar la verificación.",
    label: "Vincular cuenta de nuevo",
  },
  missing: {
    status: "todo",
    title: "Vincula y verifica tu cuenta receptora",
    hint: "Agrega una cuenta bancaria del negocio para recibir pagos.",
    label: "Vincular cuenta",
  },
} as const;

type Step = {
  status: keyof typeof icons;
  title: string;
  hint?: string;
  label?: string;
  href?: Href;
};

export function FirstPaymentChecklist({
  business,
}: {
  business: NonNullable<Profile["business"]>;
}) {
  const readiness = useQuery(api.businesses.firstPaymentReadiness, { businessId: business._id });
  const { accent, isImmersive, cardColor, cardBorder } = useAppTheme();
  const warning = useThemeColor("warning");
  const danger = useThemeColor("danger");
  const success = useThemeColor("success");

  if (!readiness) {
    return null;
  }

  const { hasPublishedProduct, receivingAccount, ordersEnabled } = readiness;
  const businessPaused = business.status === "paused";

  const steps: Array<Step> = [
    hasPublishedProduct
      ? { status: "complete", title: "Producto publicado" }
      : {
          status: "todo",
          title: "Publica un producto",
          hint: "Agrega un producto y déjalo visible en el catálogo.",
          label: "Ir al catálogo",
          href: destinations.catalog,
        },
    {
      ...accountSteps[receivingAccount.status],
      href:
        receivingAccount.status === "pending"
          ? { pathname: "/bank-account-status", params: { id: receivingAccount.accountId } }
          : destinations.linkAccount,
    },
    ordersEnabled
      ? { status: "complete", title: "Pedidos habilitados" }
      : {
          status: "todo",
          title: "Habilita los pedidos",
          hint: businessPaused
            ? "Activa tu negocio y confirma que acepte pedidos."
            : "Activa la opción para aceptar pedidos en tu negocio.",
          label: "Configurar pedidos",
          href: businessPaused ? destinations.businessStatus : destinations.orders,
        },
  ];

  const ready = steps.every((step) => step.status === "complete");
  const colors = { complete: success, todo: accent.hex, pending: warning, rejected: danger };

  const glass = isImmersive
    ? { backgroundColor: cardColor, borderColor: cardBorder, borderWidth: 1 }
    : undefined;

  const textPrimary = isImmersive ? { color: "#FFFFFF" } : undefined;
  const textSecondary = isImmersive ? { color: "rgba(255,255,255,0.70)" } : undefined;

  return (
    <View className={cn("gap-3 rounded-3xl p-5", !isImmersive && "bg-surface")} style={glass}>
      <View className="flex-row items-center gap-2">
        {ready ? <Ionicons name="checkmark-circle" size={20} color={success} /> : null}
        <Text
          accessibilityRole="header"
          className="text-base font-semibold text-foreground"
          style={textPrimary}
        >
          {ready ? "Todo listo para cobrar" : "Prepara tu primer cobro"}
        </Text>
      </View>
      {ready
        ? null
        : steps.map((step) => (
            <View key={step.title} className="flex-row items-start gap-3">
              <Ionicons name={icons[step.status]} size={19} color={colors[step.status]} />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-foreground" style={textPrimary}>
                  {step.title}
                </Text>
                {step.href && step.label ? (
                  <>
                    <Text className="mt-0.5 text-xs text-muted" style={textSecondary}>
                      {step.hint}
                    </Text>
                    <Link href={step.href} asChild push>
                      <Pressable className="min-h-11 self-start justify-center">
                        <Text
                          className="text-sm font-medium text-foreground underline"
                          style={textPrimary}
                        >
                          {step.label}
                        </Text>
                      </Pressable>
                    </Link>
                  </>
                ) : null}
              </View>
            </View>
          ))}
    </View>
  );
}
