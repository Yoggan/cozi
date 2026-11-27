import { api } from "@cozi/backend/convex/_generated/api";
import type { DailySummaryResult } from "@cozi/backend/convex/closeout";
import {
  businessTimeZones,
  isBusinessDay,
  shiftBusinessDay,
} from "@cozi/backend/convex/lib/businessDay";
import { Icon } from "@/components/icon";
import { useAction, useMutation, usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Link } from "expo-router";
import {
  Button,
  Input,
  Label,
  Select,
  Spinner,
  Text,
  TextField,
  useThemeColor,
  useToast,
} from "heroui-native";
import { useEffect, useState } from "react";
import { FlatList, Pressable, ScrollView, View } from "react-native";
import type { ListRenderItemInfo } from "react-native";

import { Container } from "@/components/container";
import { useProfile } from "@/contexts/profile-context";
import { exportCloseout } from "@/lib/export-closeout";
import { formatMxn } from "@/lib/money";

const AWAITING_PAGE_SIZE = 25;

type PendingOrder = FunctionReturnType<typeof api.closeout.listAwaitingFulfillment>["page"][number];

function orderKey(order: PendingOrder) {
  return order.publicId;
}

function renderOrder({ item }: ListRenderItemInfo<PendingOrder>) {
  return (
    <Link href={{ pathname: "/order/[publicId]", params: { publicId: item.publicId } }} asChild>
      <Pressable
        accessibilityRole="link"
        className="flex-row items-center gap-3 border-b border-border py-4"
      >
        <View className="flex-1">
          <Text className="font-semibold" numberOfLines={1}>
            {item.customerName ?? "Pedido de mostrador"}
          </Text>
          <Text className="text-xs text-muted">#{item.publicId.slice(-8)}</Text>
        </View>
        <Text className="font-semibold tabular-nums">{formatMxn(item.totalCents)}</Text>
      </Pressable>
    </Link>
  );
}

