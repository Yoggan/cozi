import type { ExpoConfig } from "expo/config";
import type { ConfigPlugin } from "expo/config-plugins";
import { withAppBuildGradle } from "expo/config-plugins";

const RELEASE_SIGNING_CONFIG = `        release {
            if (project.hasProperty('COZI_UPLOAD_STORE_FILE')) {
                storeFile file(COZI_UPLOAD_STORE_FILE)
                storePassword COZI_UPLOAD_STORE_PASSWORD
                keyAlias COZI_UPLOAD_KEY_ALIAS
                keyPassword COZI_UPLOAD_KEY_PASSWORD
            }
        }`;

const RELEASE_SIGNING_ASSIGNMENT =
  "signingConfig project.hasProperty('COZI_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug";

const withAndroidReleaseSigning: ConfigPlugin = (expoConfig) => {
  return withAppBuildGradle(expoConfig, (gradleConfig) => {
    if (gradleConfig.modResults.language !== "groovy") {
      throw new Error(
        `withAndroidReleaseSigning only supports Groovy build.gradle, received: ${gradleConfig.modResults.language}`,
      );
    }

    let contents = gradleConfig.modResults.contents;

    if (!contents.includes("COZI_UPLOAD_STORE_FILE")) {
      const signingConfigsPattern = /(signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\n\s*\})/;

      if (!signingConfigsPattern.test(contents)) {
        throw new Error("Could not find signingConfigs.debug block in android/app/build.gradle");
      }

      contents = contents.replace(signingConfigsPattern, `$1\n${RELEASE_SIGNING_CONFIG}`);

      const releaseBuildTypePattern =
        /(buildTypes\s*\{[\s\S]*?\brelease\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/;

      if (!releaseBuildTypePattern.test(contents)) {
        throw new Error(
          "Could not find buildTypes.release signingConfig in android/app/build.gradle",
        );
      }

      contents = contents.replace(releaseBuildTypePattern, `$1${RELEASE_SIGNING_ASSIGNMENT}`);
    }

    gradleConfig.modResults.contents = contents;

    return gradleConfig;
  });
};

function readEnv(key: string): string | undefined {
  // SAFETY: `process.env` solo existe en Node; el acceso es opcional y se comprueba antes de leer.
  const runtime = globalThis as { process?: { env?: Record<string, string | undefined> } };
  const value = runtime.process?.env?.[key];

  return typeof value === "string" ? value : undefined;
}

function parseVersionCode(raw: string | undefined): number {
  if (!raw) {
    return 1;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid ANDROID_VERSION_CODE: "${raw}". Expected a positive integer.`);
  }

  return parsed;
}

const isNightly = readEnv("APP_VARIANT") === "nightly";
const appVersion = readEnv("APP_VERSION")?.trim() || "1.0.0";

const config: ExpoConfig = {
  name: isNightly ? "Cozi Nightly" : "cozi",
  slug: "cozi",
  version: appVersion,
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "cozi",
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: true,
    bundleIdentifier: isNightly ? "com.cozi.app.nightly" : "com.anonymous.cozi",
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    package: isNightly ? "com.cozi.app.nightly" : "com.anonymous.cozi",
    versionCode: parseVersionCode(readEnv("ANDROID_VERSION_CODE")),
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-image-picker",
      {
        photosPermission: "Cozi usa tus fotos para que elijas imágenes para tu perfil y catálogo.",
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default withAndroidReleaseSigning(config);
