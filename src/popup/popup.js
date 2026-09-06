(function runPopup() {
  'use strict';

  const Core = globalThis.ChatGPTWorkspaceCore;
  const status = document.getElementById('status');

  async function getState() {
    const stored = await chrome.storage.local.get([
      Core.STORAGE_KEYS.settings,
      Core.STORAGE_KEYS.index,
      Core.STORAGE_KEYS.overrides
    ]);
    const settings = Core.migrateSettings(stored[Core.STORAGE_KEYS.settings]);
    const index = stored[Core.STORAGE_KEYS.index] || {};
    const overrides = stored[Core.STORAGE_KEYS.overrides] || {};
    return { settings, index, overrides };
  }

  async function render() {
    const { settings, index, overrides } = await getState();
    const summary = Core.summarizeIndex(index, settings, overrides);
    document.getElementById('summary').textContent = `${summary.total} chats indexed locally`;

    const root = document.getElementById('counts');
    root.replaceChildren();
    settings.groups.filter((group) => group.enabled !== false).forEach((group) => {
      const row = document.createElement('div');
      row.className = 'count-row';
      const name = document.createElement('span');
      name.textContent = group.name;
      const count = document.createElement('span');
      count.textContent = String(summary.counts[group.id] || 0);
      row.append(name, count);
      root.append(row);
    });

    if (settings.showUnclassified) {
      const row = document.createElement('div');
      row.className = 'count-row';
      const name = document.createElement('span');
      name.textContent = 'Unclassified';
      const count = document.createElement('span');
      count.textContent = String(summary.unclassified);
      row.append(name, count);
      root.append(row);
    }
  }

  async function activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function send(type) {
    const tab = await activeTab();
    if (!tab || !tab.id) throw new Error('Open ChatGPT first.');
    return chrome.tabs.sendMessage(tab.id, { type });
  }

  async function runScan(type, message) {
    status.textContent = message;
    try {
      const result = await send(type);
      if (!result || !result.ok) throw new Error('ChatGPT page is not ready.');
      await render();
      status.textContent = type === 'CWM_SCAN_DEEP'
        ? `Deep scan complete: ${result.total} chats indexed.`
        : `Scan complete: ${result.found} loaded chats found.`;
    } catch (_) {
      status.textContent = 'Open chatgpt.com and reload the page, then try again.';
    }
  }

  document.getElementById('scan-visible').addEventListener('click', () => runScan('CWM_SCAN_VISIBLE', 'Scanning loaded chats…'));
  document.getElementById('scan-deep').addEventListener('click', () => runScan('CWM_SCAN_DEEP', 'Scanning chat history…'));
  document.getElementById('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

  render().catch(() => { status.textContent = 'Could not read local workspace data.'; });
})();
