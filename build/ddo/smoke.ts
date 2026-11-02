/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Launches a packaged DuckDuckOps build with a fresh profile, checks that the
// terminal and chat are on screen in the DuckDuckOps layout, opens a file to check
// that it appears below the terminal, and saves screenshots, the activity bar
// entries, renderer errors and the logs. Used by the DuckDuckOps build workflow.
//
//   node build/ddo/smoke.ts <packaged app folder> <output folder>

import { _electron as electron } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const [appDir, outDir] = process.argv.slice(2);
if (!appDir || !outDir) {
	console.error('usage: node build/ddo/smoke.ts <packaged app folder> <output folder>');
	process.exit(2);
}

const product = JSON.parse(fs.readFileSync(path.join(appDir, 'resources', 'app', 'product.json'), 'utf8'));
const executablePath = path.join(appDir, process.platform === 'win32' ? `${product.nameShort}.exe` : product.applicationName);
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddo-smoke-'));
const userDataDir = path.join(profileDir, 'data');
fs.mkdirSync(outDir, { recursive: true });

const app = await electron.launch({
	executablePath,
	args: [
		`--user-data-dir=${userDataDir}`,
		`--extensions-dir=${path.join(profileDir, 'extensions')}`,
		'--skip-release-notes',
		'--disable-telemetry',
	],
});

const errors: string[] = [];
const checks: Record<string, boolean> = {};
let activityBar: string[] = [];
try {
	const window = await app.firstWindow();
	window.on('console', message => { if (message.type() === 'error') { errors.push(message.text()); } });
	window.on('pageerror', error => errors.push(String(error)));

	await window.waitForSelector('.monaco-workbench', { timeout: 120_000 });

	const expected: [string, string][] = [
		['terminal', '.part.panel .terminal-wrapper'],
		['chat', '.part.auxiliarybar .interactive-session'],
	];
	for (const [name, selector] of expected) {
		checks[name] = await window.waitForSelector(selector, { state: 'visible', timeout: 60_000 }).then(() => true, () => false);
	}

	// Give extensions (Copilot Chat, DuckDuckOps) time to activate and settle
	await window.waitForTimeout(15_000);

	activityBar = await window.$$eval('.part.activitybar .action-item .action-label', items => items.map(item => item.getAttribute('aria-label') ?? ''));
	await window.screenshot({ path: path.join(outDir, 'desktop-terminal.png') });

	// Terminal, then chat, then the side bar (Extensions) and the activity bar on the right
	const box = async (selector: string) => (await window.$(selector))?.boundingBox() ?? null;
	const [panel, chat, sideBar, activityBarBox] = await Promise.all([box('.part.panel'), box('.part.auxiliarybar'), box('.part.sidebar'), box('.part.activitybar')]);
	const workbenchClasses = await window.$eval('.monaco-workbench', workbench => [...workbench.classList]);
	checks['chat right of terminal'] = !!panel && !!chat && panel.x + panel.width <= chat.x + 1;
	checks['side bar right of chat'] = !workbenchClasses.includes('nosidebar') && !!chat && !!sideBar && sideBar.x >= chat.x + chat.width - 1;
	checks['activity bar on the right'] = !!sideBar && !!activityBarBox && activityBarBox.x >= sideBar.x + sideBar.width - 1;
	checks['extensions in side bar'] = await window.$('.part.sidebar .extensions-viewlet').then(element => !!element);
	checks['no file area while nothing is open'] = workbenchClasses.includes('nomaineditorarea');
	checks['rounded parts'] = workbenchClasses.includes('modern-ui');
	checks['duck on the chat page'] = await window.$eval('.part.auxiliarybar .chat-welcome-view-title', title => title.textContent === 'Ask the duck').catch(() => false);

	// An opened file (a log, through quick open) appears below the terminal
	const logFile = path.join(profileDir, 'service.log');
	fs.writeFileSync(logFile, [
		'2026-10-28 09:14:02.118 INFO  [main] Service starting, version 4.2.1',
		'2026-10-28 09:14:02.530 INFO  [db] Connected to db-01:5432 (pool size 20)',
		'2026-10-28 09:14:03.004 WARN  [cache] Redis latency 412 ms above threshold 250 ms',
		'2026-10-28 09:14:07.771 ERROR [http] GET /api/orders failed: upstream timed out after 30000 ms',
		'2026-10-28 09:14:07.772 INFO  [http] Retrying request 1 of 3',
		'2026-10-28 09:14:08.219 INFO  [http] GET /api/orders 200 (447 ms)',
		'',
	].join('\n'));
	await window.keyboard.press('Control+P');
	await window.keyboard.type(logFile);
	await window.waitForTimeout(1_000);
	await window.keyboard.press('Enter');
	checks['file below terminal'] = await window.waitForSelector('.part.editor .monaco-editor', { state: 'visible', timeout: 15_000 }).then(async () => {
		const [terminal, editor] = await Promise.all([box('.part.panel'), box('.part.editor')]);
		return !!terminal && !!editor && editor.y >= terminal.y + terminal.height - 1;
	}, () => false);
	// Let the terminal's size overlay fade after the resize
	await window.waitForTimeout(3_000);
	await window.screenshot({ path: path.join(outDir, 'desktop-file.png') });
} finally {
	await app.close().catch(() => undefined);
}

const logsDir = path.join(userDataDir, 'logs');
if (fs.existsSync(logsDir)) {
	fs.cpSync(logsDir, path.join(outDir, 'logs'), { recursive: true });
}

// Log lines about the Copilot CLI runtime, which DuckDuckOps leaves out (`forge.copilotRuntime`)
const copilotRuntimeLogLines: string[] = [];
const logFiles = fs.existsSync(logsDir) ? fs.readdirSync(logsDir, { recursive: true, encoding: 'utf8' }).filter(file => file.endsWith('.log')) : [];
for (const file of logFiles) {
	for (const line of fs.readFileSync(path.join(logsDir, file), 'utf8').split(/\r?\n/)) {
		if (/@github\/copilot\/sdk|CopilotCLI|agent ?host/i.test(line) && /error|fail/i.test(line)) {
			copilotRuntimeLogLines.push(`${file}: ${line}`.slice(0, 400));
		}
	}
}

const summary = { product: product.nameLong, checks, activityBar, errors, copilotRuntimeLogLines };
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, undefined, '\t'));
console.log(JSON.stringify(summary, undefined, '\t'));

if (Object.values(checks).some(ok => !ok)) {
	process.exit(1);
}
