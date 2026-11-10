/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check

// Records a terminal as an asciinema v2 file (.cast): a JSON header, then one JSON
// array per output chunk, [seconds, "o", text], and per resize, [seconds, "r",
// "COLSxROWS"]. Tiny, plain text you can edit, and it replays exactly: with
// `asciinema play`, on asciinema.org, or here with Play Terminal Recording.
// Only what the terminal shows is recorded (keystrokes only when the shell echoes them).

const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * @typedef {{ terminal: vscode.Terminal, start: number, width: number, height: number, events: [number, string, string][] }} Recording
 */

/** @type {Recording | undefined} */
let recording;
/** @type {vscode.StatusBarItem} */
let status;
/** @type {ReturnType<typeof setInterval> | undefined} */
let ticker;

const IDLE_TIME_LIMIT = 3;

/** @param {vscode.Terminal} terminal */
function dimensionsOf(terminal) {
	const d = /** @type {any} */ (terminal).dimensions;
	return { width: d?.columns ?? 120, height: d?.rows ?? 30 };
}

function elapsed() {
	return recording ? Number(((Date.now() - recording.start) / 1000).toFixed(6)) : 0;
}

/** @param {number} seconds */
function duration(seconds) {
	const s = Math.round(seconds);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** @param {vscode.ExtensionContext} context @param {unknown} arg */
async function start(context, arg) {
	if (recording) {
		vscode.window.showInformationMessage(`Already recording "${recording.terminal.name}".`);
		return;
	}
	const terminal = arg && typeof arg === 'object' && 'sendText' in arg ? /** @type {vscode.Terminal} */ (arg) : vscode.window.activeTerminal;
	if (!terminal) {
		vscode.window.showInformationMessage('Open a terminal to record it.');
		return;
	}
	if (!context.globalState.get('ddo.recording.warned')) {
		const choice = await vscode.window.showWarningMessage(
			'Everything this terminal shows is recorded, including passwords, keys or tokens it prints. Check the file before you share it.',
			{ modal: true }, 'Record', 'Record, Don\'t Warn Again');
		if (!choice) {
			return;
		}
		if (choice !== 'Record') {
			await context.globalState.update('ddo.recording.warned', true);
		}
	}
	const { width, height } = dimensionsOf(terminal);
	recording = { terminal, start: Date.now(), width, height, events: [] };
	await vscode.commands.executeCommand('setContext', 'ddo.terminalRecording', true);
	status.text = '$(record) REC 0:00';
	status.tooltip = `Recording "${terminal.name}": click to stop and save`;
	status.show();
	ticker = setInterval(() => { status.text = `$(record) REC ${duration(elapsed())}`; }, 1000);
}

/** @param {boolean} [closed] the terminal closed: save what was recorded */
async function stop(closed) {
	const done = recording;
	if (!done) {
		return;
	}
	recording = undefined;
	if (ticker) {
		clearInterval(ticker);
		ticker = undefined;
	}
	status.hide();
	await vscode.commands.executeCommand('setContext', 'ddo.terminalRecording', false);

	const seconds = done.events.length ? done.events[done.events.length - 1][0] : 0;
	const header = {
		version: 2,
		width: done.width,
		height: done.height,
		timestamp: Math.floor(done.start / 1000),
		duration: seconds,
		idle_time_limit: IDLE_TIME_LIMIT,
		title: done.terminal.name,
		env: { TERM: 'xterm-256color', SHELL: done.terminal.name },
	};
	const text = [JSON.stringify(header), ...done.events.map(e => JSON.stringify(e))].join('\n') + '\n';

	const d = new Date(done.start);
	const two = (/** @type {number} */ n) => String(n).padStart(2, '0');
	const stamp = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
	const name = `${done.terminal.name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'terminal'}-${stamp}.cast`;
	const folder = vscode.workspace.getConfiguration('ddo').get('terminal.recordingsFolder', '') || path.join(os.homedir(), '.ddo', 'recordings');
	fs.mkdirSync(folder, { recursive: true });
	const target = await vscode.window.showSaveDialog({
		defaultUri: vscode.Uri.file(path.join(folder, name)),
		filters: { 'Terminal recording (asciinema)': ['cast'] },
		title: closed ? 'The terminal closed: save its recording' : 'Save the terminal recording',
	});
	if (!target) {
		return;
	}
	fs.writeFileSync(target.fsPath, text);
	const kb = Math.max(1, Math.round(Buffer.byteLength(text) / 1024));
	const choice = await vscode.window.showInformationMessage(`Saved ${path.basename(target.fsPath)} (${duration(seconds)}, ${kb} KB).`, 'Play', 'Open', 'Show in Folder');
	if (choice === 'Play') {
		play(target);
	} else if (choice === 'Open') {
		vscode.window.showTextDocument(target);
	} else if (choice === 'Show in Folder') {
		vscode.commands.executeCommand('revealFileInOS', target);
	}
}

/** @param {unknown} arg */
async function play(arg) {
	let uri = arg instanceof vscode.Uri ? arg : vscode.window.activeTextEditor?.document.uri.path.endsWith('.cast') ? vscode.window.activeTextEditor.document.uri : undefined;
	if (!uri) {
		const folder = vscode.workspace.getConfiguration('ddo').get('terminal.recordingsFolder', '') || path.join(os.homedir(), '.ddo', 'recordings');
		const picked = await vscode.window.showOpenDialog({ defaultUri: vscode.Uri.file(folder), filters: { 'Terminal recording (asciinema)': ['cast'] }, canSelectMany: false });
		uri = picked?.[0];
	}
	if (!uri) {
		return;
	}
	const lines = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8').split(/\r?\n/).filter(Boolean);
	/** @type {any} */
	let header;
	/** @type {[number, string, string][]} */
	const events = [];
	try {
		header = JSON.parse(lines[0]);
		for (const line of lines.slice(1)) {
			const e = JSON.parse(line);
			if (Array.isArray(e) && typeof e[0] === 'number') {
				events.push(e);
			}
		}
	} catch {
		vscode.window.showErrorMessage(`${path.basename(uri.fsPath)} is not an asciinema recording.`);
		return;
	}
	const idleLimit = typeof header?.idle_time_limit === 'number' ? header.idle_time_limit : IDLE_TIME_LIMIT;

	const write = new vscode.EventEmitter();
	const close = new vscode.EventEmitter();
	const size = new vscode.EventEmitter();
	let speed = 1;
	let paused = false;
	let stopped = false;
	let generation = 0;
	/** @type {(() => void) | undefined} */
	let resume;

	const run = async () => {
		const mine = ++generation;
		write.fire('\x1b[2J\x1b[3J\x1b[H');
		if (header?.width && header?.height) {
			size.fire({ columns: header.width, rows: header.height });
		}
		let last = 0;
		for (const [time, type, data] of events) {
			const wait = Math.min(Math.max(0, time - last), idleLimit) / speed;
			last = time;
			if (wait > 0.001) {
				await new Promise(r => setTimeout(r, wait * 1000));
			}
			while (paused && !stopped && mine === generation) {
				await new Promise(r => { resume = () => r(undefined); });
			}
			if (stopped || mine !== generation) {
				return;
			}
			if (type === 'o') {
				write.fire(data);
			}
		}
		write.fire('\r\n\x1b[0m\x1b[2m-- End of the recording. r: play again, q: close. While playing: space pauses, + and - change the speed. --\x1b[0m');
	};

	/** @type {vscode.Pseudoterminal} */
	const pty = {
		onDidWrite: write.event,
		onDidClose: close.event,
		onDidOverrideDimensions: size.event,
		open: () => { run(); },
		close: () => { stopped = true; resume?.(); },
		handleInput: data => {
			if (data === ' ') {
				paused = !paused;
				if (!paused) {
					resume?.();
				}
			} else if (data === '+' || data === '=') {
				speed = Math.min(16, speed * 2);
			} else if (data === '-') {
				speed = Math.max(0.25, speed / 2);
			} else if (data === 'r') {
				paused = false;
				resume?.();
				run();
			} else if (data === 'q' || data === '\x1b') {
				stopped = true;
				resume?.();
				close.fire();
			}
		},
	};
	const terminal = vscode.window.createTerminal({ name: `\u25B6 ${path.basename(uri.fsPath)}`, pty, iconPath: new vscode.ThemeIcon('play') });
	terminal.show();
}

/** @param {vscode.ExtensionContext} context */
function register(context) {
	status = vscode.window.createStatusBarItem('ddo.recording', vscode.StatusBarAlignment.Left, 1000);
	status.name = 'Terminal Recording';
	status.command = 'ddo.terminal.stopRecording';
	status.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
	context.subscriptions.push(
		status,
		vscode.commands.registerCommand('ddo.terminal.startRecording', arg => start(context, arg)),
		vscode.commands.registerCommand('ddo.terminal.stopRecording', () => stop()),
		vscode.commands.registerCommand('ddo.terminal.playRecording', arg => play(arg)),
		vscode.window.onDidCloseTerminal(terminal => {
			if (recording?.terminal === terminal) {
				stop(true);
			}
		}),
		{ dispose: () => ticker && clearInterval(ticker) },
	);
	const window = /** @type {any} */ (vscode.window);
	if (typeof window.onDidWriteTerminalData === 'function') {
		context.subscriptions.push(window.onDidWriteTerminalData((/** @type {{ terminal: vscode.Terminal, data: string }} */ e) => {
			if (recording && e.terminal === recording.terminal) {
				recording.events.push([elapsed(), 'o', e.data]);
			}
		}));
	}
	if (typeof window.onDidChangeTerminalDimensions === 'function') {
		context.subscriptions.push(window.onDidChangeTerminalDimensions((/** @type {{ terminal: vscode.Terminal, dimensions: vscode.TerminalDimensions }} */ e) => {
			if (recording && e.terminal === recording.terminal) {
				recording.events.push([elapsed(), 'r', `${e.dimensions.columns}x${e.dimensions.rows}`]);
			}
		}));
	}
}

module.exports = { register };
