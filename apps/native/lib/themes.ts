import type { ImageSourcePropType } from "react-native";

export const COZI_DARK_COLORS = {
  glass: "rgba(10, 42, 32, 0.62)",
  subtleBorder: "rgba(245, 239, 227, 0.10)",
  primaryText: "#F5EFE3",
  secondaryText: "#BCC6C0",
  primaryAction: "#F5EFE3",
  primaryActionText: "#0B0F0D",
};

export const COZI_LIGHT_COLORS = {
  canvas: "#FBF8F2",
  glass: "rgba(255, 255, 255, 0.72)",
  subtleBorder: "rgba(11, 15, 13, 0.08)",
  primaryText: "#0B0F0D",
  secondaryText: "#26302B",
  primaryAction: "#0F3D2E",
  primaryActionText: "#F5EFE3",
};

export type BackdropCategory = "todos" | "naturaleza" | "abstracto" | "seda" | "metal";

export type AccentOption = {
  id: string;
  label: string;
  hex: string;
  softHex: string;
  foreground: string;
};

export type BackdropOption = {
  id: string;
  name: string;
  category: Exclude<BackdropCategory, "todos">;
  kind: "image" | "gradient";
  image?: ImageSourcePropType;
  gradientColors?: [string, string, string];
  baseColor: string;
  cardColor: string;
  cardBorder: string;
  glassColor?: string;
  glassBorder?: string;
  defaultAccentId: string;
};

export type ThemePreset = {
  id: string;
  name: string;
  subtitle: string;
  immersive: boolean;
  backdropId: string | null;
  baseColor: string;
  cardColor: string;
  cardBorder: string;
  defaultAccentId: string;
  defaultMode: "dark" | "light";
};

export const BACKDROP_CATEGORIES: Array<{ id: BackdropCategory; label: string; icon?: string }> = [
  { id: "todos", label: "Todos" },
  { id: "naturaleza", label: "Naturaleza" },
  { id: "abstracto", label: "Abstracto" },
  { id: "seda", label: "Seda" },
  { id: "metal", label: "Metal" },
];

export const ACCENT_OPTIONS: Array<AccentOption> = [
  {
    id: "emerald",
    label: "Esmeralda",
    hex: "#22C55E",
    softHex: "rgba(34, 197, 94, 0.18)",
    foreground: "#052E16",
  },
  {
    id: "sky",
    label: "Cielo",
    hex: "#38BDF8",
    softHex: "rgba(56, 189, 248, 0.18)",
    foreground: "#082F49",
  },
  {
    id: "indigo",
    label: "Índigo",
    hex: "#818CF8",
    softHex: "rgba(129, 140, 248, 0.2)",
    foreground: "#1E1B4B",
  },
  {
    id: "amber",
    label: "Ámbar",
    hex: "#FBBF24",
    softHex: "rgba(251, 191, 36, 0.18)",
    foreground: "#451A03",
  },
  {
    id: "rose",
    label: "Rosa",
    hex: "#FB7185",
    softHex: "rgba(251, 113, 133, 0.18)",
    foreground: "#4C0519",
  },
  {
    id: "silver",
    label: "Plata",
    hex: "#E4E4E7",
    softHex: "rgba(228, 228, 231, 0.16)",
    foreground: "#09090B",
  },
];

