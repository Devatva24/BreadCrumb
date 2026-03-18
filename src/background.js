// TabMind Background Service Worker

// ── Storage helpers ──────────────────────────────────────────────────────────
async function getTabs() {
  const result = await chrome.storage.local.get('tabmind_tabs');
  return result.tabmind_tabs || {};
}

async function saveTabs(tabs) {
  await chrome.storage.local.set({ tabmind_tabs: tabs });
}

async function getSettings() {
  const result = await chrome.storage.local.get('tabmind_settings');
  return result.tabmind_settings || {
    reminderMinutes: 30,
    maxTabs: 10,
    autoPrompt: true
  };
}

// ── Tab lifecycle ─────────────────────────────────────────────────────────────

// Track which tabs we've already prompted so we don't double-fire
const promptedTabs = new Set();

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only fire once per tab load, when the page is fully loaded
  if (changeInfo.status !== 'complete') return;

  const url = tab.url || '';
  const blocked = ['chrome://', 'chrome-extension://', 'about:', 'edge://', 'file://', 'data:'];
  if (blocked.some(b => url.startsWith(b))) return;
  if (!url || url === 'about:blank') return;

  // Skip if already tracked
  const tabs = await getTabs();
  if (tabs[tabId]) return;

  // Skip if we already prompted this tab in this session
  if (promptedTabs.has(tabId)) return;

  const settings = await getSettings();
  if (!settings.autoPrompt) return;

  promptedTabs.add(tabId);

  // Try sendMessage first (works if content script already injected)
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PROMPT_REASON' });
    return;
  } catch (e) {
    // Content script not yet injected — inject it now, then trigger
  }

  // Fallback: programmatically inject the content script then prompt
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content.js']
    });
    // Small wait for script to initialise
    await new Promise(r => setTimeout(r, 200));
    await chrome.tabs.sendMessage(tabId, { type: 'PROMPT_REASON' });
  } catch (err) {
    // Page may not allow scripts (e.g. Chrome Web Store) — silently ignore
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const tabs = await getTabs();
  if (tabs[tabId]) {
    delete tabs[tabId];
    await saveTabs(tabs);
  }
  chrome.alarms.clear(`remind_${tabId}`);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  const tabs = await getTabs();
  if (tabs[tabId]) {
    tabs[tabId].url = tab.url;
    tabs[tabId].title = tab.title;
    await saveTabs(tabs);
  }
});

// ── Messaging ─────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SAVE_REASON') {
    handleSaveReason(msg, sender, sendResponse);
    return true;
  }
  if (msg.type === 'GET_TAB_INFO') {
    handleGetTabInfo(msg, sendResponse);
    return true;
  }
  if (msg.type === 'GET_ALL_TABS') {
    handleGetAllTabs(sendResponse);
    return true;
  }
  if (msg.type === 'DELETE_TAB') {
    handleDeleteTab(msg, sendResponse);
    return true;
  }
  if (msg.type === 'SNOOZE_TAB') {
    handleSnooze(msg, sendResponse);
    return true;
  }
  if (msg.type === 'GET_SETTINGS') {
    getSettings().then(sendResponse);
    return true;
  }
  if (msg.type === 'SAVE_SETTINGS') {
    chrome.storage.local.set({ tabmind_settings: msg.settings }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'GET_OPEN_TABS') {
    handleGetOpenTabs(sendResponse);
    return true;
  }
});

async function handleSaveReason(msg, sender, sendResponse) {
  const tabs = await getTabs();
  const settings = await getSettings();
  const tabId = msg.tabId || sender.tab?.id;
  if (!tabId) { sendResponse({ ok: false }); return; }

  try {
    const tab = await chrome.tabs.get(tabId);
    tabs[tabId] = {
      id: tabId,
      reason: msg.reason,
      tags: msg.tags || [],
      priority: msg.priority || 'medium',
      url: tab.url,
      title: tab.title,
      favicon: tab.favIconUrl || '',
      createdAt: Date.now(),
      snoozedUntil: null
    };
    await saveTabs(tabs);

    // Set reminder alarm
    const minutes = msg.reminderMinutes || settings.reminderMinutes;
    if (minutes > 0) {
      chrome.alarms.create(`remind_${tabId}`, { delayInMinutes: minutes });
    }
    sendResponse({ ok: true });
  } catch (e) {
    sendResponse({ ok: false, error: e.message });
  }
}

