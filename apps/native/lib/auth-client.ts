import { expoClient } from "@better-auth/expo/client";
import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import { multiSessionClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import Constants from "expo-constants";
import { getItem, getItemAsync, setItem, setItemAsync } from "expo-secure-store";
import { Platform } from "react-native";

import { ENV } from "../src/env";

const configuredScheme = Constants.expoConfig?.scheme;
const scheme = Array.isArray(configuredScheme) ? configuredScheme[0] : configuredScheme;

export const authClient = createAuthClient({
  baseURL: ENV.EXPO_PUBLIC_CONVEX_SITE_URL,
  plugins: [
    convexClient(),
    multiSessionClient(),
    Platform.OS === "web"
      ? crossDomainClient()
      : expoClient({
          scheme: scheme ?? "cozi",
          storagePrefix: scheme ?? "cozi",
          storage: { getItem, getItemAsync, setItem, setItemAsync },
        }),
  ],
});
