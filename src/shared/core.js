(function attachWorkspaceCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.ChatGPTWorkspaceCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createWorkspaceCore() {
  'use strict';

  const STORAGE_KEYS = Object.freeze({
    settings: 'cwm.settings.v1',
    index: 'cwm.index.v1',
    overrides: 'cwm.overrides.v1',
    ui: 'cwm.ui.v1'
  });

  const DEFAULT_SETTINGS = Object.freeze({
    version: 1,
    groups: [],
    autoScan: true
  });

  const DEFAULT_UI_STATE = Object.freeze({
    openGroups: {},
    projectsVisible: false
  });

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function slugify(value) {
    const slug = normalizeText(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || `group-${Date.now()}`;
  }

  function createGroup(name = 'New group') {
    return {
      id: `${slugify(name)}-${Math.random().toString(36).slice(2, 8)}`,
      name: String(name).trim() || 'New group',
      command: '',
      keywords: [],
      enabled: true
    };
  }

  function sanitizeGroup(group, index) {
    const name = String(group && group.name || '').trim() || `Group ${index + 1}`;
    const keywords = Array.isArray(group && group.keywords)
      ? group.keywords.map((item) => String(item).trim()).filter(Boolean)
      : [];

    return {
      id: String(group && group.id || `${slugify(name)}-${index + 1}`),
      name,
      command: String(group && group.command || '').trim(),
      keywords,
      enabled: group && typeof group.enabled === 'boolean' ? group.enabled : true
    };
  }

  function migrateSettings(value) {
    const settings = value && typeof value === 'object' ? value : {};
    return {
      version: 1,
      groups: Array.isArray(settings.groups)
        ? settings.groups.map(sanitizeGroup)
        : [],
      autoScan: settings.autoScan !== false
    };
  }

  function migrateUiState(value, groups = []) {
    const state = value && typeof value === 'object' ? value : {};
    const knownGroupIds = new Set(
      (Array.isArray(groups) ? groups : [])
        .map((group) => String(group && group.id || ''))
        .filter(Boolean)
    );
    const openGroups = {};
    const rawOpenGroups = state.openGroups && typeof state.openGroups === 'object'
      ? state.openGroups
      : {};

    Object.entries(rawOpenGroups).forEach(([groupId, isOpen]) => {
      if (isOpen === true && (!knownGroupIds.size || knownGroupIds.has(groupId))) {
        openGroups[groupId] = true;
      }
    });

    return {
      openGroups,
      projectsVisible: state.projectsVisible === true
    };
  }

  function startsWithToken(text, token) {
    const normalizedText = normalizeText(text);
    const normalizedToken = normalizeText(token);
    if (!normalizedText || !normalizedToken || !normalizedText.startsWith(normalizedToken)) {
      return false;
    }

    const next = normalizedText.charAt(normalizedToken.length);
    return !next || /[\s:;,.!?—–\-\]\[()]/.test(next);
  }

  function startsWithProjectName(text, projectName) {
    const normalizedText = normalizeText(text);
    const normalizedName = normalizeText(projectName);
    if (!normalizedText || !normalizedName || !normalizedText.startsWith(normalizedName)) {
      return false;
    }

    const next = normalizedText.charAt(normalizedName.length);
    return !next || /[\s:;,.!?—–\-\]\[()]/.test(next);
  }

  function classifyConversation(conversation, groups, overrides) {
    const id = String(conversation && conversation.id || '');
    const overrideGroupId = overrides && id ? overrides[id] : null;
    const enabledGroups = (Array.isArray(groups) ? groups : [])
      .filter((group) => group && group.enabled !== false);

    if (overrideGroupId) {
      const overridden = enabledGroups.find((group) => group.id === overrideGroupId);
      if (overridden) {
        return { groupId: overridden.id, strength: 'manual', reason: 'Manual override', score: 2000 };
      }
    }

    const title = String(conversation && conversation.title || '');
    const firstMessage = String(conversation && conversation.firstMessage || '');
    const haystack = normalizeText(`${title}\n${firstMessage}`);
    const candidates = [];

    enabledGroups.forEach((group, priority) => {
      if (group.command && (startsWithToken(title, group.command) || startsWithToken(firstMessage, group.command))) {
        candidates.push({
          groupId: group.id,
          strength: 'command',
          reason: `Command ${group.command}`,
          score: 1000,
          priority
        });
      }

      if (startsWithProjectName(title, group.name) || startsWithProjectName(firstMessage, group.name)) {
        candidates.push({
          groupId: group.id,
          strength: 'project-prefix',
          reason: `Project prefix ${group.name}`,
          score: 900,
          priority
        });
      }

      (group.keywords || []).forEach((keyword) => {
        const normalizedKeyword = normalizeText(keyword);
        if (normalizedKeyword && haystack.includes(normalizedKeyword)) {
          candidates.push({
            groupId: group.id,
            strength: 'keyword',
            reason: `Keyword ${keyword}`,
            score: 500 + Math.min(normalizedKeyword.length, 100),
            priority
          });
        }
      });
    });

    if (!candidates.length) {
      return { groupId: null, strength: 'none', reason: 'No matching rule', score: 0 };
    }

    candidates.sort((a, b) => b.score - a.score || a.priority - b.priority);
    const winner = candidates[0];
    return {
      groupId: winner.groupId,
      strength: winner.strength,
      reason: winner.reason,
      score: winner.score
    };
  }

  function deriveConversationId(href, baseUrl = 'https://chatgpt.com/') {
    try {
      const url = new URL(String(href || ''), baseUrl);
      const match = url.pathname.match(/\/c\/([^/?#]+)/);
      return match ? decodeURIComponent(match[1]) : null;
    } catch (_) {
      return null;
    }
  }

  function cleanDisplayTitle(title, group) {
    let output = String(title || '').trim();
    if (!group || !output) return output || 'Untitled chat';

    if (group.command && startsWithToken(output, group.command)) {
      output = output.slice(group.command.length).replace(/^[\s:;,.!?—–\-]+/, '').trim();
    }

    if (startsWithProjectName(output, group.name)) {
      output = output.slice(group.name.length).replace(/^[\s:;,.!?—–\-]+/, '').trim();
    }

    return output || String(title || '').trim() || 'Untitled chat';
  }

  function summarizeIndex(index, settings, overrides) {
    const groups = migrateSettings(settings).groups;
    const counts = Object.fromEntries(groups.map((group) => [group.id, 0]));
    let unclassified = 0;

    Object.values(index || {}).forEach((conversation) => {
      const classification = classifyConversation(conversation, groups, overrides || {});
      if (classification.groupId && Object.prototype.hasOwnProperty.call(counts, classification.groupId)) {
        counts[classification.groupId] += 1;
      } else {
        unclassified += 1;
      }
    });

    return { counts, unclassified, total: Object.keys(index || {}).length };
  }

  return {
    STORAGE_KEYS,
    DEFAULT_SETTINGS: clone(DEFAULT_SETTINGS),
    DEFAULT_UI_STATE: clone(DEFAULT_UI_STATE),
    normalizeText,
    createGroup,
    migrateSettings,
    migrateUiState,
    startsWithToken,
    startsWithProjectName,
    classifyConversation,
    deriveConversationId,
    cleanDisplayTitle,
    summarizeIndex
  };
});
