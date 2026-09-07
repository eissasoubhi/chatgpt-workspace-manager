(function runWorkspaceManager() {
  'use strict';

  const Core = globalThis.ChatGPTWorkspaceCore;
  if (!Core || typeof chrome === 'undefined' || !chrome.storage) return;

  const PANEL_ID = 'cwm-workspace-panel';
  const PROJECTS_TOGGLE_ID = 'cwm-projects-toggle';
  const NATIVE_PROJECTS_ATTR = 'data-cwm-native-projects';
  const CHAT_LINK_SELECTOR = 'a[href*="/c/"]';
  const PROJECT_LINK_SELECTOR = 'a[href*="/g/g-p-"], a[href*="/project"]';
  const LIMIT_MARKERS = [
    "you've reached the maximum length for this conversation",
    'you’ve reached the maximum length for this conversation',
    'you have reached the maximum length for this conversation',
    'this conversation has reached its maximum length',
    'conversation has reached the maximum length',
    'this conversation is too long',
    'vous avez atteint la longueur maximale de cette conversation',
    'cette conversation a atteint sa longueur maximale',
    'cette conversation est trop longue'
  ].map(Core.normalizeText);

  let settings = Core.migrateSettings(null);
  let uiState = Core.migrateUiState(null, settings.groups);
  let index = {};
  let overrides = {};
  let exclusions = {};
  let retired = {};
  let observer = null;
  let scanTimer = null;
  let renderTimer = null;
  let limitTimer = null;
  let deepScanRunning = false;

  async function loadState() {
    const stored = await chrome.storage.local.get([
      Core.STORAGE_KEYS.settings,
      Core.STORAGE_KEYS.index,
      Core.STORAGE_KEYS.overrides,
      Core.STORAGE_KEYS.ui,
      Core.STORAGE_KEYS.exclusions,
      Core.STORAGE_KEYS.retired
    ]);

    settings = Core.migrateSettings(stored[Core.STORAGE_KEYS.settings]);
    uiState = Core.migrateUiState(stored[Core.STORAGE_KEYS.ui], settings.groups);
    index = stored[Core.STORAGE_KEYS.index] || {};
    overrides = stored[Core.STORAGE_KEYS.overrides] || {};
    exclusions = Core.migrateExclusions(stored[Core.STORAGE_KEYS.exclusions]);
    retired = Core.migrateRetired(stored[Core.STORAGE_KEYS.retired]);
  }

  async function persistUiState() {
    uiState = Core.migrateUiState(uiState, settings.groups);
    await chrome.storage.local.set({ [Core.STORAGE_KEYS.ui]: uiState });
  }

  async function persistExclusions() {
    exclusions = Core.migrateExclusions(exclusions);
    await chrome.storage.local.set({ [Core.STORAGE_KEYS.exclusions]: exclusions });
  }

  async function persistRetired() {
    retired = Core.migrateRetired(retired);
    await chrome.storage.local.set({ [Core.STORAGE_KEYS.retired]: retired });
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

  function firstUserMessageNode() {
    return document.querySelector('[data-message-author-role="user"]');
  }

  function firstUserMessage() {
    const node = firstUserMessageNode();
    return String(node && (node.innerText || node.textContent) || '').trim().slice(0, 2000);
  }

  function isConversationAtStart() {
    const node = firstUserMessageNode();
    if (!node) return false;

    const scroller = findScrollableAncestor(node);
    if (scroller) return scroller.scrollTop <= 120;

    const root = document.scrollingElement;
    return !root || root.scrollTop <= 120;
  }

  function activeConversationId() {
    return Core.deriveConversationId(location.href, location.href);
  }

  function isActiveConversation(id) {
    return activeConversationId() === id;
  }

  function nativeChatLinks() {
    return Array.from(document.querySelectorAll(CHAT_LINK_SELECTOR))
      .filter((link) => !link.closest(`#${PANEL_ID}`));
  }

  function hasConversationLimitMessage() {
    const candidates = Array.from(document.querySelectorAll(
      '[role="alert"], [aria-live], [data-testid*="limit" i], [data-testid*="error" i], main p, main div'
    ));

    return candidates.some((node) => {
      if (node.closest('[data-message-author-role]')) return false;
      const text = Core.normalizeText(node.innerText || node.textContent || '');
      if (text.length < 20 || text.length > 360) return false;
      return LIMIT_MARKERS.some((marker) => text.includes(marker));
    });
  }

  async function retireActiveConversationIfLimited() {
    const id = activeConversationId();
    if (!id || retired[id] || !hasConversationLimitMessage()) return false;

    retired[id] = {
      reason: 'conversation-limit',
      retiredAt: new Date().toISOString()
    };
    await persistRetired();
    scheduleRender();
    return true;
  }

  function scheduleLimitCheck() {
    clearTimeout(limitTimer);
    limitTimer = setTimeout(() => {
      retireActiveConversationIfLimited()
        .catch((error) => console.warn('[ChatGPT Workspace Manager]', error));
    }, 300);
  }

  async function scanVisibleChats() {
    const links = nativeChatLinks();
    if (!links.length) {
      scheduleLimitCheck();
      return { found: 0, changed: 0 };
    }

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
      const active = isActiveConversation(id);
      const prompt = Core.resolveStableFirstPrompt(
        existing,
        active ? firstUserMessage() : '',
        active && isConversationAtStart()
      );
      const next = {
        id,
        title: title.slice(0, 500),
        href,
        firstMessage: prompt.firstMessage,
        firstMessageSource: prompt.firstMessageSource,
        lastSeenAt: now
      };

      if (
        existing.title !== next.title ||
        existing.href !== next.href ||
        existing.firstMessage !== next.firstMessage ||
        existing.firstMessageSource !== next.firstMessageSource
      ) {
        changed += 1;
      }
      index[id] = { ...existing, ...next };
    }

    if (changed) {
      await chrome.storage.local.set({ [Core.STORAGE_KEYS.index]: index });
      scheduleRender();
    }

    scheduleLimitCheck();
    return { found: links.length, changed };
  }

  function findSidebarHost() {
    const firstNativeLink = nativeChatLinks()[0];
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

  async function deepScan() {
    if (deepScanRunning) return;
    deepScanRunning = true;

    try {
      await scanVisibleChats();
      const firstNativeLink = nativeChatLinks()[0];
      const scroller = firstNativeLink ? findScrollableAncestor(firstNativeLink) : null;
      if (!scroller) return;

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
    } finally {
      deepScanRunning = false;
      scheduleRender();
    }
  }

  function groupRecords() {
    const result = new Map(settings.groups.map((group) => [group.id, []]));

    Object.values(index)
      .sort((a, b) => String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || '')))
      .forEach((conversation) => {
        const classification = Core.classifyConversation(
          conversation,
          settings.groups,
          overrides,
          exclusions,
          retired
        );
        if (classification.groupId && result.has(classification.groupId)) {
          result.get(classification.groupId).push(conversation);
        }
      });

    return result;
  }

  async function removeConversationFromGroups(conversationId) {
    if (!conversationId) return;
    exclusions[conversationId] = {
      '*': {
        reason: 'manual',
        excludedAt: new Date().toISOString()
      }
    };
    await persistExclusions();
    scheduleRender();
  }

  function createChatRow(conversation, group) {
    const row = document.createElement('div');
    row.className = 'cwm-chat-row';

    const link = document.createElement('a');
    link.className = 'cwm-chat-link';
    link.href = conversation.href;
    link.textContent = Core.cleanDisplayTitle(conversation.title, group);
    link.title = conversation.title;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'cwm-chat-remove';
    removeButton.textContent = '×';
    removeButton.title = 'Remove from groups';
    removeButton.setAttribute('aria-label', `Remove ${conversation.title} from workspace groups`);
    removeButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeConversationFromGroups(conversation.id)
        .catch((error) => console.warn('[ChatGPT Workspace Manager]', error));
    });

    row.append(link, removeButton);
    return row;
  }

  function createGroupDetails(group, records) {
    const details = document.createElement('details');
    details.className = 'cwm-group';
    details.dataset.groupId = group.id;
    details.open = uiState.openGroups[group.id] === true;

    const summary = document.createElement('summary');
    const label = document.createElement('span');
    label.className = 'cwm-group-name';
    label.textContent = group.name;
    const count = document.createElement('span');
    count.className = 'cwm-count';
    count.textContent = String(records.length);
    summary.append(label, count);

    const list = document.createElement('div');
    list.className = 'cwm-chat-list';
    records.slice(0, 50).forEach((conversation) => {
      list.append(createChatRow(conversation, group));
    });

    if (!records.length) {
      const empty = document.createElement('div');
      empty.className = 'cwm-group-empty';
      empty.textContent = 'No active matching chats.';
      list.append(empty);
    } else if (records.length > 50) {
      const more = document.createElement('div');
      more.className = 'cwm-group-empty';
      more.textContent = `+${records.length - 50} more`;
      list.append(more);
    }

    details.append(summary, list);
    details.addEventListener('toggle', () => {
      const wasOpen = uiState.openGroups[group.id] === true;
      if (details.open === wasOpen) return;

      if (details.open) uiState.openGroups[group.id] = true;
      else delete uiState.openGroups[group.id];
      persistUiState().catch((error) => console.warn('[ChatGPT Workspace Manager]', error));
    });
    return details;
  }

  function elementOwnText(element) {
    if (!element) return '';
    const clone = element.cloneNode(true);
    clone.querySelectorAll('*').forEach((child) => child.remove());
    return Core.normalizeText(clone.textContent || '');
  }

  function findProjectsLabel(host) {
    const candidates = Array.from(host.querySelectorAll('button, a, [role="button"], h2, h3, div, span'));
    return candidates.find((element) => {
      if (element.closest(`#${PANEL_ID}, #${PROJECTS_TOGGLE_ID}`)) return false;
      const text = Core.normalizeText(element.innerText || element.textContent || '');
      return text === 'projects' || elementOwnText(element) === 'projects';
    }) || null;
  }

  function findNativeProjectsSection(host) {
    const marked = host.querySelector(`[${NATIVE_PROJECTS_ATTR}="true"]`);
    if (marked) return marked;

    const label = findProjectsLabel(host);
    if (!label) return null;

    let current = label;
    let fallback = label.parentElement || label;

    for (let depth = 0; depth < 7 && current && current !== host; depth += 1) {
      if (current.querySelector && current.querySelector(PROJECT_LINK_SELECTOR)) {
        fallback = current;
        break;
      }

      const parent = current.parentElement;
      if (!parent || parent === host) {
        fallback = current;
        break;
      }
      if (parent.querySelector(CHAT_LINK_SELECTOR)) {
        fallback = current;
        break;
      }

      fallback = parent;
      current = parent;
    }

    if (!fallback || fallback === host || fallback.contains(document.getElementById(PANEL_ID))) return null;
    fallback.setAttribute(NATIVE_PROJECTS_ATTR, 'true');
    return fallback;
  }

  function directChildOfHost(node, host) {
    let current = node;
    while (current && current.parentElement && current.parentElement !== host) {
      current = current.parentElement;
    }
    return current && current.parentElement === host ? current : null;
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      panel.setAttribute('aria-label', 'Workspace groups');
    }
    return panel;
  }

  function ensureProjectsToggle() {
    let button = document.getElementById(PROJECTS_TOGGLE_ID);
    if (!button) {
      button = document.createElement('button');
      button.id = PROJECTS_TOGGLE_ID;
      button.type = 'button';
      button.addEventListener('click', () => {
        uiState.projectsVisible = !uiState.projectsVisible;
        persistUiState()
          .then(render)
          .catch((error) => console.warn('[ChatGPT Workspace Manager]', error));
      });
    }
    button.textContent = uiState.projectsVisible ? 'Hide projects' : 'Show projects';
    button.setAttribute('aria-expanded', String(uiState.projectsVisible));
    return button;
  }

  function setNativeProjectsVisibility(section) {
    if (!section) return;
    if (!section.hasAttribute('data-cwm-original-display')) {
      section.setAttribute('data-cwm-original-display', section.style.display || '');
    }
    if (uiState.projectsVisible) {
      section.style.display = section.getAttribute('data-cwm-original-display') || '';
    } else {
      section.style.display = 'none';
    }
  }

  function placeSidebarUi(host, panel) {
    const nativeProjects = findNativeProjectsSection(host);
    const toggle = ensureProjectsToggle();

    if (nativeProjects && nativeProjects.parentElement) {
      setNativeProjectsVisibility(nativeProjects);
      const parent = nativeProjects.parentElement;
      if (toggle.parentElement !== parent || toggle.nextElementSibling !== nativeProjects) {
        parent.insertBefore(toggle, nativeProjects);
      }
      if (panel.parentElement !== parent || panel.previousElementSibling !== nativeProjects) {
        nativeProjects.insertAdjacentElement('afterend', panel);
      }
      return;
    }

    toggle.remove();
    const firstNativeLink = nativeChatLinks()[0];
    const insertionPoint = firstNativeLink ? directChildOfHost(firstNativeLink, host) : null;
    if (insertionPoint) host.insertBefore(panel, insertionPoint);
    else if (!panel.isConnected) host.append(panel);
  }

  function render() {
    const host = findSidebarHost();
    if (!host) return;

    uiState = Core.migrateUiState(uiState, settings.groups);
    const panel = ensurePanel();
    panel.replaceChildren();

    const grouped = groupRecords();
    settings.groups
      .filter((group) => group.enabled !== false)
      .forEach((group) => {
        panel.append(createGroupDetails(group, grouped.get(group.id) || []));
      });

    if (!panel.childElementCount) {
      const empty = document.createElement('div');
      empty.className = 'cwm-empty';
      empty.textContent = 'Add a workspace group in the extension settings.';
      panel.append(empty);
    }

    placeSidebarUi(host, panel);
  }

  function scheduleScan() {
    if (!settings.autoScan) return;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scanVisibleChats, 250);
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 100);
  }

  function mutationIsExtensionOwned(record) {
    const target = record.target.nodeType === Node.ELEMENT_NODE
      ? record.target
      : record.target.parentElement;
    return Boolean(target && target.closest(`#${PANEL_ID}, #${PROJECTS_TOGGLE_ID}`));
  }

  function startObserver() {
    observer = new MutationObserver((records) => {
      if (records.length && records.every(mutationIsExtensionOwned)) return;
      scheduleScan();
      scheduleLimitCheck();
      scheduleRender();
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

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes[Core.STORAGE_KEYS.settings]) {
      settings = Core.migrateSettings(changes[Core.STORAGE_KEYS.settings].newValue);
      uiState = Core.migrateUiState(uiState, settings.groups);
    }
    if (changes[Core.STORAGE_KEYS.index]) {
      index = changes[Core.STORAGE_KEYS.index].newValue || {};
    }
    if (changes[Core.STORAGE_KEYS.overrides]) {
      overrides = changes[Core.STORAGE_KEYS.overrides].newValue || {};
    }
    if (changes[Core.STORAGE_KEYS.ui]) {
      uiState = Core.migrateUiState(changes[Core.STORAGE_KEYS.ui].newValue, settings.groups);
    }
    if (changes[Core.STORAGE_KEYS.exclusions]) {
      exclusions = Core.migrateExclusions(changes[Core.STORAGE_KEYS.exclusions].newValue);
    }
    if (changes[Core.STORAGE_KEYS.retired]) {
      retired = Core.migrateRetired(changes[Core.STORAGE_KEYS.retired].newValue);
    }
    scheduleRender();
  });

  async function init() {
    await loadState();
    await scanVisibleChats();
    await retireActiveConversationIfLimited();
    render();
    startObserver();
  }

  init().catch((error) => console.warn('[ChatGPT Workspace Manager]', error));
})();