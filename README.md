# ChatGPT Workspace Manager

A local-first Chrome extension that groups ChatGPT conversations into smart workspace folders using explicit commands, project-name prefixes, and keywords.

Instead of manually moving every conversation after creating it, define rules once:

- `#MPC` → **MPC**
- `MPC — Fix extension capture` → **MPC**
- `github.com/example/mpc` → **MPC**
- `#JobPilot` → **JobPilot**

The extension reuses the ChatGPT sidebar area normally occupied by the native **Projects** section. Native projects are collapsed behind a compact **Show projects** control, leaving the main sidebar space for workspace groups.

## Features

- Configurable workspace groups.
- One explicit command per group, such as `#MPC`.
- Automatic project-prefix recognition, such as `MPC — …`.
- Multiple keywords or phrases per group, including repository URLs.
- Case-insensitive matching for commands, group names, and keywords.
- Keyword matching tolerates simple punctuation and spacing differences.
- Rules can match the chat title or the first user prompt once it has been indexed.
- Deterministic priority: command → project prefix → longest keyword → group order.
- Automatic indexing of ChatGPT conversation links as they load.
- User-triggered deep scan of lazy-loaded sidebar history.
- Compact local workspace groups in the ChatGPT sidebar.
- Groups are closed by default and remember their open/closed state.
- Chats can be removed from a workspace without deleting the ChatGPT conversation.
- Conversations detected as having reached ChatGPT's conversation-length limit are retired from workspace groups automatically.
- Native ChatGPT Projects can be shown or hidden without moving conversations.
- Popup with active group counts and scan actions.
- Compact collapsible settings cards with drag-and-drop and arrow reordering.
- Extension version is visible in the popup and options page.
- Local-only storage via `chrome.storage.local`.
- Light/dark mode using system colors.
- Pure classification core with Node tests and GitHub Actions CI.

Chats that do not match a workspace rule, are manually removed, or are retired at the conversation limit remain ordinary ChatGPT chats. The extension does not delete them.

## Privacy

The extension does not use a server and does not call private ChatGPT APIs. Workspace settings, sidebar state, exclusions, retirement state, and indexed metadata stay in the browser's extension storage.

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

## Active chat lifecycle

Workspace groups are intended to contain chats that are still useful for active work.

- Hover or focus a grouped chat and use **×** to remove it from that workspace. The original ChatGPT conversation remains untouched.
- The settings page shows counts for manually removed and automatically retired chats, with restore actions.
- When the currently open conversation displays a recognized ChatGPT maximum-length message, the extension records it as retired and removes it from workspace groups.
- Limit detection is DOM-based and conservative. It only checks visible non-message UI; it does not call undocumented ChatGPT endpoints.

## Sidebar behavior

- Native projects are hidden by default behind **Show projects**.
- Clicking **Show projects** reveals the native section; **Hide projects** collapses it again.
- Workspace groups are closed by default.
- Opening or closing a group is persisted locally and survives ChatGPT rerenders and page reloads.
- The content observer ignores mutations created by the extension itself to avoid render loops that reset group state.

## Settings UX

- Existing group cards start collapsed so large configurations remain easy to scan.
- Clicking a group summary opens its detailed fields.
- The top **Add group** action inserts and opens a new group near the top, then focuses its name field.
- **Add another group** at the bottom appends a new group there.
- Groups can be reordered by drag-and-drop or with the ↑/↓ controls; saving persists that order to the ChatGPT sidebar.
- Current extension version is shown as `vX.Y.Z`.

## How scanning works

ChatGPT lazy-loads conversation history. The extension continuously indexes links that appear in the sidebar.

**Deep scan history** walks the sidebar scroll container, collects titles as older items load, then returns the sidebar to its previous position. It does not open every conversation.

Because old chat bodies are not exposed in the sidebar, first-prompt rules can only be learned for a chat after that conversation has been opened. Title, command, project-prefix, and title-keyword rules work during sidebar scanning.

## Native ChatGPT Projects

The extension only collapses/reveals the existing native Projects UI. It does not automatically move chats into native Projects because there is no stable public API for that workflow.

A future native-project adapter can be added separately so a ChatGPT UI change cannot break local grouping.

## Development

Requirements: Node.js 20+.

```bash
npm run check
```

This runs the Node test suite and validates Manifest V3 references, aligned package/manifest versions, and visible version placeholders in the popup/options UI.

## Roadmap

- Manual per-chat override UI for ambiguous classifications.
- Rule preview: show exactly why a chat matched a workspace.
- Optional command stripping before message send.
- Better onboarding and import/export of workspace rules.
- Optional semantic classification for unmatched chats, with explicit privacy controls.
- Native ChatGPT Project synchronization adapter if a stable supported mechanism becomes available.
- Firefox compatibility after the Chrome MVP stabilizes.
