# SideVault

SideVault is a self-hosted sideloading hub with two tabs of real functionality:

- **Sources** — browse curated AltStore-format community repos (emulators, jailbreak tools, utilities) and see the apps each one publishes.
- **Downloader** — sign in with your own Apple ID and pull your own purchased/free App Store apps down as `.ipa` files, powered by [ipatool](https://github.com/majd/ipatool). Each browser session gets its own sandboxed credential store on the server, so concurrent users never see each other's logins, keychains, or downloads.

SideVault does not sign or install IPA files itself — pair a downloaded `.ipa` with your own signer (AltStore, SideStore, Sideloadly, or your own certificate/provisioning profile).

## Requirements

- Node.js 18+
- [`ipatool`](https://github.com/majd/ipatool) installed and on your `PATH` (or set `IPATOOL_BIN` to its path)

## Quick start

```bash
npm install
npm start
```

Then open `http://127.0.0.1:4567`.

## Security notes

This app handles real Apple ID credentials. Keep the following in mind:

- **Run it locally or on a private network first.** By default it listens on plain HTTP with non-secure cookies — fine for `localhost`, not fine for the open internet.
- **Multi-user / networked deployments need HTTPS.** Put SideVault behind a reverse proxy (nginx, Caddy, Traefik) that terminates TLS, then set:
  - `COOKIE_SECURE=true` — cookies are only sent over HTTPS
  - `TRUST_PROXY=true` — Express trusts the proxy's `X-Forwarded-*` headers
  - `SESSION_SECRET=<random string>` — otherwise a random secret is generated per process restart, which logs everyone out on redeploy
- **Per-session isolation.** Each browser session gets its own `HOME`/`XDG_CONFIG_HOME` under `data/sessions/<id>/`, so `ipatool`'s keychain and credentials are sandboxed per visitor. These directories (and their Apple ID sessions) are wiped on sign-out or automatically after 24 hours of inactivity.
- **Linux keychain passphrase.** `ipatool` on Linux needs a keychain passphrase; SideVault generates and stores a random one per session automatically via `IPATOOL_KEYCHAIN_PASSPHRASE`, so you don't need to set anything yourself.
- **CLI flags may drift.** `ipatool`'s flags have changed across releases — if login/search/download start failing, run `ipatool --help` (and the relevant subcommand's `--help`) against your installed version and adjust `lib/ipatool.js` if needed.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4567` | HTTP port |
| `IPATOOL_BIN` | `ipatool` | Path to the ipatool binary |
| `COOKIE_SECURE` | `false` | Only send session cookies over HTTPS |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-*` from a reverse proxy |
| `SESSION_SECRET` | random per boot | Signs session cookies |

## Project layout

```
server.js            Express app entry point
lib/sessionHome.js    Per-session sandboxed ipatool home dirs + idle cleanup
lib/ipatool.js         Thin wrapper around the ipatool CLI (execFile, JSON parsing)
routes/downloader.js   Login / search / license / download API for the Downloader tab
routes/sources.js       App source catalog + proxy-fetch of each source's app list
public/                 Frontend (tabs: Home, Sources, Downloader, About)
data/sources.json       Curated list of AltStore-format app sources
```
