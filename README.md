# ChatGPT Workspace Manager

A local-first Chrome extension that groups ChatGPT conversations into smart workspace folders using explicit commands, project-name prefixes, and keywords.

Instead of manually moving every conversation after creating it, define rules once:

- `#MPC` → **MPC**
- `MPC — Fix extension capture` → **MPC**
- `github.com/example/mpc` → **MPC**
- `#JobPilot` → **JobPilot**

The extension reuses the ChatGPT sidebar area normally occupied by the native **Projects** section. Native projects are collapsed behind a compact **Show projects** control, leaving the main sidebar space for workspace groups.

## MVP features

- Configurable workspace groups.
- One explicit command per group, such as `#MPC`.
- Automatic project-prefix recognition, such as `MPC — …`.
- Multiple keywords or phrases per group, including repository URLs.
- Deterministic priority: command → project prefix → longest keyword → group order.
- Automatic indexing of ChatGPT conversation links as they load.
- User-triggered deep scan that scrolls through the lazy-loaded sidebar, collects chat titles, then restores the previous scroll position.
- Compact local workspace groups in the ChatGPT sidebar.
- Groups are closed by default and remember their open/closed state.
- Native ChatGPT Projects can be shown or hidden without moving conversations.
- Popup with group counts and scan actions.
- Local-only storage via `chrome.storage.local`.
- Light/dark mode using system colors.
- Pure classification core with Node tests and GitHub Actions CI.

Chats that do not match a workspace rule remain indexed internally but are not shown in a separate "Unclassified" folder.

## Privacy

The MVP does not use a server and does not call private ChatGPT APIs. Workspace settings, sidebar state, and indexed metadata stay in the browser's extension storage.

The index stores the chat ID, title, ChatGPT path, last-seen timestamp, and—when a chat is opened—the first user-message snippet so explicit commands or keywords can be recognized there too.

## Install locally

1. Clone or download this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the repository root (the folder containing `manifest.json`).
6. Open or reload `https://chatgpt.com`.
7. Open the extension settings and create your workspace groups.

No build step is required.

## Example configuration

### MPC

- Group name: `MPC`
- Command: `#MPC`
- Keywords:
  - `github.com/eissasoubhi/mpc`
  - `PLink`
  - `MPC extension`

### JobPilot

- Group name: `JobPilot`
- Command: `#JobPilot`
- Keywords:
  - `JobPilot scoring`
  - `Oracle deployment`

A title such as `MPC — API keys` is recognized automatically from the group name; it does not need to be duplicated as a keyword.

## Sidebar behavior

Workspace groups are inserted around the native Projects area instead of being prepended above every ChatGPT sidebar menu.

- Native projects are hidden by default behind **Show projects**.
- Clicking **Show projects** reveals the native section; **Hide projects** collapses it again.
- Workspace groups are closed by default.
- Opening or closing a group is persisted locally and survives ChatGPT rerenders and page reloads.
- The content observer ignores mutations created by the extension itself to avoid render loops that reset group state.

## How scanning works

ChatGPT lazy-loads conversation history. The extension continuously indexes links that appear in the sidebar.

**Deep scan history** walks the sidebar scroll container, collects titles as older items load, then returns the sidebar to its previous position. It does not open every conversation.

Because old chat bodies are not exposed in the sidebar, first-message rules can only be learned for a chat after that conversation has been opened. Title, command, project-prefix, and title-keyword rules work during sidebar scanning.

## Native ChatGPT Projects

The extension only collapses/reveals the existing native Projects UI. It does not automatically move chats into native Projects because there is no stable public API for that workflow.

A future native-project adapter can be added separately so a ChatGPT UI change cannot break local grouping.

## Development

Requirements: Node.js 20+.

```bash
npm run check
```

This runs the Node test suite and validates that the Manifest V3 references existing extension files.

## Roadmap

- Manual per-chat override UI for ambiguous classifications.
- Rule preview: show exactly why a chat matched a workspace.
- Optional command stripping before message send.
- Better onboarding and import/export of workspace rules.
- Optional semantic classification for unmatched chats, with explicit privacy controls.
- Native ChatGPT Project synchronization adapter if a stable supported mechanism becomes available.
- Firefox compatibility after the Chrome MVP stabilizes.
