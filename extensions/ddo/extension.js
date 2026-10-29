// @ts-check
'use strict';
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

const cfg = () => vscode.workspace.getConfiguration('ddo');
const LOG_RE = /\.(log|txt|out|err)(\.\d+)?$/i;

/** Per-terminal ring buffer of recent commands + output. */
const buffers = new WeakMap();
const tailed = new Set();

function stripAnsi(s) {
	// eslint-disable-next-line no-control-regex
	return s.replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b\[[0-9;?]*[ -\/]*[@-~]|\u001b[@-Z\\-_]|\r/g, '');
}

function bufferFor(terminal) {
	let b = buffers.get(terminal);
	if (!b) { b = { text: '' }; buffers.set(terminal, b); }
	return b;
}

function append(terminal, chunk) {
	const b = bufferFor(terminal);
	const max = Math.max(2000, cfg().get('chat.terminalContextChars', 8000)) * 3;
	b.text = (b.text + chunk).slice(-max);
}

function recentTerminalOutput() {
	const t = vscode.window.activeTerminal ?? vscode.window.terminals[0];
	if (!t) { return ''; }
	const limit = cfg().get('chat.terminalContextChars', 8000);
	return buffers.get(t)?.text.slice(-limit) ?? '';
}

function extractCommands(markdown) {
	const out = [];
	const re = /```(?:sh|bash|zsh|shell|console|powershell|pwsh|cmd|bat)?\s*\n([\s\S]*?)```/g;
	let m;
	while ((m = re.exec(markdown))) {
		const c = m[1].trim().replace(/^\$ /gm, '');
		if (c && c.length < 2000) { out.push(c); }
	}
	return out;
}

/** @param {{name:string,path:string,args?:string[],env?:Record<string,string>,cwd?:string}} p */
function createProfileTerminal(p) {
	const t = vscode.window.createTerminal({
		name: p.name,
		shellPath: p.path,
		shellArgs: p.args,
		env: p.env,
		cwd: p.cwd ? p.cwd.replace(/^~(?=$|[\\/])/, require('os').homedir()) : undefined,
	});
	t.show();
	return t;
}

function getProfiles() { return cfg().get('profiles', []); }

async function ensureTerminal() {
	const existing = vscode.window.activeTerminal ?? vscode.window.terminals[0];
	if (existing) { return existing; }
	const def = getProfiles().find(p => p.name === cfg().get('defaultProfile'));
	return def ? createProfileTerminal(def) : vscode.window.createTerminal();
}

/** Sizes are best-effort: the workbench has no public API for part sizes. */
async function applyLayout(context, force) {
	const run = c => vscode.commands.executeCommand(c);
	await run('workbench.action.editorLayoutSingle').then(undefined, () => { });
	const t = await ensureTerminal();
	t.show(false);
	await run('workbench.action.chat.open').then(undefined, () => { });
	if (force || !context.globalState.get('layoutApplied')) {
		await run('workbench.action.focusPanel').then(undefined, () => { });
		await context.globalState.update('layoutApplied', true);
	}
}

async function tailEditor(editor) {
	const doc = editor.document;
	const last = Math.max(0, doc.lineCount - 1);
	const pos = new vscode.Position(last, doc.lineAt(last).text.length);
	editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.Default);
}

