// Breadcrumb popup.js — CSP-safe, zero inline handlers

const $ = id => document.getElementById(id);
let activePanel = 'tracked';
let trackedData = [], allTabsData = [];

function send(type, extra = {}) {
  return new Promise(r => chrome.runtime.sendMessage({ type, ...extra }, r));
}
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function ago(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  return Math.floor(h / 24) + 'd';
}
function faviconImg(url, cls, phCls) {
  if (url) return `<img class="${cls}" data-src="${esc(url)}">`;
  return `<div class="${phCls}"></div>`;
}
function fixFavicons(el) {
  el.querySelectorAll('img[data-src]').forEach(img => {
    img.src = img.dataset.src;
    img.onerror = () => {
      const ph = document.createElement('div');
      ph.className = img.className.replace(/\bae-fav\b/, 'ae-fav-ph').replace(/\bcur-fav\b/, 'cur-fav-ph');
      img.parentNode.replaceChild(ph, img);
    };
  });
}

// ── Nav ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    activePanel = btn.dataset.tab;
    $(`panel-${activePanel}`).classList.add('active');
    renderPanel();
  });
});

$('gear-btn').addEventListener('click', () => {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-tab="settings"]').classList.add('active');
  $('panel-settings').classList.add('active');
  activePanel = 'settings';
  renderPanel();
});

// ── Data ─────────────────────────────────────────────────────────────────────
async function load() {
  [trackedData, allTabsData] = await Promise.all([
    send('GET_ALL_TABS'),
    send('GET_OPEN_TABS')
  ]);
  trackedData = trackedData || [];
  allTabsData = allTabsData || [];
  $('hdr-count').textContent = `${allTabsData.length} open · ${trackedData.length} crumbs`;
}

async function renderPanel() {
  await load();
  if (activePanel === 'tracked') renderTracked();
  else if (activePanel === 'all') renderAll();
  else renderSettings();
}

// ── Tracked ──────────────────────────────────────────────────────────────────
async function renderTracked() {
  const el = $('panel-tracked');
  let curHtml = '', curId = null;

  try {
    const [cur] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (cur?.url && !cur.url.startsWith('chrome://')) {
      curId = cur.id;
      const isTracked = trackedData.find(t => t.id === cur.id);
      const host = new URL(cur.url).hostname.replace('www.', '');
      curHtml = `<div class="cur-strip">
        ${faviconImg(cur.favIconUrl, 'cur-fav', 'cur-fav-ph')}
        <span class="cur-title">${esc(host)}</span>
        ${isTracked
          ? `<span class="cur-tracked">✓ crumbed</span>`
          : `<button class="cur-btn" data-action="prompt-current" data-id="${cur.id}">+ crumb</button>`}
      </div>`;
    }
  } catch (e) {}

  const high = trackedData.filter(t => t.priority === 'high').length;
  const statsHtml = `<div class="stats">
    <div class="stat"><div class="stat-n">${allTabsData.length}</div><div class="stat-l">Open</div></div>
    <div class="stat"><div class="stat-n amber">${trackedData.length}</div><div class="stat-l">Crumbs</div></div>
    <div class="stat"><div class="stat-n red">${high}</div><div class="stat-l">Urgent</div></div>
  </div>`;

  if (!trackedData.length) {
    el.innerHTML = curHtml + statsHtml + `
      <div class="empty">
        <div class="empty-h">// no crumbs yet</div>
        <div class="empty-p">Open a new tab and Breadcrumb<br>will ask why you opened it.</div>
      </div>
      <div class="inline-add">
        <div class="inline-label">Drop a crumb on current tab</div>
        <input class="inline-input" id="il-input" placeholder="why did you open this tab?">
        <button class="inline-save" data-action="inline-save">Save crumb</button>
      </div>`;
    fixFavicons(el);
    bindTracked(el);
    return;
  }

  const sorted = [...trackedData].sort((a, b) => {
    const o = { high: 0, medium: 1, low: 2 };
    return (o[a.priority] ?? 1) - (o[b.priority] ?? 1) || b.createdAt - a.createdAt;
  });

  const entries = sorted.map(t => `
    <div class="entry p-${t.priority || 'medium'}">
      <div class="entry-top">
        <div class="entry-bar"></div>
        <div class="entry-body">
          <div class="entry-reason">${esc(t.reason)}</div>
          <div class="entry-site">${esc(t.title || t.url || '')}</div>
          <div class="entry-meta">
            <span class="badge ${t.priority || 'medium'}">${t.priority || 'medium'}</span>
            ${(t.tags || []).map(tag => `<span class="badge tag">${esc(tag)}</span>`).join('')}
            <span class="badge time">${ago(t.createdAt)}</span>
          </div>
        </div>
      </div>
      <div class="entry-actions">
        <button class="e-btn go"   data-action="go"     data-id="${t.id}">↗ go</button>
        <button class="e-btn done" data-action="done"   data-id="${t.id}">✓ done</button>
        <button class="e-btn"      data-action="snooze" data-id="${t.id}">⏱ snooze</button>
        <button class="e-btn del"  data-action="delete" data-id="${t.id}">✕</button>
      </div>
    </div>`).join('');

  el.innerHTML = curHtml + statsHtml +
    `<div class="divider">Breadcrumbs — ${sorted.length}</div>` + entries;

  fixFavicons(el);
  bindTracked(el);
}

