import { cn } from "heroui-native";
import type { PropsWithChildren } from "react";
import { ScrollView, View } from "react-native";
import type { ScrollViewProps, ViewProps } from "react-native";
import Animated from "react-native-reanimated";
import type { AnimatedProps } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemeBackdrop } from "@/components/theme-backdrop";
import { useAppTheme } from "@/contexts/app-theme-context";

const AnimatedView = Animated.createAnimatedComponent(View);

type Props = AnimatedProps<ViewProps> & {
  className?: string;
  isScrollable?: boolean;
  scrollViewProps?: Omit<ScrollViewProps, "contentContainerStyle">;
  showBackdrop?: boolean;
  backdropHeight?: number;
};

export function Container({
  children,
  className,
  isScrollable = true,
  scrollViewProps,
  showBackdrop = true,
  backdropHeight = 320,
  style,
  ...props
}: PropsWithChildren<Props>) {
  const insets = useSafeAreaInsets();
  const { isImmersive, backdrop, baseColor } = useAppTheme();
  const immersive = isImmersive && backdrop !== null;

  return (
    <AnimatedView
      className={cn("flex-1", !immersive && "bg-background", className)}
      style={[{ paddingBottom: insets.bottom }, immersive && { backgroundColor: baseColor }, style]}
      {...props}
    >
      {immersive && showBackdrop ? (
        <ThemeBackdrop backdrop={backdrop} height={backdropHeight} />
      ) : null}
      {isScrollable ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          {...scrollViewProps}
        >
          {children}
        </ScrollView>
      ) : (
        <View className="flex-1">{children}</View>
      )}
    </AnimatedView>
  );
}
