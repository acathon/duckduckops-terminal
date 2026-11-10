// @ts-check
'use strict';
const vscode = require('vscode');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

// Chooses the terminal's default shell on Windows, per `ddo.terminal.defaultShell`:
// `auto` is WSL when a distribution is installed, otherwise PowerShell 7, otherwise
// Windows PowerShell. A default profile the user chose is left alone.

/** @returns {Promise<string[]>} WSL distributions, in `wsl -l` order (the default first) */
function wslDistros() {
	return new Promise(resolve => cp.execFile('wsl.exe', ['-l', '-q'], { encoding: 'utf16le', env: { ...process.env, WSL_UTF8: '0' }, timeout: 5000, windowsHide: true }, (error, out) => {
		resolve(error ? [] : String(out).split(/\r?\n/).map(d => d.replace(/\0/g, '').trim()).filter(d => d && !d.startsWith('docker-desktop')));
	}));
}

const hasPwsh = () => fs.existsSync(path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe'));

/** The terminal profile name for a choice, as VS Code names the detected profiles */
async function profileFor(/** @type {string} */ choice) {
	if (choice === 'auto' || choice === 'wsl') {
		const [distro] = await wslDistros();
		if (distro) { return `${distro} (WSL)`; }
	}
	if (choice === 'cmd') { return 'Command Prompt'; }
	return hasPwsh() ? 'PowerShell' : 'Windows PowerShell';
}

/**
 * Sets `terminal.integrated.defaultProfile.windows`, unless the user set it, and
 * replaces the first terminal with one in that shell if nothing ran in it yet.
 * @param {vscode.ExtensionContext} context
 * @param {(terminal: vscode.Terminal) => boolean} isUntouched
 */
async function chooseDefaultShell(context, isUntouched) {
	if (process.platform !== 'win32') { return; }
	const choice = vscode.workspace.getConfiguration('ddo.terminal').get('defaultShell', 'auto');
	if (choice === 'manual') { return; }
	const terminal = vscode.workspace.getConfiguration('terminal.integrated');
	const current = terminal.inspect('defaultProfile.windows')?.globalValue;
	const ours = context.globalState.get('defaultShellProfile');
	if (current !== undefined && current !== ours) { return; }
	const profile = await profileFor(choice);
	if (profile === current) { return; }
	await terminal.update('defaultProfile.windows', profile, vscode.ConfigurationTarget.Global);
	await context.globalState.update('defaultShellProfile', profile);

	const [first] = vscode.window.terminals;
	if (vscode.window.terminals.length === 1 && first && !first.creationOptions.name && isUntouched(first)) {
		first.dispose();
		vscode.window.createTerminal().show();
	}
}

module.exports = { chooseDefaultShell, wslDistros };
