(() => {
  const tabs = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');

  function activate(tabId) {
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === tabId));
    panels.forEach((p) => p.classList.toggle('active', p.id === `tab-${tabId}`));
  }

  tabs.forEach((t) => t.addEventListener('click', () => activate(t.dataset.tab)));
  document.querySelectorAll('[data-goto]').forEach((el) =>
    el.addEventListener('click', () => activate(el.dataset.goto))
  );

  // ---------- Sources tab ----------
  const sourcesList = document.getElementById('sources-list');
  const sourceApps = document.getElementById('source-apps');

  async function loadSources() {
    const res = await fetch('/api/sources');
    const { sources } = await res.json();
    sourcesList.innerHTML = '';
    sources.forEach((s) => {
      const el = document.createElement('div');
      el.className = 'source-item';
      el.innerHTML = `<h4>${escapeHtml(s.name)}</h4><p>${escapeHtml(s.description)}</p>`;
      el.addEventListener('click', () => selectSource(s, el));
      sourcesList.appendChild(el);
    });
  }

  async function selectSource(source, el) {
    document.querySelectorAll('.source-item').forEach((n) => n.classList.remove('active'));
    el.classList.add('active');
    sourceApps.innerHTML = '<p class="muted">Loading apps…</p>';
    try {
      const res = await fetch(`/api/sources/${source.id}/apps`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load.');
      if (!data.apps.length) {
        sourceApps.innerHTML = '<p class="muted">No apps found in this source right now.</p>';
        return;
      }
      sourceApps.innerHTML = '';
      data.apps.forEach((a) => {
        const row = document.createElement('div');
        row.className = 'app-row';
        row.innerHTML = `
          ${a.iconURL ? `<img src="${escapeAttr(a.iconURL)}" alt="" onerror="this.style.visibility='hidden'" />` : '<div class="icon"></div>'}
          <div class="meta">
            <strong>${escapeHtml(a.name)}</strong>
            <span>${escapeHtml(a.version || '')} ${a.bundleIdentifier ? '· ' + escapeHtml(a.bundleIdentifier) : ''}</span>
          </div>
          ${a.downloadURL ? `<a class="btn small" href="${escapeAttr(a.downloadURL)}" target="_blank" rel="noopener">Download</a>` : ''}
        `;
        sourceApps.appendChild(row);
      });
    } catch (err) {
      sourceApps.innerHTML = `<p class="status error">${escapeHtml(err.message)}</p>`;
    }
  }

  // ---------- Downloader tab ----------
  const loggedOutView = document.getElementById('dl-logged-out');
  const loggedInView = document.getElementById('dl-logged-in');
  const loginForm = document.getElementById('login-form');
  const codeField = document.getElementById('code-field');
  const loginStatus = document.getElementById('login-status');
  const accountLabel = document.getElementById('account-label');
  const logoutBtn = document.getElementById('logout-btn');
  const searchForm = document.getElementById('search-form');
  const searchStatus = document.getElementById('search-status');
  const searchResults = document.getElementById('search-results');

  async function checkAccount() {
    try {
      const res = await fetch('/api/downloader/account');
      const data = await res.json();
      if (data.loggedIn) showLoggedIn(data.account);
    } catch {
      /* not logged in yet */
    }
  }

  function showLoggedIn(account) {
    loggedOutView.classList.add('hidden');
    loggedInView.classList.remove('hidden');
    accountLabel.textContent = account?.email ? `Signed in as ${account.email}` : 'Signed in';
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus(loginStatus, 'Signing in…', '');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const code = document.getElementById('login-code').value.trim();

    const res = await fetch('/api/downloader/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, code: code || undefined }),
    });
    const data = await res.json();

    if (data.requiresCode) {
      codeField.classList.remove('hidden');
      setStatus(loginStatus, data.message || 'Enter your 2FA code and sign in again.', '');
      return;
    }
    if (!res.ok) {
      setStatus(loginStatus, data.error || 'Login failed.', 'error');
      return;
    }
    setStatus(loginStatus, '', '');
    showLoggedIn(data.account);
  });

  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/downloader/logout', { method: 'POST' });
    loggedInView.classList.add('hidden');
    loggedOutView.classList.remove('hidden');
    loginForm.reset();
    codeField.classList.add('hidden');
    searchResults.innerHTML = '';
  });

  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const term = document.getElementById('search-term').value.trim();
    if (!term) return;
    setStatus(searchStatus, 'Searching…', '');
    searchResults.innerHTML = '';

    const res = await fetch(`/api/downloader/search?term=${encodeURIComponent(term)}`);
    const data = await res.json();
    if (!res.ok) {
      setStatus(searchStatus, data.error || 'Search failed.', 'error');
      return;
    }
    setStatus(searchStatus, '', '');
    if (!data.apps.length) {
      searchResults.innerHTML = '<p class="muted">No results.</p>';
      return;
    }
    data.apps.forEach((app) => renderResult(app));
  });

  function renderResult(app) {
    const bundleId = app.bundleID || app.bundleId || app.bundleIdentifier;
    const row = document.createElement('div');
    row.className = 'result-row';
    row.innerHTML = `
      <div class="icon"></div>
      <div class="meta">
        <strong>${escapeHtml(app.name || bundleId)}</strong>
        <span>${escapeHtml(bundleId || '')}</span>
      </div>
      <button class="btn small" data-action="license">Get license</button>
      <button class="btn small primary" data-action="download">Download</button>
    `;
    const status = document.createElement('p');
    status.className = 'status';
    row.appendChild(status);

    row.querySelector('[data-action="license"]').addEventListener('click', async () => {
      setStatus(status, 'Requesting license…', '');
      const res = await fetch('/api/downloader/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundleId }),
      });
      const data = await res.json();
      setStatus(status, res.ok ? 'License obtained.' : data.error, res.ok ? 'ok' : 'error');
    });

    row.querySelector('[data-action="download"]').addEventListener('click', async () => {
      setStatus(status, 'Downloading… this can take a while for large apps.', '');
      const res = await fetch('/api/downloader/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundleId, name: app.name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(status, data.error || 'Download failed.', 'error');
        return;
      }
      setStatus(status, '', '');
      const link = document.createElement('a');
      link.href = `/api/downloader/file/${encodeURIComponent(data.file)}`;
      link.textContent = `Save ${data.file}`;
      link.className = 'btn small';
      status.appendChild(link);
    });

    searchResults.appendChild(row);
  }

  function setStatus(el, text, kind) {
    el.textContent = text;
    el.className = `status ${kind || ''}`.trim();
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escapeAttr(str) {
    return escapeHtml(str);
  }

  loadSources();
  checkAccount();
})();