async function handleGetTabInfo(msg, sendResponse) {
  const tabs = await getTabs();
  sendResponse(tabs[msg.tabId] || null);
}

async function handleGetAllTabs(sendResponse) {
  const tabs = await getTabs();
  sendResponse(Object.values(tabs));
}

async function handleDeleteTab(msg, sendResponse) {
  const tabs = await getTabs();
  delete tabs[msg.tabId];
  await saveTabs(tabs);
  chrome.alarms.clear(`remind_${msg.tabId}`);
  sendResponse({ ok: true });
}

async function handleSnooze(msg, sendResponse) {
  const tabs = await getTabs();
  if (tabs[msg.tabId]) {
    tabs[msg.tabId].snoozedUntil = Date.now() + msg.minutes * 60 * 1000;
    await saveTabs(tabs);
    chrome.alarms.clear(`remind_${msg.tabId}`);
    chrome.alarms.create(`remind_${msg.tabId}`, { delayInMinutes: msg.minutes });
    sendResponse({ ok: true });
  } else {
    sendResponse({ ok: false });
  }
}

async function handleGetOpenTabs(sendResponse) {
  const [openTabs, savedTabs] = await Promise.all([
    chrome.tabs.query({}),
    getTabs()
  ]);
  const result = openTabs
    .filter(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'))
    .map(t => ({
      ...t,
      tabmind: savedTabs[t.id] || null
    }));
  sendResponse(result);
}

// ── Alarms / Reminders ────────────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith('remind_')) return;
  const tabId = parseInt(alarm.name.replace('remind_', ''), 10);
  const tabs = await getTabs();
  const tabInfo = tabs[tabId];
  if (!tabInfo) return;

  // Check snooze
  if (tabInfo.snoozedUntil && Date.now() < tabInfo.snoozedUntil) return;

  const priorityEmoji = { high: '🔴', medium: '🟡', low: '🟢' };
  chrome.notifications.create(`notif_${tabId}`, {
    type: 'basic',
    iconUrl: tabInfo.favicon || 'icons/icon128.png',
    title: `TabMind Reminder ${priorityEmoji[tabInfo.priority] || ''}`,
    message: `"${tabInfo.reason}"`,
    contextMessage: tabInfo.title || tabInfo.url,
    buttons: [
      { title: '✅ Done – Close Tab' },
      { title: '😴 Snooze 15 min' }
    ],
    requireInteraction: true
  });
});

chrome.notifications.onButtonClicked.addListener(async (notifId, btnIdx) => {
  const tabId = parseInt(notifId.replace('notif_', ''), 10);
  chrome.notifications.clear(notifId);
  if (btnIdx === 0) {
    // Close tab
    const tabs = await getTabs();
    delete tabs[tabId];
    await saveTabs(tabs);
    chrome.tabs.remove(tabId).catch(() => {});
  } else if (btnIdx === 1) {
    // Snooze 15 min
    const tabs = await getTabs();
    if (tabs[tabId]) {
      tabs[tabId].snoozedUntil = Date.now() + 15 * 60 * 1000;
      await saveTabs(tabs);
      chrome.alarms.create(`remind_${tabId}`, { delayInMinutes: 15 });
    }
  }
});

chrome.notifications.onClicked.addListener(async (notifId) => {
  const tabId = parseInt(notifId.replace('notif_', ''), 10);
  chrome.notifications.clear(notifId);
  chrome.tabs.update(tabId, { active: true }).catch(() => {});
  chrome.windows.getCurrent().then(w => chrome.windows.update(w.id, { focused: true })).catch(() => {});
});
