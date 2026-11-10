// @ts-check
'use strict';
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

// Looks for a newer DuckDuckOps release on GitHub once a day (`ddo.updates.check`),
// and on "DuckDuckOps: Check for Updates". DuckDuckOps does not update itself: the
// message opens the release page, with the installers.

const DAY = 24 * 60 * 60 * 1000;

/** forge.version from DuckDuckOps' product.json */
function currentVersion() {
	try {
		return JSON.parse(fs.readFileSync(path.join(vscode.env.appRoot, 'product.json'), 'utf8')).forge?.version ?? '0.0.0';
	} catch {
		return '0.0.0';
	}
}

/** @param {string} a @param {string} b */
function isNewer(a, b) {
	const pa = a.split('.').map(Number);
	const pb = b.split('.').map(Number);
	for (let i = 0; i < 3; i++) {
		if ((pa[i] || 0) !== (pb[i] || 0)) { return (pa[i] || 0) > (pb[i] || 0); }
	}
	return false;
}

/** @param {vscode.ExtensionContext} context @param {boolean} manual */
async function checkForUpdates(context, manual) {
	const config = vscode.workspace.getConfiguration('ddo.updates');
	if (!manual && (!config.get('check', true) || Date.now() - context.globalState.get('updateCheckedAt', 0) < DAY)) { return; }
	const repository = config.get('repository', 'acathon/duckduckops-terminal');
	const current = currentVersion();
	let release;
	try {
		const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'DuckDuckOps' } });
		if (!response.ok) { throw new Error(`GitHub answered ${response.status}`); }
		release = await response.json();
	} catch (error) {
		if (manual) { vscode.window.showWarningMessage(`Could not check for updates: ${error instanceof Error ? error.message : String(error)}`); }
		return;
	}
	await context.globalState.update('updateCheckedAt', Date.now());
	const latest = String(release.tag_name ?? '').replace(/^ddo-v?/, '');
	if (!isNewer(latest, current)) {
		if (manual) { vscode.window.showInformationMessage(`DuckDuckOps ${current} is the latest version.`); }
		return;
	}
	if (!manual && context.globalState.get('updateDismissed') === latest) { return; }
	const action = await vscode.window.showInformationMessage(`DuckDuckOps ${latest} is available (you have ${current}).`, 'Download', 'Skip This Version');
	if (action === 'Download') {
		vscode.env.openExternal(vscode.Uri.parse(release.html_url));
	} else if (action === 'Skip This Version') {
		await context.globalState.update('updateDismissed', latest);
	}
}

module.exports = { checkForUpdates, isNewer };
