import { api } from "@cozi/backend/convex/_generated/api";
import type { OrderStatus } from "@cozi/backend/convex/schema";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Spinner, Text, useThemeColor, useToast } from "heroui-native";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme } from "@/contexts/app-theme-context";
import { authClient } from "@/lib/auth-client";
import { formatMxn } from "@/lib/money";
import { firstParam } from "@/lib/search-params";

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Pendiente",
  awaiting_payment: "Esperando pago",
  paid: "Pagado",
  fulfilled: "Completado",
  cancelled: "Cancelado",
  expired: "Expirado",
};

function formatMessageTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ConversationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ threadId: string }>();
  const threadId = firstParam(params.threadId);
  const insets = useSafeAreaInsets();
  const { toast } = useToast();
  const { isImmersive, baseColor, cardColor, cardBorder } = useAppTheme();
  const background = useThemeColor("background");
  const muted = useThemeColor("muted");
  const success = useThemeColor("success");
  const successForeground = useThemeColor("success-foreground");

  const thread = useQuery(api.messages.getThread, threadId ? { threadId } : "skip");
  const sendMessage = useMutation(api.messages.sendMessage);
  const markRead = useMutation(api.messages.markRead);
  const setMuted = useMutation(api.messages.setMuted);
  const setCounterpartBlocked = useMutation(api.messages.setCounterpartBlocked);
  const reportThread = useMutation(api.messages.reportThread);
  const { data: session } = authClient.useSession();

  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isSavingMute, setIsSavingMute] = useState(false);
  const [isModerating, setIsModerating] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const messageCount = thread?.messages.length ?? 0;
  const conversationId = thread?.threadId;

  useEffect(() => {
    if (conversationId) {
      void markRead({ threadId: conversationId });
    }
  }, [conversationId, markRead, messageCount]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messageCount]);

  const cleaned = draft.trim();
  const canSend = thread?.canSend === true && cleaned.length > 0 && !isSending && !isModerating;

  async function moderate(action: () => Promise<null>, fallback: string) {
    setIsModerating(true);

    try {
      await action();
    } catch (error) {
      toast.show({ variant: "danger", label: conversationError(error, fallback) });
    } finally {
      setIsModerating(false);
    }
  }

  async function toggleMute() {
    if (!thread || !session || isSavingMute) {
      return;
    }

    setIsSavingMute(true);

    try {
      await setMuted({
        threadId: thread.threadId,
        muted: !thread.isMuted,
        authUserId: session.user.id,
      });
    } catch {
      toast.show({ variant: "danger", label: "No pudimos actualizar esta conversación" });
    } finally {
      setIsSavingMute(false);
    }
  }

  async function handleSend() {
    if (!thread || !canSend) {
      return;
    }

    setIsSending(true);

    try {
      await sendMessage({ threadId: thread.threadId, text: cleaned });
      setDraft("");
    } catch (error) {
      toast.show({
        variant: "danger",
        label: conversationError(error, "No pudimos enviar el mensaje"),
      });
    } finally {
      setIsSending(false);
    }
  }

  if (thread === undefined) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background"
        style={isImmersive ? { backgroundColor: baseColor } : undefined}
      >
        <Spinner />
      </View>
    );
  }

  if (thread === null) {
    return (
      <View
        className="flex-1 items-center justify-center gap-3 bg-background px-8"
        style={isImmersive ? { backgroundColor: baseColor } : undefined}
      >
        <Ionicons name="chatbubbles-outline" size={32} color={muted} />
        <Text className="text-center text-lg font-semibold text-foreground">
          Conversación no disponible
        </Text>
        <Text className="text-center text-sm text-muted">
          Este hilo no existe o ya no tienes acceso a él.
        </Text>
      </View>
    );
  }

  const current = thread;
  const blockLabel = current.blockedByViewer ? "Desbloquear" : "Bloquear";

  function confirmBlock() {
    const blocked = !current.blockedByViewer;
    Alert.alert(
      blockLabel,
      blocked
        ? "Se desactivará el envío entre ambas cuentas. Podrás seguir leyendo el historial."
        : "Esto quitará tu bloqueo en todas las conversaciones con esta cuenta.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: blockLabel,
          style: blocked ? "destructive" : "default",
          onPress: () =>
            void moderate(
              () => setCounterpartBlocked({ threadId: current.threadId, blocked }),
              "No pudimos cambiar el bloqueo",
            ),
        },
      ],
    );
  }

  function confirmReport() {
    Alert.alert(
      "Reportar conversación",
      "Soporte de Cozi podrá revisar hasta 20 mensajes, incluido el último que recibiste.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Reportar",
          onPress: () =>
            void moderate(
              () => reportThread({ threadId: current.threadId }),
              "No pudimos enviar el reporte",
            ),
        },
      ],
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: isImmersive ? baseColor : background }}
    >
      <View className="px-5 pb-2 pt-4">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="flex-1 text-lg font-semibold text-foreground">
            {current.counterpartName}
          </Text>
          {current.business || current.order?.isBusinessOrder ? (
            <Pressable
              accessibilityRole="button"
              disabled={isSavingMute}
              hitSlop={8}
              onPress={() => void toggleMute()}
            >
              <Text className="text-sm font-medium text-muted">
                {current.isMuted ? "Quitar silencio" : "Silenciar"}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {current.counterpartHandle ? (
          <Text className="mt-0.5 text-xs text-muted">@{current.counterpartHandle}</Text>
        ) : null}
        {current.order ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/order/[publicId]",
                params: { publicId: current.order?.publicId ?? "" },
              })
            }
            className="mt-2 flex-row items-center gap-2 rounded-2xl bg-surface px-3 py-2"
            style={
              isImmersive
                ? { backgroundColor: cardColor, borderColor: cardBorder, borderWidth: 1 }
                : undefined
            }
          >
            <Ionicons name="receipt-outline" size={15} color={muted} />
            <Text className="flex-1 text-xs text-muted" numberOfLines={1}>
              {current.order.concept} · {formatMxn(current.order.amountCents)} ·{" "}
              {ORDER_STATUS_LABELS[current.order.status] ?? current.order.status}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={muted} />
          </Pressable>
        ) : current.business ? (
          <Text className="mt-1 text-xs text-muted">{current.business.name}</Text>
        ) : null}
        {current.canBlockOrReport ? (
          <View className="flex-row flex-wrap items-center gap-x-4">
            <Pressable
              accessibilityRole="button"
              disabled={isModerating}
              onPress={confirmBlock}
              className="min-h-11 justify-center"
            >
              <Text className="text-sm font-medium text-foreground">{blockLabel}</Text>
            </Pressable>
            {current.reportStatus !== "available" ? (
              <Text accessibilityLiveRegion="polite" className="text-sm text-muted">
                {current.reportStatus === "pending" ? "Reporte enviado" : "Reporte revisado"}
              </Text>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={isModerating}
                onPress={confirmReport}
                className="min-h-11 justify-center"
              >
                <Text className="text-sm font-medium text-foreground">Reportar conversación</Text>
              </Pressable>
            )}
          </View>
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "flex-end",
          gap: 10,
          paddingHorizontal: 20,
          paddingVertical: 12,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        {current.messages.length === 0 ? (
          <Text className="py-8 text-center text-sm text-muted">Aún no hay mensajes.</Text>
        ) : (
          current.messages.map((message) => (
            <View key={message.messageId} className={message.isMine ? "items-end" : "items-start"}>
              <View
                className={`max-w-[82%] rounded-2xl px-4 py-2.5 ${
                  message.isMine ? "bg-success" : "bg-surface"
                }`}
                style={
                  !message.isMine && isImmersive
                    ? { backgroundColor: cardColor, borderColor: cardBorder, borderWidth: 1 }
                    : undefined
                }
              >
                <Text
                  className={`text-sm ${
                    message.isMine ? "text-success-foreground" : "text-foreground"
                  }`}
                >
                  {message.text}
                </Text>
              </View>
              <Text className="mt-1 px-1 text-[10px] text-muted">
                {formatMessageTime(message.createdAt)}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      {current.canSend ? (
        <View
          className="flex-row items-end gap-2 border-t border-border px-4 pt-2"
          style={[
            { paddingBottom: Math.max(insets.bottom, 12) },
            isImmersive ? { borderTopColor: cardBorder } : undefined,
          ]}
        >
          <TextInput
            accessibilityLabel="Mensaje"
            value={draft}
            onChangeText={setDraft}
            placeholder="Escribe un mensaje"
            placeholderTextColor={muted}
            selectionColor={success}
            cursorColor={success}
            underlineColorAndroid="transparent"
            multiline
            maxLength={1000}
            className="flex-1 rounded-2xl bg-surface px-4 py-3 text-sm text-foreground"
            style={{ maxHeight: 112, color: isImmersive ? "#FFFFFF" : undefined }}
          />
          <Pressable
            accessibilityLabel="Enviar mensaje"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSend, busy: isSending }}
            disabled={!canSend}
            onPress={handleSend}
            className={`h-11 w-11 items-center justify-center rounded-full ${
              canSend ? "bg-success" : "bg-surface-secondary"
            }`}
          >
            {isSending ? (
              <Spinner size="sm" color="default" />
            ) : (
              <Ionicons name="send" size={18} color={canSend ? successForeground : muted} />
            )}
          </Pressable>
        </View>
      ) : (
        <Text
          accessibilityLiveRegion="polite"
          className="border-t border-border px-4 pt-3 text-sm text-muted"
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}
        >
          No se pueden enviar mensajes en esta conversación.
        </Text>
      )}
    </KeyboardAvoidingView>
  );
}

function conversationError(error: unknown, fallback: string) {
  return error instanceof ConvexError && typeof error.data === "string" ? error.data : fallback;
}
