const { execFile } = require('child_process');

const IPATOOL_BIN = process.env.IPATOOL_BIN || 'ipatool';
const TIMEOUT_MS = 2 * 60 * 1000;

// Runs ipatool with an argv array (never a shell string) so user-supplied
// values like emails/search terms can never be interpreted as shell syntax.
function run(args, env) {
  return new Promise((resolve) => {
    execFile(
      IPATOOL_BIN,
      [...args, '--format', 'json', '--non-interactive'],
      { env: { ...process.env, ...env }, timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 * 32 },
      (error, stdout, stderr) => {
        const out = (stdout || '').trim();
        let json = null;
        // ipatool prints one JSON object per line to stdout; take the last
        // parseable one (some versions log progress lines before the result).
        for (const line of out.split('\n').reverse()) {
          try {
            json = JSON.parse(line);
            break;
          } catch {
            // not JSON, keep looking
          }
        }
        const notInstalled = error && error.code === 'ENOENT';
        resolve({
          ok: !error,
          exitCode: error ? error.code : 0,
          json,
          stdout: out,
          stderr: notInstalled
            ? `ipatool binary not found (looked for "${IPATOOL_BIN}"). Install it from https://github.com/majd/ipatool and ensure it's on PATH, or set IPATOOL_BIN.`
            : (stderr || '').trim(),
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
  return run(['download', '-b', bundleId, '-o', outputPath], env);
}

module.exports = { run, authLogin, authInfo, authRevoke, search, purchase, download };