function bindTracked(el) {
  el.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = parseInt(btn.dataset.id, 10);

    if (action === 'go') {
      chrome.tabs.update(id, { active: true }); window.close();
    } else if (action === 'done') {
      await send('DELETE_TAB', { tabId: id });
      chrome.tabs.remove(id).catch(() => {});
      renderPanel();
    } else if (action === 'snooze') {
      await send('SNOOZE_TAB', { tabId: id, minutes: 30 });
      renderPanel();
    } else if (action === 'delete') {
      await send('DELETE_TAB', { tabId: id });
      renderPanel();
    } else if (action === 'prompt-current') {
      chrome.tabs.sendMessage(id, { type: 'PROMPT_REASON' }).catch(() => {});
      window.close();
    } else if (action === 'inline-save') {
      const reason = $('il-input')?.value.trim();
      if (!reason) return;
      const [cur] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!cur) return;
      await send('SAVE_REASON', { tabId: cur.id, reason, tags: [], priority: 'medium', reminderMinutes: 30 });
      renderPanel();
    }
  });

  const ilInput = $('il-input');
  if (ilInput) {
    ilInput.addEventListener('keydown', async e => {
      if (e.key !== 'Enter') return;
      const reason = ilInput.value.trim();
      if (!reason) return;
      const [cur] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!cur) return;
      await send('SAVE_REASON', { tabId: cur.id, reason, tags: [], priority: 'medium', reminderMinutes: 30 });
      renderPanel();
    });
  }
}

// ── All tabs ─────────────────────────────────────────────────────────────────
function renderAll() {
  const el = $('panel-all');
  const trackedMap = Object.fromEntries(trackedData.map(t => [t.id, t]));

  if (!allTabsData.length) {
    el.innerHTML = `<div class="empty"><div class="empty-h">// no tabs open</div></div>`;
    return;
  }

  el.innerHTML = `<div class="divider">All open — ${allTabsData.length}</div>` +
    allTabsData.map(t => {
      const tracked = trackedMap[t.id];
      const host = (() => { try { return new URL(t.url || '').hostname.replace('www.', ''); } catch { return t.url || ''; } })();
      return `<div class="all-entry" data-action="focus-tab" data-id="${t.id}">
        ${faviconImg(t.favIconUrl, 'ae-fav', 'ae-fav-ph')}
        <div class="ae-info">
          <div class="ae-title">${esc(t.title || host)}</div>
          <div class="ae-sub">${tracked ? esc(tracked.reason) : esc(host)}</div>
        </div>
        ${tracked
          ? `<div class="ae-dot tracked"></div>`
          : `<button class="ae-add" data-action="prompt-tab" data-id="${t.id}">+ crumb</button>`}
      </div>`;
    }).join('');

  fixFavicons(el);

  el.addEventListener('click', e => {
    const row = e.target.closest('[data-action="focus-tab"]');
    const btn = e.target.closest('[data-action="prompt-tab"]');
    if (btn) {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id, 10);
      chrome.tabs.sendMessage(id, { type: 'PROMPT_REASON' }).catch(() => {});
      chrome.tabs.update(id, { active: true });
      window.close();
    } else if (row) {
      chrome.tabs.update(parseInt(row.dataset.id, 10), { active: true });
      window.close();
    }
  });
}

