# Nightly Mobile Releases

Cozi builds and publishes a rolling Android nightly `.apk` from `master` via [`.github/workflows/nightly-mobile-release.yml`](../.github/workflows/nightly-mobile-release.yml).

## Download the latest build

- **Release page**: <https://github.com/Yoggan/cozi/releases/tag/nightly>
- **Direct APK link**: <https://github.com/Yoggan/cozi/releases/download/nightly/cozi-nightly.apk>

The nightly app uses package ID `com.cozi.app.nightly` and display name **Cozi Nightly**, so it can be installed side-by-side with local dev or production builds.

## How it works

1. **Schedule**: Runs daily at **03:00 Mexico City time (UTC-6)** (`17 9 * * *` UTC), plus supports manual runs via **Actions -> Nightly Mobile Release -> Run workflow** (with an optional `force` toggle).
2. **Change detection**: Compares `master` against the `nightly` git tag. On scheduled runs, it builds only if mobile-relevant files (`apps/native/**`, `packages/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`) changed since the previous nightly.
3. **Quality gates**: Runs `pnpm --filter @cozi/native... check-types` and `pnpm exec oxlint apps/native packages` before starting the Android build.
4. **Build & signing**: Runs `expo prebuild --platform android --clean` and `./gradlew assembleRelease` on `ubuntu-latest`, signing the APK with the persistent release keystore from GitHub Actions secrets so updates install in place without wiping app data.
5. **Publishing**: Moves the `nightly` git tag to the built `master` commit and updates the rolling `nightly` GitHub Pre-release with `cozi-nightly.apk` and the commit changelog.

## One-time GitHub repository setup

Before the first nightly run succeeds, configure the staging Convex variables and Android signing keystore secrets on `Yoggan/cozi`.

### 1. Set staging Convex repository variables

Because `EXPO_PUBLIC_*` values are bundled into the APK (and `Yoggan/cozi` is a public repo), point nightly builds to your **staging/dev** Convex deployment:

```bash
gh variable set EXPO_PUBLIC_CONVEX_URL --repo Yoggan/cozi --body "https://<your-staging-deployment>.convex.cloud"
gh variable set EXPO_PUBLIC_CONVEX_SITE_URL --repo Yoggan/cozi --body "https://<your-staging-deployment>.convex.site"
```

### 2. Generate a persistent Android upload keystore

Generate a single `.keystore` file once (keep a secure backup outside the repo — never commit it):

```bash
keytool -genkeypair -v \
  -storetype PKCS12 \
  -keystore cozi-nightly-upload.keystore \
  -alias cozi-nightly \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Remember the keystore password, key alias (`cozi-nightly`), and key password you enter.

### 3. Store the keystore in GitHub Actions secrets

Encode the keystore to base64 and upload the 4 secrets:

**macOS / Linux:**

```bash
base64 -i cozi-nightly-upload.keystore | tr -d '\n' | gh secret set ANDROID_KEYSTORE_BASE64 --repo Yoggan/cozi
gh secret set ANDROID_KEY_ALIAS --repo Yoggan/cozi --body "cozi-nightly"
gh secret set ANDROID_KEYSTORE_PASSWORD --repo Yoggan/cozi
gh secret set ANDROID_KEY_PASSWORD --repo Yoggan/cozi
```

**Windows (PowerShell):**

```powershell
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("cozi-nightly-upload.keystore"))
$b64 | gh secret set ANDROID_KEYSTORE_BASE64 --repo Yoggan/cozi
gh secret set ANDROID_KEY_ALIAS --repo Yoggan/cozi --body "cozi-nightly"
gh secret set ANDROID_KEYSTORE_PASSWORD --repo Yoggan/cozi
gh secret set ANDROID_KEY_PASSWORD --repo Yoggan/cozi
```

_(Leaving off `--body` prompts you to enter the password interactively without storing it in shell history.)_

### 4. Trigger your first build

Once this PR is merged to `master` and the variables/secrets above are set, trigger the first nightly immediately:

```bash
gh workflow run nightly-mobile-release.yml --repo Yoggan/cozi -f force=true
```
