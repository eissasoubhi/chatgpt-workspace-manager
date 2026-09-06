'use strict';

importScripts('shared/core.js');

const Core = globalThis.ChatGPTWorkspaceCore;

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(Core.STORAGE_KEYS.settings);
  const settings = Core.migrateSettings(stored[Core.STORAGE_KEYS.settings]);
  await chrome.storage.local.set({ [Core.STORAGE_KEYS.settings]: settings });
});
