const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const sessionHome = require('../lib/sessionHome');
const zsign = require('../lib/zsign');

const router = express.Router();

const CERT_FILENAME = 'cert.p12';
const PROVISION_FILENAME = 'profile.mobileprovision';
const PASSWORD_FILENAME = '.cert-password';

function dirsFor(req) {
  return sessionHome.ensure(req.session.id);
}

function certPaths(req) {
  const { certs } = dirsFor(req);
  return {
    p12: path.join(certs, CERT_FILENAME),
    provision: path.join(certs, PROVISION_FILENAME),
    passwordFile: path.join(certs, PASSWORD_FILENAME),
  };
}

function readCertPassword(req) {
  const { passwordFile } = certPaths(req);
  try {
    return fs.readFileSync(passwordFile, 'utf8');
  } catch {
    return '';
  }
}

// Certificate/provision uploads and the .ipa a session is about to sign are
// small-to-moderate files staged straight into that session's sandboxed
// directory, so nothing from one visitor's upload is ever reachable from
// another's request.
const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const { certs, uploads } = dirsFor(req);
      cb(null, file.fieldname === 'ipa' ? uploads : certs);
    },
    filename(req, file, cb) {
      if (file.fieldname === 'p12') return cb(null, CERT_FILENAME);
      if (file.fieldname === 'provision') return cb(null, PROVISION_FILENAME);
      cb(null, `src-${Date.now()}.ipa`);
    },
  }),
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB, generous for large .ipa uploads
});

router.post(
  '/certificate',
  upload.fields([{ name: 'p12', maxCount: 1 }, { name: 'provision', maxCount: 1 }]),
  async (req, res) => {
    const { p12, provision, passwordFile } = certPaths(req);
    if (!fs.existsSync(p12) || !fs.existsSync(provision)) {
      return res.status(400).json({ error: 'Both a .p12 certificate and a .mobileprovision file are required.' });
    }
    const password = (req.body?.password || '').toString();

    const check = await zsign.checkCertificate(p12, password);
    if (!check.ok) {
      fs.rmSync(p12, { force: true });
      fs.rmSync(provision, { force: true });
      fs.rmSync(passwordFile, { force: true });
      return res.status(400).json({ error: check.message || 'Could not read this certificate — check the file and password.' });
    }

    if (password) {
      fs.writeFileSync(passwordFile, password, { mode: 0o600 });
    } else {
      fs.rmSync(passwordFile, { force: true });
    }
    sessionHome.touch(req.session.id);
    res.json({ ok: true, certificate: check.info });
  }
);

router.get('/certificate', async (req, res) => {
  const { p12, provision } = certPaths(req);
  if (!fs.existsSync(p12) || !fs.existsSync(provision)) {
    return res.json({ hasCertificate: false });
  }
  const check = await zsign.checkCertificate(p12, readCertPassword(req));
  if (!check.ok) {
    return res.json({ hasCertificate: false });
  }
  res.json({ hasCertificate: true, certificate: check.info });
});

router.delete('/certificate', (req, res) => {
  const { p12, provision, passwordFile } = certPaths(req);
  fs.rmSync(p12, { force: true });
  fs.rmSync(provision, { force: true });
  fs.rmSync(passwordFile, { force: true });
  res.json({ ok: true });
});