export default function BusinessCloseout() {
  const { business } = useProfile();
  const [day, setDay] = useState<string>();
  const [now, setNow] = useState(Date.now);
  const [draft, setDraft] = useState<string>();
  const [refreshNonce, setRefreshNonce] = useState(0);

  const [summaryState, setSummaryState] = useState<
    | { key: string; status: "ready"; data: DailySummaryResult }
    | { key: string; status: "error"; message: string }
    | null
  >(null);

  const [exporting, setExporting] = useState(false);
  const [savingZone, setSavingZone] = useState(false);
  const { toast } = useToast();
  const foreground = useThemeColor("foreground");

  const update = useMutation(api.businesses.update);
  const getDailySummary = useAction(api.closeout.getDailySummary);
  const exportDailyCsv = useAction(api.closeout.exportDailyCsv);

  const businessId = business?._id;
  const summaryKey = businessId ? `${businessId}:${day ?? "today"}:${now}:${refreshNonce}` : null;
  const activeState = summaryKey && summaryState?.key === summaryKey ? summaryState : null;
  const summary = activeState?.status === "ready" ? activeState.data : null;
  const summaryError = activeState?.status === "error" ? activeState.message : null;
  const loadingSummary = Boolean(summaryKey && activeState === null);

  useEffect(() => {
    if (!businessId || !summaryKey) {
      return;
    }

    const currentBusinessId = businessId;
    const currentKey = summaryKey;
    let cancelled = false;

    async function load() {
      try {
        const result = await getDailySummary({ businessId: currentBusinessId, day, now });

        if (!cancelled) {
          setSummaryState({ key: currentKey, status: "ready", data: result });
        }
      } catch {
        if (!cancelled) {
          const message = "No pudimos cargar el corte diario";
          setSummaryState({ key: currentKey, status: "error", message });
          toast.show({ variant: "danger", label: message });
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [businessId, day, now, summaryKey, getDailySummary, toast]);

  const awaiting = usePaginatedQuery(
    api.closeout.listAwaitingFulfillment,
    businessId ? { businessId, day: day ?? summary?.day, now } : "skip",
    { initialNumItems: AWAITING_PAGE_SIZE },
  );

  const selectedDay = day ?? summary?.day;
  const previousDay = selectedDay && shiftBusinessDay(selectedDay, -1);
  const nextDay = selectedDay && shiftBusinessDay(selectedDay, 1);
  const zone = businessTimeZones.find(({ value }) => value === summary?.timeZone);
  const awaitingCount = summary?.awaitingFulfillmentCount ?? awaiting.results.length;

  function selectDay(value: string | undefined) {
    setDraft(undefined);
    setDay(value);

    if (!value) {
      setNow(Date.now());
    }
  }

  function submitDate() {
    if (draft === undefined) {
      return;
    }

    if (!draft || !isBusinessDay(draft)) {
      toast.show({ variant: "danger", label: "Escribe una fecha válida en formato AAAA-MM-DD" });

      return;
    }

    selectDay(draft);
  }

  async function saveTimeZone(value: string) {
    const option = businessTimeZones.find((candidate) => candidate.value === value);

    if (!businessId || !option || option.value === summary?.timeZone) {
      return;
    }

    setSavingZone(true);

    try {
      await update({ businessId, timeZone: option.value });
      setRefreshNonce((current) => current + 1);
    } catch {
      toast.show({ variant: "danger", label: "No pudimos guardar la zona horaria" });
    } finally {
      setSavingZone(false);
    }
  }

  async function shareCsv() {
    if (!businessId || !summary) {
      return;
    }

    setExporting(true);

    try {
      const exported = await exportDailyCsv({ businessId, day: summary.day, now });
      await exportCloseout(exported.filename, exported.csv);
    } catch {
      toast.show({ variant: "danger", label: "No pudimos exportar el corte" });
    } finally {
      setExporting(false);
    }
  }

  if (!business) {
    return (
      <Container className="px-4">
        <Text className="py-6 text-muted">
          El corte diario está disponible para dueños de negocios.
        </Text>
      </Container>
    );
  }

  return (
    <Container isScrollable={false} className="px-4" showBackdrop={false}>
      <FlatList
        data={awaiting.results}
        keyExtractor={orderKey}
        renderItem={renderOrder}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View className="gap-4 pt-5">
            <View className="flex-row items-end gap-2">
              <TextField className="flex-1">
                <Label>Fecha del corte</Label>
                <Input
                  accessibilityLabel="Fecha del corte, año-mes-día"
                  value={draft ?? selectedDay ?? ""}
                  placeholder="AAAA-MM-DD"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={10}
                  onChangeText={setDraft}
                  onSubmitEditing={submitDate}
                  returnKeyType="go"
                />
              </TextField>
              {draft !== undefined ? (
                <Button variant="secondary" onPress={submitDate}>
                  <Button.Label>Ver</Button.Label>
                </Button>
              ) : (
                <Button variant="secondary" onPress={() => selectDay(undefined)}>
                  <Button.Label>Hoy</Button.Label>
                </Button>
              )}
            </View>
            <View className="flex-row gap-2">
              <Button
                accessibilityLabel="Día anterior"
                variant="secondary"
                isIconOnly
                isDisabled={!previousDay || !isBusinessDay(previousDay)}
                onPress={() => selectDay(previousDay)}
              >
                <Icon name="chevron-back" size={18} color={foreground} />
              </Button>
              <Button
                accessibilityLabel="Día siguiente"
                variant="secondary"
                isIconOnly
                isDisabled={!nextDay || !isBusinessDay(nextDay)}
                onPress={() => selectDay(nextDay)}
              >
                <Icon name="chevron-forward" size={18} color={foreground} />
              </Button>
              <Button
                accessibilityLabel="Actualizar corte"
                variant="secondary"
                isIconOnly
                isDisabled={loadingSummary || savingZone}
                onPress={() => setRefreshNonce((current) => current + 1)}
              >
                <Icon name="refresh" size={18} color={foreground} />
              </Button>
              <Button
                className="ml-auto"
                onPress={() => void shareCsv()}
                isDisabled={
                  !summary || loadingSummary || draft !== undefined || exporting || savingZone
                }
              >
                <Button.Label>{exporting ? "Exportando…" : "Exportar CSV"}</Button.Label>
              </Button>
            </View>
            {summary ? (
              <>
                <View className="gap-1">
                  <Text className="text-sm font-medium">Zona horaria del negocio</Text>
                  <Select
                    presentation="dialog"
                    value={zone}
                    onValueChange={(option) => {
                      if (option) {
                        void saveTimeZone(option.value);
                      }
                    }}
                  >
                    <Select.Trigger
                      accessibilityLabel="Zona horaria del negocio"
                      isDisabled={savingZone}
                    >
                      <Select.Value placeholder="Elige una zona horaria" />
                      <Select.TriggerIndicator />
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Overlay />
                      <Select.Content presentation="dialog">
                        <Select.ListLabel>Zona horaria del negocio</Select.ListLabel>
                        <ScrollView className="max-h-80" keyboardShouldPersistTaps="handled">
                          {businessTimeZones.map(({ value, label }) => (
                            <Select.Item key={value} value={value} label={label} />
                          ))}
                        </ScrollView>
                      </Select.Content>
                    </Select.Portal>
                  </Select>
                </View>
                <View className="gap-3 rounded-2xl bg-surface p-4">
                  <View>
                    <Text className="text-sm text-muted">Total cobrado (MXN)</Text>
                    <Text className="text-3xl font-bold tabular-nums">
                      {formatMxn(summary.totalPaidCents)}
                    </Text>
                  </View>
                  <View className="flex-row flex-wrap gap-x-8 gap-y-2 border-t border-border pt-3">
                    <View>
                      <Text className="text-sm text-muted">Propinas incluidas</Text>
                      <Text className="text-lg font-semibold tabular-nums">
                        {formatMxn(summary.tipCents)}
                      </Text>
                    </View>
                    <View>
                      <Text className="text-sm text-muted">Pedidos pagados</Text>
                      <Text className="text-lg font-semibold tabular-nums">
                        {summary.paidOrderCount}
                      </Text>
                    </View>
                  </View>
                </View>
                <Text accessibilityRole="header" className="text-lg font-semibold">
                  Por entregar ({awaitingCount})
                </Text>
              </>
            ) : summaryError ? (
              <View className="gap-3 rounded-2xl bg-surface p-4">
                <Text className="text-sm text-danger">{summaryError}</Text>
                <Button
                  variant="secondary"
                  className="self-start"
                  onPress={() => setRefreshNonce((current) => current + 1)}
                >
                  <Button.Label>Reintentar</Button.Label>
                </Button>
              </View>
            ) : (
              <Spinner accessibilityLabel="Cargando corte" className="self-center" />
            )}
          </View>
        }
        ListEmptyComponent={
          summary && awaiting.status !== "LoadingFirstPage" ? (
            <Text className="py-3 text-muted">
              No hay pedidos pagados por entregar para esta fecha.
            </Text>
          ) : summary && awaiting.status === "LoadingFirstPage" ? (
            <Spinner
              accessibilityLabel="Cargando pedidos por entregar"
              className="my-4 self-center"
            />
          ) : null
        }
        ListFooterComponent={
          awaiting.status === "CanLoadMore" ? (
            <View className="py-4">
              <Button variant="secondary" onPress={() => awaiting.loadMore(AWAITING_PAGE_SIZE)}>
                <Button.Label>Cargar más</Button.Label>
              </Button>
            </View>
          ) : awaiting.status === "LoadingMore" ? (
            <Spinner accessibilityLabel="Cargando más pedidos" className="my-4 self-center" />
          ) : null
        }
      />
    </Container>
  );
}
