const { execFile } = require('child_process');

const ZSIGN_BIN = process.env.ZSIGN_BIN || 'zsign';
const TIMEOUT_MS = 5 * 60 * 1000; // large .ipa files can take a while to re-zip

// zsign has no --format json; it prints colored, human-readable status lines
// to stdout (and errors too — confirmed against zsign v1.1.2: a missing input
// file exits non-zero with ">>> Invalid path! ..." on stdout, not stderr).
function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function run(args) {
  return new Promise((resolve) => {
    execFile(
      ZSIGN_BIN,
      args,
      { timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 * 64 },
      (error, stdout, stderr) => {
        const out = stripAnsi((stdout || '').trim());
        const errOut = stripAnsi((stderr || '').trim());
        const notInstalled = error && error.code === 'ENOENT';
        resolve({
          ok: !error,
          output: out,
          message: notInstalled
            ? `zsign binary not found (looked for "${ZSIGN_BIN}"). Build it from https://github.com/zhlynn/zsign and ensure it's on PATH, or set ZSIGN_BIN.`
            : lastMeaningfulLine(out) || errOut || (error ? error.message : ''),
        });
      }
    );
  });
}

function lastMeaningfulLine(out) {
  const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] || '';
}

// Parses zsign's "-C" certificate-check output (plain "Key:\tValue" lines)
// into an object. Works for .p12/.mobileprovision/.ipa alike.
function parseCertInfo(output) {
  const info = {};
  const fieldMap = {
    Name: 'name',
    Type: 'type',
    Org: 'organization',
    Team: 'team',
    Serial: 'serial',
    Issued: 'issuedAt',
    Expires: 'expiresAt',
    Algorithm: 'algorithm',
    Issuer: 'issuer',
    OCSP: 'ocsp',
    Signed: 'signed',
  };
  for (const line of output.split('\n')) {
    const match = line.match(/^>>>\s*([A-Za-z]+):\s*(.+)$/);
    if (match && fieldMap[match[1]]) {
      info[fieldMap[match[1]]] = match[2].trim();
    }
  }
  return info;
}

// Checks a certificate (.p12) or provisioning profile so the UI can show the
// signer's identity/expiry right after upload, and so a bad p12 password is
// caught immediately instead of surfacing only when a real sign attempt runs.
async function checkCertificate(filePath, password) {
  const args = ['-C', filePath];
  if (password) args.push('-p', password);
  const result = await run(args);
  if (!result.ok) return result;
  return { ...result, info: parseCertInfo(result.output) };
}

// Re-signs an .ipa with the given p12 + provisioning profile. Bundle
// id/name/version overrides are optional (blank keeps the original values).
// metadataDir, if given, gets metadata.json (final AppBundleIdentifier/
// AppVersion/AppName) written via -x, for building an OTA manifest.plist
// that reflects the actual signed output rather than a guess.
async function sign({ ipaPath, p12Path, password, provisionPath, bundleId, bundleName, bundleVersion, outputPath, metadataDir }) {
  const args = ['-k', p12Path, '-m', provisionPath, '-o', outputPath, '-z', '9'];
  if (password) args.push('-p', password);
  if (bundleId) args.push('-b', bundleId);
  if (bundleName) args.push('-n', bundleName);
  if (bundleVersion) args.push('-r', bundleVersion);
  if (metadataDir) args.push('-x', metadataDir);
  args.push(ipaPath);
  return run(args);
}

module.exports = { run, checkCertificate, sign };
