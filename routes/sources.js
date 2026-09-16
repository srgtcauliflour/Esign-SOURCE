const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const sources = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'sources.json'), 'utf8'));

const cache = new Map(); // id -> { at, apps }
const CACHE_MS = 15 * 60 * 1000;

function normalizeApps(json) {
  const list = Array.isArray(json?.apps)
    ? json.apps
    : Array.isArray(json?.applications)
    ? json.applications
    : Array.isArray(json)
    ? json
    : [];

  return list
    .map((a) => ({
      name: a.name || a.title || 'Unknown',
      version: a.version || a.versions?.[0]?.version || '',
      bundleIdentifier: a.bundleIdentifier || a.bundleID || a.identifier || '',
      iconURL: a.iconURL || a.icon || '',
      downloadURL: a.downloadURL || a.versions?.[0]?.downloadURL || '',
      size: a.size || a.versions?.[0]?.size || null,
    }))
    .filter((a) => a.name);
}

router.get('/', (req, res) => {
  res.json({ sources: sources.map(({ id, name, description, url }) => ({ id, name, description, url })) });
});

router.get('/:id/apps', async (req, res) => {
  const source = sources.find((s) => s.id === req.params.id);
  if (!source) return res.status(404).json({ error: 'Unknown source.' });

  const cached = cache.get(source.id);
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return res.json({ apps: cached.apps });
  }

  try {
    const resp = await fetch(source.url, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) throw new Error(`Upstream returned ${resp.status}`);
    const json = await resp.json();
    const apps = normalizeApps(json);
    cache.set(source.id, { at: Date.now(), apps });
    res.json({ apps });
  } catch (err) {
    res.status(502).json({ error: `Could not load this source right now (${err.message}).` });
  }
});

module.exports = router;
