# ChatGPT Workspace Manager

A local-first Chrome extension that groups ChatGPT conversations into smart workspace folders using explicit commands, project-name prefixes, and keywords.

Instead of manually moving every conversation after creating it, define rules once:

- `#MPC` → **MPC**
- `MPC — Fix extension capture` → **MPC**
- `github.com/example/mpc` → **MPC**
- `#JobPilot` → **JobPilot**

The extension adds a **Workspaces** panel to the ChatGPT sidebar and keeps its own local conversation index.

## MVP features

- Configurable workspace groups.
- One explicit command per group, such as `#MPC`.
- Automatic project-prefix recognition, such as `MPC — …`.
- Multiple keywords or phrases per group, including repository URLs.
- Deterministic priority: command → project prefix → longest keyword → group order.
- Automatic indexing of ChatGPT conversation links as they load.
- User-triggered deep scan that scrolls through the lazy-loaded sidebar, collects chat titles, then restores the previous scroll position.
- Local virtual folders in the ChatGPT sidebar.
- Unclassified folder for chats that match no rule.
- Popup with group counts and scan actions.
- Local-only storage via `chrome.storage.local`.
- Light/dark mode using system colors.
- Pure classification core with Node tests and GitHub Actions CI.

## Privacy

The MVP does not use a server and does not call private ChatGPT APIs. Workspace settings and indexed metadata stay in the browser's extension storage.

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

## How scanning works

ChatGPT lazy-loads conversation history. The extension continuously indexes links that appear in the sidebar.

**Deep scan history** walks the sidebar scroll container, collects titles as older items load, then returns the sidebar to its previous position. It does not open every conversation.

Because old chat bodies are not exposed in the sidebar, first-message rules can only be learned for a chat after that conversation has been opened. Title, command, project-prefix, and title-keyword rules work during sidebar scanning.

## Native ChatGPT Projects

The MVP deliberately treats local virtual workspaces as the reliable source of organization. Automatic movement into native ChatGPT Projects is not implemented because there is no stable public API for that workflow.

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
