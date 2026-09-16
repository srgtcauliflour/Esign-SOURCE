const express = require('express');
const path = require('path');
const fs = require('fs');
const sessionHome = require('../lib/sessionHome');
const ipatool = require('../lib/ipatool');

const router = express.Router();

function envFor(req) {
  return sessionHome.ensure(req.session.id).env;
}

function looksLike2FA(result) {
  const text = `${result.message} ${result.stdout}`.toLowerCase();
  return text.includes('2fa') || text.includes('mfa') || text.includes('auth code') || text.includes('two-factor');
}

router.post('/login', express.json(), async (req, res) => {
  const { email, password, code } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const env = envFor(req);
  const result = await ipatool.authLogin({ email, password, code }, env);
  sessionHome.touch(req.session.id);

  // In non-interactive mode ipatool exits 0 even when it only got as far as
  // "a 2FA code is required" — so that check has to run before looking at ok/success.
  if (looksLike2FA(result)) {
    return res.status(200).json({ requiresCode: true, message: 'Enter the 2FA code sent to your Apple devices.' });
  }
  if (!result.ok || result.json?.success !== true) {
    return res.status(401).json({ error: result.message || 'Login failed. Check your Apple ID and password.' });
  }
  res.json({ ok: true, account: result.json || null });
});

router.get('/account', async (req, res) => {
  const env = envFor(req);
  const result = await ipatool.authInfo(env);
  if (!result.ok) {
    return res.status(401).json({ loggedIn: false });
  }
  res.json({ loggedIn: true, account: result.json || null });
});

router.post('/logout', async (req, res) => {
  const env = envFor(req);
  await ipatool.authRevoke(env);
  sessionHome.wipe(req.session.id);
  req.session.destroy(() => {});
  res.json({ ok: true });
});

router.get('/search', async (req, res) => {
  const term = (req.query.term || '').toString().trim();
  if (!term) return res.status(400).json({ error: 'Missing search term.' });
  const env = envFor(req);
  const result = await ipatool.search(term, 10, env);
  sessionHome.touch(req.session.id);
  if (!result.ok) {
    return res.status(400).json({ error: result.message || 'Search failed.' });
  }
  const apps = result.json?.apps || [];
  res.json({ apps });
});

router.post('/purchase', express.json(), async (req, res) => {
  const { bundleId } = req.body || {};
  if (!bundleId) return res.status(400).json({ error: 'Missing bundleId.' });
  const env = envFor(req);
  const result = await ipatool.purchase(bundleId, env);
  sessionHome.touch(req.session.id);
  if (!result.ok || result.json?.success !== true) {
    return res.status(400).json({ error: result.message || 'Could not obtain a license for this app.' });
  }
  res.json({ ok: true });
});

router.post('/download', express.json(), async (req, res) => {
  const { bundleId, name } = req.body || {};
  if (!bundleId) return res.status(400).json({ error: 'Missing bundleId.' });
  const env = envFor(req);
  const { downloads } = sessionHome.ensure(req.session.id);
  const safeName = (name || bundleId).toString().replace(/[^a-z0-9_-]+/gi, '_');
  const filename = `${safeName}.ipa`;
  const outPath = path.join(downloads, filename);

  const result = await ipatool.download(bundleId, outPath, env);
  sessionHome.touch(req.session.id);

  if (!result.ok || result.json?.success !== true || !fs.existsSync(outPath)) {
    return res.status(400).json({ error: result.message || 'Download failed.' });
  }
  res.json({ ok: true, file: filename });
});

router.get('/downloads', (req, res) => {
  const { downloads } = sessionHome.ensure(req.session.id);
  const files = fs
    .readdirSync(downloads)
    .filter((f) => f.toLowerCase().endsWith('.ipa'))
    .map((f) => ({ file: f, size: fs.statSync(path.join(downloads, f)).size }));
  res.json({ files });
});

router.get('/file/:filename', (req, res) => {
  const { downloads } = sessionHome.ensure(req.session.id);
  const filename = path.basename(req.params.filename);
  const filePath = path.join(downloads, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found or expired.');
  }
  sessionHome.touch(req.session.id);
  res.download(filePath, filename);
});

module.exports = router;
