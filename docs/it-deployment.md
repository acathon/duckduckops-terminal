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
- To update, run the newer installer the same way; it replaces the installed version. DuckDuckOps does
  not update itself and has no update server.
- Intune detection rule: the registry key
  `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{4F21C77D-CB92-476E-925C-BDC9CB83002F}_is1`,
  value `DisplayVersion` equals the release version (for example `0.4.1`). Or the file
  `C:\Program Files\DuckDuckOps\DuckDuckOps.exe`.

## What it runs

`DuckDuckOps.exe` (Electron) and its helper processes, all from the install folder. The terminal
starts the user's shells (PowerShell, cmd, WSL, ...) like any terminal does. Copilot's agents run
commands in that terminal only after the user approves them, apart from read-only diagnostics such
as `Get-*`, `ipconfig /all` or `kubectl get`.

## Network

- `github.com`, `api.github.com`: GitHub sign-in and the user's Copilot entitlement.
- `*.githubcopilot.com`: GitHub Copilot. Copilot follows your organization's Copilot policies
  (models, content exclusion, public code filter) like in VS Code.
- `open-vsx.org`, `raw.githubusercontent.com`: the extension gallery (Open VSX) and its list of
  blocked extensions. The gallery address can point to an internal Open VSX server instead.
- Anything the user adds: extensions, MCP servers, SSH hosts.

DuckDuckOps itself sends no telemetry: no telemetry endpoint is configured in the build. The GitHub
Copilot extension sends its usage data to GitHub, as in VS Code.

## Data on the device

| Path | Contents |
|---|---|
| `%APPDATA%\DuckDuckOps` | settings, keybindings, chat history, logs |
| `%USERPROFILE%\.ddo\extensions` | extensions the user installed |
| `%USERPROFILE%\.ddo\agents` | the Duck agents (`.agent.md` files) |

The app keeps its own folders and does not share settings or extensions with VS Code. Uninstalling
leaves these folders in place.
