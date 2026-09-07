'use strict';

importScripts('shared/core.js');

const Core = globalThis.ChatGPTWorkspaceCore;

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get([
    Core.STORAGE_KEYS.settings,
    Core.STORAGE_KEYS.ui,
    Core.STORAGE_KEYS.exclusions,
    Core.STORAGE_KEYS.retired
  ]);
  const settings = Core.migrateSettings(stored[Core.STORAGE_KEYS.settings]);
  const ui = Core.migrateUiState(stored[Core.STORAGE_KEYS.ui], settings.groups);
  const exclusions = Core.migrateExclusions(stored[Core.STORAGE_KEYS.exclusions]);
  const retired = Core.migrateRetired(stored[Core.STORAGE_KEYS.retired]);

  await chrome.storage.local.set({
    [Core.STORAGE_KEYS.settings]: settings,
    [Core.STORAGE_KEYS.ui]: ui,
    [Core.STORAGE_KEYS.exclusions]: exclusions,
    [Core.STORAGE_KEYS.retired]: retired
  });
});
