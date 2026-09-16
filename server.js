const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');

const sessionHome = require('./lib/sessionHome');
const downloaderRoutes = require('./routes/downloader');
const sourcesRoutes = require('./routes/sources');
const signingRoutes = require('./routes/signing');

const PORT = process.env.PORT || 4567;
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const app = express();
if (TRUST_PROXY) app.set('trust proxy', 1);

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      secure: COOKIE_SECURE,
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/downloader', downloaderRoutes);
app.use('/api/sources', sourcesRoutes);
app.use('/api/signing', signingRoutes);

app.get('/healthz', (req, res) => res.json({ ok: true }));

// Sweep idle per-session dirs so old logins, certs, and downloads don't linger.
setInterval(() => sessionHome.sweepIdle(), 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`SideVault listening on http://127.0.0.1:${PORT}`);
  if (!COOKIE_SECURE) {
    console.log('Running without secure cookies — fine for localhost only. See README before exposing this over a network.');
  }
});
