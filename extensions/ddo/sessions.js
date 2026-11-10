// @ts-check
'use strict';
const vscode = require('vscode');
const cp = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Saved sessions, like MobaXterm's: SSH (with jump host, SOCKS5/HTTP proxy and port
// forwarding), SSH tunnels, Remote Desktop and local shells, in folders. They are
// kept in ~/.ddo/sessions.json; hosts from ~/.ssh/config and read-only team files
// are listed next to them. SSH runs Windows' own OpenSSH client in a terminal.

/**
 * @typedef {{ type: 'socks5' | 'http', host: string, port: number }} Proxy
 * @typedef {{
 *   id: string, name: string, folder?: string, type: 'ssh' | 'tunnel' | 'rdp' | 'shell',
 *   host?: string, port?: number, user?: string, identityFile?: string, jump?: string,
 *   proxy?: Proxy, forwards?: string[], keepAlive?: number, compression?: boolean,
 *   x11?: boolean, remoteCommand?: string, startDir?: string, options?: string[],
 *   shell?: string, args?: string[], production?: boolean, log?: boolean,
 *   auto?: boolean, lastUsed?: number, description?: string, color?: string
 * }} Session
 * @typedef {{ kind: 'folder', folder: string, source: string, label: string }} FolderNode
 * @typedef {{ kind: 'session', session: Session, source: string }} SessionNode
 * @typedef {FolderNode | SessionNode} Node
 */

const SAVED = 'saved';
const SSH_CONFIG = 'sshconfig';
const RECENT = 'Recent';
const MAX_RECENT = 20;

/** Session colours: the hue of the terminal's border (or background), and the tab and list icon colour */
const COLORS = {
	red: { hue: 0, theme: 'terminal.ansiRed' },
	yellow: { hue: 45, theme: 'terminal.ansiYellow' },
	green: { hue: 130, theme: 'terminal.ansiGreen' },
	cyan: { hue: 185, theme: 'terminal.ansiCyan' },
	blue: { hue: 215, theme: 'terminal.ansiBlue' },
	magenta: { hue: 290, theme: 'terminal.ansiMagenta' },
};
/** Red is kept for production */
const RANDOM_COLORS = ['yellow', 'green', 'cyan', 'blue', 'magenta'];
const randomColor = () => RANDOM_COLORS[crypto.randomInt(RANDOM_COLORS.length)];

/** @returns {keyof COLORS} the session's colour: red for production, its own, or one derived from its id */
function colorOf(/** @type {Session} */ s) {
	if (s.production) { return 'red'; }
	if (s.color && s.color in COLORS) { return /** @type {keyof COLORS} */ (s.color); }
	return /** @type {keyof COLORS} */ (RANDOM_COLORS[crypto.createHash('sha1').update(s.id).digest()[0] % RANDOM_COLORS.length]);
}

const cfg = () => vscode.workspace.getConfiguration('ddo.sessions');
const expandHome = (/** @type {string} */ p) => p.replace(/^~(?=$|[\\/])/, os.homedir());
const sessionsFile = () => expandHome(cfg().get('file') || '~/.ddo/sessions.json');
const logFolder = () => expandHome(cfg().get('logFolder') || '~/.ddo/logs');

function sshPath() {
	const configured = cfg().get('sshPath', '');
	if (configured) { return expandHome(configured); }
	const windowsSsh = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'OpenSSH', 'ssh.exe');
	return process.platform === 'win32' && fs.existsSync(windowsSsh) ? windowsSsh : 'ssh';
}

// #region Store

/** @returns {{ version: number, sessions: Session[] }} */
function readStore(file = sessionsFile()) {
	if (!fs.existsSync(file)) { return { version: 1, sessions: [] }; }
	const data = JSON.parse(fs.readFileSync(file, 'utf8'));
	const sessions = Array.isArray(data?.sessions) ? data.sessions.filter((/** @type {any} */ s) => s && typeof s === 'object') : [];
	for (const s of sessions) {
		s.id ||= crypto.randomUUID();
		s.type ||= 'ssh';
		s.name ||= s.host || 'Session';
	}
	return { version: 1, sessions };
}

/** @param {Session[]} sessions */
function writeStore(sessions) {
	const file = sessionsFile();
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, JSON.stringify({ version: 1, sessions }, undefined, '\t') + '\n');
}

/** @param {(sessions: Session[]) => void} change */
function updateStore(change) {
	const store = readStore();
	change(store.sessions);
	writeStore(store.sessions);
}

