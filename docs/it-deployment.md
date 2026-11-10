# DuckDuckOps Terminal: deployment notes for IT

DuckDuckOps Terminal is a desktop app for IT/ops staff: a terminal with GitHub Copilot Chat next to
it. It is built from Microsoft's open-source VS Code (Code - OSS) with the coding features removed.
Source, builds and releases: https://github.com/acathon/duckduckops-terminal (MIT license).

## Packages

Each release on the [Releases page](https://github.com/acathon/duckduckops-terminal/releases) has:

| File | Installs to | Rights needed | Use |
|---|---|---|---|
| `DuckDuckOps-Terminal-SystemSetup-x64-<version>.exe` | `C:\Program Files\DuckDuckOps` | administrator | **managed devices**, deployed by IT |
| `DuckDuckOps-Terminal-Setup-x64-<version>.exe` | `%LOCALAPPDATA%\Programs\DuckDuckOps` | none | unmanaged devices |
| `DuckDuckOps-Terminal-win32-x64-<version>.zip` | wherever it is extracted | none | testing |
| `SHA256SUMS.txt` | | | SHA-256 hashes of the three files above |

Windows 10 or 11, x64. Every release build installs and uninstalls both installers silently before
it is published.

**The files are not code-signed yet.** With application control (AppLocker, App Control for Business,
Intune), the per-user installer and the zip are usually blocked, because they run from user folders.
Installed in Program Files by the all-users installer, DuckDuckOps is covered by the usual "Program
Files" path rules. Publisher rules will be possible once the releases are signed.

## Silent install and uninstall

```bat
:: Install for all users (run as administrator or SYSTEM)
DuckDuckOps-Terminal-SystemSetup-x64-<version>.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /MERGETASKS=!runcode /LOG="%TEMP%\ddo-install.log"

:: Uninstall
"C:\Program Files\DuckDuckOps\unins000.exe" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART
```

- The installer adds DuckDuckOps to the Start menu and `ddo` to the system PATH. Add `,!addtopath` to
  `/MERGETASKS` to leave the PATH alone. A desktop icon, **Open with DuckDuckOps** in the Explorer
  menu and file associations are off unless added with `desktopicon`, `addcontextmenufiles`,
  `addcontextmenufolders` or `associatewithfiles`.
- From 0.6.0 the installer also puts the `copilot` command on the PATH, as VS Code does:
  `bin\copilot-shim\copilot.exe` in the install folder, which starts GitHub Copilot CLI (installed
  separately, in `%LOCALAPPDATA%\GitHubCopilotCLI`) and, when it is missing, asks the user before
  downloading and installing it. A silent install only adds the command and downloads nothing. Add
  `/copilotcli=none` to leave it out, or set the DWORD policy `CopilotCliCommand` to `0` under
  `HKLM\SOFTWARE\Policies\Microsoft\DuckDuckOps`: setup then leaves the command out and it never
  installs Copilot CLI.
- To update, run the newer installer the same way; it replaces the installed version. DuckDuckOps does
  not update itself and has no update server.
- Intune detection rule: the registry key
  `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{4F21C77D-CB92-476E-925C-BDC9CB83002F}_is1`,
  value `DisplayVersion` equals the release version (for example `0.4.1`). Or the file
  `C:\Program Files\DuckDuckOps\DuckDuckOps.exe`.

## What it runs

`DuckDuckOps.exe` (Electron) and its helper processes, all from the install folder. The terminal
starts the user's shells (PowerShell, cmd, WSL, ...) like any terminal does. Saved sessions start
Windows' own OpenSSH client (`C:\Windows\System32\OpenSSH\ssh.exe`) and Remote Desktop Connection
(`mstsc.exe`); for an SSH proxy, `ssh.exe` starts `DuckDuckOps.exe` again as its `ProxyCommand`.
From 0.6.0, Copilot chats on the Copilot harness run in the Agent Host, another `DuckDuckOps.exe`
process, which starts the GitHub Copilot runtime from the install folder. It follows your
organization's Copilot policies, including sandbox and permission rules. Copilot's agents run
commands in that terminal only after the user approves them, apart from read-only diagnostics such
as `Get-*`, `ipconfig /all` or `kubectl get`.

## Network

- `github.com`, `api.github.com`: GitHub sign-in and the user's Copilot entitlement.
- `*.githubcopilot.com`: GitHub Copilot. Copilot follows your organization's Copilot policies
  (models, content exclusion, public code filter) like in VS Code.
- `open-vsx.org`, `raw.githubusercontent.com`: the extension gallery (Open VSX) and its list of
  blocked extensions. The gallery address can point to an internal Open VSX server instead.
- `api.github.com`, once a day: looks for a newer DuckDuckOps release (setting `ddo.updates.check`,
  repository in `ddo.updates.repository`). It only shows a message with a link; nothing is downloaded
  or installed.
- `github.com` (the `github/copilot-cli` releases) and its download host `*.githubusercontent.com`:
  only when a user agrees to install GitHub Copilot CLI, from the `copilot` command or the per-user
  installer's Copilot CLI page. Never during a silent install.
- `wttr.in`, at most every 30 minutes while the app runs: the weather line at the top of new
  terminals (from 0.7.1). wttr.in sees the computer's public address. Turn it off with the setting
  `ddo.terminal.welcomeLines` (leave out `weather`).
- Anything the user adds: extensions, MCP servers, SSH hosts.

DuckDuckOps itself sends no telemetry: no telemetry endpoint is configured in the build. The GitHub
Copilot extension sends its usage data to GitHub, as in VS Code.

## Data on the device

| Path | Contents |
|---|---|
| `%APPDATA%\DuckDuckOps` | settings, keybindings, chat history, logs |
| `%USERPROFILE%\.ddo\extensions` | extensions the user installed |
| `%USERPROFILE%\.ddo\agents` | the Duck agents (`.agent.md` files) |
| `%USERPROFILE%\.ddo\sessions.json` | saved sessions (servers, ports, user names; never passwords) |
| `%USERPROFILE%\.ddo\logs` | session output, only when the user turns logging on |
| `%USERPROFILE%\.ddo\recordings` | terminal recordings (`.cast`), only when the user records a terminal; they hold everything the terminal showed |

The app keeps its own folders and does not share settings or extensions with VS Code. Uninstalling
leaves these folders in place.
