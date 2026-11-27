import { api } from "@cozi/backend/convex/_generated/api";
import type { Id } from "@cozi/backend/convex/_generated/dataModel";
import { uploadImage, validateProductPhoto } from "@cozi/backend/image-upload";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { Image } from "expo-image";
import { launchImageLibraryAsync } from "expo-image-picker";
import type { ImagePickerAsset } from "expo-image-picker";
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
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Container } from "@/components/container";
import { useAppTheme } from "@/contexts/app-theme-context";
import { useProfile } from "@/contexts/profile-context";
import { formatMxn, parseAmountToCents } from "@/lib/money";

type CatalogProduct = FunctionReturnType<typeof api.products.listByBusiness>[number];

export default function BusinessCatalogScreen() {
  const profile = useProfile();
  const business = profile.business;

  const products = useQuery(
    api.products.listByBusiness,
    business ? { businessId: business._id, includeInactive: true, limit: 100 } : "skip",
  );

  const createProduct = useMutation(api.products.create);
  const updateProduct = useMutation(api.products.update);
  const generatePhotoUploadUrl = useMutation(api.products.generatePhotoUploadUrl);
  const stagePhotoUpload = useMutation(api.products.stagePhotoUpload);
  const discardPendingPhoto = useMutation(api.products.discardPendingPhoto);
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
  const [isPickingPhoto, setIsPickingPhoto] = useState(false);
  const [photoDraft, setPhotoDraft] = useState<ImagePickerAsset | null>();
  const pendingUploadRef = useRef<{ uri: string; storageId: Id<"_storage"> } | null>(null);
  const [togglingId, setTogglingId] = useState<Id<"products"> | null>(null);

  const formBusy = isSaving || isPickingPhoto;
  const currentPhotoUrl = products?.find((product) => product._id === editingId)?.imageUrl;
  const photoUri = photoDraft === undefined ? currentPhotoUrl : photoDraft?.uri;
  const businessId = business?._id;

  function discardPendingUpload() {
    const pending = pendingUploadRef.current;
    pendingUploadRef.current = null;

    if (pending && businessId) {
      void discardPendingPhoto({ businessId, storageId: pending.storageId }).catch(() => {});
    }
  }

  useEffect(
    () => () => {
      const pending = pendingUploadRef.current;
      pendingUploadRef.current = null;

      if (pending && businessId) {
        void discardPendingPhoto({ businessId, storageId: pending.storageId }).catch(() => {});
      }
    },
    [businessId, discardPendingPhoto],
  );

  const glass = isImmersive
    ? { backgroundColor: cardColor, borderColor: cardBorder, borderWidth: 1 }
    : undefined;

  const textPrimary = isImmersive ? { color: "#FFFFFF" } : undefined;
  const textSecondary = isImmersive ? { color: "rgba(255,255,255,0.70)" } : undefined;
  const iconMuted = isImmersive ? "rgba(255,255,255,0.70)" : muted;

  function openCreate() {
    discardPendingUpload();
    setEditingId(null);
    setName("");
    setPrice("");
    setCategory("");
    setDescription("");
    setStock("");
    setPhotoDraft(undefined);
    setShowForm(true);
  }

  function openEdit(product: CatalogProduct) {
    discardPendingUpload();
    setEditingId(product._id);
    setName(product.name);
    setPrice((product.priceCents / 100).toFixed(2));
    setCategory(product.category ?? "");
    setDescription(product.description ?? "");
    setStock(product.stock === null ? "" : String(product.stock));
    setPhotoDraft(undefined);
    setShowForm(true);
  }

  function closeForm(keepUploaded = false) {
    if (!keepUploaded) {
      discardPendingUpload();
    }

    setShowForm(false);
    setEditingId(null);
    setPhotoDraft(undefined);
  }

  async function handlePickPhoto() {
    if (formBusy) {
      return;
    }

    setIsPickingPhoto(true);

    try {
      const result = await launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled) {
        const asset = result.assets[0];

        if (pendingUploadRef.current && pendingUploadRef.current.uri !== asset?.uri) {
          discardPendingUpload();
        }

        setPhotoDraft(asset);
      }
    } catch {
      toast.show({ variant: "danger", label: "No pudimos abrir tus fotos" });
    } finally {
      setIsPickingPhoto(false);
    }
  }

  async function handleSave() {
    if (!business || formBusy) {
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
      let imageStorageId: Id<"_storage"> | null | undefined =
        photoDraft === null ? null : undefined;

      if (photoDraft) {
        if (pendingUploadRef.current?.uri === photoDraft.uri) {
          imageStorageId = pendingUploadRef.current.storageId;
        } else {
          discardPendingUpload();
          const local = await fetch(photoDraft.uri);
          const blob = await local.blob();
          const contentType = photoDraft.mimeType || blob.type;
          validateProductPhoto(blob.size, contentType);

          const uploadedId = await uploadImage(blob, contentType, () =>
            generatePhotoUploadUrl({ businessId: business._id }),
          );

          const staged = await stagePhotoUpload({
            businessId: business._id,
            storageId: uploadedId,
          });

          if (staged.status === "rejected") {
            throw new ConvexError(staged.message);
          }

          pendingUploadRef.current = { uri: photoDraft.uri, storageId: staged.storageId };
          imageStorageId = staged.storageId;
        }
      }

      if (editingId) {
        await updateProduct({
          productId: editingId,
          name: name.trim(),
          description: description.trim(),
          priceCents,
          category: category.trim(),
          imageStorageId,
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
          imageStorageId: imageStorageId ?? undefined,
          stock: stockValue ?? undefined,
        });
        toast.show({ variant: "success", label: "Producto agregado" });
      }

      pendingUploadRef.current = null;
      closeForm(true);
    } catch (error) {
      toast.show({
        variant: "danger",
        label:
          error instanceof ConvexError && typeof error.data === "string"
            ? error.data
            : "No pudimos guardar el producto",
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
      <Container className="px-4 pt-6">
        <Text className="text-sm text-muted">Todavía no tienes un negocio.</Text>
      </Container>
    );
  }

  return (
    <Container className="px-4 pt-4">
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
        <Button
          size="sm"
          variant="secondary"
          isDisabled={formBusy}
          onPress={showForm ? () => closeForm() : openCreate}
        >
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

          <View className="gap-2">
            <Text className="text-sm font-medium" style={textPrimary}>
              Foto (opcional)
            </Text>
            {photoUri ? (
              <Image source={photoUri} style={{ width: 80, height: 80, borderRadius: 8 }} />
            ) : null}
            <Text className="text-xs text-muted" style={textSecondary}>
              {photoDraft === null
                ? "La foto se quitará al guardar."
                : "JPG, PNG o WebP de hasta 5 MB."}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              <Button size="sm" variant="secondary" isDisabled={formBusy} onPress={handlePickPhoto}>
                <Button.Label>{photoUri ? "Reemplazar foto" : "Elegir foto"}</Button.Label>
              </Button>
              {currentPhotoUrl && photoDraft !== null ? (
                <Button
                  size="sm"
                  variant="ghost"
                  isDisabled={formBusy}
                  onPress={() => {
                    discardPendingUpload();
                    setPhotoDraft(null);
                  }}
                >
                  <Button.Label>Quitar foto</Button.Label>
                </Button>
              ) : null}
              {photoDraft !== undefined ? (
                <Button
                  size="sm"
                  variant="ghost"
                  isDisabled={formBusy}
                  onPress={() => {
                    discardPendingUpload();
                    setPhotoDraft(undefined);
                  }}
                >
                  <Button.Label>Deshacer cambio de foto</Button.Label>
                </Button>
              ) : null}
            </View>
          </View>

          <Button isDisabled={formBusy} onPress={handleSave}>
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
              <Pressable disabled={formBusy} onPress={() => openEdit(product)} className="flex-1">
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
              <Pressable disabled={formBusy} onPress={() => openEdit(product)} hitSlop={8}>
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

      {/* Lets the last card scroll above the floating tab bar. */}
      <View className="h-28" />
    </Container>
  );
}
