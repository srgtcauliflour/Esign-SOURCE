const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SESSIONS_ROOT = path.join(__dirname, '..', 'data', 'sessions');
const IDLE_MS = 24 * 60 * 60 * 1000; // 24h

fs.mkdirSync(SESSIONS_ROOT, { recursive: true });

function dirFor(sessionId) {
  return path.join(SESSIONS_ROOT, sessionId);
}

// Ensures a sandboxed HOME/XDG_CONFIG_HOME (and a stable per-session keychain
// passphrase) exist for this browser session, so each visitor's ipatool
// login/keychain/downloads never touch another visitor's.
function ensure(sessionId) {
  const home = dirFor(sessionId);
  const config = path.join(home, '.config');
  const downloads = path.join(home, 'downloads');
  fs.mkdirSync(config, { recursive: true });
  fs.mkdirSync(downloads, { recursive: true });

  const secretPath = path.join(home, '.keychain-secret');
  let secret;
  if (fs.existsSync(secretPath)) {
    secret = fs.readFileSync(secretPath, 'utf8');
  } else {
    secret = crypto.randomBytes(24).toString('hex');
    fs.writeFileSync(secretPath, secret, { mode: 0o600 });
  }

  touch(sessionId);

  return {
    home,
    downloads,
    env: {
      HOME: home,
      XDG_CONFIG_HOME: config,
      IPATOOL_KEYCHAIN_PASSPHRASE: secret,
    },
  };
}

function touch(sessionId) {
  const marker = path.join(dirFor(sessionId), '.last-active');
  fs.writeFileSync(marker, String(Date.now()));
}

function wipe(sessionId) {
  const home = dirFor(sessionId);
  fs.rmSync(home, { recursive: true, force: true });
}

// Sweeps session directories older than IDLE_MS. Call on an interval.
function sweepIdle() {
  let entries;
  try {
    entries = fs.readdirSync(SESSIONS_ROOT);
  } catch {
    return;
  }
  const now = Date.now();
  for (const id of entries) {
    const marker = path.join(dirFor(id), '.last-active');
    let last = 0;
    try {
      last = Number(fs.readFileSync(marker, 'utf8'));
    } catch {
      // No marker (partially created dir) — treat as stale.
    }
    if (!last || now - last > IDLE_MS) {
      wipe(id);
    }
  }
}

module.exports = { ensure, touch, wipe, sweepIdle };
