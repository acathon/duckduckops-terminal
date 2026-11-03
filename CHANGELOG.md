# Changelog

Each release on GitHub uses the matching section below as its notes. Every version needs one: the build fails without it.
Write for someone deciding whether to update: what is new, what changed, what to do after updating.
For each release, take screenshots of the build (`node build/ddo/smoke.ts <app folder> docs/screenshots/<version>`, or the `ddo-smoke` artifact of the branch's build), keep `desktop-terminal.png` and `desktop-file.png` plus any screen that changed, and show them as in the sections below.

## [0.4.0] - Duck agents

Three Copilot agents that work together on an ops task, each on its own model, sharing your terminal.

### New
- **Duck Lead, Duck Operator and Duck Reviewer**, in the chat's agent list. The Lead plans and hands each step to the Operator, which runs it in the terminal; before anything that changes the system, the Reviewer checks it. Buttons under an answer pass the work from one to another by hand.
- **Each agent has its own model.** The first time Copilot is signed in, DuckDuckOps picks one per agent from the models your Copilot plan offers (for example Opus for the Lead, Sonnet for the Operator, GPT for the Reviewer) and tells you which. Change them, or leave an agent out, with **DuckDuckOps: Set Up Agents**.
- **The terminal is shared.** The agents read what you ran before they start, and the commands they run show in the terminal, not only in the chat.
- **Safer commands.** Diagnostics such as `systemctl status`, `journalctl`, `kubectl get`, `ipconfig /all` or `Test-NetConnection` run without asking. Restarting or stopping services, rebooting, `kubectl delete`, `terraform apply`, `helm upgrade` and `docker rm` always ask first, whatever else you allowed.
- **Fewer tokens.** Each agent gets only the tools its job needs, and an agent that fails twice the same way stops and asks the Reviewer instead of trying again (ideas from Microsoft's TokenEconomizer).

### Things to know
- Every agent turn uses a Copilot request, and premium models such as Opus count more. With three agents on one task, keep an eye on your Copilot usage.
- Which models you can pick depends on your company's Copilot plan and policies.
- The agents live in `.ddo\agents` in your user folder as `.agent.md` files. You can read and edit them; **Set Up Agents** writes them again.

### After updating
- Sign in to GitHub Copilot if you haven't. A message tells you when the agents are ready; pick **Duck Lead** in the chat to start.

## [0.3.0] - Forge themes and a lighter app

Two themes of its own, more space between the parts, and about 110 MB less to download and install.

| On startup | With a log open |
|---|---|
| <img src="https://github.com/acathon/duckduckops-terminal/blob/main/docs/screenshots/0.3.0/desktop-terminal.png?raw=true" width="420" alt="Forge Light: terminal, chat and Extensions as white cards on a grey frame, the menu as a button"> | <img src="https://github.com/acathon/duckduckops-terminal/blob/main/docs/screenshots/0.3.0/desktop-file.png?raw=true" width="420" alt="A log file below the terminal in Forge Light, errors in red and warnings in orange"> |

### New
- **Forge Light and Forge Dark**, calm themes in the style of JetBrains IDEs: the terminal, the chat and the side bar are white (or dark grey) cards on a grey frame, with blue accents, readable log colours (errors red, warnings orange, dates grey) and matching terminal colours. They follow the Windows light or dark mode.
- **More space between the parts**: the gaps are twice as wide as in VS Code, so each part reads as its own card.
- **The integrated browser** has a globe button in the title bar.
- **The menu is a button** at the top of the activity bar instead of a menu bar, and the terminal and chat titles show icons instead of TERMINAL and CHAT.

### Things to know
- **Fewer themes.** Forge Light, Forge Dark, Light 2026, Dark 2026 and the two High Contrast themes remain. If you picked Dark+, Light+, Dark Modern, Light Modern or a Visual Studio theme, you get the default theme again.
- **No Agents window.** "Open in Agents" buttons and commands are gone; it needed the Copilot CLI runtime, which DuckDuckOps does not ship. Copilot Chat next to the terminal works as before, including agent mode.
- **Smaller app**: Chromium's own strings are in English and French only (menus and dialogs of DuckDuckOps are not affected), and parts DuckDuckOps never loaded are no longer included.
- To get the menu bar back, set `window.menuBarVisibility` to `classic`. To pick another theme: **Preferences: Color Theme**.

### After updating
- Your settings override the new defaults: if you changed the menu bar or the theme before, those stay as you set them.

## [0.2.0] - The duck, and an installer

DuckDuckOps now looks like itself: the duck is the app icon, and it answers in the chat as `@duck`. It can also be installed like any Windows app.

| On startup | With a log open |
|---|---|
| <img src="https://github.com/acathon/duckduckops-terminal/blob/main/docs/screenshots/0.2.0/desktop-terminal.png?raw=true" width="420" alt="The terminal, and the empty chat page explaining @duck"> | <img src="https://github.com/acathon/duckduckops-terminal/blob/main/docs/screenshots/0.2.0/desktop-file.png?raw=true" width="420" alt="A log file open below the terminal"> |

### New
- **`@duck` in the chat** reads the terminal's recent output, as `@ops` did: `/explain`, `/fix`, `/logs`.
- **`@duck /rubberduck`** talks a problem through with you: the duck asks one question at a time and lets you find the cause. Ask it directly and it answers.
- **The duck as the app icon**, on the taskbar, the Start menu tile and the title bar.
- **The empty chat page** says how `@duck` works.
- **About** (Help menu) shows the DuckDuckOps version, then the VS Code version it is built on.
- **An installer**, `DuckDuckOps-Terminal-Setup-x64-0.2.0.exe`, next to the zip. It installs DuckDuckOps for your Windows account in `%LOCALAPPDATA%\Programs\DuckDuckOps` without administrator rights, adds it to the Start menu and `ddo` to your PATH, and can add a desktop icon and **Open with DuckDuckOps** to the Explorer menu (both off by default). Uninstall it from **Settings > Apps**.

### Things to know
- `@ops` is now `@duck`.
- The terminal no longer suggests typing `copilot`: the Copilot CLI is not part of DuckDuckOps.
- The chat's empty page no longer offers to generate agent instructions for a codebase.
- **The installer is not code-signed yet.** Windows SmartScreen may say "Windows protected your PC": choose **More info**, then **Run anyway**. Your company's IT may need to allow it.
- DuckDuckOps does not update itself. To update, run the new installer: it replaces the old version and keeps your settings.
- The zip is still there, for machines where you can't run installers.

### After updating
- Run `DuckDuckOps-Terminal-Setup-x64-0.2.0.exe`. If you used the zip of 0.1.1, delete the folder you extracted afterwards. Settings and extensions in `.ddo` in your user folder are kept.
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
