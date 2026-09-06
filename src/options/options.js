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

  function cards() {
    return Array.from(groupsRoot.querySelectorAll(':scope > .group-card'));
  }

  function updateEmptyState() {
    emptyState.hidden = cards().length > 0;
  }

  function updateOrderButtons() {
    const groupCards = cards();
    groupCards.forEach((card, index) => {
      card.querySelector('.move-up').disabled = index === 0;
      card.querySelector('.move-down').disabled = index === groupCards.length - 1;
    });
  }

  function moveCard(card, direction) {
    const groupCards = cards();
    const currentIndex = groupCards.indexOf(card);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= groupCards.length) return;

    const target = groupCards[targetIndex];
    if (direction < 0) target.before(card);
    else target.after(card);
    updateOrderButtons();
    saveStatus.textContent = 'Order changed. Save to apply.';
  }

  function addGroupCard(group) {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector('.group-card');
    card.dataset.groupId = group.id;
    card.querySelector('.group-enabled').checked = group.enabled !== false;
    card.querySelector('.group-name').value = group.name || '';
    card.querySelector('.group-command').value = group.command || '';
    card.querySelector('.group-keywords').value = (group.keywords || []).join('\n');
    card.querySelector('.move-up').addEventListener('click', (event) => {
      event.preventDefault();
      moveCard(card, -1);
    });
    card.querySelector('.move-down').addEventListener('click', (event) => {
      event.preventDefault();
      moveCard(card, 1);
    });
    card.querySelector('.remove-group').addEventListener('click', () => {
      card.remove();
      updateEmptyState();
      updateOrderButtons();
    });
    groupsRoot.append(fragment);
    updateEmptyState();
    updateOrderButtons();
  }

  async function load() {
    const stored = await chrome.storage.local.get(Core.STORAGE_KEYS.settings);
    settings = Core.migrateSettings(stored[Core.STORAGE_KEYS.settings]);
    document.getElementById('auto-scan').checked = settings.autoScan;
    groupsRoot.replaceChildren();
    settings.groups.forEach(addGroupCard);
    updateEmptyState();
    updateOrderButtons();
  }

  async function save() {
    const groups = cards().map(readCard);
    const invalid = groups.find((group) => !group.name);
    if (invalid) {
      saveStatus.textContent = 'Every group needs a name.';
      return;
    }

    settings = Core.migrateSettings({
      version: 1,
      groups,
      autoScan: document.getElementById('auto-scan').checked
    });
    await chrome.storage.local.set({ [Core.STORAGE_KEYS.settings]: settings });
    saveStatus.textContent = 'Saved.';
    setTimeout(() => { saveStatus.textContent = ''; }, 1600);
  }

  document.getElementById('add-group').addEventListener('click', () => {
    addGroupCard(Core.createGroup('New group'));
    const groupCards = cards();
    groupCards[groupCards.length - 1].querySelector('.group-name').select();
  });
  document.getElementById('save').addEventListener('click', save);

  load().catch((error) => {
    saveStatus.textContent = `Could not load settings: ${error.message}`;
  });
})();
