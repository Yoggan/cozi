import { Link } from "expo-router";
import type { Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";

export function RecoveryScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        bottomOffset={24}
      >
        <View style={styles.column}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          <View style={styles.panel}>{children}</View>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

export function RecoveryMessage({ children }: { children: string }) {
  return (
    <Text accessibilityLiveRegion="polite" style={styles.message}>
      {children}
    </Text>
  );
}

export function RecoveryLink({ href, children }: { href: Href; children: string }) {
  return (
    <Link href={href} replace style={styles.link}>
      {children}
    </Link>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#000000",
  },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  column: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 460,
    gap: 16,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "700",
  },
  panel: {
    backgroundColor: "#121212",
    borderColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderRadius: 28,
    padding: 20,
    gap: 16,
  },
  message: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 14,
    lineHeight: 21,
  },
  link: {
    alignSelf: "flex-start",
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
    paddingVertical: 12,
  },
});
