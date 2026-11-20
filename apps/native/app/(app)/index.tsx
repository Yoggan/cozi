import { api } from "@cozi/backend/convex/_generated/api";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Avatar, Text, useThemeColor } from "heroui-native";
import { Pressable, ScrollView, Share, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ActivityRow } from "@/components/activity-row";
import { Container } from "@/components/container";
import { ThemeBackdrop } from "@/components/theme-backdrop";
import { useAppTheme } from "@/contexts/app-theme-context";
import { useProfile } from "@/contexts/profile-context";
import { initials } from "@/lib/money";

function GlassAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="items-center gap-2" style={{ width: 72 }}>
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: "rgba(255, 255, 255, 0.22)",
          borderWidth: 1,
          borderColor: "rgba(255, 255, 255, 0.20)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={22} color="#FFFFFF" />
      </View>
      <Text style={{ color: "#FFFFFF" }} className="text-center text-xs font-medium">
        {label}
      </Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const profile = useProfile();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isImmersive, backdrop, baseColor, cardColor, cardBorder, accent } = useAppTheme();
  const activity = useQuery(api.p2p.listActivity, { limit: 4 });
  const success = useThemeColor("success");
  const successForeground = useThemeColor("success-foreground");
  const foreground = useThemeColor("foreground");
  const firstName = profile.displayName.split(/\s+/)[0] ?? profile.displayName;

  async function shareHandle() {
    if (!profile.handle) return;
    await Share.share({ message: `Págame en Cozi: @${profile.handle}` });
  }

  if (isImmersive && backdrop) {
    return (
      <View style={{ flex: 1, backgroundColor: baseColor }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: Math.max(insets.bottom, 16) + 96,
          }}
        >
          {/* Full-bleed hero with seamless fade into baseColor */}
          <View style={{ paddingTop: insets.top + 10, paddingBottom: 24 }}>
            <ThemeBackdrop backdrop={backdrop} height={470} />

            {/* Top bar */}
            <View className="flex-row items-center gap-3 px-5">
              <Pressable onPress={() => router.push("/profile")}>
                <Avatar size="sm" color="success">
                  <Avatar.Fallback>{initials(profile.displayName)}</Avatar.Fallback>
                </Avatar>
              </Pressable>

              <Pressable
                onPress={shareHandle}
                style={{
                  flex: 1,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: "rgba(0, 0, 0, 0.34)",
                  borderWidth: 1,
                  borderColor: "rgba(255, 255, 255, 0.16)",
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 14,
                  gap: 8,
                }}
              >
                <Ionicons name="at" size={16} color="rgba(255,255,255,0.75)" />
                <Text style={{ color: "rgba(255,255,255,0.88)" }} className="text-sm font-medium">
                  {profile.handle ?? "cozi"}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.push("/theme-preview")}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: "rgba(0, 0, 0, 0.34)",
                  borderWidth: 1,
                  borderColor: "rgba(255, 255, 255, 0.16)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="color-palette-outline" size={18} color="#FFFFFF" />
              </Pressable>

              <Pressable
                onPress={shareHandle}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: "rgba(0, 0, 0, 0.34)",
                  borderWidth: 1,
                  borderColor: "rgba(255, 255, 255, 0.16)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="share-outline" size={18} color="#FFFFFF" />
              </Pressable>
            </View>

            {/* Centered Hero */}
            <View className="items-center px-6 pt-12">
              <Text style={{ color: "rgba(255,255,255,0.85)" }} className="text-sm font-medium">
                Personal · MXN
              </Text>
              <Text
                style={{ color: "#FFFFFF" }}
                className="mt-1 text-4xl font-bold tracking-tight"
                numberOfLines={1}
              >
                @{profile.handle ?? "cozi"}
              </Text>
              <View className="mt-2 flex-row items-center gap-1.5">
                <Ionicons
                  name="shield-checkmark-outline"
                  size={14}
                  color="rgba(255,255,255,0.75)"
                />
                <Text style={{ color: "rgba(255,255,255,0.78)" }} className="text-xs font-medium">
                  CoDi · Sin compartir tu CLABE
                </Text>
              </View>

              {/* Center glass pill */}
              <Pressable
                onPress={() => router.push("/activity")}
                style={{
                  marginTop: 22,
                  paddingHorizontal: 20,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: "rgba(255, 255, 255, 0.22)",
                  borderWidth: 1,
                  borderColor: "rgba(255, 255, 255, 0.18)",
                }}
              >
                <Text style={{ color: "#FFFFFF" }} className="text-xs font-semibold">
                  Movimientos
                </Text>
              </Pressable>
            </View>

            {/* 4 Glassmorphic Circular Actions */}
            <View className="mt-8 flex-row justify-around px-4">
              <GlassAction icon="arrow-up" label="Enviar" onPress={() => router.push("/send")} />
              <GlassAction
                icon="arrow-down"
                label="Cobrar"
                onPress={() => router.push("/request")}
              />
              <GlassAction
                icon="business-outline"
                label="Cuenta"
                onPress={() =>
                  router.push(profile.hasPendingBankAccount ? "/bank-account-status" : "/profile")
                }
              />
              <GlassAction
                icon="color-palette-outline"
                label="Temas"
                onPress={() => router.push("/theme-preview")}
              />
            </View>
          </View>

          {/* Translucent Tinted Cards */}
          <View className="gap-4 px-4">
            {!profile.hasReceivingAccount ? (
              <View
                style={{
                  backgroundColor: cardColor,
                  borderColor: cardBorder,
                  borderWidth: 1,
                  borderRadius: 24,
                  padding: 18,
                }}
              >
                <View className="flex-row items-start gap-3">
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      backgroundColor: "rgba(255,255,255,0.12)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name={profile.hasPendingBankAccount ? "time-outline" : "warning-outline"}
                      size={20}
                      color="#FFFFFF"
                    />
                  </View>
                  <View className="flex-1">
                    <Text style={{ color: "#FFFFFF" }} className="text-base font-semibold">
                      {profile.hasPendingBankAccount
                        ? "Tu cuenta está en activación"
                        : "Vincula tu cuenta bancaria"}
                    </Text>
                    <Text
                      style={{ color: "rgba(255,255,255,0.72)" }}
                      className="mt-1 text-sm leading-5"
                    >
                      {profile.hasPendingBankAccount
                        ? "Banxico está activando tu CLABE en CoDi (1 a 5 días hábiles)."
                        : "Agrega tu CLABE una sola vez para recibir pagos y cobrar por CoDi sin comisiones."}
                    </Text>
                  </View>
                </View>

                <Pressable
                  onPress={() =>
                    router.push(profile.hasPendingBankAccount ? "/bank-account-status" : "/profile")
                  }
                  style={{
                    marginTop: 16,
                    backgroundColor: "#FFFFFF",
                    borderRadius: 999,
                    paddingVertical: 12,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#09090B" }} className="text-sm font-semibold">
                    {profile.hasPendingBankAccount ? "Ver progreso" : "Agregar CLABE"}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {/* Recent activity glass card */}
            <View
              style={{
                backgroundColor: cardColor,
                borderColor: cardBorder,
                borderWidth: 1,
                borderRadius: 24,
                paddingHorizontal: 16,
                paddingVertical: 14,
              }}
            >
              <View className="mb-2 flex-row items-center justify-between">
                <Text style={{ color: "#FFFFFF" }} className="text-base font-semibold">
                  Actividad reciente
                </Text>
                <Pressable onPress={() => router.push("/activity")}>
                  <Text style={{ color: accent.hex }} className="text-xs font-semibold">
                    Ver todo
                  </Text>
                </Pressable>
              </View>

              {activity === undefined ? (
                <View className="py-6">
                  <Text style={{ color: "rgba(255,255,255,0.65)" }} className="text-center text-sm">
                    Cargando movimientos...
                  </Text>
                </View>
              ) : activity.length === 0 ? (
                <View className="items-center py-6">
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: "rgba(255,255,255,0.10)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="swap-horizontal" size={20} color="#FFFFFF" />
                  </View>
                  <Text style={{ color: "#FFFFFF" }} className="mt-3 text-sm font-medium">
                    Aún no hay movimientos
                  </Text>
                  <Text
                    style={{ color: "rgba(255,255,255,0.65)" }}
                    className="mt-1 text-center text-xs"
                  >
                    Manda tu primer pago o cobra con tu @handle.
                  </Text>
                </View>
              ) : (
                activity.map((item, index) => (
                  <View
                    key={item.publicId}
                    style={
                      index > 0
                        ? { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" }
                        : undefined
                    }
                  >
                    <ActivityRow
                      item={item}
                      onPress={() =>
                        router.push({
                          pathname: "/order/[publicId]",
                          params: { publicId: item.publicId },
                        })
                      }
                    />
                  </View>
                ))
              )}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <Container className="px-5" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between pb-6 pt-4">
        <View>
          <Text className="text-sm text-muted">Hola</Text>
          <Text className="text-2xl font-semibold tracking-tight text-foreground">{firstName}</Text>
        </View>
        <View className="flex-row items-center gap-2.5">
          <Pressable
            onPress={() => router.push("/theme-preview")}
            className="h-10 w-10 items-center justify-center rounded-full bg-surface"
          >
            <Ionicons name="color-palette-outline" size={20} color={foreground} />
          </Pressable>
          <Pressable onPress={() => router.push("/profile")}>
            <Avatar size="md" color="success">
              <Avatar.Fallback>{initials(profile.displayName)}</Avatar.Fallback>
            </Avatar>
          </Pressable>
        </View>
      </View>

      <View className="rounded-3xl bg-success p-5">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-medium uppercase tracking-widest text-success-foreground opacity-70">
            Tu @handle
          </Text>
          <Pressable onPress={shareHandle} hitSlop={10}>
            <Ionicons name="share-outline" size={18} color={successForeground} />
          </Pressable>
        </View>
        <Text className="mt-1 text-3xl font-bold tracking-tight text-success-foreground">
          @{profile.handle ?? "cozi"}
        </Text>
        <Text className="mt-2 text-sm text-success-foreground opacity-80">
          Manda y recibe dinero sin compartir tu CLABE.
        </Text>

        <View className="mt-5 flex-row gap-3">
          <Pressable
            onPress={() => router.push("/send")}
            className="flex-1 items-center rounded-2xl bg-foreground py-3"
          >
            <Text className="font-semibold text-background">Enviar</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/request")}
            className="flex-1 items-center rounded-2xl bg-black/10 py-3"
          >
            <Text className="font-semibold text-success-foreground">Cobrar</Text>
          </Pressable>
        </View>
      </View>

      {!profile.hasReceivingAccount ? (
        <Pressable
          onPress={() =>
            router.push(profile.hasPendingBankAccount ? "/bank-account-status" : "/profile")
          }
          className="mt-4 flex-row items-center gap-3 rounded-2xl bg-surface-secondary p-4"
        >
          <Ionicons
            name={profile.hasPendingBankAccount ? "time-outline" : "alert-circle"}
            size={22}
            color={success}
          />
          <View className="flex-1">
            <Text className="text-sm font-medium text-foreground">
              {profile.hasPendingBankAccount ? "Cuenta en activación" : "Vincula tu cuenta"}
            </Text>
            <Text className="mt-0.5 text-xs text-muted">
              {profile.hasPendingBankAccount
                ? "Banxico está validando tu CLABE (1–5 días hábiles)."
                : "Para recibir pagos y cobrar con Cozi."}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={foreground} />
        </Pressable>
      ) : null}

      <View className="mt-7 flex-row items-center justify-between">
        <Text className="text-lg font-semibold text-foreground">Actividad reciente</Text>
        <Pressable onPress={() => router.push("/activity")}>
          <Text className="text-sm font-medium text-success-soft-foreground">Ver todo</Text>
        </Pressable>
      </View>

      <View className="mt-1 rounded-2xl bg-surface px-4">
        {activity === undefined ? (
          <View className="py-8">
            <Text className="text-center text-sm text-muted">Cargando movimientos...</Text>
          </View>
        ) : activity.length === 0 ? (
          <View className="items-center py-10">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-surface-secondary">
              <Ionicons name="swap-horizontal" size={22} color={foreground} />
            </View>
            <Text className="mt-3 text-sm font-medium text-foreground">Aún no hay movimientos</Text>
            <Text className="mt-1 text-center text-xs text-muted">
              Manda tu primer pago o cobra con tu @handle.
            </Text>
          </View>
        ) : (
          activity.map((item, index) => (
            <View key={item.publicId} className={index > 0 ? "border-t border-border" : undefined}>
              <ActivityRow
                item={item}
                onPress={() =>
                  router.push({
                    pathname: "/order/[publicId]",
                    params: { publicId: item.publicId },
                  })
                }
              />
            </View>
          ))
        )}
      </View>
    </Container>
  );
}
