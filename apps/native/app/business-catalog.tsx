import { api } from "@cozi/backend/convex/_generated/api";
import type { Id } from "@cozi/backend/convex/_generated/dataModel";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
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
import { formatMxn, parseAmountToCents } from "@/lib/money";

type CatalogProduct = {
  _id: Id<"products">;
  name: string;
  description: string | null;
  priceCents: number;
  category: string | null;
  stock: number | null;
  active: boolean;
};

export default function BusinessCatalogScreen() {
  const profile = useProfile();
  const business = profile.business;

  const products = useQuery(
    api.products.listByBusiness,
    business ? { businessId: business._id, includeInactive: true, limit: 100 } : "skip",
  );

  const createProduct = useMutation(api.products.create);
  const updateProduct = useMutation(api.products.update);
  const { toast } = useToast();
  const { isImmersive, cardColor, cardBorder } = useAppTheme();
  const muted = useThemeColor("muted");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<Id<"products"> | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [stock, setStock] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<Id<"products"> | null>(null);

  const glass = isImmersive
    ? { backgroundColor: cardColor, borderColor: cardBorder, borderWidth: 1 }
    : undefined;

  const textPrimary = isImmersive ? { color: "#FFFFFF" } : undefined;
  const textSecondary = isImmersive ? { color: "rgba(255,255,255,0.70)" } : undefined;
  const iconMuted = isImmersive ? "rgba(255,255,255,0.70)" : muted;

  function openCreate() {
    setEditingId(null);
    setName("");
    setPrice("");
    setCategory("");
    setDescription("");
    setStock("");
    setShowForm(true);
  }

  function openEdit(product: CatalogProduct) {
    setEditingId(product._id);
    setName(product.name);
    setPrice((product.priceCents / 100).toFixed(2));
    setCategory(product.category ?? "");
    setDescription(product.description ?? "");
    setStock(product.stock === null ? "" : String(product.stock));
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function handleSave() {
    if (!business) {
      return;
    }

    const priceCents = parseAmountToCents(price);

    if (!name.trim()) {
      toast.show({ variant: "danger", label: "Escribe el nombre del producto" });

      return;
    }

    if (priceCents === null || priceCents < 100) {
      toast.show({ variant: "danger", label: "Escribe un precio válido (mínimo $1 MXN)" });

      return;
    }

    let stockValue: number | null = null;

    if (stock.trim()) {
      const parsed = Number(stock.trim());

      if (!Number.isInteger(parsed) || parsed < 0) {
        toast.show({
          variant: "danger",
          label: "El inventario debe ser un entero mayor o igual a 0",
        });

        return;
      }

      stockValue = parsed;
    }

    setIsSaving(true);

    try {
      if (editingId) {
        await updateProduct({
          productId: editingId,
          name: name.trim(),
          description: description.trim(),
          priceCents,
          category: category.trim(),
          stock: stockValue,
        });
        toast.show({ variant: "success", label: "Producto actualizado" });
      } else {
        await createProduct({
          businessId: business._id,
          name: name.trim(),
          description: description.trim(),
          priceCents,
          category: category.trim(),
          stock: stockValue ?? undefined,
        });
        toast.show({ variant: "success", label: "Producto agregado" });
      }

      closeForm();
    } catch (error) {
      toast.show({
        variant: "danger",
        label: error instanceof Error ? error.message : "No pudimos guardar el producto",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggle(product: CatalogProduct) {
    setTogglingId(product._id);

    try {
      await updateProduct({ productId: product._id, active: !product.active });
    } catch (error) {
      toast.show({
        variant: "danger",
        label: error instanceof Error ? error.message : "No pudimos cambiar la disponibilidad",
      });
    } finally {
      setTogglingId(null);
    }
  }

  if (!business) {
    return (
      <Container className="px-5 pt-6">
        <Text className="text-sm text-muted">Todavía no tienes un negocio.</Text>
      </Container>
    );
  }

  return (
    <Container className="px-5 pt-4">
      <Animated.View
        entering={FadeInDown.duration(220)}
        className="flex-row items-center justify-between gap-3"
      >
        <View className="flex-1">
          <Text
            className="text-2xl font-semibold tracking-tight text-foreground"
            style={textPrimary}
          >
            Catálogo
          </Text>
          <Text className="mt-0.5 text-sm text-muted" style={textSecondary}>
            Lo que tus clientes pueden pedir.
          </Text>
        </View>
        <Button size="sm" variant="secondary" onPress={showForm ? closeForm : openCreate}>
          <Button.Label>{showForm ? "Cerrar" : "Agregar"}</Button.Label>
        </Button>
      </Animated.View>

      {showForm ? (
        <Animated.View
          entering={FadeInDown.duration(220)}
          className={cn("mt-4 gap-3 rounded-2xl p-4", !isImmersive && "bg-surface")}
          style={glass}
        >
          <TextField>
            <Label>Nombre del producto</Label>
            <Input
              value={name}
              onChangeText={setName}
              placeholder="Ej. Café americano"
              autoCapitalize="sentences"
            />
          </TextField>

          <TextField>
            <Label>Precio (MXN)</Label>
            <Input
              value={price}
              onChangeText={setPrice}
              placeholder="45.00"
              keyboardType="decimal-pad"
            />
          </TextField>

          <TextField>
            <Label>Categoría</Label>
            <Input value={category} onChangeText={setCategory} placeholder="Ej. Bebidas" />
          </TextField>

          <TextField>
            <Label>Descripción</Label>
            <Input
              value={description}
              onChangeText={setDescription}
              placeholder="Opcional"
              autoCapitalize="sentences"
            />
          </TextField>

          <TextField>
            <Label>Inventario</Label>
            <Input
              value={stock}
              onChangeText={setStock}
              placeholder="Opcional; déjalo vacío para no controlarlo"
              keyboardType="number-pad"
            />
          </TextField>

          <Button isDisabled={isSaving} onPress={handleSave}>
            {isSaving ? (
              <Spinner size="sm" color="default" />
            ) : (
              <Button.Label>{editingId ? "Guardar producto" : "Agregar producto"}</Button.Label>
            )}
          </Button>
        </Animated.View>
      ) : null}

      <Animated.View
        entering={FadeInDown.duration(220).delay(80)}
        className={cn("mt-4 rounded-2xl px-4", !isImmersive && "bg-surface")}
        style={glass}
      >
        {products === undefined ? (
          <View className="py-6">
            <Text className="text-center text-sm text-muted" style={textSecondary}>
              Cargando productos...
            </Text>
          </View>
        ) : products.length === 0 ? (
          <View className="items-center py-8">
            <Ionicons name="pricetags-outline" size={24} color={iconMuted} />
            <Text className="mt-2 text-sm font-medium text-foreground" style={textPrimary}>
              Sin productos todavía
            </Text>
            <Text className="mt-1 text-center text-xs text-muted" style={textSecondary}>
              Agrega tu primer producto para empezar a vender.
            </Text>
          </View>
        ) : (
          products.map((product, index) => (
            <View
              key={product._id}
              className={cn(
                "flex-row items-center gap-3 py-3",
                index > 0 && "border-t border-border",
              )}
            >
              <Pressable onPress={() => openEdit(product)} className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text
                    className="flex-shrink text-sm font-medium text-foreground"
                    style={textPrimary}
                  >
                    {product.name}
                  </Text>
                  {!product.active ? (
                    <Chip size="sm" variant="soft" color="default">
                      <Chip.Label>Inactivo</Chip.Label>
                    </Chip>
                  ) : null}
                </View>
                <Text className="mt-0.5 text-xs text-muted" style={textSecondary}>
                  {formatMxn(product.priceCents)} · {product.category ?? "Sin categoría"}
                </Text>
                <Text className="mt-0.5 text-xs text-muted" style={textSecondary}>
                  {product.stock === null
                    ? "Sin control de inventario"
                    : `Inventario: ${product.stock}`}
                </Text>
              </Pressable>
              <Switch
                accessibilityLabel={`Disponibilidad de ${product.name}`}
                isSelected={product.active}
                isDisabled={togglingId === product._id}
                onSelectedChange={() => handleToggle(product)}
              />
              <Pressable onPress={() => openEdit(product)} hitSlop={8}>
                <Ionicons name="create-outline" size={18} color={iconMuted} />
              </Pressable>
            </View>
          ))
        )}
      </Animated.View>

      <View
        className={cn(
          "mt-4 flex-row items-start gap-2 rounded-2xl px-4 py-3",
          !isImmersive && "bg-surface",
        )}
        style={glass}
      >
        <Ionicons name="information-circle-outline" size={16} color={muted} />
        <Text className="flex-1 text-xs leading-5 text-muted" style={textSecondary}>
          Los productos inactivos no aparecen en tu perfil público. El inventario se descuenta al
          pagar; si lo dejas vacío, no se controla.
        </Text>
      </View>
    </Container>
  );
}