router.post('/sign', upload.fields([{ name: 'ipa', maxCount: 1 }]), async (req, res) => {
  const { p12, provision } = certPaths(req);
  if (!fs.existsSync(p12) || !fs.existsSync(provision)) {
    return res.status(400).json({ error: 'Upload a signing certificate first.' });
  }

  const { downloads, signed } = dirsFor(req);
  const uploadedFile = req.files?.ipa?.[0];
  let ipaPath;
  let baseName;

  if (uploadedFile) {
    ipaPath = uploadedFile.path;
    baseName = uploadedFile.originalname.replace(/\.ipa$/i, '');
  } else {
    const sourceFilename = (req.body?.sourceFilename || '').toString();
    if (!sourceFilename) {
      return res.status(400).json({ error: 'Upload an .ipa file or pick one you already downloaded.' });
    }
    const candidate = path.join(downloads, path.basename(sourceFilename));
    if (!fs.existsSync(candidate)) {
      return res.status(400).json({ error: 'That downloaded file no longer exists in this session.' });
    }
    ipaPath = candidate;
    baseName = path.basename(sourceFilename).replace(/\.ipa$/i, '');
  }

  const safeName = baseName.replace(/[^a-z0-9_-]+/gi, '_') || 'app';
  const outputFilename = `${safeName}-signed.ipa`;
  const outputPath = path.join(signed, outputFilename);
  const metadataDir = path.join(signed, `${safeName}-metadata`);
  fs.rmSync(metadataDir, { recursive: true, force: true });

  const result = await zsign.sign({
    ipaPath,
    p12Path: p12,
    password: readCertPassword(req),
    provisionPath: provision,
    bundleId: (req.body?.bundleId || '').toString().trim(),
    bundleName: (req.body?.bundleName || '').toString().trim(),
    bundleVersion: (req.body?.bundleVersion || '').toString().trim(),
    outputPath,
    metadataDir,
  });

  if (uploadedFile) fs.rm(ipaPath, { force: true }, () => {});
  sessionHome.touch(req.session.id);

  if (!result.ok || !fs.existsSync(outputPath)) {
    return res.status(400).json({ error: result.message || 'Signing failed.' });
  }

  res.json({
    ok: true,
    file: outputFilename,
    manifestUrl: `/api/signing/manifest/${encodeURIComponent(outputFilename)}.plist`,
    installUrl: `itms-services://?action=download-manifest&url=${encodeURIComponent(
      `${req.protocol}://${req.get('host')}/api/signing/manifest/${outputFilename}.plist`
    )}`,
  });
});

router.get('/file/:filename', (req, res) => {
  const { signed } = dirsFor(req);
  const filename = path.basename(req.params.filename);
  const filePath = path.join(signed, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found or expired.');
  }
  sessionHome.touch(req.session.id);
  res.download(filePath, filename);
});

// iOS's OTA installer (itms-services://) fetches this manifest, then the
// .ipa itself, over HTTPS — it won't install from a plain-HTTP host.
router.get('/manifest/:filename.plist', (req, res) => {
  const { signed } = dirsFor(req);
  const filename = path.basename(req.params.filename);
  const filePath = path.join(signed, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found or expired.');
  }

  const metadataDir = path.join(signed, `${filename.replace(/-signed\.ipa$/i, '')}-metadata`);
  let meta = {};
  try {
    meta = JSON.parse(fs.readFileSync(path.join(metadataDir, 'metadata.json'), 'utf8'));
  } catch {
    // No metadata (older sign, or extraction unavailable) — fall back to filename-derived values below.
  }

  const ipaUrl = `${req.protocol}://${req.get('host')}/api/signing/file/${encodeURIComponent(filename)}`;
  const bundleId = escapeXml(meta.AppBundleIdentifier || 'com.sidevault.signed');
  const bundleVersion = escapeXml(meta.AppVersion || '1.0');
  const title = escapeXml(meta.AppName || filename.replace(/\.ipa$/i, ''));

  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>items</key>
  <array>
    <dict>
      <key>assets</key>
      <array>
        <dict>
          <key>kind</key>
          <string>software-package</string>
          <key>url</key>
          <string>${escapeXml(ipaUrl)}</string>
        </dict>
      </array>
      <key>metadata</key>
      <dict>
        <key>bundle-identifier</key>
        <string>${bundleId}</string>
        <key>bundle-version</key>
        <string>${bundleVersion}</string>
        <key>kind</key>
        <string>software</string>
        <key>title</key>
        <string>${title}</string>
      </dict>
    </dict>
  </array>
</dict>
</plist>
`);
});

function escapeXml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

module.exports = router;
