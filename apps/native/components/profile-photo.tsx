import { Ionicons } from "@expo/vector-icons";
import { Text } from "heroui-native";
import { useState } from "react";
import { Image, Pressable, View } from "react-native";

import { initials } from "@/lib/money";

export function ProfilePhoto({
  name,
  uri,
  size = 72,
  onPress,
  borderColor,
}: {
  name: string;
  uri: string | null;
  size?: number;
  onPress?: () => void;
  borderColor?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(uri) && !failed;
  const badgeSize = Math.round(size * 0.34);

  const content = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: borderColor ? 2 : 0,
        borderColor,
        backgroundColor: "rgba(34, 197, 94, 0.28)",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {showImage ? (
        <Image
          onError={() => setFailed(true)}
          source={{ uri: uri ?? undefined }}
          style={{ width: size, height: size }}
        />
      ) : (
        <Text style={{ color: "#4ADE80", fontSize: size * 0.32, fontWeight: "700" }}>
          {initials(name) || "?"}
        </Text>
      )}
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable accessibilityLabel="Cambiar foto de perfil" hitSlop={8} onPress={onPress}>
      {content}
      <View
        style={{
          position: "absolute",
          right: -2,
          bottom: -2,
          width: badgeSize,
          height: badgeSize,
          borderRadius: badgeSize / 2,
          backgroundColor: "#22C55E",
          borderWidth: 2,
          borderColor: borderColor ?? "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons color="#0B0F0D" name="camera" size={Math.round(badgeSize * 0.58)} />
      </View>
    </Pressable>
  );
}
