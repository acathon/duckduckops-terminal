# DuckDuckOps — product plan (core fork, not an extension)

Goal: a standalone desktop app, in the class of Cursor / Windsurf / Antigravity, but for IT/ops and
non-coders. It runs on the user's **GitHub Copilot Business** seat and uses **official GitHub
extensions**, so org policy keeps working.

Decisions so far
- Name: DuckDuckOps (`vs/forge` stays the internal code name).
- UX: a new top-level workbench layer, `src/vs/forge`, next to `src/vs/sessions` (own layout, no editor chrome).
- Scope: coding features are removed from the app, not just hidden, to keep it light (see "Lightweight
  workbench status" below).
- Extensions: Open VSX by default, internal extensions via VSIX or a self-hosted Open VSX, allowlist by
  policy. No Microsoft Marketplace.
- First audience: one company's internal IT/ops team.

## What the fork already gives us
- `defaultChatAgent` in `product.json`: GitHub auth, Copilot entitlement, enterprise provider (`github-enterprise`).
- `extensions/copilot` (GitHub Copilot Chat) is in-tree, so it can be bundled instead of downloaded.
- `src/vs/sessions` shows the pattern for a second top-level workbench: own `*.main.ts` entry,
  own HTML, own layout code, own ESLint import-layer rules. Build wiring is in `build/gulpfile.vscode.ts`.
- Policy plumbing: `src/vs/platform/policy/*` (OS policy, managed settings) and `IAllowedExtensionsService`.

## Architecture
```
src/vs/forge/
  browser/        ForgeWorkbench (fixed 3-column layout), parts, layout service
  electron-browser/ forge.html, forge.ts bootstrap, forge.main.ts
  contrib/
    terminal/     default shell profiles, profile UI, output capture service
    chat/         thin host for Copilot Chat view + ops system prompt + "run in terminal"
    logViewer/    read-only minimal text/log editor, live tail
    firstRun/     sign-in with GitHub (enterprise host), policy status
```
- `ForgeWorkbench` extends the shared `Workbench` mechanics like `DesktopWorkbench` does. Parts:
  terminal (top left), files/logs/browser below it (only while something is open), chat to their
  right, Extensions/Accounts side bar on the far right (open by default). Chat stays next to the
  terminal with the side bar on the right because we own the grid; the stock layout cannot do that.
- The app starts in forge mode: `product.json` points the main window at `forge.html`
  (the same way the Agents Window is selected).
- Compatibility rule: no private forks of Copilot Chat. Use the in-tree extension via its public
  chat/LM API so GitHub's own updates and org policy (content exclusion, model allow-list, chat
  disabled by admin) apply unchanged.

## Enterprise policy
1. Copilot policies are enforced server-side from the GitHub org (models, content exclusion,
   public-code filter). We must not strip or spoof headers; keep the real extension and its auth flow.
2. Local policy: ship the existing OS policy/managed-settings support (`policy.ts`, managed settings),
   plus `allowedExtensions` locked to the internal gallery. Document an ADMX/plist/JSON template.
3. Telemetry: disabled or routed to the company endpoint; no Microsoft endpoints.
4. Auto-update: own update server (`updateUrl` in `product.json`) or manual rollout via MDM.

## Risks to settle before building (need a human decision)
- **Licensing:** the in-tree Copilot Chat code (`extensions/copilot/LICENSE.txt`) is MIT, so bundling it
  is fine. Still open: whether GitHub's Copilot terms allow Business seats in a rebranded Code-OSS
  client. Ask GitHub (via your account rep) in writing and test with a real seat early.
- Client identification: Copilot's service may allowlist editor identities. Test with a real seat early.
- Branding: remove Microsoft trademarks/icons from the build; keep MIT notices.
- Signing/notarization certificates for Windows/macOS.

## Milestones
1. **Boot**: build the fork, run branded app against a Business seat, confirm sign-in and chat work.
2. **Forge shell**: `vs/forge` workbench with terminal + chat + empty log area; startup into it.
   *First cut on this branch, see "Forge shell status" below.*
   **2b. Lightweight workbench**: remove coding features and unneeded built-in extensions; rename to
   DuckDuckOps; Open VSX gallery; online Windows build. *Done on this branch, see below.*
3. **Terminal**: profile manager, output capture service, "run suggested command" with approval.
4. **Log viewer** + live tail, drag and drop, search.
5. **Policy & extensions**: internal gallery (self-hosted Open VSX), allowlist, managed settings templates.
6. **Packaging**: installers, signing, update channel, admin guide.