/** Hosts of ~/.ssh/config (not patterns), connected to by their alias */
function sshConfigSessions() {
	const file = path.join(os.homedir(), '.ssh', 'config');
	if (!fs.existsSync(file)) { return []; }
	/** @type {Map<string, { hostName?: string, user?: string }>} */
	const hosts = new Map();
	/** @type {{ hostName?: string, user?: string }[]} */
	let current = [];
	for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
		const match = /^\s*(\w+)\s*=?\s*(.*?)\s*$/.exec(line.replace(/#.*/, ''));
		if (!match) { continue; }
		const [, key, value] = match;
		if (/^(host|match)$/i.test(key)) {
			current = [];
			for (const alias of /^host$/i.test(key) ? value.split(/\s+/) : []) {
				if (alias && !/[*?!]/.test(alias) && !hosts.has(alias)) {
					const host = {};
					hosts.set(alias, host);
					current.push(host);
				}
			}
		} else if (/^hostname$/i.test(key)) {
			current.forEach(h => h.hostName ??= value);
		} else if (/^user$/i.test(key)) {
			current.forEach(h => h.user ??= value);
		}
	}
	return [...hosts].map(([alias, h]) => /** @type {Session} */({
		id: `sshconfig:${alias}`, name: alias, type: 'ssh', host: alias,
		description: `${h.user ? `${h.user}@` : ''}${h.hostName ?? alias}`,
	}));
}

/** @returns {{ label: string, file: string, sessions: Session[], error?: string }[]} */
function teamFiles() {
	return cfg().get('teamFiles', []).map((/** @type {string} */ entry) => {
		const file = expandHome(entry);
		const label = path.basename(file, path.extname(file));
		try {
			return { label, file, sessions: readStore(file).sessions };
		} catch (error) {
			return { label, file, sessions: [], error: error instanceof Error ? error.message : String(error) };
		}
	});
}

// #endregion

// #region Commands for sessions

/** `L 8080:db:5432`, `R 9000:localhost:9000`, `D 1080` → OpenSSH arguments */
function forwardArgs(/** @type {string} */ spec) {
	const match = /^\s*([LRD])\s*(\S+)\s*$/i.exec(spec);
	return match ? [`-${match[1].toUpperCase()}`, match[2]] : [];
}

/** ProxyCommand running proxy.js with DuckDuckOps' own runtime, see `proxyEnv` */
function proxyCommand(/** @type {Proxy} */ proxy) {
	return `"${process.execPath}" "${path.join(__dirname, 'proxy.js')}" ${proxy.type} ${proxy.host} ${proxy.port} %h %p`;
}

/** @param {Session} s */
function sshArgs(s) {
	if (s.id.startsWith('sshconfig:')) { return [s.host ?? s.name]; }
	const args = [];
	if (s.port && s.port !== 22) { args.push('-p', String(s.port)); }
	if (s.user) { args.push('-l', s.user); }
	if (s.identityFile) { args.push('-i', expandHome(s.identityFile)); }
	if (s.jump) {
		args.push('-J', s.jump);
	} else if (s.proxy?.host && s.proxy.port) {
		args.push('-o', `ProxyCommand=${proxyCommand(s.proxy)}`);
	}
	for (const forward of s.forwards ?? []) { args.push(...forwardArgs(forward)); }
	if (s.keepAlive) { args.push('-o', `ServerAliveInterval=${s.keepAlive}`); }
	if (s.compression) { args.push('-C'); }
	if (s.x11) { args.push('-X'); }
	for (const option of s.options ?? []) { args.push('-o', option); }
	const command = s.remoteCommand || (s.startDir ? `cd '${s.startDir.replace(/'/g, `'\\''`)}' && exec "$SHELL" -l` : '');
	if (s.type === 'tunnel') {
		args.push('-N');
	} else if (command) {
		args.push('-t');
	}
	args.push(s.host ?? '');
	if (s.type !== 'tunnel' && command) { args.push(command); }
	return args;
}

/** The command line, for "Copy SSH Command" */
function sshCommandLine(/** @type {Session} */ s) {
	return ['ssh', ...sshArgs(s)].map(arg => /[\s"'%]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg).join(' ');
}

/** @param {Session} s */
function proxyEnv(s) {
	return !s.jump && s.proxy?.host ? { ELECTRON_RUN_AS_NODE: '1' } : undefined;
}

// #endregion

// #region Parsing

/** Splits a command line into words, keeping quoted parts together */
function shellSplit(/** @type {string} */ line) {
	const words = [];
	const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g;
	let m;
	while ((m = re.exec(line))) { words.push(m[1] ?? m[2] ?? m[3]); }
	return words;
}

/** `user@host:port`, `ssh://user@host:port` or `host` */
function parseDestination(/** @type {string} */ text) {
	const m = /^(?:ssh:\/\/)?(?:([^@\s]+)@)?(\[[^\]]+\]|[^:@\s]+)(?::(\d+))?$/.exec(text.trim());
	return m ? { user: m[1], host: m[2].replace(/^\[|\]$/g, ''), port: m[3] ? Number(m[3]) : undefined } : undefined;
}

/**
 * An interactive `ssh` command (no remote command) as a session, or undefined.
 * @returns {Omit<Session, 'id' | 'name'> | undefined}
 */
function parseSshCommand(/** @type {string} */ line) {
	const words = shellSplit(line.trim());
	if (!words.length || !/^ssh(\.exe)?$/i.test(path.basename(words[0]))) { return undefined; }
	const withValue = new Set('BbcDEeFIiJLlmOoPpQRSWw');
	/** @type {Omit<Session, 'id' | 'name'>} */
	const session = { type: 'ssh' };
	let destination;
	for (let i = 1; i < words.length; i++) {
		const word = words[i];
		if (destination) { return undefined; }
		if (word.startsWith('-') && word.length > 1) {
			const flag = word[1];
			if (!withValue.has(flag)) { continue; }
			const value = word.length > 2 ? word.slice(2) : words[++i];
			if (value === undefined) { return undefined; }
			if (flag === 'p') { session.port = Number(value); }
			if (flag === 'l') { session.user = value; }
			if (flag === 'i') { session.identityFile = value; }
			if (flag === 'J') { session.jump = value; }
			if (flag === 'L' || flag === 'R' || flag === 'D') { (session.forwards ??= []).push(`${flag} ${value}`); }
			if (flag === 'o') { (session.options ??= []).push(value); }
			continue;
		}
		destination = parseDestination(word);
		if (!destination) { return undefined; }
	}
	if (!destination) { return undefined; }
	session.host = destination.host;
	if (destination.user && !session.user) { session.user = destination.user; }
	if (destination.port && !session.port) { session.port = destination.port; }
	return session;
}

/** Path placeholders MobaXterm writes in its settings */
const mobaPath = (/** @type {string} */ p) => p.replace(/_ProfileDir_/g, os.homedir()).replace(/_CurrentDrive_/g, 'C:').replace(/\\/g, '/');

/**
 * Sessions of a MobaXterm.ini or .mxtsessions file: SSH (type 109) and RDP (91).
 * @returns {{ sessions: Omit<Session, 'id'>[], skipped: number }}
 */
function parseMobaXterm(/** @type {string} */ text) {
	/** @type {Omit<Session, 'id'>[]} */
	const sessions = [];
	let skipped = 0;
	let inBookmarks = false;
	let folder = '';
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (line.startsWith('[')) {
			inBookmarks = /^\[Bookmarks(_\d+)?\]$/i.test(line);
			folder = '';
			continue;
		}
		const eq = line.indexOf('=');
		if (!inBookmarks || eq < 0) { continue; }
		const key = line.slice(0, eq).trim();
		const value = line.slice(eq + 1);
		if (key === 'SubRep') { folder = value.replace(/\\/g, '/'); continue; }
		if (key === 'ImgNum') { continue; }
		const m = /^#(\d+)#([^#]*)/.exec(value);
		if (!m) { continue; }
		const fields = m[2].split('%');
		const host = fields[1];
		const port = Number(fields[2]) || undefined;
		const user = fields[3] || undefined;
		const name = key;
		const where = ['MobaXterm', folder].filter(Boolean).join('/');
		if (m[1] === '109' && host) {
			const keyFile = fields.find(f => /(\.pem|\.key|[\\/]id_(rsa|ecdsa|ed25519))$/i.test(f));
			sessions.push({ name, folder: where, type: 'ssh', host, port: port === 22 ? undefined : port, user, identityFile: keyFile ? mobaPath(keyFile) : undefined });
		} else if (m[1] === '91' && host) {
			sessions.push({ name, folder: where, type: 'rdp', host, port: port === 3389 ? undefined : port, user });
		} else {
			skipped++;
		}
	}
	return { sessions, skipped };
}

/**
 * Saved PuTTY sessions (registry): SSH, with SOCKS5/HTTP proxy and port forwarding.
 * @returns {{ sessions: Omit<Session, 'id'>[], skipped: number }}
 */
function readPutty() {
	let output = '';
	try {
		output = cp.execFileSync('reg.exe', ['query', 'HKCU\\Software\\SimonTatham\\PuTTY\\Sessions', '/s'], { encoding: 'utf8', windowsHide: true });
	} catch {
		return { sessions: [], skipped: 0 };
	}
	/** @type {Map<string, Record<string, string>>} */
	const keys = new Map();
	/** @type {Record<string, string> | undefined} */
	let current;
	for (const line of output.split(/\r?\n/)) {
		if (line.startsWith('HKEY_')) {
			const name = decodeURIComponent(line.split('\\').pop() ?? '');
			current = name && name !== 'Default Settings' && !line.endsWith('\\Sessions') ? {} : undefined;
			if (current) { keys.set(name, current); }
			continue;
		}
		const m = /^\s+(\S+)\s+(REG_\w+)\s*(.*)$/.exec(line);
		if (current && m) { current[m[1]] = m[2] === 'REG_DWORD' ? String(parseInt(m[3], 16)) : m[3]; }
	}
	/** @type {Omit<Session, 'id'>[]} */
	const sessions = [];
	let skipped = 0;
	for (const [name, v] of keys) {
		if ((v.Protocol || 'ssh') !== 'ssh' || !v.HostName) { skipped++; continue; }
		const destination = parseDestination(v.HostName);
		const proxyType = { 2: 'socks5', 3: 'http' }[Number(v.ProxyMethod)];
		const forwards = (v.PortForwardings || '').split(',').map(entry => {
			const f = /^[46]?([LRD])(.+?)(?:=(.+))?$/.exec(entry.trim());
			return f ? `${f[1]} ${f[3] ? `${f[2]}:${f[3]}` : f[2]}` : '';
		}).filter(Boolean);
		const port = Number(v.PortNumber) || undefined;
		sessions.push({
			name, folder: 'PuTTY', type: 'ssh',
			host: destination?.host ?? v.HostName,
			user: v.UserName || destination?.user,
			port: port === 22 ? undefined : port,
			proxy: proxyType && v.ProxyHost ? { type: /** @type {'socks5' | 'http'} */ (proxyType), host: v.ProxyHost, port: Number(v.ProxyPort) || 1080 } : undefined,
			forwards: forwards.length ? forwards : undefined,
		});
	}
	return { sessions, skipped };
}

// #endregion

// #region Opening sessions

/** @type {Map<string, vscode.Terminal>} running tunnels by session id */
const tunnels = new Map();
/** @type {Map<vscode.Terminal, fs.WriteStream>} */
const logs = new Map();

function stripAnsi(/** @type {string} */ s) {
	// eslint-disable-next-line no-control-regex
	return s.replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b\[[0-9;?]*[ -\/]*[@-~]|\u001b[@-Z\\-_]/g, '').replace(/\r\n?/g, '\n');
}

/** @param {vscode.Terminal} terminal @param {Session} s */
function startLog(terminal, s) {
	if (!(s.log ?? cfg().get('logOutput', false))) { return; }
	const dir = path.join(logFolder(), s.name.replace(/[<>:"/\\|?*]+/g, '_'));
	fs.mkdirSync(dir, { recursive: true });
	const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
	logs.set(terminal, fs.createWriteStream(path.join(dir, `${stamp}.log`), { flags: 'a' }));
}

/** @param {Session} s */
function sessionIcon(s) {
	const icon = { ssh: 'remote', tunnel: tunnels.has(s.id) ? 'pass-filled' : 'plug', rdp: 'device-desktop', shell: 'terminal' }[s.type] ?? 'remote';
	return new vscode.ThemeIcon(icon, new vscode.ThemeColor(COLORS[colorOf(s)].theme));
}

/** @param {Session} s */
function openTerminal(s, /** @type {vscode.TerminalOptions} */ options) {
	// The terminal shows the session's colour (TerminalInstance reads DDO_TERMINAL_TINT)
	const style = cfg().get('colorStyle', 'border');
	const color = COLORS[colorOf(s)];
	const terminal = vscode.window.createTerminal({
		...options,
		name: s.name,
		iconPath: sessionIcon(s),
		color: new vscode.ThemeColor(color.theme),
		env: { ...options.env, ...(style === 'none' ? {} : { DDO_TERMINAL_TINT: String(color.hue), DDO_TERMINAL_TINT_STYLE: style }) },
	});
	terminal.show();
	startLog(terminal, s);
	return terminal;
}

/** @param {Session} s */
function openRdp(s) {
	const file = path.join(os.tmpdir(), `ddo-${s.id.replace(/[^\w-]/g, '')}.rdp`);
	const lines = [`full address:s:${s.port ? `${s.host}:${s.port}` : s.host}`, 'prompt for credentials:i:1'];
	if (s.user) { lines.push(`username:s:${s.user}`); }
	fs.writeFileSync(file, lines.join('\r\n') + '\r\n');
	cp.spawn('mstsc.exe', [file], { detached: true, stdio: 'ignore' }).unref();
}

/** @param {Session} s */
async function connect(s) {
	if (s.type !== 'shell' && !s.host) {
		vscode.window.showWarningMessage(`"${s.name}" has no host. Edit the session to add one.`);
		return;
	}
	if (s.type === 'rdp') {
		openRdp(s);
	} else if (s.type === 'shell') {
		openTerminal(s, { shellPath: s.shell, shellArgs: s.args });
	} else if (s.type === 'tunnel') {
		if (tunnels.has(s.id)) { tunnels.get(s.id)?.show(); return; }
		const terminal = openTerminal({ ...s, name: `Tunnel: ${s.name}` }, { shellPath: sshPath(), shellArgs: sshArgs(s), env: proxyEnv(s) });
		tunnels.set(s.id, terminal);
	} else {
		if (s.jump && s.proxy?.host) {
			vscode.window.showWarningMessage(`"${s.name}" has both a jump host and a proxy; the proxy is not used.`);
		}
		openTerminal(s, { shellPath: sshPath(), shellArgs: sshArgs(s), env: proxyEnv(s) });
	}
	if (!s.id.startsWith('sshconfig:') && !s.id.startsWith('team:')) {
		updateStore(sessions => {
			const saved = sessions.find(x => x.id === s.id);
			if (saved) { saved.lastUsed = Date.now(); }
		});
	}
}

// #endregion

// #region Tree

/** @implements {vscode.TreeDataProvider<Node>} */
class SessionsTree {
	constructor() {
		this._onDidChange = new vscode.EventEmitter();
		this.onDidChangeTreeData = this._onDidChange.event;
		/** @type {Map<string, Session[]>} */
		this.sources = new Map();
		/** @type {Map<string, string>} */
		this.errors = new Map();
	}

	refresh() {
		this.sources.clear();
		this.errors.clear();
		try {
			this.sources.set(SAVED, readStore().sessions);
		} catch (error) {
			this.sources.set(SAVED, []);
			this.errors.set(SAVED, `${sessionsFile()}: ${error instanceof Error ? error.message : String(error)}`);
		}
		this.sources.set(SSH_CONFIG, sshConfigSessions());
		for (const team of teamFiles()) {
			const source = `team:${team.file}`;
			this.sources.set(source, team.sessions.map(s => ({ ...s, id: `team:${team.file}:${s.id}` })));
			if (team.error) { this.errors.set(source, team.error); }
		}
		this._onDidChange.fire(undefined);
	}

	/** @returns {boolean} */
	isEmpty() {
		return [...this.sources.values()].every(list => !list.length) && !this.errors.size;
	}

	/** @param {Node} node */
	getTreeItem(node) {
		if (node.kind === 'folder') {
			const item = new vscode.TreeItem(node.label, node.folder === RECENT && node.source === SAVED ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded);
			item.id = `${node.source}|${node.folder}`;
			item.iconPath = new vscode.ThemeIcon(node.source === SSH_CONFIG ? 'gear' : node.source.startsWith('team:') ? 'organization' : node.folder === RECENT ? 'history' : 'folder');
			item.contextValue = 'folder';
			const error = node.folder === '' ? this.errors.get(node.source) : undefined;
			if (error) { item.description = 'could not be read'; item.tooltip = error; }
			return item;
		}
		const s = node.session;
		const item = new vscode.TreeItem(s.name, vscode.TreeItemCollapsibleState.None);
		item.id = s.id;
		item.iconPath = sessionIcon(s);
		const target = s.type === 'shell' ? path.basename(s.shell ?? '') : `${s.user ? `${s.user}@` : ''}${s.host ?? ''}${s.port ? `:${s.port}` : ''}`;
		const extra = s.type === 'tunnel' ? (s.forwards ?? []).join(', ') : s.description;
		item.description = [s.production ? 'production' : '', extra || target].filter(Boolean).join(' · ');
		item.tooltip = new vscode.MarkdownString([
			`**${s.name}**`,
			s.type === 'rdp' ? `Remote Desktop to \`${target}\`` : s.type === 'shell' ? `Local shell \`${target}\`` : `\`${sshCommandLine(s)}\``,
			s.production ? '$(warning) Production' : '',
			s.type === 'tunnel' ? (tunnels.has(s.id) ? 'Running' : 'Stopped') : '',
		].filter(Boolean).join('\n\n'), true);
		const readonly = node.source !== SAVED;
		const running = s.type === 'tunnel' && tunnels.has(s.id) ? '.running' : '';
		item.contextValue = `session.${s.type}${running}${readonly ? '.readonly' : ''}`;
		item.command = { command: 'ddo.sessions.connect', title: 'Connect', arguments: [node] };
		return item;
	}

	/** @param {Node | undefined} node */
	getChildren(node) {
		if (!this.sources.size) { this.refresh(); }
		if (!node) {
			/** @type {Node[]} */
			const roots = this.childrenOf(SAVED, '');
			if (this.sources.get(SSH_CONFIG)?.length) { roots.push({ kind: 'folder', folder: '', source: SSH_CONFIG, label: 'SSH config' }); }
			for (const source of this.sources.keys()) {
				if (source.startsWith('team:')) { roots.push({ kind: 'folder', folder: '', source, label: path.basename(source.slice(5), '.json') }); }
			}
			if (this.errors.has(SAVED)) { roots.unshift({ kind: 'folder', folder: '', source: SAVED, label: 'sessions.json' }); }
			return roots;
		}
		return node.kind === 'folder' ? this.childrenOf(node.source, node.folder) : [];
	}

	/** Sessions and sub folders directly in `folder` (`a/b` style paths) */
	childrenOf(/** @type {string} */ source, /** @type {string} */ folder) {
		const sessions = this.sources.get(source) ?? [];
		const prefix = folder ? `${folder}/` : '';
		/** @type {Set<string>} */
		const subfolders = new Set();
		/** @type {SessionNode[]} */
		const items = [];
		for (const s of sessions) {
			const f = (s.folder ?? '').split('/').filter(Boolean).join('/');
			if (f === folder) {
				items.push({ kind: 'session', session: s, source });
			} else if (f.startsWith(prefix)) {
				subfolders.add(f.slice(prefix.length).split('/')[0]);
			}
		}
		const byName = (/** @type {string} */ a, /** @type {string} */ b) => a.localeCompare(b, undefined, { sensitivity: 'base' });
		/** @type {Node[]} */
		const folders = [...subfolders].sort((a, b) => a === RECENT ? 1 : b === RECENT ? -1 : byName(a, b))
			.map(name => ({ kind: 'folder', folder: prefix + name, source, label: name }));
		const sorted = folder === RECENT ? items.sort((a, b) => (b.session.lastUsed ?? 0) - (a.session.lastUsed ?? 0)) : items.sort((a, b) => byName(a.session.name, b.session.name));
		return [...folders, ...sorted];
	}
}

// #endregion

// #region Creating sessions

/** @param {string} title @param {string} prompt @param {string} [value] @param {(v: string) => string | undefined} [validate] */
async function ask(title, prompt, value, validate) {
	return vscode.window.showInputBox({ title, prompt, value, ignoreFocusOut: true, validateInput: validate });
}

async function pickFolder(/** @type {string} */ title) {
	const folders = [...new Set(readStore().sessions.map(s => s.folder).filter(f => f && f !== RECENT))].sort();
	const picked = await vscode.window.showQuickPick([
		{ label: '$(root-folder) No folder', folder: '' },
		{ label: '$(new-folder) New folder...', folder: undefined },
		...folders.map(folder => ({ label: `$(folder) ${folder}`, folder })),
	], { title, placeHolder: 'Folder' });
	if (!picked) { return undefined; }
	return picked.folder ?? await ask(title, 'Folder name (use / for sub folders, for example Prod/Web)');
}

const validateDestination = (/** @type {string} */ v) => parseDestination(v) ? undefined : 'Use host, user@host or user@host:port';
const validateForwards = (/** @type {string} */ v) => v.split(',').every(f => !f.trim() || forwardArgs(f).length) ? undefined : 'Use L 8080:host:80, R 9000:localhost:9000 or D 1080, separated by commas';

async function localShells() {
	const shells = [];
	const wsl = await new Promise(resolve => cp.execFile('wsl.exe', ['-l', '-q'], { encoding: 'utf16le', env: { ...process.env, WSL_UTF8: '0' }, timeout: 3000, windowsHide: true }, (error, out) => resolve(error ? '' : out)));
	for (const distro of String(wsl).split(/\r?\n/).map(d => d.replace(/\0/g, '').trim()).filter(d => d && !d.startsWith('docker-desktop'))) {
		shells.push({ label: `${distro} (WSL)`, shell: 'C:\\Windows\\System32\\wsl.exe', args: ['-d', distro] });
	}
	const pwsh = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe');
	if (fs.existsSync(pwsh)) { shells.push({ label: 'PowerShell 7', shell: pwsh, args: [] }); }
	shells.push({ label: 'Windows PowerShell', shell: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', args: [] });
	shells.push({ label: 'Command Prompt', shell: 'C:\\Windows\\System32\\cmd.exe', args: [] });
	return shells;
}

/** Asks for a new session step by step, saves it and offers to connect */
async function newSession(/** @type {SessionsTree} */ tree) {
	const title = 'New Session';
	const kind = await vscode.window.showQuickPick([
		{ label: '$(remote) SSH', type: 'ssh', detail: 'A terminal on a server, with jump host, proxy and port forwarding if needed' },
		{ label: '$(plug) SSH tunnel', type: 'tunnel', detail: 'Port forwarding only (local, remote or SOCKS), started and stopped from the list' },
		{ label: '$(device-desktop) Remote Desktop', type: 'rdp', detail: 'A Windows server, in Remote Desktop Connection' },
		{ label: '$(terminal) Local shell', type: 'shell', detail: 'WSL, PowerShell or Command Prompt' },
	], { title, placeHolder: 'Session type' });
	if (!kind) { return; }
	/** @type {Session} */
	const s = { id: crypto.randomUUID(), name: '', type: /** @type {Session['type']} */ (kind.type), color: randomColor() };

	if (s.type === 'shell') {
		const shell = await vscode.window.showQuickPick(await localShells(), { title, placeHolder: 'Shell' });
		if (!shell) { return; }
		s.shell = shell.shell;
		s.args = shell.args;
		s.name = shell.label;
	} else {
		const destination = await ask(title, s.type === 'rdp' ? 'Server (host, user@host or user@host:port)' : 'Server (host, user@host or user@host:port)', '', validateDestination);
		if (!destination) { return; }
		const d = parseDestination(destination);
		Object.assign(s, { host: d?.host, user: d?.user, port: d?.port });
		s.name = s.host ?? '';
	}

	if (s.type === 'tunnel') {
		const forwards = await ask(title, 'Port forwarding: L 8080:host:80 (local), R 9000:localhost:9000 (remote), D 1080 (SOCKS), separated by commas', 'L ', validateForwards);
		if (!forwards) { return; }
		s.forwards = forwards.split(',').map(f => f.trim()).filter(Boolean);
	}

	if (s.type === 'ssh' || s.type === 'tunnel') {
		const options = await vscode.window.showQuickPick([
			{ label: 'Jump host', id: 'jump', description: 'connect through a bastion (ssh -J)' },
			{ label: 'SOCKS5 proxy', id: 'socks5' },
			{ label: 'HTTP proxy', id: 'http', description: 'HTTP CONNECT' },
			...(s.type === 'ssh' ? [{ label: 'Port forwarding', id: 'forwards', description: 'while the session is open' }] : []),
			{ label: 'Private key file', id: 'key' },
			{ label: 'Keep alive', id: 'keepAlive', description: 'every 30 seconds' },
			...(s.type === 'ssh' ? [{ label: 'Start in a folder', id: 'startDir' }, { label: 'Save the output to a log file', id: 'log' }] : []),
		], { title, placeHolder: 'Options (none needed for a plain connection)', canPickMany: true });
		if (!options) { return; }
		for (const option of options) {
			if (option.id === 'jump') {
				s.jump = await ask(title, 'Jump host (user@bastion or user@bastion:port, several separated by commas)', '');
			} else if (option.id === 'socks5' || option.id === 'http') {
				const proxy = await ask(title, `${option.label} (host:port)`, option.id === 'socks5' ? 'localhost:1080' : '', v => parseDestination(v)?.port ? undefined : 'Use host:port');
				const p = proxy ? parseDestination(proxy) : undefined;
				if (p?.port) { s.proxy = { type: /** @type {'socks5' | 'http'} */ (option.id), host: p.host, port: p.port }; }
			} else if (option.id === 'forwards') {
				const forwards = await ask(title, 'Port forwarding: L 8080:host:80, R 9000:localhost:9000, D 1080, separated by commas', 'L ', validateForwards);
				s.forwards = forwards?.split(',').map(f => f.trim()).filter(Boolean);
			} else if (option.id === 'key') {
				const key = await vscode.window.showOpenDialog({ title: 'Private key', defaultUri: vscode.Uri.file(path.join(os.homedir(), '.ssh')), openLabel: 'Use this key' });
				if (key?.length) { s.identityFile = key[0].fsPath; }
			} else if (option.id === 'keepAlive') {
				s.keepAlive = 30;
			} else if (option.id === 'startDir') {
				s.startDir = await ask(title, 'Folder on the server', '/var/log');
			} else if (option.id === 'log') {
				s.log = true;
			}
		}
	}

	if (s.type === 'ssh' || s.type === 'rdp') {
		const production = await vscode.window.showQuickPick(['No', 'Yes'], { title, placeHolder: 'Is this a production server? Its terminal is shown in red.' });
		if (!production) { return; }
		s.production = production === 'Yes' || undefined;
	}

	const name = await ask(title, 'Session name', s.name);
	if (!name) { return; }
	s.name = name;
	const folder = await pickFolder(title);
	if (folder === undefined) { return; }
	s.folder = folder || undefined;

	updateStore(sessions => sessions.push(s));
	tree.refresh();
	const action = await vscode.window.showInformationMessage(`Session "${s.name}" saved.`, s.type === 'tunnel' ? 'Start' : 'Connect');
	if (action) { await connect(s); }
}

/**
 * Saves an SSH connection under Recent, or updates the saved one for the same server.
 * A host of ~/.ssh/config is not saved again: its session there is returned.
 */
function remember(/** @type {Omit<Session, 'id' | 'name'>} */ parsed, /** @type {SessionsTree} */ tree) {
	if (!parsed.host) { return undefined; }
	const configured = sshConfigSessions().find(s => s.host === parsed.host);
	if (configured && !parsed.user && !parsed.port) { return configured; }
	/** @type {Session | undefined} */
	let session;
	updateStore(sessions => {
		session = sessions.find(s => s.type === 'ssh' && s.host === parsed.host && (s.user ?? '') === (parsed.user ?? '') && (s.port ?? 22) === (parsed.port ?? 22));
		if (session) {
			session.lastUsed = Date.now();
			return;
		}
		session = { ...parsed, id: crypto.randomUUID(), name: `${parsed.user ? `${parsed.user}@` : ''}${parsed.host}`, folder: RECENT, auto: true, lastUsed: Date.now(), color: randomColor() };
		sessions.push(session);
		const recent = sessions.filter(s => s.auto && s.folder === RECENT).sort((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0));
		for (const old of recent.slice(MAX_RECENT)) { sessions.splice(sessions.indexOf(old), 1); }
	});
	tree.refresh();
	return session;
}

// #endregion

// #region Import

/** @param {SessionsTree} tree */
async function importSessions(tree) {
	const source = await vscode.window.showQuickPick([
		{ label: 'MobaXterm', id: 'moba', detail: 'MobaXterm.ini, or sessions exported as .mxtsessions (SSH and Remote Desktop)' },
		{ label: 'PuTTY', id: 'putty', detail: 'Saved sessions of this Windows account (SSH, with proxy and port forwarding)' },
		{ label: 'SSH config', id: 'sshconfig', detail: '~/.ssh/config, to edit the hosts as sessions' },
	], { title: 'Import Sessions', placeHolder: 'Import from' });
	if (!source) { return; }
	/** @type {{ sessions: Omit<Session, 'id'>[], skipped: number }} */
	let result;
	if (source.id === 'moba') {
		const defaultIni = [path.join(process.env.APPDATA || '', 'MobaXterm', 'MobaXterm.ini'), path.join(os.homedir(), 'Documents', 'MobaXterm', 'MobaXterm.ini')].find(f => fs.existsSync(f));
		const files = await vscode.window.showOpenDialog({ title: 'MobaXterm sessions', defaultUri: defaultIni ? vscode.Uri.file(defaultIni) : undefined, filters: { 'MobaXterm sessions': ['ini', 'mxtsessions'], 'All files': ['*'] }, openLabel: 'Import' });
		if (!files?.length) { return; }
		result = parseMobaXterm(fs.readFileSync(files[0].fsPath, 'latin1'));
	} else if (source.id === 'putty') {
		result = readPutty();
	} else {
		result = { sessions: sshConfigSessions().map(s => ({ name: s.name, folder: 'SSH config', type: 'ssh', host: s.host })), skipped: 0 };
	}
	let added = 0;
	updateStore(sessions => {
		for (const s of result.sessions) {
			const same = sessions.some(x => x.type === s.type && x.host === s.host && (x.user ?? '') === (s.user ?? '') && (x.port ?? 0) === (s.port ?? 0));
			if (!same) {
				sessions.push({ ...s, id: crypto.randomUUID(), color: randomColor() });
				added++;
			}
		}
	});
	tree.refresh();
	const notes = [
		`${added} session${added === 1 ? '' : 's'} imported from ${source.label}`,
		result.sessions.length > added ? `${result.sessions.length - added} already there` : '',
		result.skipped ? `${result.skipped} of other types skipped (only SSH${source.id === 'moba' ? ' and Remote Desktop' : ''} are imported)` : '',
	].filter(Boolean);
	vscode.window.showInformationMessage(`${notes.join(', ')}. Passwords are never imported; PuTTY keys (.ppk) need converting to OpenSSH format with PuTTYgen.`);
}

// #endregion

/** @param {vscode.ExtensionContext} context */
function register(context) {
	const tree = new SessionsTree();
	const view = vscode.window.createTreeView('ddo.sessions', { treeDataProvider: tree, showCollapseAll: true });
	context.subscriptions.push(view);

	/** @param {Node | undefined} node @returns {Session | undefined} */
	const sessionOf = node => node?.kind === 'session' ? node.session : undefined;
	const reg = (/** @type {string} */ id, /** @type {(...args: any[]) => any} */ fn) => context.subscriptions.push(vscode.commands.registerCommand(id, fn));

	reg('ddo.sessions.refresh', () => tree.refresh());
	reg('ddo.sessions.connect', (/** @type {Node} */ node) => { const s = sessionOf(node); if (s) { connect(s).then(() => tree.refresh()); } });
	reg('ddo.sessions.stopTunnel', (/** @type {Node} */ node) => { const s = sessionOf(node); if (s) { tunnels.get(s.id)?.dispose(); } });
	reg('ddo.sessions.new', () => newSession(tree));
	reg('ddo.sessions.import', () => importSessions(tree));
	reg('ddo.sessions.openFile', async () => {
		if (!fs.existsSync(sessionsFile())) { writeStore([]); }
		await vscode.window.showTextDocument(vscode.Uri.file(sessionsFile()));
	});
	reg('ddo.sessions.openLogs', () => {
		fs.mkdirSync(logFolder(), { recursive: true });
		vscode.env.openExternal(vscode.Uri.file(logFolder()));
	});
	reg('ddo.sessions.quickConnect', async () => {
		const input = await ask('Quick Connect', 'user@host, user@host:port, or a full ssh command. It is saved under Recent.', '', v => parseSshCommand(/^ssh(\.exe)?\s/i.test(v) ? v : `ssh ${v}`) ? undefined : 'Use user@host or an ssh command');
		if (!input) { return; }
		const parsed = parseSshCommand(/^ssh(\.exe)?\s/i.test(input) ? input : `ssh ${input}`);
		const s = parsed && remember(parsed, tree);
		if (s) { await connect(s); }
	});
	reg('ddo.sessions.edit', async (/** @type {Node} */ node) => {
		const s = sessionOf(node);
		if (!s) { return; }
		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(sessionsFile()));
		const offset = document.getText().indexOf(`"id": "${s.id}"`);
		const editor = await vscode.window.showTextDocument(document);
		if (offset >= 0) {
			const position = document.positionAt(offset);
			editor.selection = new vscode.Selection(position, position);
			editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
		}
	});
	reg('ddo.sessions.duplicate', (/** @type {Node} */ node) => {
		const s = sessionOf(node);
		if (!s) { return; }
		updateStore(sessions => sessions.push({ ...s, id: crypto.randomUUID(), name: `${s.name} (copy)`, auto: undefined, lastUsed: undefined, color: randomColor() }));
		tree.refresh();
	});
	reg('ddo.sessions.delete', async (/** @type {Node} */ node) => {
		const s = sessionOf(node);
		if (!s) { return; }
		const answer = await vscode.window.showWarningMessage(`Delete the session "${s.name}"?`, { modal: true, detail: 'Its log files stay.' }, 'Delete');
		if (answer !== 'Delete') { return; }
		updateStore(sessions => { const i = sessions.findIndex(x => x.id === s.id); if (i >= 0) { sessions.splice(i, 1); } });
		tree.refresh();
	});
	reg('ddo.sessions.copyCommand', async (/** @type {Node} */ node) => {
		const s = sessionOf(node);
		if (s) { await vscode.env.clipboard.writeText(sshCommandLine(s)); vscode.window.setStatusBarMessage('SSH command copied', 2000); }
	});

	// Output logging and tunnel state
	const onDidWriteTerminalData = /** @type {any} */ (vscode.window).onDidWriteTerminalData;
	if (typeof onDidWriteTerminalData === 'function') {
		context.subscriptions.push(onDidWriteTerminalData((/** @type {{ terminal: vscode.Terminal, data: string }} */ e) => logs.get(e.terminal)?.write(stripAnsi(e.data))));
	}
	context.subscriptions.push(vscode.window.onDidCloseTerminal(terminal => {
		logs.get(terminal)?.end();
		logs.delete(terminal);
		for (const [id, t] of tunnels) {
			if (t === terminal) { tunnels.delete(id); tree.refresh(); }
		}
	}));
	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
		if (path.resolve(document.uri.fsPath) === path.resolve(sessionsFile())) { tree.refresh(); }
	}));
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('ddo.sessions')) { tree.refresh(); }
	}));

	// Show the sessions the first time
	if (!context.globalState.get('sessionsShown')) {
		context.globalState.update('sessionsShown', true);
		vscode.commands.executeCommand('workbench.view.extension.ddo-sessions').then(undefined, () => { });
	}

	return {
		/** Saves `ssh` commands typed in a terminal (shell integration) under Recent */
		rememberTypedSsh(/** @type {string} */ commandLine) {
			if (!cfg().get('rememberTypedSsh', true)) { return; }
			const parsed = parseSshCommand(commandLine);
			if (parsed) { remember(parsed, tree); }
		},
	};
}

module.exports = { register, parseSshCommand, parseMobaXterm, parseDestination, sshArgs, sshCommandLine, forwardArgs };