export const BACKDROP_OPTIONS: Array<BackdropOption> = [
  {
    id: "forest",
    name: "Bosque",
    category: "naturaleza",
    kind: "image",
    image: require("../assets/themes/forest.jpg"),
    baseColor: "#0E1B0D",
    cardColor: "rgba(28, 46, 26, 0.72)",
    cardBorder: "rgba(255, 255, 255, 0.10)",
    glassColor: COZI_DARK_COLORS.glass,
    defaultAccentId: "emerald",
  },
  {
    id: "aurora",
    name: "Aurora",
    category: "abstracto",
    kind: "image",
    image: require("../assets/themes/aurora.jpg"),
    baseColor: "#080B1A",
    cardColor: "rgba(20, 25, 52, 0.74)",
    cardBorder: "rgba(255, 255, 255, 0.10)",
    glassColor: "rgba(20, 25, 52, 0.70)",
    defaultAccentId: "indigo",
  },
  {
    id: "silk-sage",
    name: "Seda Salvia",
    category: "seda",
    kind: "image",
    image: require("../assets/themes/silk-sage.jpg"),
    baseColor: "#141C14",
    cardColor: "rgba(35, 46, 35, 0.72)",
    cardBorder: "rgba(255, 255, 255, 0.10)",
    glassColor: "rgba(35, 46, 35, 0.70)",
    defaultAccentId: "emerald",
  },
  {
    id: "metal-slate",
    name: "Acero Azul",
    category: "metal",
    kind: "image",
    image: require("../assets/themes/metal-slate.jpg"),
    baseColor: "#0D1624",
    cardColor: "rgba(24, 36, 56, 0.74)",
    cardBorder: "rgba(255, 255, 255, 0.11)",
    glassColor: "rgba(24, 36, 56, 0.72)",
    glassBorder: "rgba(245, 239, 227, 0.11)",
    defaultAccentId: "sky",
  },
  {
    id: "moss-glow",
    name: "Musgo",
    category: "naturaleza",
    kind: "gradient",
    gradientColors: ["#234227", "#142917", "#0C180E"],
    baseColor: "#0C180E",
    cardColor: "rgba(26, 46, 29, 0.75)",
    cardBorder: "rgba(255, 255, 255, 0.09)",
    defaultAccentId: "emerald",
  },
  {
    id: "midnight-indigo",
    name: "Medianoche",
    category: "abstracto",
    kind: "gradient",
    gradientColors: ["#312E81", "#17153B", "#09091A"],
    baseColor: "#09091A",
    cardColor: "rgba(26, 24, 58, 0.74)",
    cardBorder: "rgba(255, 255, 255, 0.10)",
    glassColor: "rgba(26, 24, 58, 0.72)",
    defaultAccentId: "indigo",
  },
  {
    id: "olive-velvet",
    name: "Oliva",
    category: "seda",
    kind: "gradient",
    gradientColors: ["#4B5945", "#2A3327", "#141A13"],
    baseColor: "#141A13",
    cardColor: "rgba(36, 44, 34, 0.74)",
    cardBorder: "rgba(255, 255, 255, 0.10)",
    glassColor: "rgba(36, 44, 34, 0.72)",
    defaultAccentId: "amber",
  },
  {
    id: "cobalt-steel",
    name: "Cobalto",
    category: "metal",
    kind: "gradient",
    gradientColors: ["#3B6496", "#1D3452", "#0C1726"],
    baseColor: "#0C1726",
    cardColor: "rgba(22, 37, 59, 0.76)",
    cardBorder: "rgba(255, 255, 255, 0.11)",
    defaultAccentId: "sky",
  },
  {
    id: "obsidian-satin",
    name: "Obsidiana",
    category: "metal",
    kind: "gradient",
    gradientColors: ["#27272A", "#141417", "#09090B"],
    baseColor: "#09090B",
    cardColor: "rgba(28, 28, 33, 0.80)",
    cardBorder: "rgba(255, 255, 255, 0.09)",
    glassColor: "rgba(28, 28, 33, 0.78)",
    glassBorder: "rgba(245, 239, 227, 0.09)",
    defaultAccentId: "silver",
  },
];

export const THEME_PRESETS: Array<ThemePreset> = [
  {
    id: "bosque",
    name: "Bosque",
    subtitle: "Naturaleza",
    immersive: true,
    backdropId: "forest",
    baseColor: "#0E1B0D",
    cardColor: "rgba(28, 46, 26, 0.72)",
    cardBorder: "rgba(255, 255, 255, 0.10)",
    defaultAccentId: "emerald",
    defaultMode: "dark",
  },
  {
    id: "aurora",
    name: "Aurora",
    subtitle: "Abstracto",
    immersive: true,
    backdropId: "aurora",
    baseColor: "#080B1A",
    cardColor: "rgba(20, 25, 52, 0.74)",
    cardBorder: "rgba(255, 255, 255, 0.10)",
    defaultAccentId: "indigo",
    defaultMode: "dark",
  },
  {
    id: "seda",
    name: "Seda Salvia",
    subtitle: "Premium",
    immersive: true,
    backdropId: "silk-sage",
    baseColor: "#141C14",
    cardColor: "rgba(35, 46, 35, 0.72)",
    cardBorder: "rgba(255, 255, 255, 0.10)",
    defaultAccentId: "emerald",
    defaultMode: "dark",
  },
  {
    id: "acero",
    name: "Acero",
    subtitle: "Metal",
    immersive: true,
    backdropId: "metal-slate",
    baseColor: "#0D1624",
    cardColor: "rgba(24, 36, 56, 0.74)",
    cardBorder: "rgba(255, 255, 255, 0.11)",
    defaultAccentId: "sky",
    defaultMode: "dark",
  },
  {
    id: "obsidiana",
    name: "Obsidiana",
    subtitle: "Minimal",
    immersive: true,
    backdropId: "obsidian-satin",
    baseColor: "#09090B",
    cardColor: "rgba(28, 28, 33, 0.80)",
    cardBorder: "rgba(255, 255, 255, 0.09)",
    defaultAccentId: "silver",
    defaultMode: "dark",
  },
  {
    id: "clasico",
    name: "Clásico",
    subtitle: "Limpio",
    immersive: false,
    backdropId: null,
    baseColor: "#FFFFFF",
    cardColor: "#F4F4F5",
    cardBorder: "rgba(0, 0, 0, 0.06)",
    defaultAccentId: "emerald",
    defaultMode: "light",
  },
];

export const DEFAULT_PRESET_ID = "bosque";

export function getPresetById(id: string | null | undefined): ThemePreset {
  return THEME_PRESETS.find((preset) => preset.id === id) ?? THEME_PRESETS[0];
}

export function getBackdropById(id: string | null | undefined): BackdropOption | null {
  if (!id) {
    return null;
  }

  return BACKDROP_OPTIONS.find((backdrop) => backdrop.id === id) ?? null;
}

export function getAccentById(id: string | null | undefined): AccentOption {
  return ACCENT_OPTIONS.find((accent) => accent.id === id) ?? ACCENT_OPTIONS[0];
}
