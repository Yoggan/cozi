import { Text } from "heroui-native";
import { View } from "react-native";

import { ProfilePhoto } from "@/components/profile-photo";
import { useAccounts } from "@/contexts/accounts-context";
import { useAppTheme } from "@/contexts/app-theme-context";
import { useProfile } from "@/contexts/profile-context";
import { initials } from "@/lib/money";

function nameInitials(name: string): string {
  return initials(name) || "?";
}

export function AccountsAvatar({ size = "sm" }: { size?: "sm" | "md" }) {
  const profile = useProfile();
  const { sessions, activeSessionId, isLoading } = useAccounts();
  const { baseColor } = useAppTheme();
  const dimension = size === "sm" ? 32 : 40;
  const fontSize = size === "sm" ? 11 : 13;

  const ordered = [...sessions].sort((a, b) => {
    if (a.session.id === activeSessionId) {
      return -1;
    }

    if (b.session.id === activeSessionId) {
      return 1;
    }

    return 0;
  });

  const visible = ordered.slice(0, 2);
  const fallback = [{ user: { name: profile.displayName }, session: { token: "self" } }];
  const accounts = isLoading || visible.length === 0 ? fallback : visible;
  const overlap = accounts.length > 1 ? -10 : 0;

  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {accounts.map((account, index) => (
        <View key={account.session.token} style={{ marginLeft: index === 0 ? 0 : overlap }}>
          {index === 0 ? (
            <ProfilePhoto
              borderColor={baseColor}
              name={account.user.name}
              size={dimension}
              uri={profile.avatarUrl}
            />
          ) : (
            <View
              style={{
                width: dimension,
                height: dimension,
                borderRadius: dimension / 2,
                borderWidth: 2,
                borderColor: baseColor,
                backgroundColor: "rgba(255, 255, 255, 0.16)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: "rgba(255, 255, 255, 0.86)",
                  fontSize,
                  fontWeight: "700",
                }}
              >
                {nameInitials(account.user.name)}
              </Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}
