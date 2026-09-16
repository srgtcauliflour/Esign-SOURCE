# SideVault iOS wrapper

A minimal native iOS app: a single full-screen `WKWebView` that loads the
SideVault web app from a server you host elsewhere. `ipatool` and `zsign`
have to run as real server processes — that's not possible on iOS itself,
sideloaded or not — so this wrapper is a thin client, not a reimplementation.
It exists so you get an actual app icon and a native install, the way the
original Esign app worked, instead of opening a browser tab.

The project itself (`.xcodeproj`) is **not** committed — it's generated on
demand from `project.yml` via [XcodeGen](https://github.com/yonaskolb/XcodeGen),
both locally and in CI, so there's no stale, hand-edited Xcode project file to
drift out of sync.

## Building and signing via GitHub Actions

The `.github/workflows/build-ios.yml` workflow builds and signs the app
entirely on a GitHub-hosted macOS runner, using your own Apple
Developer signing materials. Nothing you upload here reaches the SideVault
app or server — it's a separate, self-contained pipeline.

### 1. Add repository secrets

Under the repo's **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|---|---|
| `IOS_P12_BASE64` | Your `.p12` certificate, base64-encoded: `base64 -i YourCert.p12 \| pbcopy` (macOS) or `base64 -w0 YourCert.p12` (Linux) |
| `IOS_P12_PASSWORD` | The password you set when exporting that `.p12` (empty string if none) |
| `IOS_PROVISION_BASE64` | Your `.mobileprovision` file, base64-encoded the same way |

The workflow reads the Team ID and provisioning profile UUID directly out of
the profile itself, so you don't need to supply those separately.

### 2. Run the workflow

From the repo's **Actions** tab, run **Build signed iOS app** and fill in:

- **server_url** — where SideVault is reachable, e.g. `https://sidevault.example.com` or `http://192.168.1.20:4567` for LAN testing
- **bundle_id** — must exactly match the App ID your provisioning profile was issued for
- **app_name** — optional, defaults to "SideVault"
- **export_method** — `development` (your own registered test devices), `ad-hoc` (any device listed in the profile), or `enterprise`

When it finishes, download the **SideVault-signed-ipa** artifact from the run
summary — that's your signed `.ipa`, ready to install with your usual
sideloading tool (or `ipatool`/AltStore/Sideloadly/etc. — anything that
takes a pre-signed `.ipa`).

### Requirements the workflow can't check for you

- For `development`/`ad-hoc` export, the installing device's UDID must
  already be registered in the Apple Developer portal **and** included in
  the provisioning profile you uploaded — that's an Apple Developer account
  step, not something this workflow can do.
- `bundle_id` must match the profile exactly, or codesigning fails.
- If `server_url` is plain HTTP, the app's `Info.plist` disables App
  Transport Security (`NSAllowsArbitraryLoads`) so it can still load —
  expected for LAN/self-hosted testing, but don't rely on that for anything
  handling real Apple ID credentials over an untrusted network. Use HTTPS
  for that (see the main README's security notes).

### A note on testing

This workflow was written against XcodeGen's and Apple's documented, stable
conventions (the certificate-import recipe mirrors GitHub's own published
pattern for signing on macOS runners), but there's no macOS or Xcode
available in the environment this was built in, so it hasn't actually been
run end-to-end. The first real run is the real test — if `xcodebuild` or
codesigning fails, the job logs will show exactly which step and why.

## Local development (on a Mac)

```bash
brew install xcodegen
cd ios
xcodegen generate
open SideVault.xcodeproj
```

Then set `SIDEVAULT_SERVER_URL` under the target's Build Settings (or edit
the default in `project.yml`) before running on a simulator or device.
