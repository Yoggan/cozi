import type { api } from "@cozi/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import Constants from "expo-constants";
import { randomUUID } from "expo-crypto";
import {
  AndroidImportance,
  AndroidNotificationVisibility,
  getExpoPushTokenAsync,
  getPermissionsAsync,
  IosAuthorizationStatus,
  requestPermissionsAsync,
  setNotificationChannelAsync,
} from "expo-notifications";
import type { DevicePushToken, NotificationPermissionsStatus } from "expo-notifications";
import { getItemAsync, setItemAsync } from "expo-secure-store";
import { Platform } from "react-native";
import { z } from "zod";

const INSTALLATION_KEY = "cozi.mobile-notifications";

const installationSchema = z.object({
  installationKey: z.string(),
  revision: z.number(),
  registeredTo: z.string().nullable(),
});

const projectExtraSchema = z.object({ eas: z.object({ projectId: z.string() }) });
let storageQueue = Promise.resolve();

export type NotificationTarget = NonNullable<
  FunctionReturnType<typeof api.mobileNotifications.resolveTarget>
>;

export type NotificationDeviceVersion = {
  installationKey: string;
  revision: number;
};

// Settings changes and account changes share a durable revision on this installation.
function updateInstallation(
  authUserId: string | null,
  isCurrent = () => true,
  exceptAuthUserId?: string,
): Promise<NotificationDeviceVersion | null> {
  const next = storageQueue.then(async () => {
    if (!isCurrent()) {
      return null;
    }

    const value = await getItemAsync(INSTALLATION_KEY);
    const current = value ? installationSchema.parse(JSON.parse(value)) : null;

    if (
      !isCurrent() ||
      (!authUserId && (!current?.registeredTo || current.registeredTo === exceptAuthUserId))
    ) {
      return null;
    }

    const version = {
      installationKey: current?.installationKey ?? randomUUID(),
      revision: (current?.revision ?? 0) + 1,
    };

    // Keep remembering a possible binding until the server confirms removal.
    await setItemAsync(
      INSTALLATION_KEY,
      JSON.stringify({
        ...version,
        registeredTo: authUserId ?? current?.registeredTo ?? null,
      }),
    );

    return version;
  });

  storageQueue = next.then(
    () => {},
    () => {},
  );

  return next;
}

export const supportsMobileNotifications =
  (Platform.OS === "android" || Platform.OS === "ios") && Constants.appOwnership !== "expo";

function hasNotificationPermission(permission: NotificationPermissionsStatus) {
  return permission.granted || permission.ios?.status === IosAuthorizationStatus.PROVISIONAL;
}

export async function getNotificationToken(prompt: boolean, devicePushToken?: DevicePushToken) {
  const projectId =
    Constants.easConfig?.projectId ??
    projectExtraSchema.safeParse(Constants.expoConfig?.extra).data?.eas.projectId;

  if (typeof projectId !== "string" || !projectId) {
    throw new Error("Las notificaciones necesitan una compilación de Cozi configurada.");
  }

  if (Platform.OS === "android") {
    await setNotificationChannelAsync("cozi-updates", {
      name: "Actualizaciones de Cozi",
      importance: AndroidImportance.DEFAULT,
      lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
    });
  }

  let permission = await getPermissionsAsync();

  if (!hasNotificationPermission(permission) && prompt) {
    permission = await requestPermissionsAsync();
  }

  return hasNotificationPermission(permission)
    ? (await getExpoPushTokenAsync({ projectId, devicePushToken })).data
    : null;
}

export function nextNotificationRegistration(authUserId: string, isCurrent: () => boolean) {
  return updateInstallation(authUserId, isCurrent);
}

export function prepareNotificationClear(isCurrent?: () => boolean, exceptAuthUserId?: string) {
  return updateInstallation(null, isCurrent, exceptAuthUserId);
}

export function confirmNotificationClear(revision: number) {
  const save = storageQueue.then(async () => {
    const value = await getItemAsync(INSTALLATION_KEY);
    const current = value ? installationSchema.parse(JSON.parse(value)) : null;

    if (current?.revision === revision) {
      await setItemAsync(
        INSTALLATION_KEY,
        JSON.stringify({
          installationKey: current.installationKey,
          revision,
          registeredTo: null,
        }),
      );
    }
  });

  storageQueue = save.catch(() => {});

  return save;
}

export function notificationIdFromData(data: unknown) {
  const id =
    data && typeof data === "object" && "coziNotificationId" in data
      ? data.coziNotificationId
      : null;

  return typeof id === "string" && id.length <= 128 && /^[a-z0-9]+$/i.test(id) ? id : null;
}

export function notificationHref(target: NotificationTarget) {
  return target.kind === "businessMessage"
    ? { pathname: "/messages/[threadId]" as const, params: { threadId: target.threadId } }
    : { pathname: "/order/[publicId]" as const, params: { publicId: target.publicId } };
}