function activate(context) {
	const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	status.command = 'ddo.toggleTail';
	context.subscriptions.push(status);
	const updateStatus = () => {
		const ed = vscode.window.activeTextEditor;
		if (ed && LOG_RE.test(ed.document.fileName)) {
			const on = tailed.has(ed.document.uri.toString());
			status.text = on ? '$(eye) Tailing' : '$(eye-closed) Tail off';
			status.tooltip = 'Live tail (Ctrl+Alt+L)';
			status.show();
		} else { status.hide(); }
	};

	// ---- terminal output capture (shell integration) ----
	context.subscriptions.push(vscode.window.onDidStartTerminalShellExecution(async e => {
		append(e.terminal, `\n$ ${e.execution.commandLine.value}\n`);
		try { for await (const d of e.execution.read()) { append(e.terminal, stripAnsi(d)); } } catch { /* terminal closed */ }
	}));
	context.subscriptions.push(vscode.window.onDidEndTerminalShellExecution(e => {
		if (e.exitCode !== undefined) { append(e.terminal, `\n[exit code ${e.exitCode}]\n`); }
	}));

	// ---- log files ----
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(ed => {
		if (ed && LOG_RE.test(ed.document.fileName) && ed.document.languageId !== 'log' && /\.log(\.\d+)?$/i.test(ed.document.fileName)) {
			vscode.languages.setTextDocumentLanguage(ed.document, 'log');
		}
		if (ed && cfg().get('logs.autoTail', true) && /\.log(\.\d+)?$/i.test(ed.document.fileName)) {
			tailed.add(ed.document.uri.toString());
			tailEditor(ed);
		}
		updateStatus();
	}));
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => {
		if (!tailed.has(e.document.uri.toString())) { return; }
		for (const ed of vscode.window.visibleTextEditors) {
			if (ed.document === e.document) { tailEditor(ed); }
		}
	}));
	// Reveal log files that terminal commands create (e.g. `cmd > out.log`).
	const watcher = vscode.workspace.createFileSystemWatcher('**/*.{log,txt}', false, true, true);
	context.subscriptions.push(watcher, watcher.onDidCreate(async uri => {
		if (!cfg().get('logs.autoOpen', true) || uri.path.includes('/node_modules/') || uri.path.includes('/.git/')) { return; }
		const doc = await vscode.workspace.openTextDocument(uri);
		await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preserveFocus: true, preview: true });
	}));

	const reg = (id, fn) => context.subscriptions.push(vscode.commands.registerCommand(id, fn));

	reg('ddo.focusTerminal', async () => { (await ensureTerminal()).show(false); });
	reg('ddo.focusChat', () => vscode.commands.executeCommand('workbench.action.chat.open'));
	reg('ddo.clearTerminal', async () => {
		const t = vscode.window.activeTerminal;
		if (t) { buffers.delete(t); }
		await vscode.commands.executeCommand('workbench.action.terminal.clear');
	});
	reg('ddo.openLog', async () => {
		const picked = await vscode.window.showOpenDialog({
			canSelectMany: true,
			filters: { 'Logs & text': ['log', 'txt', 'out', 'err', 'json', 'csv', 'md'], 'All files': ['*'] },
		});
		for (const uri of picked ?? []) {
			await vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.One, preview: false });
		}
	});
	reg('ddo.toggleTail', () => {
		const ed = vscode.window.activeTextEditor;
		if (!ed) { return; }
		const k = ed.document.uri.toString();
		if (tailed.delete(k)) { vscode.window.setStatusBarMessage('Live tail off', 2000); }
		else { tailed.add(k); tailEditor(ed); vscode.window.setStatusBarMessage('Live tail on', 2000); }
		updateStatus();
	});
	reg('ddo.newTerminalWithProfile', async () => {
		const profiles = getProfiles();
		if (!profiles.length) {
			if (await vscode.window.showInformationMessage('No DuckDuckOps profiles defined yet.', 'Add Profile') === 'Add Profile') {
				return vscode.commands.executeCommand('ddo.addProfile');
			}
			return;
		}
		const pick = await vscode.window.showQuickPick(profiles.map(p => ({ label: p.name, description: p.path, p })), { placeHolder: 'Shell profile' });
		if (pick) { createProfileTerminal(pick.p); }
	});
	reg('ddo.addProfile', async () => {
		const name = await vscode.window.showInputBox({ prompt: 'Profile name', ignoreFocusOut: true });
		if (!name) { return; }
		const shellPath = await vscode.window.showInputBox({ prompt: 'Shell path or command (e.g. /bin/zsh, pwsh, /opt/ops/shell.sh)', ignoreFocusOut: true });
		if (!shellPath) { return; }
		const args = await vscode.window.showInputBox({ prompt: 'Arguments (space separated, optional)', ignoreFocusOut: true });
		const cwd = await vscode.window.showInputBox({ prompt: 'Starting directory (optional, ~ allowed)', ignoreFocusOut: true });
		const envStr = await vscode.window.showInputBox({ prompt: 'Environment variables (KEY=VALUE;KEY2=VALUE2, optional)', ignoreFocusOut: true });
		/** @type {any} */
		const profile = { name, path: shellPath };
		if (args?.trim()) { profile.args = args.trim().split(/\s+/); }
		if (cwd?.trim()) { profile.cwd = cwd.trim(); }
		if (envStr?.trim()) {
			profile.env = Object.fromEntries(envStr.split(';').map(kv => kv.split(/=(.*)/s).slice(0, 2)).filter(([k]) => k));
		}
		const next = getProfiles().filter(p => p.name !== name).concat(profile);
		await cfg().update('profiles', next, vscode.ConfigurationTarget.Global);
		if (await vscode.window.showInformationMessage(`Profile "${name}" saved.`, 'Make Default', 'Open Now') === 'Make Default') {
			await cfg().update('defaultProfile', name, vscode.ConfigurationTarget.Global);
		} else { createProfileTerminal(profile); }
	});
	reg('ddo.editProfiles', () => vscode.commands.executeCommand('workbench.action.openSettings', 'ddo.profiles'));
	reg('ddo.runInTerminal', async (command) => {
		if (typeof command !== 'string' || !command.trim()) { return; }
		if (cfg().get('chat.confirmBeforeRun', true)) {
			const ok = await vscode.window.showWarningMessage('Run this command in the terminal?', { modal: true, detail: command }, 'Run');
			if (ok !== 'Run') { return; }
		}
		const t = await ensureTerminal();
		t.show(true);
		if (t.shellIntegration) { t.shellIntegration.executeCommand(command); } else { t.sendText(command, true); }
	});
	reg('ddo.askAboutSelection', async () => {
		const ed = vscode.window.activeTextEditor;
		const sel = ed && !ed.selection.isEmpty ? ed.document.getText(ed.selection) : '';
		const query = sel ? `@duck Explain this:\n\`\`\`\n${sel.slice(0, 6000)}\n\`\`\`` : '@duck /explain';
		await vscode.commands.executeCommand('workbench.action.chat.open', { query, isPartialQuery: false });
	});
	reg('ddo.installVsixFolder', async () => {
		let dir = cfg().get('extensions.vsixFolder', '');
		if (!dir) {
			const p = await vscode.window.showOpenDialog({ canSelectFolders: true, openLabel: 'Select VSIX folder' });
			if (!p?.length) { return; }
			dir = p[0].fsPath;
			await cfg().update('extensions.vsixFolder', dir, vscode.ConfigurationTarget.Global);
		}
		const files = fs.readdirSync(dir).filter(f => f.endsWith('.vsix'));
		if (!files.length) { vscode.window.showWarningMessage(`No .vsix files in ${dir}`); return; }
		for (const f of files) {
			await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(path.join(dir, f)));
		}
		vscode.window.showInformationMessage(`Installed ${files.length} VSIX file(s) from ${dir}.`);
	});
	reg('ddo.resetLayout', () => applyLayout(context, true));

	// ---- chat participant ----
	const participant = vscode.chat.createChatParticipant('ddo.duck', async (request, chatCtx, stream, token) => {
		const parts = [];
		const term = recentTerminalOutput();
		if (term) { parts.push(`Recent terminal output:\n\`\`\`\n${term}\n\`\`\``); }

		if (request.command === 'logs') {
			const ed = vscode.window.visibleTextEditors.find(e => e.document.uri.scheme === 'file') ?? vscode.window.activeTextEditor;
			if (!ed) { stream.markdown('Open a log file in the main area first.'); return {}; }
			const max = cfg().get('logs.maxAnalyzeChars', 24000);
			const text = ed.document.getText();
			parts.push(`Active file ${path.basename(ed.document.fileName)} (last ${Math.min(max, text.length)} of ${text.length} chars):\n\`\`\`\n${text.slice(-max)}\n\`\`\``);
		}
		const task = {
			explain: 'Explain what happened in the latest terminal output, root cause first.',
			fix: 'Diagnose the latest failure and suggest the minimal safe commands to fix it.',
			logs: 'Analyze the log: summarise errors/warnings, notable patterns, a timeline, and suggested next diagnostic commands.',
			rubberduck: 'Be a rubber duck. The user talks the problem through and finds the cause themselves. Do not give the cause, the fix or commands. Ask one short question at a time about what they expected, what happened, what changed and what they already ruled out, using the terminal output above. When they ask you directly for the answer, give it.',
		}[request.command ?? ''] ?? '';

		const messages = [
			vscode.LanguageModelChatMessage.User(cfg().get('systemPrompt', '')),
			...chatCtx.history.flatMap(h => h instanceof vscode.ChatRequestTurn
				? [vscode.LanguageModelChatMessage.User(h.prompt)]
				: [vscode.LanguageModelChatMessage.Assistant(h.response.map(r => r instanceof vscode.ChatResponseMarkdownPart ? r.value.value : '').join(''))]),
			vscode.LanguageModelChatMessage.User([...parts, task, request.prompt].filter(Boolean).join('\n\n')),
		];
		let full = '';
		try {
			const resp = await request.model.sendRequest(messages, {}, token);
			for await (const chunk of resp.text) { full += chunk; stream.markdown(chunk); }
		} catch (err) {
			stream.markdown(`\n\n**Model request failed:** ${err instanceof Error ? err.message : String(err)}\n\nMake sure GitHub Copilot is signed in.`);
			return {};
		}
		for (const cmd of request.command === 'rubberduck' ? [] : extractCommands(full)) {
			stream.button({ command: 'ddo.runInTerminal', title: `▶ Run: ${cmd.split('\n')[0].slice(0, 48)}`, arguments: [cmd] });
		}
		return {};
	});
	participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'duck.png');
	context.subscriptions.push(participant);

	// ---- startup ----
	updateStatus();
	applyLayout(context, false).then(undefined, () => { });
}

function deactivate() { }
module.exports = { activate, deactivate };
