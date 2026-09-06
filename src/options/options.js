(function runOptions() {
  'use strict';

  const Core = globalThis.ChatGPTWorkspaceCore;
  const groupsRoot = document.getElementById('groups');
  const template = document.getElementById('group-template');
  const emptyState = document.getElementById('empty-groups');
  const saveStatus = document.getElementById('save-status');
  let settings = Core.migrateSettings(null);

  function readCard(card) {
    return {
      id: card.dataset.groupId,
      name: card.querySelector('.group-name').value.trim(),
      command: card.querySelector('.group-command').value.trim(),
      keywords: card.querySelector('.group-keywords').value
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean),
      enabled: card.querySelector('.group-enabled').checked
    };
  }

  function updateEmptyState() {
    emptyState.hidden = groupsRoot.children.length > 0;
  }

  function moveCard(card, direction) {
    const sibling = direction < 0 ? card.previousElementSibling : card.nextElementSibling;
    if (!sibling) return;
    if (direction < 0) groupsRoot.insertBefore(card, sibling);
    else groupsRoot.insertBefore(sibling, card);
  }

  function addGroupCard(group) {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector('.group-card');
    card.dataset.groupId = group.id;
    card.querySelector('.group-enabled').checked = group.enabled !== false;
    card.querySelector('.group-name').value = group.name || '';
    card.querySelector('.group-command').value = group.command || '';
    card.querySelector('.group-keywords').value = (group.keywords || []).join('\n');
    card.querySelector('.move-up').addEventListener('click', () => moveCard(card, -1));
    card.querySelector('.move-down').addEventListener('click', () => moveCard(card, 1));
    card.querySelector('.remove-group').addEventListener('click', () => {
      card.remove();
      updateEmptyState();
    });
    groupsRoot.append(fragment);
    updateEmptyState();
  }

  async function load() {
    const stored = await chrome.storage.local.get(Core.STORAGE_KEYS.settings);
    settings = Core.migrateSettings(stored[Core.STORAGE_KEYS.settings]);
    document.getElementById('auto-scan').checked = settings.autoScan;
    document.getElementById('show-unclassified').checked = settings.showUnclassified;
    groupsRoot.replaceChildren();
    settings.groups.forEach(addGroupCard);
    updateEmptyState();
  }

  async function save() {
    const groups = Array.from(groupsRoot.querySelectorAll('.group-card')).map(readCard);
    const invalid = groups.find((group) => !group.name);
    if (invalid) {
      saveStatus.textContent = 'Every group needs a name.';
      return;
    }

    settings = Core.migrateSettings({
      version: 1,
      groups,
      autoScan: document.getElementById('auto-scan').checked,
      showUnclassified: document.getElementById('show-unclassified').checked
    });
    await chrome.storage.local.set({ [Core.STORAGE_KEYS.settings]: settings });
    saveStatus.textContent = 'Saved.';
    setTimeout(() => { saveStatus.textContent = ''; }, 1600);
  }

  document.getElementById('add-group').addEventListener('click', () => {
    addGroupCard(Core.createGroup('New group'));
    const cards = groupsRoot.querySelectorAll('.group-card');
    cards[cards.length - 1].querySelector('.group-name').select();
  });
  document.getElementById('save').addEventListener('click', save);

  load().catch((error) => {
    saveStatus.textContent = `Could not load settings: ${error.message}`;
  });
})();
