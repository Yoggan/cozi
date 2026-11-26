import { useAssets } from "expo-asset";
import { useFonts } from "expo-font";
import { Button, useToast } from "heroui-native";
import qrcode from "qrcode-generator";
import { useMemo } from "react";
import { Clipboard, Share, Text, View } from "react-native";
import Svg, { G, Path, SvgUri } from "react-native-svg";

import mediumFont from "@/assets/fonts/PlusJakartaSans_500Medium.ttf";
import semiboldFont from "@/assets/fonts/PlusJakartaSans_600SemiBold.ttf";
import copyLightIcon from "@/assets/profile/copy-light.svg";
import copyIcon from "@/assets/profile/copy.svg";
import shareLightIcon from "@/assets/profile/share-light.svg";
import shareIcon from "@/assets/profile/share.svg";
import { useCoziGlassPalette } from "@/lib/cozi-glass-palette";
import { COZI_LIGHT_COLORS } from "@/lib/themes";

const ICONS = [shareIcon, copyIcon, shareLightIcon, copyLightIcon];
const FONTS = { PlusJakartaSansMedium: mediumFont, PlusJakartaSansSemiBold: semiboldFont };
const QUIET_ZONE = 4;

// Fixed version 6 (41 modules) fits every 3-20 character handle at level H and keeps the logo the same size.
const QR_VERSION = 6;

// Diameter, in modules, of the round area cleared for the logo (~13% of the code).
// Decoding starts failing near 17% cleared, so keep headroom for real cameras.
const LOGO_DIAMETER = 17;

// symbol/A from the Figma brand file (tile 301 export), in its 300px viewBox.
const LOGO_ARC =
  "M198.888 109.008C190.472 98.9607 179.169 91.7469 166.511 88.3463C153.854 84.9458 140.457 85.5232 128.139 90.0003C115.822 94.4773 105.18 102.637 97.6607 113.371C90.1409 124.105 86.1072 136.894 86.1072 150C86.1072 163.106 90.1409 175.895 97.6607 186.629C105.18 197.363 115.822 205.523 128.139 210C140.457 214.477 153.854 215.054 166.511 211.654C179.169 208.253 190.472 201.039 198.888 190.992";

const LOGO_DOT =
  "M150 170.16C161.134 170.16 170.16 161.134 170.16 150C170.16 138.866 161.134 129.84 150 129.84C138.866 129.84 129.84 138.866 129.84 150C129.84 161.134 138.866 170.16 150 170.16Z";

// The glyph's arc is a circle centered at (150, 150) with an outer diameter of ~155 (stroke included).
const GLYPH_CENTER = 150;
const GLYPH_DIAMETER = 155;

const QR_SIZE = 224;

function encodeProfileQr(url: string) {
  // Use high error correction to recover the modules covered by the logo.
  const code = qrcode(QR_VERSION, "H");
  code.addData(url);
  code.make();

  const modules = code.getModuleCount();
  const size = modules + 2 * QUIET_ZONE;
  const center = modules / 2;
  const clearRadius = LOGO_DIAMETER / 2;
  const path: Array<string> = [];

  for (let row = 0; row < modules; row += 1) {
    for (let column = 0; column < modules; column += 1) {
      const behindLogo = Math.hypot(row + 0.5 - center, column + 0.5 - center) <= clearRadius;

      if (!behindLogo && code.isDark(row, column)) {
        path.push(`M${column + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`);
      }
    }
  }

  // Kept modules can poke ~0.7 module inside the circle at their corners, so a 1-module gap keeps them off the glyph.
  const logoCenter = QUIET_ZONE + center;
  const logoScale = (LOGO_DIAMETER - 2) / GLYPH_DIAMETER;
  const logoTransform = `translate(${logoCenter} ${logoCenter}) scale(${logoScale}) translate(${-GLYPH_CENTER} ${-GLYPH_CENTER})`;

  return { path: path.join(""), viewBox: `0 0 ${size} ${size}`, logoTransform };
}

export function ProfileCodeCard({ handle, canReceive }: { handle: string; canReceive: boolean }) {
  const palette = useCoziGlassPalette();
  const { toast } = useToast();
  const [assets] = useAssets(ICONS);
  const [fontsLoaded] = useFonts(FONTS);
  const url = `cozi://send?handle=${encodeURIComponent(handle)}`;
  const qr = useMemo(() => encodeProfileQr(url), [url]);
  const shareAsset = assets?.[palette.light ? 2 : 0]?.localUri ?? null;
  const copyAsset = assets?.[palette.light ? 3 : 1]?.localUri ?? null;

  const actionStyle = {
    backgroundColor: palette.secondaryAction,
    borderColor: palette.glassStyle.borderColor,
  };

  const labelStyle = {
    color: palette.text,
    fontFamily: fontsLoaded ? "PlusJakartaSansSemiBold" : undefined,
    fontSize: 15,
    lineHeight: 18,
  };

  async function shareLink() {
    try {
      await Share.share({ message: `Págame en Cozi: ${url}` });
    } catch {
      toast.show({ variant: "danger", label: "No pudimos compartir el enlace" });
    }
  }

  function copyLink() {
    Clipboard.setString(url);
    toast.show({ variant: "success", label: "Enlace copiado" });
  }

  return (
    <View className="items-center gap-4 rounded-3xl border p-5" style={palette.glassStyle}>
      <View
        accessibilityRole="image"
        accessibilityLabel={`Código QR de pago para @${handle}`}
        accessible
        className="items-center justify-center rounded-2xl"
        style={{ width: QR_SIZE, height: QR_SIZE, backgroundColor: COZI_LIGHT_COLORS.canvas }}
      >
        <Svg width={QR_SIZE} height={QR_SIZE} viewBox={qr.viewBox}>
          <Path d={qr.path} fill={COZI_LIGHT_COLORS.primaryText} />
          <G transform={qr.logoTransform}>
            <Path
              d={LOGO_ARC}
              fill="none"
              stroke={COZI_LIGHT_COLORS.primaryText}
              strokeWidth={26.88}
              strokeLinecap="round"
            />
            <Path d={LOGO_DOT} fill={COZI_LIGHT_COLORS.primaryText} />
          </G>
        </Svg>
      </View>
      <Text
        className="text-center text-xs leading-4"
        style={{
          color: palette.muted,
          fontFamily: fontsLoaded ? "PlusJakartaSansMedium" : undefined,
        }}
      >
        {canReceive
          ? "Muéstralo para que te paguen desde Cozi."
          : "Vincula una cuenta para recibir pagos con este código."}
      </Text>
      <View className="w-full flex-row flex-wrap gap-3">
        <Button
          accessibilityLabel="Compartir enlace de pago"
          className="min-h-11 min-w-[112px] flex-1 flex-row gap-2 rounded-full border px-2"
          style={actionStyle}
          variant="secondary"
          onPress={() => void shareLink()}
        >
          <View accessible={false} className="size-5">
            <SvgUri uri={shareAsset} />
          </View>
          <Button.Label style={labelStyle}>Compartir</Button.Label>
        </Button>
        <Button
          accessibilityLabel="Copiar enlace de pago"
          className="min-h-11 min-w-[112px] flex-1 flex-row gap-2 rounded-full border px-2"
          style={actionStyle}
          variant="secondary"
          onPress={copyLink}
        >
          <View accessible={false} className="size-5">
            <SvgUri uri={copyAsset} />
          </View>
          <Button.Label style={labelStyle}>Copiar enlace</Button.Label>
        </Button>
      </View>
    </View>
  );
}
