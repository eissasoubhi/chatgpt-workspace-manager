(function runOptions() {
  'use strict';

  const Core = globalThis.ChatGPTWorkspaceCore;
  const groupsRoot = document.getElementById('groups');
  const template = document.getElementById('group-template');
  const emptyState = document.getElementById('empty-groups');
  const saveStatus = document.getElementById('save-status');
  let settings = Core.migrateSettings(null);
  let exclusions = {};
  let retired = {};
  let draggedCard = null;

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

  function setStatus(message) {
    saveStatus.textContent = message || '';
  }

  function markDirty(message = 'Unsaved changes.') {
    setStatus(message);
  }

  function updateEmptyState() {
    emptyState.hidden = cards().length > 0;
    document.getElementById('add-group-bottom').hidden = cards().length === 0;
  }

  function updateOrderButtons() {
    const groupCards = cards();
    groupCards.forEach((card, index) => {
      card.querySelector('.move-up').disabled = index === 0;
      card.querySelector('.move-down').disabled = index === groupCards.length - 1;
    });
  }

  function setCardExpanded(card, expanded) {
    const fields = card.querySelector('.group-fields');
    const toggle = card.querySelector('.group-toggle');
    fields.hidden = !expanded;
    toggle.setAttribute('aria-expanded', String(expanded));
    card.classList.toggle('is-open', expanded);
  }

  function updateCardSummary(card) {
    const group = readCard(card);
    const name = group.name || 'Unnamed group';
    const command = group.command || 'No command';
    const keywordCount = group.keywords.length;
    card.querySelector('.group-summary-name').textContent = name;
    card.querySelector('.group-summary-meta').textContent = `${command} · ${keywordCount} keyword${keywordCount === 1 ? '' : 's'}`;
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
    markDirty('Group order changed. Save to apply.');
  }

  function clearDragStyles() {
    cards().forEach((card) => card.classList.remove('drag-before', 'drag-after', 'is-dragging'));
  }

  function attachDragAndDrop(card) {
    const handle = card.querySelector('.drag-handle');

    handle.addEventListener('dragstart', (event) => {
      draggedCard = card;
      card.classList.add('is-dragging');
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', card.dataset.groupId);
      }
    });

    handle.addEventListener('dragend', () => {
      draggedCard = null;
      clearDragStyles();
    });

    card.addEventListener('dragover', (event) => {
      if (!draggedCard || draggedCard === card) return;
      event.preventDefault();
      const rect = card.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      card.classList.toggle('drag-before', before);
      card.classList.toggle('drag-after', !before);
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-before', 'drag-after');
    });

    card.addEventListener('drop', (event) => {
      if (!draggedCard || draggedCard === card) return;
      event.preventDefault();
      const rect = card.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      if (before) card.before(draggedCard);
      else card.after(draggedCard);
      clearDragStyles();
      updateOrderButtons();
      markDirty('Group order changed. Save to apply.');
    });
  }

  function addGroupCard(group, { expanded = false, position = 'end' } = {}) {
    const card = template.content.firstElementChild.cloneNode(true);
    card.dataset.groupId = group.id;
    card.querySelector('.group-enabled').checked = group.enabled !== false;
    card.querySelector('.group-name').value = group.name || '';
    card.querySelector('.group-command').value = group.command || '';
    card.querySelector('.group-keywords').value = (group.keywords || []).join('\n');

    card.querySelector('.group-toggle').addEventListener('click', () => {
      const expandedNow = card.querySelector('.group-toggle').getAttribute('aria-expanded') === 'true';
      setCardExpanded(card, !expandedNow);
    });

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
      markDirty('Group removed. Save to apply.');
    });

    card.querySelectorAll('input, textarea').forEach((field) => {
      field.addEventListener('input', () => {
        updateCardSummary(card);
        markDirty();
      });
      field.addEventListener('change', () => {
        updateCardSummary(card);
        markDirty();
      });
    });

    attachDragAndDrop(card);
    setCardExpanded(card, expanded);
    updateCardSummary(card);

    if (position === 'start' && groupsRoot.firstElementChild) groupsRoot.prepend(card);
    else groupsRoot.append(card);

    updateEmptyState();
    updateOrderButtons();
    return card;
  }

  function countManualExclusions() {
    return Object.values(Core.migrateExclusions(exclusions))
      .reduce((total, groups) => total + Object.keys(groups).length, 0);
  }

  function updateMaintenance() {
    const excludedCount = countManualExclusions();
    const retiredCount = Object.keys(Core.migrateRetired(retired)).length;
    document.getElementById('excluded-count').textContent = String(excludedCount);
    document.getElementById('retired-count').textContent = String(retiredCount);
    document.getElementById('restore-excluded').disabled = excludedCount === 0;
    document.getElementById('restore-retired').disabled = retiredCount === 0;
  }

  async function load() {
    const stored = await chrome.storage.local.get([
      Core.STORAGE_KEYS.settings,
      Core.STORAGE_KEYS.exclusions,
      Core.STORAGE_KEYS.retired
    ]);
    settings = Core.migrateSettings(stored[Core.STORAGE_KEYS.settings]);
    exclusions = Core.migrateExclusions(stored[Core.STORAGE_KEYS.exclusions]);
    retired = Core.migrateRetired(stored[Core.STORAGE_KEYS.retired]);

    document.getElementById('version').textContent = `v${chrome.runtime.getManifest().version}`;
    document.getElementById('auto-scan').checked = settings.autoScan;
    groupsRoot.replaceChildren();
    settings.groups.forEach((group) => addGroupCard(group));
    updateEmptyState();
    updateOrderButtons();
    updateMaintenance();
  }

  async function save() {
    const groups = cards().map(readCard);
    const invalid = groups.find((group) => !group.name);
    if (invalid) {
      setStatus('Every group needs a name.');
      return;
    }

    settings = Core.migrateSettings({
      version: 1,
      groups,
      autoScan: document.getElementById('auto-scan').checked
    });
    await chrome.storage.local.set({ [Core.STORAGE_KEYS.settings]: settings });
    setStatus('Saved.');
    setTimeout(() => {
      if (saveStatus.textContent === 'Saved.') setStatus('');
    }, 1600);
  }

  function addNewGroup(position) {
    const card = addGroupCard(Core.createGroup('New group'), {
      expanded: true,
      position
    });
    markDirty('New group added. Save to apply.');
    requestAnimationFrame(() => {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.querySelector('.group-name').select();
    });
  }

  document.getElementById('add-group').addEventListener('click', () => addNewGroup('start'));
  document.getElementById('add-group-bottom').addEventListener('click', () => addNewGroup('end'));
  document.getElementById('save').addEventListener('click', save);
  document.getElementById('auto-scan').addEventListener('change', () => markDirty());

  document.getElementById('restore-excluded').addEventListener('click', async () => {
    exclusions = {};
    await chrome.storage.local.set({ [Core.STORAGE_KEYS.exclusions]: {} });
    updateMaintenance();
    setStatus('Manually removed chats restored.');
  });

  document.getElementById('restore-retired').addEventListener('click', async () => {
    retired = {};
    await chrome.storage.local.set({ [Core.STORAGE_KEYS.retired]: {} });
    updateMaintenance();
    setStatus('Limited chats restored.');
  });

  load().catch((error) => {
    setStatus(`Could not load settings: ${error.message}`);
  });
})();
