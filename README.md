# SideVault

SideVault is a self-hosted sideloading hub with three tabs of real functionality:

- **Sources** — browse curated AltStore-format community repos (emulators, jailbreak tools, utilities) and see the apps each one publishes.
- **Downloader** — sign in with your own Apple ID and pull your own purchased/free App Store apps down as `.ipa` files, powered by [ipatool](https://github.com/majd/ipatool).
- **Signing** — upload your own `.p12` certificate and `.mobileprovision` profile to resign any `.ipa` (one you downloaded, or one you upload) and install it over the air, powered by [zsign](https://github.com/zhlynn/zsign). No Xcode or macOS required — zsign is a native cross-platform `codesign` alternative.

Each browser session gets its own sandboxed storage on the server, so concurrent users never see each other's Apple ID logins, certificates, or files.

There's also a native iOS wrapper for the web app itself — see [`ios/README.md`](ios/README.md) — so you get an actual installable app icon (built and signed with your own certificate via GitHub Actions) instead of a browser tab.

## Requirements

- Node.js 18+
- [`ipatool`](https://github.com/majd/ipatool) installed and on your `PATH` (or set `IPATOOL_BIN` to its path) — needed for the Downloader tab
- [`zsign`](https://github.com/zhlynn/zsign) built and on your `PATH` (or set `ZSIGN_BIN` to its path) — needed for the Signing tab

Both tabs degrade gracefully (a clear error, not a crash) if their binary isn't installed — you don't need both to use the app.

### Building zsign

```bash
sudo apt-get install -y git g++ pkg-config libssl-dev   # Debian/Ubuntu
git clone https://github.com/zhlynn/zsign.git
cd zsign/build/linux
make clean && make
# binary is at zsign/bin/zsign — copy it onto your PATH, or point ZSIGN_BIN at it
```

(macOS/Windows build steps are in [zsign's README](https://github.com/zhlynn/zsign#build).)

## Quick start

```bash
npm install
npm start
```

Then open `http://127.0.0.1:4567`.

## Security notes

This app handles real Apple ID credentials and real code-signing certificates. Keep the following in mind:

- **Run it locally or on a private network first.** By default it listens on plain HTTP with non-secure cookies — fine for `localhost`, not fine for the open internet.
- **Multi-user / networked deployments need HTTPS.** Put SideVault behind a reverse proxy (nginx, Caddy, Traefik) that terminates TLS, then set:
  - `COOKIE_SECURE=true` — cookies are only sent over HTTPS
  - `TRUST_PROXY=true` — Express trusts the proxy's `X-Forwarded-*` headers
  - `SESSION_SECRET=<random string>` — otherwise a random secret is generated per process restart, which logs everyone out on redeploy
- **Over-the-air install needs HTTPS too.** iOS's `itms-services://` installer fetches the manifest and `.ipa` over HTTPS only — the Signing tab's "Install over-the-air" link won't trigger an install prompt from a plain-HTTP host. The direct `.ipa` download always works regardless; you'd just install it with another tool (AltStore, Sideloadly, etc.) instead.
- **Per-session isolation.** Each browser session gets its own `HOME` under `data/sessions/<id>/` (ipatool stores its state at `$HOME/.ipatool`), plus its own `certs/`, `downloads/`, `signed/`, and `uploads/` subdirectories. Nothing here is shared across sessions, and it's all wiped on sign-out or automatically after 24 hours of inactivity.
- **Certificate password storage.** If your `.p12` has a password, it's kept in a `0600`-permission file inside that session's sandboxed directory (so you don't have to retype it for every sign) — same trust boundary as ipatool's own on-disk keychain.
- **Linux keychain passphrase.** `ipatool` has no env-var for its keychain passphrase — only the `--keychain-passphrase` flag. SideVault generates a random one per session and passes it on every invocation (see `lib/ipatool.js`), so you don't need to set anything yourself.
- **CLI flags may drift.** Both `ipatool` and `zsign` are external projects whose flags can change across releases. `lib/ipatool.js` was verified against `ipatool` v2.6.0's real `--help` output and actual JSON responses; `lib/zsign.js` was verified against `zsign` v1.1.2's real `--help` output and actual signing/certificate-check output (built and run from source, not just read from docs). If a future release changes flags or output format, run `ipatool [command] --help` / `zsign --help` against your installed version and adjust the relevant wrapper.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4567` | HTTP port |
| `IPATOOL_BIN` | `ipatool` | Path to the ipatool binary |
| `ZSIGN_BIN` | `zsign` | Path to the zsign binary |
| `COOKIE_SECURE` | `false` | Only send session cookies over HTTPS |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-*` from a reverse proxy |
| `SESSION_SECRET` | random per boot | Signs session cookies |

## Project layout

```
server.js              Express app entry point
lib/sessionHome.js      Per-session sandboxed storage (ipatool home, certs, downloads, signed output) + idle cleanup
lib/ipatool.js           Thin wrapper around the ipatool CLI (execFile, JSON parsing)
lib/zsign.js              Thin wrapper around the zsign CLI (execFile, cert-check + sign)
routes/downloader.js      Login / search / license / download API for the Downloader tab
routes/signing.js          Certificate upload / sign / OTA manifest API for the Signing tab
routes/sources.js           App source catalog + proxy-fetch of each source's app list
public/                      Frontend (tabs: Home, Sources, Downloader, Signing, About)
data/sources.json             Curated list of AltStore-format app sources
```