// ── Settings ─────────────────────────────────────────────────────────────────
function renderSettings() {
  send('GET_SETTINGS').then(s => {
    const el = $('panel-settings');
    el.innerHTML = `
      <div class="sg-label">Reminders</div>
      <div class="sr">
        <div><div class="sr-lbl">Default reminder</div><div class="sr-sub">Time before you're nudged</div></div>
        <select class="sr-sel" id="s-remind">
          <option value="15"   ${s.reminderMinutes == 15   ? 'selected' : ''}>15 min</option>
          <option value="30"   ${s.reminderMinutes == 30   ? 'selected' : ''}>30 min</option>
          <option value="60"   ${s.reminderMinutes == 60   ? 'selected' : ''}>1 hour</option>
          <option value="120"  ${s.reminderMinutes == 120  ? 'selected' : ''}>2 hours</option>
          <option value="1440" ${s.reminderMinutes == 1440 ? 'selected' : ''}>Tomorrow</option>
          <option value="0"    ${s.reminderMinutes == 0    ? 'selected' : ''}>Off</option>
        </select>
      </div>
      <div class="sg-label" style="margin-top:12px;">Behaviour</div>
      <div class="sr">
        <div><div class="sr-lbl">Auto-prompt new tabs</div><div class="sr-sub">Ask why on every new tab</div></div>
        <div class="toggle ${s.autoPrompt ? 'on' : ''}" id="s-auto"></div>
      </div>
      <div class="sr">
        <div><div class="sr-lbl">Tab limit warning</div><div class="sr-sub">Alert when tabs exceed</div></div>
        <select class="sr-sel" id="s-max">
          <option value="5"  ${s.maxTabs == 5  ? 'selected' : ''}>5 tabs</option>
          <option value="10" ${s.maxTabs == 10 ? 'selected' : ''}>10 tabs</option>
          <option value="15" ${s.maxTabs == 15 ? 'selected' : ''}>15 tabs</option>
          <option value="20" ${s.maxTabs == 20 ? 'selected' : ''}>20 tabs</option>
          <option value="0"  ${s.maxTabs == 0  ? 'selected' : ''}>No limit</option>
        </select>
      </div>
      <div class="danger-row">
        <button class="danger-btn" id="s-clear">Clear all breadcrumbs</button>
      </div>`;

    let auto = s.autoPrompt;
    const tog = $('s-auto');
    tog.addEventListener('click', () => { auto = !auto; tog.classList.toggle('on', auto); save(); });

    function save() {
      send('SAVE_SETTINGS', { settings: {
        reminderMinutes: parseInt($('s-remind').value),
        maxTabs: parseInt($('s-max').value),
        autoPrompt: auto
      }});
    }
    $('s-remind').addEventListener('change', save);
    $('s-max').addEventListener('change', save);
    $('s-clear').addEventListener('click', async () => {
      if (confirm('Clear all breadcrumbs?')) {
        await chrome.storage.local.remove('tabmind_tabs');
        renderPanel();
      }
    });
  });
}

// ── Init ─────────────────────────────────────────────────────────────────────
renderPanel();
