const { execFile } = require('child_process');

const IPATOOL_BIN = process.env.IPATOOL_BIN || 'ipatool';
const TIMEOUT_MS = 2 * 60 * 1000;

// Runs ipatool with an argv array (never a shell string) so user-supplied
// values like emails/search terms can never be interpreted as shell syntax.
//
// ipatool has no env-var hook for its keychain passphrase (only the
// --keychain-passphrase flag), so it's appended here from env's
// IPATOOL_KEYCHAIN_PASSPHRASE rather than relied on as an inherited env var.
// All output — including errors — goes to stdout as one JSON object per
// line (confirmed against ipatool v2: stderr stays empty for its own
// errors and is only populated by Node when the binary itself can't run),
// so callers should read result.json/result.message, not result.stderr.
function run(args, env) {
  const fullArgs = [...args, '--format', 'json', '--non-interactive'];
  if (env.IPATOOL_KEYCHAIN_PASSPHRASE) {
    fullArgs.push('--keychain-passphrase', env.IPATOOL_KEYCHAIN_PASSPHRASE);
  }
  return new Promise((resolve) => {
    execFile(
      IPATOOL_BIN,
      fullArgs,
      { env: { ...process.env, ...env }, timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 * 32 },
      (error, stdout) => {
        const out = (stdout || '').trim();
        let json = null;
        // ipatool prints one JSON object per line to stdout; take the last
        // parseable one (the terminal result line, after any progress/info lines).
        for (const line of out.split('\n').reverse()) {
          try {
            json = JSON.parse(line);
            break;
          } catch {
            // not JSON, keep looking
          }
        }

        const notInstalled = error && error.code === 'ENOENT';
        const message = notInstalled
          ? `ipatool binary not found (looked for "${IPATOOL_BIN}"). Install it from https://github.com/majd/ipatool and ensure it's on PATH, or set IPATOOL_BIN.`
          : json?.error || json?.message || (error ? error.message : '');

        resolve({
          // ipatool can exit 0 even when it didn't complete the action (e.g. a
          // non-interactive 2FA prompt), so callers must inspect json, not just ok.
          ok: !error,
          json,
          message,
          stdout: out,
        });
      }
    );
  });
}

async function authLogin({ email, password, code }, env) {
  const args = ['auth', 'login', '-e', email, '-p', password];
  if (code) args.push('--auth-code', code);
  return run(args, env);
}

async function authInfo(env) {
  return run(['auth', 'info'], env);
}

async function authRevoke(env) {
  return run(['auth', 'revoke'], env);
}

async function search(term, limit, env) {
  return run(['search', term, '--limit', String(limit || 10)], env);
}

async function purchase(bundleId, env) {
  return run(['purchase', '-b', bundleId], env);
}

async function download(bundleId, outputPath, env) {
  // --purchase lets ipatool auto-obtain a license (free/owned apps) if the
  // account doesn't already have one, instead of failing with "license is required".
  return run(['download', '-b', bundleId, '-o', outputPath, '--purchase'], env);
}

module.exports = { run, authLogin, authInfo, authRevoke, search, purchase, download };
