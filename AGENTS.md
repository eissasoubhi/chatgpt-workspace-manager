# AGENTS.md

## Product goal

ChatGPT Workspace Manager is a local-first browser extension that helps people organize many ChatGPT conversations into virtual project folders without requiring manual moves after every chat.

## Product principles

- Keep the core useful without private or undocumented ChatGPT APIs.
- Prefer resilient DOM discovery over brittle class-name selectors.
- Store conversation metadata and workspace rules locally by default.
- Never send chat content to a third-party service without an explicit, user-visible opt-in.
- Automatic classification must be explainable: command > project-name prefix > keyword. Manual overrides, when present, always win.
- A user must be able to remove a chat from a workspace without deleting the underlying ChatGPT conversation.
- Chats detected as having reached ChatGPT's conversation limit should be retired from workspace groups, not deleted from ChatGPT.
- Native ChatGPT Project synchronization must remain an optional adapter. A native UI/API change must not break local workspace grouping.
- Preserve user data. Migrations must be backward-compatible and non-destructive.

## Extension engineering

- Target Chrome Manifest V3.
- Keep classification and normalization logic in `src/shared/core.js` pure and testable.
- Add tests for every classification-rule change and every storage migration.
- Do not add a runtime dependency unless it solves a concrete problem that cannot be handled cleanly with the platform.
- Avoid inline scripts so the extension remains compatible with Manifest V3 CSP defaults.
- Treat ChatGPT DOM selectors as fallible. Prefer semantic attributes and URL patterns, and fail without breaking the host page.
- Never call ChatGPT internal endpoints from the core implementation. If an experimental adapter is added later, isolate it behind a feature flag and document the risk.
- Keyword matching must be case-insensitive and should tolerate simple whitespace/punctuation differences without making command matching ambiguous.

## Versioning

- Every user-facing extension release must increment the extension version.
- Keep `manifest.json`, `package.json`, and `package-lock.json` versions aligned.
- Display the current version as a small, user-visible text label in both the popup and the settings/options page.
- Do not ship a user-facing change without updating and displaying the version.

## Design system

- Use native system typography and platform-aware light/dark colors.
- Keep surfaces neutral, compact, and visually compatible with ChatGPT without copying private implementation details.
- Use consistent radii, spacing, button sizing, hierarchy, and interaction states across popup, settings, and injected UI.
- Settings for repeated items such as workspace groups should default to compact collapsed summaries and reveal detailed fields on demand.
- Adding a new repeated item must reveal and focus the new item where the user initiated the action; do not make the user hunt for a form elsewhere on the page.
- Reordering controls must be discoverable, keyboard-accessible where practical, and persist the chosen order.
- Accessibility is required: labels, keyboard focus, meaningful button names, adequate hit targets, and no color-only meaning.

## Content Designer / UX Writer pass

Every user-facing change must receive a Content Designer / UX Writer pass before completion. Review page titles, section titles, buttons, labels, empty states, helper text, errors, confirmations, tooltips, and other microcopy. Text should be short, clear, simple, consistent, non-technical unless technical language is necessary, and appropriate to the user's context. Avoid exposing implementation details when the user only needs to understand the action or outcome.

## Definition of done

- `npm run check` passes.
- New behavior has tests where practical.
- The extension can be loaded unpacked from the repository root.
- No uncaught error should prevent ChatGPT itself from working.
- The manifest/package versions are incremented and aligned for user-facing changes.
- The current version is visible in both popup and options UI.
- README limitations and manual test steps stay accurate.
