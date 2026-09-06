(function runWorkspaceManager() {
  'use strict';

  const Core = globalThis.ChatGPTWorkspaceCore;
  if (!Core || !chrome || !chrome.storage) return;

  const PANEL_ID = 'cwm-workspace-panel';
  const CHAT_LINK_SELECTOR = 'a[href*="/c/"]';
  let settings = Core.migrateSettings(null);
  let index = {};
  let overrides = {};
  let observer = null;
  let scanTimer = null;
  let renderTimer = null;
  let deepScanRunning = false;

  async function loadState() {
    const stored = await chrome.storage.local.get([
      Core.STORAGE_KEYS.settings,
      Core.STORAGE_KEYS.index,
      Core.STORAGE_KEYS.overrides
    ]);

    settings = Core.migrateSettings(stored[Core.STORAGE_KEYS.settings]);
    index = stored[Core.STORAGE_KEYS.index] || {};
    overrides = stored[Core.STORAGE_KEYS.overrides] || {};
  }

  function getLinkTitle(link) {
    const candidates = [
      link.getAttribute('aria-label'),
      link.getAttribute('title'),
      link.innerText,
      link.textContent
    ];
    return candidates.map((value) => String(value || '').trim()).find(Boolean) || '';
  }

  function firstUserMessage() {
    const node = document.querySelector('[data-message-author-role="user"]');
    return String(node && (node.innerText || node.textContent) || '').trim().slice(0, 1000);
  }

  function isActiveConversation(id) {
    return Core.deriveConversationId(location.href, location.href) === id;
  }

  async function scanVisibleChats() {
    const links = Array.from(document.querySelectorAll(CHAT_LINK_SELECTOR))
      .filter((link) => !link.closest(`#${PANEL_ID}`));
    if (!links.length) return { found: 0, changed: 0 };

    let changed = 0;
    const now = new Date().toISOString();

    for (const link of links) {
      const rawHref = link.getAttribute('href') || link.href;
      const id = Core.deriveConversationId(rawHref, location.href);
      const title = getLinkTitle(link);
      if (!id || !title) continue;

      const url = new URL(rawHref, location.href);
      const href = url.pathname + url.search;
      const existing = index[id] || {};
      const message = isActiveConversation(id) ? firstUserMessage() : existing.firstMessage || '';
      const next = {
        id,
        title: title.slice(0, 500),
        href,
        firstMessage: message,
        lastSeenAt: now
      };

      if (
        existing.title !== next.title ||
        existing.href !== next.href ||
        existing.firstMessage !== next.firstMessage
      ) {
        changed += 1;
      }
      index[id] = { ...existing, ...next };
    }

    if (changed) {
      await chrome.storage.local.set({ [Core.STORAGE_KEYS.index]: index });
    }

    scheduleRender();
    return { found: links.length, changed };
  }

  function findSidebarHost() {
    const firstNativeLink = Array.from(document.querySelectorAll(CHAT_LINK_SELECTOR))
      .find((link) => !link.closest(`#${PANEL_ID}`));
    if (!firstNativeLink) return null;
    return firstNativeLink.closest('nav') || firstNativeLink.closest('aside') || null;
  }

  function findScrollableAncestor(node) {
    let current = node;
    while (current && current !== document.body) {
      const style = getComputedStyle(current);
      const overflowY = style.overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight + 20) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function setStatus(message) {
    const node = document.querySelector(`#${PANEL_ID} .cwm-status`);
    if (node) node.textContent = message || '';
  }

  async function deepScan() {
    if (deepScanRunning) return;
    deepScanRunning = true;
    setStatus('Scanning chat history…');

    try {
      await scanVisibleChats();
      const firstNativeLink = Array.from(document.querySelectorAll(CHAT_LINK_SELECTOR))
        .find((link) => !link.closest(`#${PANEL_ID}`));
      const scroller = firstNativeLink ? findScrollableAncestor(firstNativeLink) : null;

      if (!scroller) {
        setStatus('Scanned chats currently loaded by ChatGPT.');
        return;
      }

      const originalTop = scroller.scrollTop;
      let stableRounds = 0;
      let previousTotal = Object.keys(index).length;

      for (let round = 0; round < 80 && stableRounds < 5; round += 1) {
        const before = scroller.scrollTop;
        scroller.scrollTop = Math.min(
          scroller.scrollTop + Math.max(scroller.clientHeight * 0.8, 240),
          scroller.scrollHeight
        );
        await new Promise((resolve) => setTimeout(resolve, 220));
        await scanVisibleChats();

        const total = Object.keys(index).length;
        const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
        if (total === previousTotal && (atBottom || scroller.scrollTop === before)) {
          stableRounds += 1;
        } else {
          stableRounds = 0;
        }
        previousTotal = total;
      }

      scroller.scrollTop = originalTop;
      setStatus(`${Object.keys(index).length} chats indexed locally.`);
    } finally {
      deepScanRunning = false;
      scheduleRender();
    }
  }

  function groupRecords() {
    const result = new Map(settings.groups.map((group) => [group.id, []]));
    const unclassified = [];

    Object.values(index)
      .sort((a, b) => String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || '')))
      .forEach((conversation) => {
        const classification = Core.classifyConversation(conversation, settings.groups, overrides);
        if (classification.groupId && result.has(classification.groupId)) {
          result.get(classification.groupId).push(conversation);
        } else {
          unclassified.push(conversation);
        }
      });

    return { grouped: result, unclassified };
  }

  function createChatLink(conversation, group) {
    const link = document.createElement('a');
    link.className = 'cwm-chat-link';
    link.href = conversation.href;
    link.textContent = Core.cleanDisplayTitle(conversation.title, group);
    link.title = conversation.title;
    return link;
  }

  function createGroupDetails(group, records, isUnclassified) {
    const details = document.createElement('details');
    details.className = 'cwm-group';
    details.open = true;

    const summary = document.createElement('summary');
    const label = document.createElement('span');
    label.textContent = isUnclassified ? 'Unclassified' : group.name;
    const count = document.createElement('span');
    count.className = 'cwm-count';
    count.textContent = String(records.length);
    summary.append(label, count);

    const list = document.createElement('div');
    list.className = 'cwm-chat-list';
    records.slice(0, 50).forEach((conversation) => {
      list.append(createChatLink(conversation, isUnclassified ? null : group));
    });

    if (records.length > 50) {
      const more = document.createElement('div');
      more.className = 'cwm-status';
      more.textContent = `+${records.length - 50} more indexed chats`;
      list.append(more);
    }

    details.append(summary, list);
    return details;
  }

  function render() {
    const host = findSidebarHost();
    if (!host) return;

    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      host.prepend(panel);
    }

    panel.replaceChildren();

    const header = document.createElement('div');
    header.className = 'cwm-header';

    const title = document.createElement('div');
    title.className = 'cwm-title';
    title.textContent = 'Workspaces';

    const actions = document.createElement('div');
    actions.className = 'cwm-actions';

    const scanButton = document.createElement('button');
    scanButton.type = 'button';
    scanButton.className = 'cwm-icon-button';
    scanButton.title = 'Deep scan chat history';
    scanButton.setAttribute('aria-label', 'Deep scan chat history');
    scanButton.textContent = '↻';
    scanButton.addEventListener('click', deepScan);

    const settingsButton = document.createElement('button');
    settingsButton.type = 'button';
    settingsButton.className = 'cwm-icon-button';
    settingsButton.title = 'Workspace Manager settings';
    settingsButton.setAttribute('aria-label', 'Workspace Manager settings');
    settingsButton.textContent = '⚙';
    settingsButton.addEventListener('click', () => chrome.runtime.openOptionsPage());

    actions.append(scanButton, settingsButton);
    header.append(title, actions);
    panel.append(header);

    if (!settings.groups.length) {
      const empty = document.createElement('div');
      empty.className = 'cwm-empty';
      empty.textContent = 'Create a group in settings to start organizing chats.';
      panel.append(empty);
    } else {
      const { grouped, unclassified } = groupRecords();
      settings.groups.filter((group) => group.enabled !== false).forEach((group) => {
        panel.append(createGroupDetails(group, grouped.get(group.id) || [], false));
      });
      if (settings.showUnclassified) {
        panel.append(createGroupDetails({ name: 'Unclassified' }, unclassified, true));
      }
    }

    const status = document.createElement('div');
    status.className = 'cwm-status';
    status.textContent = `${Object.keys(index).length} chats indexed locally.`;
    panel.append(status);
  }

  function scheduleScan() {
    if (!settings.autoScan) return;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scanVisibleChats, 250);
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 80);
  }

  function startObserver() {
    observer = new MutationObserver(() => {
      scheduleScan();
      if (!document.getElementById(PANEL_ID)) scheduleRender();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) return undefined;

    if (message.type === 'CWM_SCAN_VISIBLE') {
      scanVisibleChats().then((result) => sendResponse({ ok: true, ...result }));
      return true;
    }

    if (message.type === 'CWM_SCAN_DEEP') {
      deepScan().then(() => sendResponse({ ok: true, total: Object.keys(index).length }));
      return true;
    }

    return undefined;
  });

  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes[Core.STORAGE_KEYS.settings]) {
      settings = Core.migrateSettings(changes[Core.STORAGE_KEYS.settings].newValue);
    }
    if (changes[Core.STORAGE_KEYS.index]) {
      index = changes[Core.STORAGE_KEYS.index].newValue || {};
    }
    if (changes[Core.STORAGE_KEYS.overrides]) {
      overrides = changes[Core.STORAGE_KEYS.overrides].newValue || {};
    }
    scheduleRender();
  });

  async function init() {
    await loadState();
    await scanVisibleChats();
    render();
    startObserver();
  }

  init().catch((error) => console.warn('[ChatGPT Workspace Manager]', error));
})();
