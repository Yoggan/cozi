import { api } from "@cozi/backend/convex/_generated/api";
import type { BankAccountStatus } from "@cozi/backend/convex/schema";
import { Ionicons } from "@expo/vector-icons";
import { useAction, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Button, Chip, Spinner, Text, useThemeColor, useToast } from "heroui-native";
import { View } from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { Container } from "@/components/container";
import { useAppTheme } from "@/contexts/app-theme-context";
import { firstParam } from "@/lib/search-params";

const STATUS_LABELS: Record<BankAccountStatus, string> = {
  pending: "En revisión",
  verified: "Verificada",
  rejected: "Rechazada",
  disabled: "Deshabilitada",
};

const STATUS_COLORS: Record<BankAccountStatus, "warning" | "success" | "danger" | "default"> = {
  pending: "warning",
  verified: "success",
  rejected: "danger",
  disabled: "default",
};

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type StepState = "done" | "active" | "pending" | "failed";

function TimelineStep({
  title,
  description,
  state,
  isLast,
}: {
  title: string;
  description: string;
  state: StepState;
  isLast?: boolean;
}) {
  const successForeground = useThemeColor("success-foreground");
  const warning = useThemeColor("warning");
  const warningForeground = useThemeColor("warning-foreground");
  const dangerForeground = useThemeColor("danger-foreground");

  const pulse = useSharedValue(1);
  useEffect(() => {
    if (state === "active") {
      pulse.value = withRepeat(
        withSequence(withTiming(1.12, { duration: 900 }), withTiming(1, { duration: 900 })),
        -1,
        true,
      );
    } else {
      pulse.value = 1;
    }
  }, [state, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  return (
    <View className="flex-row gap-3">
      <View className="items-center">
        {state === "done" ? (
          <View className="h-6 w-6 items-center justify-center rounded-full bg-success">
            <Ionicons name="checkmark" size={14} color={successForeground} />
          </View>
        ) : state === "active" ? (
          <Animated.View
            style={pulseStyle}
            className="h-6 w-6 items-center justify-center rounded-full bg-warning"
          >
            <Ionicons name="time" size={14} color={warningForeground} />
          </Animated.View>
        ) : state === "failed" ? (
          <View className="h-6 w-6 items-center justify-center rounded-full bg-danger">
            <Ionicons name="close" size={14} color={dangerForeground} />
          </View>
        ) : (
          <View className="h-6 w-6 items-center justify-center rounded-full border border-border bg-surface-secondary">
            <View className="h-1.5 w-1.5 rounded-full bg-muted" />
          </View>
        )}
        {!isLast ? <View className="w-px flex-1 bg-border" /> : null}
      </View>

      <View className={`flex-1 ${isLast ? "" : "pb-5"}`}>
        <Text
          className={`text-sm font-medium ${state === "pending" ? "text-muted" : "text-foreground"}`}
        >
          {title}
        </Text>
        <Text className="mt-0.5 text-xs text-muted">{description}</Text>
        {state === "active" ? (
          <View className="mt-1 flex-row items-center gap-1">
            <Ionicons name="hourglass-outline" size={12} color={warning} />
            <Text className="text-xs font-medium text-warning-soft-foreground">
              Tiempo estimado: 1 a 5 días hábiles
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function BankAccountStatusScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = firstParam(params.id);
  const accounts = useQuery(api.users.listBankAccounts);
  const refreshBankAccount = useAction(api.pey.actions.refreshBankAccount);
  const router = useRouter();
  const { toast } = useToast();
  const { isImmersive, baseColor, cardColor, cardBorder } = useAppTheme();

  const muted = useThemeColor("muted");
  const success = useThemeColor("success");
  const warning = useThemeColor("warning");
  const danger = useThemeColor("danger");

  const immersiveCard = isImmersive
    ? { backgroundColor: cardColor, borderColor: cardBorder, borderWidth: 1 }
    : undefined;

  const [isRefreshing, setIsRefreshing] = useState(false);

  if (accounts === undefined) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background"
        style={isImmersive ? { backgroundColor: baseColor } : undefined}
      >
        <Spinner />
      </View>
    );
  }

  const account =
    (id ? accounts.find((item) => item._id === id) : undefined) ??
    accounts.find((item) => item.status === "pending") ??
    accounts[0];

  if (!account) {
    return (
      <View
        className="flex-1 items-center justify-center gap-3 bg-background px-8"
        style={isImmersive ? { backgroundColor: baseColor } : undefined}
      >
        <Ionicons name="business-outline" size={32} color={muted} />
        <Text className="text-center text-lg font-semibold text-foreground">
          Sin cuentas todavía
        </Text>
        <Text className="text-center text-sm text-muted">
          Agrega una CLABE en tu perfil para recibir pagos por CoDi.
        </Text>
        <Button variant="secondary" onPress={() => router.back()}>
          <Button.Label>Volver a Perfil</Button.Label>
        </Button>
      </View>
    );
  }

  const isPending = account.status === "pending";
  const isVerified = account.status === "verified";
  const isRejected = account.status === "rejected";

  const providerHint =
    account.providerStatus === "PENDING"
      ? "En cola para enviarse a Banxico"
      : account.providerStatus === "PROCESSING"
        ? "Banxico está validando tu cuenta"
        : "En validación con Banxico";

  const headline = isVerified
    ? "¡Tu cuenta está activa!"
    : isRejected
      ? "Banxico no pudo activar esta cuenta"
      : isPending && account.providerStatus === "PENDING"
        ? "Tu CLABE fue recibida por Pey"
        : "Banxico está activando tu CLABE en CoDi";

  const bannerClassName = isVerified
    ? "bg-success-soft"
    : isRejected
      ? "bg-danger-soft"
      : "bg-warning-soft";
  const bannerTextClassName = isVerified
    ? "text-success-soft-foreground"
    : isRejected
      ? "text-danger-soft-foreground"
      : "text-warning-soft-foreground";

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      const result = await refreshBankAccount({ bankAccountId: account._id });
      if (result.status === "verified") {
        toast.show({ variant: "success", label: "¡Tu cuenta ya está verificada!" });
      } else if (result.status === "rejected") {
        toast.show({
          variant: "danger",
          label: result.errorMessage ?? "Banxico rechazó esta cuenta",
        });
      } else {
        toast.show({
          variant: "warning",
          label: "Sigue en validación con Banxico (1–5 días hábiles)",
        });
      }
    } catch (error) {
      toast.show({
        variant: "danger",
        label: error instanceof Error ? error.message : "No pudimos revisar tu cuenta",
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <Container className="px-5">
      <Animated.View
        entering={FadeInDown.duration(220)}
        className="mt-5 flex-row items-center gap-3 rounded-3xl bg-surface p-5"
        style={immersiveCard}
      >
        <View className="h-12 w-12 items-center justify-center rounded-full bg-surface-secondary">
          <Ionicons name="card-outline" size={22} color={muted} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-foreground">
            {account.institution ?? (account.accountType === "clabe" ? "CLABE" : "Tarjeta")} ·{" "}
            {account.accountNumberMasked}
          </Text>
          <Text className="mt-0.5 text-xs text-muted">{account.holderName}</Text>
        </View>
        <Chip size="sm" variant="soft" color={STATUS_COLORS[account.status] ?? "default"}>
          <Chip.Label>{STATUS_LABELS[account.status] ?? account.status}</Chip.Label>
        </Chip>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.duration(240).delay(60)}
        className={`mt-4 rounded-3xl p-5 ${bannerClassName}`}
      >
        <View className="flex-row items-center gap-2">
          <Ionicons
            name={isVerified ? "checkmark-circle" : isRejected ? "alert-circle" : "time-outline"}
            size={22}
            color={isVerified ? success : isRejected ? danger : warning}
          />
          <Text className={`flex-1 text-lg font-semibold ${bannerTextClassName}`}>{headline}</Text>
        </View>

        {isVerified ? (
          <Text className={`mt-3 text-sm ${bannerTextClassName}`}>
            Ya puedes recibir pagos por CoDi y links de pago directo en tu cuenta.
          </Text>
        ) : isRejected ? (
          <Text className={`mt-3 text-sm ${bannerTextClassName}`}>
            {account.errorMessage ??
              "La CLABE o el nombre del titular no pasaron la validación de Banxico. Revisa tus datos y agrega otra CLABE."}
          </Text>
        ) : (
          <Text className={`mt-3 text-sm ${bannerTextClassName}`}>
            Para recibir pagos por CoDi sin comisiones, Pey registra tu CLABE directamente ante
            Banxico. Este proceso tarda entre{" "}
            <Text className="font-semibold">1 y 5 días hábiles</Text> y ocurre de forma automática.
          </Text>
        )}

        {isRejected ? (
          <View className="mt-4">
            <Button variant="danger" onPress={() => router.back()}>
              <Button.Label>Agregar otra CLABE</Button.Label>
            </Button>
          </View>
        ) : null}
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(240).delay(120)} className="mt-6">
        <Text className="text-base font-semibold text-foreground">Tu proceso de activación</Text>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.duration(240).delay(140)}
        className="mt-3 rounded-2xl bg-surface p-4"
        style={immersiveCard}
      >
        <TimelineStep
          title="CLABE enviada a Pey"
          description={`Registrada el ${formatDate(account.createdAt)}`}
          state="done"
        />
        <TimelineStep
          title="Validación con Banxico (CoDi)"
          description={
            isVerified
              ? "Banxico aprobó tu CLABE"
              : isRejected
                ? "La validación no se completó"
                : providerHint
          }
          state={isVerified ? "done" : isRejected ? "failed" : "active"}
        />
        <TimelineStep
          title="Lista para recibir pagos"
          description={
            isVerified
              ? "Tu cuenta ya puede recibir pagos por CoDi."
              : "En cuanto Banxico apruebe tu CLABE, podrás cobrar automáticamente sin hacer nada más."
          }
          state={isVerified ? "done" : "pending"}
          isLast
        />
      </Animated.View>

      {isPending ? (
        <Animated.View
          entering={FadeInDown.duration(240).delay(180)}
          className="mt-4 gap-3 rounded-2xl bg-surface-secondary p-4"
        >
          <View className="flex-row items-center gap-2">
            <Ionicons name="information-circle-outline" size={18} color={muted} />
            <Text className="text-sm font-semibold text-foreground">
              ¿Qué puedo hacer mientras tanto?
            </Text>
          </View>
          {[
            "Ya puedes enviar dinero y configurar tu perfil.",
            "No necesitas mantener la app abierta ni hacer ningún trámite en tu banco.",
            "Tu cuenta se activará automáticamente en cuanto Pey reciba la confirmación de Banxico.",
          ].map((item) => (
            <View key={item} className="flex-row gap-2">
              <Text className="text-xs text-muted">•</Text>
              <Text className="flex-1 text-xs text-muted">{item}</Text>
            </View>
          ))}
        </Animated.View>
      ) : null}

      <View className="mt-6 gap-3">
        <Button onPress={handleRefresh} isDisabled={isRefreshing}>
          {isRefreshing ? (
            <Spinner size="sm" color="default" />
          ) : (
            <Button.Label>Verificar estado ahora</Button.Label>
          )}
        </Button>
        {account.lastCheckedAt ? (
          <Text className="text-center text-xs text-muted">
            Última revisión: {formatDateTime(account.lastCheckedAt)}
          </Text>
        ) : null}
        <Button variant="secondary" onPress={() => router.back()}>
          <Button.Label>Entendido</Button.Label>
        </Button>
      </View>

      <Text className="mt-6 pb-4 text-center text-xs text-muted">
        Cozi nunca guarda tu CLABE completa. La validación la hace Pey con Banxico.
      </Text>
    </Container>
  );
}
