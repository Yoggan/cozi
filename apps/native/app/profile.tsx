import { api } from "@cozi/backend/convex/_generated/api";
import type { BankAccountStatus } from "@cozi/backend/convex/schema";
import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import {
  Button,
  Chip,
  cn,
  Input,
  Label,
  Spinner,
  Text,
  TextField,
  useThemeColor,
  useToast,
} from "heroui-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AccountsAvatar } from "@/components/accounts-avatar";
import { Container } from "@/components/container";
import { ProfilePhoto } from "@/components/profile-photo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAppLock } from "@/contexts/app-lock-context";
import { useAppTheme } from "@/contexts/app-theme-context";
import { useProfile } from "@/contexts/profile-context";
import { authClient } from "@/lib/auth-client";

type AccountType = "clabe" | "card";

const STATUS_LABELS: Record<BankAccountStatus, string> = {
  pending: "En revisión",
  verified: "Verificada",
  rejected: "Rechazada",
  disabled: "Deshabilitada",
};

function TypeButton({
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

async function handleSignOut() {
  await authClient.signOut();
}

export default function ProfileScreen() {
  const profile = useProfile();
  const accounts = useQuery(api.users.listBankAccounts);
  const linkBankAccount = useAction(api.pey.actions.linkBankAccount);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { preset, backdrop, accent, isImmersive, cardColor, cardBorder } = useAppTheme();
  const { isEnabled: isLockEnabled } = useAppLock();
  const { toast } = useToast();
  const muted = useThemeColor("muted");
  const warning = useThemeColor("warning");

  const glass = isImmersive
    ? { backgroundColor: cardColor, borderColor: cardBorder, borderWidth: 1 }
    : undefined;

  const textPrimary = isImmersive ? { color: "#FFFFFF" } : undefined;
  const textSecondary = isImmersive ? { color: "rgba(255,255,255,0.70)" } : undefined;
  const iconMuted = isImmersive ? "rgba(255,255,255,0.70)" : muted;

  const [showForm, setShowForm] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>("clabe");
  const [accountNumber, setAccountNumber] = useState("");
  const [holderName, setHolderName] = useState(profile.displayName);
  const [isLinking, setIsLinking] = useState(false);

  async function handleLink() {
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
        setDefault: true,
      });

      setAccountNumber("");
      setShowForm(false);

      if (result.status === "pending") {
        router.push({
          pathname: "/bank-account-status",
          params: { id: result.bankAccountId },
        });
      } else {
        toast.show({ variant: "success", label: "Cuenta vinculada" });
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

  return (
    <Container className="px-5" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between pb-6 pt-4">
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            className="h-10 w-10 items-center justify-center rounded-full bg-surface"
          >
            <Ionicons name="arrow-back" size={20} color={muted} />
          </Pressable>
          <Text
            className="text-2xl font-semibold tracking-tight text-foreground"
            style={textPrimary}
          >
            Perfil
          </Text>
        </View>
        <ThemeToggle />
      </View>

      <Animated.View
        entering={FadeInDown.duration(220)}
        className={cn("flex-row items-center gap-4 rounded-3xl p-5", !isImmersive && "bg-surface")}
        style={glass}
      >
        <ProfilePhoto
          borderColor={isImmersive ? "rgba(255, 255, 255, 0.18)" : undefined}
          name={profile.displayName}
          onPress={() => router.push("/edit-profile")}
          size={56}
          uri={profile.avatarUrl}
        />
        <View className="flex-1">
          <Text
            className="text-lg font-semibold text-foreground"
            style={textPrimary}
            testID="profile-name"
          >
            {profile.displayName}
          </Text>
          <Text className="mt-0.5 text-sm text-muted" style={textSecondary}>
            @{profile.handle ?? "cozi"}
          </Text>
          {profile.phone ? (
            <Text className="mt-1 text-xs text-muted" style={textSecondary}>
              {profile.phone}
            </Text>
          ) : null}
        </View>
        <Button
          size="sm"
          testID="profile-edit"
          variant="secondary"
          onPress={() => router.push("/edit-profile")}
        >
          <Button.Label>Editar</Button.Label>
        </Button>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(220).delay(30)}>
        <Pressable
          onPress={() => router.push("/accounts")}
          className={cn(
            "mt-4 flex-row items-center gap-3 rounded-2xl p-4",
            !isImmersive && "bg-surface",
          )}
          style={glass}
        >
          <AccountsAvatar size="md" />
          <View className="flex-1">
            <Text className="text-sm font-semibold text-foreground" style={textPrimary}>
              Cuentas
            </Text>
            <Text className="mt-0.5 text-xs text-muted" style={textSecondary}>
              Cambiar de cuenta
            </Text>
          </View>
          <Ionicons name="swap-horizontal" size={18} color={iconMuted} />
        </Pressable>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(220).delay(40)}>
        <Pressable
          onPress={() => router.push("/theme-preview")}
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
            <Ionicons name="color-palette" size={19} color={accent.hex} />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-foreground" style={textPrimary}>
              Apariencia y temas
            </Text>
            <Text className="mt-0.5 text-xs text-muted" style={textSecondary}>
              {backdrop ? `${preset.name} · ${backdrop.name}` : preset.name}
            </Text>
          </View>
          <View
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: accent.hex,
            }}
          />
          <Ionicons name="chevron-forward" size={18} color={iconMuted} />
        </Pressable>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(220).delay(60)}>
        <Pressable
          onPress={() => router.push("/security")}
          className={cn(
            "mt-3 flex-row items-center gap-3 rounded-2xl p-4",
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
            <Ionicons name="shield-checkmark" size={19} color={accent.hex} />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-foreground" style={textPrimary}>
              Seguridad
            </Text>
            <Text className="mt-0.5 text-xs text-muted" style={textSecondary}>
              {isLockEnabled ? "PIN activo" : "PIN y biometría"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={iconMuted} />
        </Pressable>
      </Animated.View>

      {profile.accountType === "personal" ? (
        <Animated.View entering={FadeInDown.duration(220).delay(70)}>
          <Pressable
            onPress={() => router.push("/contacts")}
            className={cn(
              "mt-3 flex-row items-center gap-3 rounded-2xl p-4",
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
              <Ionicons name="people" size={19} color={accent.hex} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-foreground" style={textPrimary}>
                Contactos
              </Text>
              <Text className="mt-0.5 text-xs text-muted" style={textSecondary}>
                Envía o cobra en un toque
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={iconMuted} />
          </Pressable>
        </Animated.View>
      ) : null}

      {profile.business ? (
        <Animated.View entering={FadeInDown.duration(220).delay(75)}>
          <Pressable
            onPress={() => router.push("/business")}
            className={cn(
              "mt-3 flex-row items-center gap-3 rounded-2xl p-4",
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
              <Ionicons name="business" size={19} color={accent.hex} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-foreground" style={textPrimary}>
                Mi negocio
              </Text>
              <Text className="mt-0.5 text-xs text-muted" style={textSecondary}>
                {profile.business.name}
                {profile.business.handle ? ` · @${profile.business.handle}` : ""}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={iconMuted} />
          </Pressable>
        </Animated.View>
      ) : null}

      {profile.accountType === "personal" ? (
        <Animated.View
          layout={LinearTransition.duration(200)}
          entering={FadeInDown.duration(220).delay(80)}
          className="mt-6 flex-row items-center justify-between"
        >
          <View>
            <Text className="text-lg font-semibold text-foreground" style={textPrimary}>
              Cuentas para recibir
            </Text>
            <Text className="mt-0.5 text-xs text-muted" style={textSecondary}>
              Tu CLABE solo se comparte con Pey.
            </Text>
          </View>
          <Button size="sm" variant="secondary" onPress={() => setShowForm((value) => !value)}>
            <Button.Label>{showForm ? "Cerrar" : "Agregar"}</Button.Label>
          </Button>
        </Animated.View>
      ) : null}

      {showForm && profile.accountType === "personal" ? (
        <Animated.View
          entering={FadeInDown.duration(220)}
          exiting={FadeOutUp.duration(160)}
          layout={LinearTransition.duration(200)}
          className={cn("mt-3 gap-3 rounded-2xl p-4", !isImmersive && "bg-surface")}
          style={glass}
        >
          <View className="flex-row rounded-xl bg-surface-secondary p-1">
            <TypeButton
              active={accountType === "clabe"}
              label="CLABE"
              onPress={() => setAccountType("clabe")}
            />
            <TypeButton
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

          <Button onPress={handleLink} isDisabled={isLinking}>
            {isLinking ? (
              <Spinner size="sm" color="default" />
            ) : (
              <Button.Label>Vincular cuenta</Button.Label>
            )}
          </Button>
        </Animated.View>
      ) : null}

      {profile.accountType === "personal" ? (
        <Animated.View
          layout={LinearTransition.duration(200)}
          entering={FadeInDown.duration(220).delay(120)}
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
              <Ionicons name="business-outline" size={24} color={iconMuted} />
              <Text className="mt-2 text-sm font-medium text-foreground" style={textPrimary}>
                Sin cuentas todavía
              </Text>
              <Text className="mt-1 text-center text-xs text-muted" style={textSecondary}>
                Agrega una CLABE para recibir pagos.
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
                    <Ionicons name="card-outline" size={18} color={iconMuted} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-foreground" style={textPrimary}>
                      {account.institution ??
                        (account.accountType === "clabe" ? "CLABE" : "Tarjeta")}{" "}
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
                  <Ionicons name="chevron-forward" size={16} color={iconMuted} />
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
                    <Ionicons name="time-outline" size={14} color={warning} />
                    <Text className="flex-1 text-xs font-medium text-warning-soft-foreground">
                      Activación CoDi con Banxico (1–5 días hábiles) · Toca para ver el progreso
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ))
          )}
        </Animated.View>
      ) : null}

      <Pressable
        onPress={handleSignOut}
        className={cn(
          "mt-6 flex-row items-center justify-center gap-2 rounded-2xl py-3",
          !isImmersive && "bg-surface",
        )}
        style={glass}
      >
        <Ionicons name="log-out-outline" size={18} color={iconMuted} />
        <Text className="text-sm font-medium text-foreground" style={textPrimary}>
          Cerrar sesión
        </Text>
      </Pressable>

      <Text className="mt-6 text-center text-xs text-muted" style={textSecondary}>
        cozi · MXN · Hecho en México
      </Text>

      <View className="h-8" />
    </Container>
  );
}
