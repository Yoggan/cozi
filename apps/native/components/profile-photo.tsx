import { Ionicons } from "@expo/vector-icons";
import { Text } from "heroui-native";
import { useState } from "react";
import { Image, Pressable, View } from "react-native";

import { useAppTheme } from "@/contexts/app-theme-context";
import { initials } from "@/lib/money";

export function ProfilePhoto({
  name,
  uri,
  size = 72,
  onPress,
  borderColor,
  testID,
}: {
  name: string;
  uri: string | null;
  size?: number;
  onPress?: () => void;
  borderColor?: string;
  testID?: string;
}) {
  const { accent } = useAppTheme();
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showImage = Boolean(uri) && failedUri !== uri;
  const badgeSize = Math.round(size * 0.34);

  const content = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: borderColor ? 2 : 0,
        borderColor,
        backgroundColor: accent.softHex,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {showImage ? (
        <Image
          onError={() => setFailedUri(uri)}
          source={{ uri: uri ?? undefined }}
          style={{ width: size, height: size }}
        />
      ) : (
        <Text style={{ color: accent.hex, fontSize: size * 0.32, fontWeight: "700" }}>
          {initials(name) || "?"}
        </Text>
      )}
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable
      accessibilityLabel="Cambiar foto de perfil"
      hitSlop={8}
      onPress={onPress}
      testID={testID}
    >
      {content}
      <View
        style={{
          position: "absolute",
          right: -2,
          bottom: -2,
          width: badgeSize,
          height: badgeSize,
          borderRadius: badgeSize / 2,
          backgroundColor: accent.hex,
          borderWidth: 2,
          borderColor: borderColor ?? "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons color={accent.foreground} name="camera" size={Math.round(badgeSize * 0.58)} />
      </View>
    </Pressable>
  );
}
