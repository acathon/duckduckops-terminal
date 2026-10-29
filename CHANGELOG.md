# Changelog

Each release on GitHub uses the matching section below as its notes. Every version needs one: the build fails without it.
Write for someone deciding whether to update: what is new, what changed, what to do after updating.
For each release, take screenshots of the build (`node build/ddo/smoke.ts <app folder> docs/screenshots/<version>`, or the `ddo-smoke` artifact of the branch's build), keep `desktop-terminal.png` and `desktop-file.png` plus any screen that changed, and show them as in the sections below.

## [0.2.0] - The duck

DuckDuckOps now looks like itself: the duck is the app icon, greets you in the first terminal and waits in the chat as `@duck`.

| On startup | With a log open |
|---|---|
| <img src="https://github.com/acathon/duckduckops-terminal/blob/main/docs/screenshots/0.2.0/desktop-terminal.png?raw=true" width="420" alt="The pixel duck and how to reach the chat in the first terminal, the duck on the empty chat page"> | <img src="https://github.com/acathon/duckduckops-terminal/blob/main/docs/screenshots/0.2.0/desktop-file.png?raw=true" width="420" alt="A log file open below the terminal"> |

### New
- **`@duck` in the chat** reads the terminal's recent output, as `@ops` did: `/explain`, `/fix`, `/logs`.
- **`@duck /rubberduck`** talks a problem through with you: the duck asks one question at a time and lets you find the cause. Ask it directly and it answers.
- **A greeting in the first terminal** of each window: the duck in pixels and how to reach the chat. It is printed before the shell starts, so your shell and scripts never see it. Turn it off with the `ddo.terminal.greeting` setting.
- **The duck as the app icon**, on the taskbar, the Start menu tile, the title bar and the empty chat page.
- **About** (Help menu) shows the DuckDuckOps version, then the VS Code version it is built on.

### Things to know
- `@ops` is now `@duck`.
- The terminal no longer suggests typing `copilot`: the Copilot CLI is not part of DuckDuckOps.
- The chat's empty page no longer offers to generate agent instructions for a codebase.

### After updating
- Download `DuckDuckOps-Terminal-win32-x64-0.2.0.zip` and extract it over the previous version, or next to it. Settings and extensions in `.ddo` are kept.
- If the taskbar still shows the old icon, unpin DuckDuckOps and pin it again (Windows keeps icons in a cache).

## [0.1.1] - A terminal with Copilot next to it

The first release of DuckDuckOps Terminal: a workstation for IT/ops that opens on a terminal with GitHub Copilot Chat beside it, built from VS Code with the coding features taken out.

| On startup | With a log open |
|---|---|
| <img src="https://github.com/acathon/duckduckops-terminal/blob/main/docs/screenshots/0.1.1/desktop-terminal.png?raw=true" width="420" alt="Terminal at the top left, Copilot Chat to its right, Extensions in the side bar on the far right"> | <img src="https://github.com/acathon/duckduckops-terminal/blob/main/docs/screenshots/0.1.1/desktop-file.png?raw=true" width="420" alt="A log file open below the terminal, with live tail on"> |

### New
- **Terminal first.** The terminal fills the top left, Copilot Chat sits to its right, and the side bar (Extensions, Accounts) is on the far right next to a compact activity bar. Toggle each part from the title bar or with `Ctrl+B`.
- **Files, logs and web pages open below the terminal** as tabs, and that area disappears when the last one is closed.
- **Copilot Chat** in ask and agent mode, with tools and MCP servers. In chat, `@ops` sees your recent terminal output: `/explain`, `/fix`, `/logs`.
- **Extensions from Open VSX**, an internal gallery or VSIX files (**DuckDuckOps: Install VSIX Files from Internal Folder**).
- **Vim mode and the integrated browser** built in. The theme follows the Windows light or dark mode.
- Shortcuts with `Ctrl+Alt+`: **T** terminal, **C** chat, **O** open log, **K** clear terminal, **L** live tail, **N** terminal with profile, **A** ask chat about the selection.

### Things to know
- **Coding features are removed**, not hidden: Explorer, Search, Source Control, Debug, Testing, Problems, the welcome page, Settings Sync and Profiles are not in the app.
- **No Copilot CLI sessions.** Background Agent / Copilot CLI sessions and the Agent Host are left out, which saves about 100 MB. Chat and extensions that use the chat API work without them.
- Microsoft-only extensions (Remote-SSH, C#, Pylance, ...) are not on Open VSX and their licenses don't allow other apps. Open Remote - SSH is the Open VSX alternative.
- Settings and extensions are kept in `.ddo` in your user folder, separate from VS Code.

### Under the hood
- Built from microsoft/vscode `f3640a90889` (2026-10-24), with a reduced workbench in `src/vs/forge` and 25 of about 100 built-in extensions.
- Every build launches the app with a fresh profile and checks the layout before it can be released.

### After updating
- Download `DuckDuckOps-Terminal-win32-x64-0.1.1.zip`, extract it and run `DuckDuckOps.exe`. Sign in to GitHub from the Accounts menu to use Copilot.
