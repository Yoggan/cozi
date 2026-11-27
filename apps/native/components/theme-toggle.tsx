import { Icon } from "@/components/icon";
import { ImpactFeedbackStyle, impactAsync } from "expo-haptics";
import { Platform, Pressable } from "react-native";
import Animated, { FadeOut, ZoomIn } from "react-native-reanimated";
import { withUniwind } from "uniwind";

import { useAppTheme } from "@/contexts/app-theme-context";

const StyledIcon = withUniwind(Icon);

export function ThemeToggle() {
  const { toggleTheme, isLight } = useAppTheme();

  return (
    <Pressable
      onPress={() => {
        if (Platform.OS === "ios") {
          void impactAsync(ImpactFeedbackStyle.Light);
        }

        toggleTheme();
      }}
      className="px-2.5"
    >
      {isLight ? (
        <Animated.View key="moon" entering={ZoomIn} exiting={FadeOut}>
          <StyledIcon name="moon" size={20} colorClassName="accent-foreground" />
        </Animated.View>
      ) : (
        <Animated.View key="sun" entering={ZoomIn} exiting={FadeOut}>
          <StyledIcon name="sunny" size={20} colorClassName="accent-foreground" />
        </Animated.View>
      )}
    </Pressable>
  );
}
