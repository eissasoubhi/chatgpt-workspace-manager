(function runActiveChatHighlight() {
  'use strict';

  const PANEL_ID = 'cwm-workspace-panel';
  const LINK_SELECTOR = `#${PANEL_ID} .cwm-chat-link`;
  let lastHref = '';
  let observer = null;

  function conversationId(href) {
    try {
      const url = new URL(String(href || ''), location.href);
      const match = url.pathname.match(/\/c\/([^/?#]+)/);
      return match ? decodeURIComponent(match[1]) : null;
    } catch (_) {
      return null;
    }
  }

  function clearActiveState() {
    document.querySelectorAll(`#${PANEL_ID} .cwm-chat-row.is-active`).forEach((row) => {
      row.classList.remove('is-active');
    });
    document.querySelectorAll(`#${PANEL_ID} .cwm-group.cwm-group-has-active`).forEach((group) => {
      group.classList.remove('cwm-group-has-active');
    });
    document.querySelectorAll(`${LINK_SELECTOR}[aria-current="page"]`).forEach((link) => {
      link.removeAttribute('aria-current');
    });
  }

  function markLinkActive(link) {
    clearActiveState();
    if (!link) return;

    const row = link.closest('.cwm-chat-row');
    const group = link.closest('.cwm-group');
    if (row) row.classList.add('is-active');
    if (group) group.classList.add('cwm-group-has-active');
    link.setAttribute('aria-current', 'page');
  }

  function refreshActiveState() {
    lastHref = location.href;
    const activeId = conversationId(location.href);
    if (!activeId) {
      clearActiveState();
      return;
    }

    const activeLink = Array.from(document.querySelectorAll(LINK_SELECTOR)).find((link) => {
      return conversationId(link.getAttribute('href') || link.href) === activeId;
    });
    markLinkActive(activeLink || null);
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const link = target && target.closest(LINK_SELECTOR);
    if (!link) return;

    markLinkActive(link);
    setTimeout(refreshActiveState, 120);
  }, true);

  observer = new MutationObserver(() => {
    queueMicrotask(refreshActiveState);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  setInterval(() => {
    if (location.href !== lastHref) refreshActiveState();
  }, 300);

  refreshActiveState();
})();
