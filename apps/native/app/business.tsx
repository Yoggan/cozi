import { api } from "@cozi/backend/convex/_generated/api";
import type { BankAccountStatus } from "@cozi/backend/convex/schema";
import { Icon } from "@/components/icon";
import { useAction, useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Button,
  Chip,
  cn,
  Input,
  Label,
  Spinner,
  Switch,
  Text,
  TextField,
  useThemeColor,
  useToast,
} from "heroui-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Container } from "@/components/container";
import { useAppTheme } from "@/contexts/app-theme-context";
import { useProfile } from "@/contexts/profile-context";
import { firstParam } from "@/lib/search-params";

type Status = "active" | "paused";

type AccountType = "clabe" | "card";

type SaleToggle = "acceptingOrders" | "tipsEnabled";

const STATUS_LABELS: Record<BankAccountStatus, string> = {
  pending: "En revisión",
  verified: "Verificada",
  rejected: "Rechazada",
  disabled: "Deshabilitada",
};

function OptionButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 items-center rounded-xl py-2.5 ${active ? "bg-surface" : ""}`}
    >
      <Text className={`text-sm font-medium ${active ? "text-foreground" : "text-muted"}`}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function BusinessScreen() {
  const profile = useProfile();
  const business = profile.business;
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const section = firstParam(params.section);
  const updateBusiness = useMutation(api.businesses.update);
  const linkBankAccount = useAction(api.pey.actions.linkBankAccount);

  const accounts = useQuery(
    api.businesses.listBankAccounts,
    business ? { businessId: business._id } : "skip",
  );

  const { toast } = useToast();
  const { accent, isImmersive, cardColor, cardBorder } = useAppTheme();
  const muted = useThemeColor("muted");
  const warning = useThemeColor("warning");

  const [name, setName] = useState(business?.name ?? "");
  const [category, setCategory] = useState(business?.category ?? "");
  const [status, setStatus] = useState<Status>(business?.status ?? "active");
  const [isSaving, setIsSaving] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<SaleToggle | null>(null);
  const [showAccountForm, setShowAccountForm] = useState(section === "receiving-account");
  const [accountType, setAccountType] = useState<AccountType>("clabe");
  const [accountNumber, setAccountNumber] = useState("");
  const [holderName, setHolderName] = useState(business?.name ?? "");
  const [isLinking, setIsLinking] = useState(false);

  const glass = isImmersive
    ? { backgroundColor: cardColor, borderColor: cardBorder, borderWidth: 1 }
    : undefined;

  const textPrimary = isImmersive ? { color: "#FFFFFF" } : undefined;
  const textSecondary = isImmersive ? { color: "rgba(255,255,255,0.70)" } : undefined;
  const iconMuted = isImmersive ? "rgba(255,255,255,0.70)" : muted;

  async function handleSave() {
    if (!business) {
      return;
    }

    setIsSaving(true);

    try {
      await updateBusiness({
        businessId: business._id,
        name: name.trim(),
        category: category.trim(),
        status,
      });
      toast.show({ variant: "success", label: "Negocio actualizado" });
    } catch (error) {
      toast.show({
        variant: "danger",
        label: error instanceof Error ? error.message : "No pudimos guardar tu negocio",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaleToggle(field: SaleToggle, value: boolean) {
    if (!business) {
      return;
    }

    setPendingToggle(field);

    try {
      await updateBusiness(
        field === "acceptingOrders"
          ? { businessId: business._id, acceptingOrders: value }
          : { businessId: business._id, tipsEnabled: value },
      );
      toast.show({
        variant: "success",
        label:
          field === "acceptingOrders"
            ? value
              ? "Pedidos activados"
              : "Pedidos pausados"
            : value
              ? "Propinas activadas"
              : "Propinas desactivadas",
      });
    } catch (error) {
      toast.show({
        variant: "danger",
        label: error instanceof Error ? error.message : "No pudimos actualizar tus ventas",
      });
    } finally {
      setPendingToggle(null);
    }
  }

  async function handleLinkAccount() {
    if (!business) {
      return;
    }

    const digits = accountNumber.replaceAll(/[\s-]/g, "");

    if (!digits) {
      toast.show({ variant: "danger", label: "Escribe el número de cuenta" });

      return;
    }

    setIsLinking(true);

    try {
      const result = await linkBankAccount({
        accountType,
        accountNumber: digits,
        holderName: holderName.trim(),
        businessId: business._id,
        setDefault: true,
      });

      setAccountNumber("");
      setShowAccountForm(false);

      if (result.status === "pending") {
        router.push({
          pathname: "/bank-account-status",
          params: { id: result.bankAccountId },
        });
      } else {
        toast.show({ variant: "success", label: "Cuenta del negocio vinculada" });
      }
    } catch (error) {
      toast.show({
        variant: "danger",
        label: error instanceof Error ? error.message : "No pudimos vincular la cuenta",
      });
    } finally {
      setIsLinking(false);
    }
  }

  if (!business) {
    return (
      <Container className="px-5 pt-6">
        <Text className="text-sm text-muted">Todavía no tienes un negocio.</Text>
      </Container>
    );
  }

  const profileSettings = (
    <Animated.View
      entering={FadeInDown.duration(220).delay(60)}
      className={cn("mt-4 gap-3 rounded-2xl p-4", !isImmersive && "bg-surface")}
      style={glass}
    >
      <TextField>
        <Label>Nombre del negocio</Label>
        <Input value={name} onChangeText={setName} autoCapitalize="words" />
      </TextField>

      <TextField>
        <Label>Categoría</Label>
        <Input value={category} onChangeText={setCategory} placeholder="Ej. Cafetería" />
      </TextField>

      <View>
        <Text className="mb-2 text-sm font-medium text-foreground" style={textPrimary}>
          Estado
        </Text>
        <View className="flex-row rounded-xl bg-surface-secondary p-1">
          <OptionButton
            active={status === "active"}
            label="Activo"
            onPress={() => setStatus("active")}
          />
          <OptionButton
            active={status === "paused"}
            label="Pausado"
            onPress={() => setStatus("paused")}
          />
        </View>
        <Text className="mt-2 text-xs text-muted" style={textSecondary}>
          Pausado desactiva el cobro del negocio.
        </Text>
      </View>

      <Button isDisabled={isSaving} onPress={handleSave}>
        {isSaving ? (
          <Spinner size="sm" color="default" />
        ) : (
          <Button.Label>Guardar cambios</Button.Label>
        )}
      </Button>
    </Animated.View>
  );

  const orderSettings = (
    <Animated.View
      entering={FadeInDown.duration(220).delay(90)}
      className={cn("mt-4 gap-4 rounded-2xl p-4", !isImmersive && "bg-surface")}
      style={glass}
    >
      <View className="flex-row items-center gap-3">
        <View className="flex-1">
          <Text className="text-sm font-semibold text-foreground" style={textPrimary}>
            Aceptando pedidos
          </Text>
          <Text className="mt-1 text-xs leading-5 text-muted" style={textSecondary}>
            Obligatorio para cobrar con CoDi o link de pago. Si está apagado, tus clientes no pueden
            pagar.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Aceptando pedidos"
          isSelected={business.acceptingOrders}
          isDisabled={pendingToggle !== null}
          onSelectedChange={(value) => handleSaleToggle("acceptingOrders", value)}
        />
      </View>

      <View className="flex-row items-center gap-3 border-t border-border pt-4">
        <View className="flex-1">
          <Text className="text-sm font-semibold text-foreground" style={textPrimary}>
            Aceptar propinas
          </Text>
          <Text className="mt-1 text-xs leading-5 text-muted" style={textSecondary}>
            Permite que tus clientes agreguen propina al pagar.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Aceptar propinas"
          isSelected={business.tipsEnabled}
          isDisabled={pendingToggle !== null}
          onSelectedChange={(value) => handleSaleToggle("tipsEnabled", value)}
        />
      </View>
    </Animated.View>
  );

  const receivingAccountSettings = (
    <>
      <Animated.View
        entering={FadeInDown.duration(220).delay(140)}
        className="mt-6 flex-row items-center justify-between gap-3"
      >
        <View className="flex-1">
          <Text className="text-lg font-semibold text-foreground" style={textPrimary}>
            Cuenta para recibir
          </Text>
          <Text className="mt-0.5 text-xs text-muted" style={textSecondary}>
            Solo guardamos la máscara; la CLABE completa se queda con Pey.
          </Text>
        </View>
        <Button size="sm" variant="secondary" onPress={() => setShowAccountForm((value) => !value)}>
          <Button.Label>{showAccountForm ? "Cerrar" : "Vincular"}</Button.Label>
        </Button>
      </Animated.View>

      {showAccountForm ? (
        <Animated.View
          entering={FadeInDown.duration(220)}
          className={cn("mt-3 gap-3 rounded-2xl p-4", !isImmersive && "bg-surface")}
          style={glass}
        >
          <View className="flex-row rounded-xl bg-surface-secondary p-1">
            <OptionButton
              active={accountType === "clabe"}
              label="CLABE"
              onPress={() => setAccountType("clabe")}
            />
            <OptionButton
              active={accountType === "card"}
              label="Tarjeta"
              onPress={() => setAccountType("card")}
            />
          </View>

          <TextField>
            <Label>{accountType === "clabe" ? "CLABE (18 dígitos)" : "Número de tarjeta"}</Label>
            <Input
              value={accountNumber}
              onChangeText={setAccountNumber}
              placeholder={accountType === "clabe" ? "012180000000000000" : "4111 1111 1111 1111"}
              keyboardType="number-pad"
              autoCapitalize="none"
            />
          </TextField>

          <TextField>
            <Label>Nombre del titular</Label>
            <Input value={holderName} onChangeText={setHolderName} autoCapitalize="words" />
          </TextField>

          <Button onPress={handleLinkAccount} isDisabled={isLinking}>
            {isLinking ? (
              <Spinner size="sm" color="default" />
            ) : (
              <Button.Label>Vincular cuenta del negocio</Button.Label>
            )}
          </Button>
        </Animated.View>
      ) : null}

      <Animated.View
        entering={FadeInDown.duration(220).delay(160)}
        className={cn("mt-3 rounded-2xl px-4", !isImmersive && "bg-surface")}
        style={glass}
      >
        {accounts === undefined ? (
          <View className="py-6">
            <Text className="text-center text-sm text-muted" style={textSecondary}>
              Cargando cuentas...
            </Text>
          </View>
        ) : accounts.length === 0 ? (
          <View className="items-center py-8">
            <Icon name="card-outline" size={24} color={iconMuted} />
            <Text className="mt-2 text-sm font-medium text-foreground" style={textPrimary}>
              Sin cuenta de negocio
            </Text>
            <Text className="mt-1 text-center text-xs text-muted" style={textSecondary}>
              Vincula una CLABE para que tus clientes puedan pagarte.
            </Text>
          </View>
        ) : (
          accounts.map((account, index) => (
            <View key={account._id} className={index > 0 ? "border-t border-border" : undefined}>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/bank-account-status",
                    params: { id: account._id },
                  })
                }
                className="flex-row items-center gap-3 py-3"
              >
                <View className="h-9 w-9 items-center justify-center rounded-full bg-surface-secondary">
                  <Icon name="card-outline" size={18} color={iconMuted} />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-medium text-foreground" style={textPrimary}>
                    {account.institution ?? (account.accountType === "clabe" ? "CLABE" : "Tarjeta")}{" "}
                    · {account.accountNumberMasked}
                  </Text>
                  <Text className="mt-0.5 text-xs text-muted" style={textSecondary}>
                    {account.holderName}
                  </Text>
                </View>
                <Chip
                  size="sm"
                  variant="soft"
                  color={
                    account.status === "verified"
                      ? "success"
                      : account.status === "rejected"
                        ? "danger"
                        : account.status === "pending"
                          ? "warning"
                          : "default"
                  }
                >
                  <Chip.Label>{STATUS_LABELS[account.status] ?? account.status}</Chip.Label>
                </Chip>
                <Icon name="chevron-forward" size={16} color={iconMuted} />
              </Pressable>

              {account.status === "pending" ? (
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: "/bank-account-status",
                      params: { id: account._id },
                    })
                  }
                  className="mb-3 flex-row items-center gap-2 rounded-xl bg-warning-soft px-3 py-2"
                >
                  <Icon name="time-outline" size={14} color={warning} />
                  <Text className="flex-1 text-xs font-medium text-warning-soft-foreground">
                    Activación CoDi con Banxico (1–5 días hábiles) · Toca para ver el progreso
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </Animated.View>
    </>
  );

  const focusAccount = section === "receiving-account";
  const focusSalesSettings = section === "orders" || section === "business-status";

  const ordersFirst = section === "orders";

  const salesSettings = (
    <>
      {ordersFirst ? orderSettings : profileSettings}
      {ordersFirst ? profileSettings : orderSettings}
    </>
  );

  return (
    <Container className="px-5 pt-4">
      <Animated.View
        entering={FadeInDown.duration(220)}
        className={cn("flex-row items-center gap-4 rounded-3xl p-5", !isImmersive && "bg-surface")}
        style={glass}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: accent.softHex,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="business" size={22} color={accent.hex} />
        </View>
        <View className="flex-1">
          <Text className="text-lg font-semibold text-foreground" style={textPrimary}>
            {business.name}
          </Text>
          <Text className="mt-0.5 text-sm text-muted" style={textSecondary}>
            {business.handle ? `@${business.handle}` : "Sin @handle"}
          </Text>
        </View>
        <Chip size="sm" variant="soft" color={business.status === "active" ? "success" : "warning"}>
          <Chip.Label>{business.status === "active" ? "Activo" : "Pausado"}</Chip.Label>
        </Chip>
      </Animated.View>

      {focusAccount ? receivingAccountSettings : null}
      {focusSalesSettings ? salesSettings : null}

      <Animated.View
        entering={FadeInDown.duration(220).delay(30)}
        className={cn("mt-4 gap-3 rounded-2xl p-4", !isImmersive && "bg-surface")}
        style={glass}
      >
        <View>
          <Text className="text-base font-semibold text-foreground" style={textPrimary}>
            Ventas
          </Text>
          <Text className="mt-0.5 text-xs text-muted" style={textSecondary}>
            Toma pedidos en el local y comparte el link de pago.
          </Text>
        </View>
        <Button onPress={() => router.push("/business-order")}>
          <Button.Label>Nuevo pedido</Button.Label>
        </Button>
        <Button variant="secondary" onPress={() => router.push("/business-orders")}>
          <Button.Label>Pedidos</Button.Label>
        </Button>
      </Animated.View>

      {focusSalesSettings ? null : salesSettings}

      <Animated.View entering={FadeInDown.duration(220).delay(120)}>
        <Pressable
          onPress={() => router.push("/business-catalog")}
          className={cn(
            "mt-4 flex-row items-center gap-3 rounded-2xl p-4",
            !isImmersive && "bg-surface",
          )}
          style={glass}
        >
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: accent.softHex,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="pricetags" size={19} color={accent.hex} />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-foreground" style={textPrimary}>
              Catálogo
            </Text>
            <Text className="mt-0.5 text-xs text-muted" style={textSecondary}>
              Productos, precios y disponibilidad
            </Text>
          </View>
          <Icon name="chevron-forward" size={18} color={iconMuted} />
        </Pressable>
      </Animated.View>

      {focusAccount ? null : receivingAccountSettings}

      <View
        className={cn(
          "mt-4 flex-row items-start gap-2 rounded-2xl px-4 py-3",
          !isImmersive && "bg-surface",
        )}
        style={glass}
      >
        <Icon name="information-circle-outline" size={16} color={muted} />
        <Text className="flex-1 text-xs leading-5 text-muted" style={textSecondary}>
          Para cobrar con CoDi necesitas una cuenta verificada del negocio. Tu @handle no se puede
          cambiar por ahora.
        </Text>
      </View>
    </Container>
  );
}