## Forge shell status (milestone 2)
What exists:
- `product.json` `"forge": { "enabled": true }` makes the main process load
  `vs/forge/electron-browser/forge.html` for regular windows (`windowImpl.ts`). The Agents window is unchanged.
- `forge.html` reuses the standard bootstrap (`vs/code/electron-browser/workbench/workbench.js`); a
  `data-vscode-workbench="forge"` attribute makes it import `vs/forge/forge.desktop.main.js` instead of
  the standard workbench. Only the page and its CSS bundle are forge-specific, so the 750-line bootstrap
  is not copied.
- `forge.desktop.main.ts` = the reduced desktop workbench (see milestone 2b) + `vs/forge` contributions.
  `forge.main.ts` subclasses `DesktopMain` (new `createWorkbench` hook) to create a `ForgeWorkbench`.
- `ForgeWorkbench` extends the standard `Workbench`. The panel (terminal) sits above the editor (files,
  logs, browser pages) and the primary side bar is on the right, where the standard layout would put
  the secondary side bar (chat) on the far left. `ForgeWorkbench` moves it next to the terminal column
  instead, each time the base layout repositions parts (`adjustPartPositions`, now `protected`).
- `browser/forge.contribution.ts`: defaults (no startup editor, no tips, no automatic tours, panel on
  top, side bar on the right, compact activity bar, title bar layout toggles, Modern UI rounded parts,
  theme follows the OS) and, after restore, shows the terminal (which creates a terminal if none
  exists) and the primary side bar on Extensions (it has no default view without the Explorer). The editor area is hidden while nothing is open in it, so the
  terminal takes the full height. The activity bar only holds Extensions, Accounts and Manage.
- Build: entry point + CSS bundle in `build/next/index.ts`, HTML in `build/next/resources.ts`,
  checksums in `build/gulpfile.vscode.ts`. Lint: `vs/forge` layer rules in `eslint.config.js`.

Verified here: client typecheck, ESLint (incl. the new layer rules), `valid-layers-check`, tsec,
hygiene, transpile and the desktop bundle (emits `forge.desktop.main.js/.css` and `forge.html`).
**Not verified:** the app was not launched. This environment cannot download Electron headers, so
native modules were not built. Check the layout by running `./scripts/code.sh`.

Not done yet: the stopgap extension's features are not ported yet (milestones 3–4).

The extension already on this branch (`extensions/ddo`) is a stopgap; its terminal-output
capture, tail and profile logic move into `vs/forge/contrib/*` in milestones 3–4.

## Lightweight workbench status (milestone 2b)
- `forge.common.main.ts` / `forge.desktop.main.ts` replace the full workbench import with reduced copies
  of `workbench.common.main.ts` / `workbench.desktop.main.ts` (kept and removed features are listed in
  [README.md](README.md)). Services of removed features that kept code injects are covered by
  null services (debug, testing, inline chat) or by keeping the feature's contribution when the
  extension host API needs it (comments, interactive, share, browser view, issue reporter).
  `build/ddo/checkServices.ts` verifies this on the transpiled output; it reports nothing
  beyond two services that are never created in DuckDuckOps.
- Chat pulls in most of the workbench, so the module graph shrinks by only about 6% (4766 → 4470
  modules). The runtime savings come from the views, editors, startup contributions and the 80+
  built-in extensions that are no longer loaded.
- `product.json`: DuckDuckOps names, own installer GUIDs and data folders (installs next to VS Code),
  `urlProtocol: ddo`, `reportIssueUrl` → this repo, `forge.builtInExtensions` allowlist,
  `extensionsGallery` → Open VSX, `builtInExtensions`: js-debug downloads replaced by VSCodeVim (from
  Open VSX, Vim mode built in).
- The integrated browser and Copilot's browser tools (open, read, click, screenshot pages) stay, plus the
  Simple Browser extension (Copilot's request log uses `simpleBrowser.show`).
- The Copilot CLI runtime (Agent Host, Background Agent / Copilot CLI sessions) is left out unless
  `forge.copilotRuntime` is set in `product.json`; the smoke test lists related errors from the logs
  (`copilotRuntimeLogLines`).
- `.github/workflows/release.yml` packages the Windows app on GitHub and uploads it with a
  first-launch screenshot (`build/ddo/smoke.ts`).
