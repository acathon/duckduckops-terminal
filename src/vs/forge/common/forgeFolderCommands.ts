/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Reads a terminal command line for the folder panel (`forgeFolder.ts`): how a
// listing command (ls, dir, Get-ChildItem...) shows a folder, and which paths a
// command names. No imports, so it can be tested on its own.

export type FolderShellKind = 'posix' | 'powershell' | 'cmd';

export type FolderSortKey = 'name' | 'time' | 'size' | 'extension';

export interface IFolderListing {
	/** Show hidden files (dotfiles in POSIX shells, system files in Windows shells) */
	readonly hidden: boolean;
	/** Show sizes and dates */
	readonly details: boolean;
	/** name: A to Z; time: newest first; size: largest first; extension: A to Z */
	readonly sort: FolderSortKey;
	readonly reverse: boolean;
	readonly only?: 'folders' | 'files';
	/** A wildcard pattern, such as `*.log` */
	readonly filter?: string;
	/** The folder listed, as typed (relative to the current folder unless absolute) */
	readonly path?: string;
}

export interface IFolderCommandEffect {
	/** Set when the command lists a folder: the panel shows it the same way */
	readonly listing?: IFolderListing;
	/** Paths the command names (arguments and redirections), as typed */
	readonly mentioned: readonly string[];
	/** The command changes the current folder (cd, pushd...): the shell reports where to */
	readonly changesFolder: boolean;
}

export const defaultFolderListing: IFolderListing = { hidden: false, details: false, sort: 'name', reverse: false };

interface IToken {
	readonly text: string;
	/** An operator: ; && || | & or a redirection (> >> 2> < ...) */
	readonly operator?: boolean;
	readonly quoted?: boolean;
}

/** Splits a command line into words and operators, with the shell's quoting rules */
export function tokenizeCommandLine(line: string, shell: FolderShellKind): IToken[] {
	const tokens: IToken[] = [];
	let current = '';
	let quoted = false;
	let inWord = false;
	const push = () => {
		if (inWord) {
			tokens.push({ text: current, quoted });
		}
		current = '';
		quoted = false;
		inWord = false;
	};
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
			push();
			continue;
		}
		if (c === '\'' && shell !== 'cmd') {
			const end = line.indexOf('\'', i + 1);
			current += line.slice(i + 1, end === -1 ? undefined : end);
			quoted = inWord = true;
			i = end === -1 ? line.length : end;
			continue;
		}
		if (c === '"') {
			let j = i + 1;
			while (j < line.length && line[j] !== '"') {
				const escape = shell === 'posix' ? '\\' : shell === 'powershell' ? '`' : undefined;
				if (line[j] === escape && j + 1 < line.length) {
					j++;
				}
				current += line[j];
				j++;
			}
			quoted = inWord = true;
			i = j;
			continue;
		}
		if ((c === '\\' && shell === 'posix') || (c === '`' && shell === 'powershell')) {
			if (i + 1 < line.length) {
				current += line[++i];
				inWord = true;
			}
			continue;
		}
		const two = line.slice(i, i + 2);
		const three = line.slice(i, i + 3);
		const op = ['2>&1', '&>>'].includes(line.slice(i, i + 4)) ? line.slice(i, i + 4)
			: ['2>>', '&>>'].includes(three) ? three
				: ['&&', '||', '>>', '2>', '&>', '<<'].includes(two) ? two
					: ';|&<>'.includes(c) ? c : undefined;
		if (op && !(op === '&' && inWord && shell === 'posix' && /=$/.test(current))) {
			push();
			tokens.push({ text: op, operator: true });
			i += op.length - 1;
			continue;
		}
		current += c;
		inWord = true;
	}
	push();
	return tokens;
}

const separators = new Set([';', '&&', '||', '|', '&']);
const redirections = new Set(['>', '>>', '2>', '2>>', '&>', '&>>', '<']);

/** The program of a pipeline stage, without path, `.exe` and wrappers such as sudo */
function programOf(words: string[]): { program: string; args: string[] } {
	let i = 0;
	while (i < words.length) {
		const w = words[i];
		if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w) || ['sudo', 'time', 'nohup', 'command', 'builtin', 'exec', 'env', 'doas', 'nice', 'stdbuf', 'unbuffer', 'call', '&', '.'].includes(w.toLowerCase())) {
			i++;
			continue;
		}
		break;
	}
	const raw = words[i] ?? '';
	const program = raw.replace(/^.*[\\/]/, '').replace(/\.(exe|cmd|bat|ps1)$/i, '').toLowerCase();
	return { program, args: words.slice(i + 1) };
}

const posixListers = new Set(['ls', 'll', 'la', 'l', 'dir', 'vdir', 'exa', 'eza', 'lsd', 'tree']);
const powershellListers = new Set(['ls', 'dir', 'gci', 'get-childitem', 'll', 'la']);
const folderChangers = new Set(['cd', 'chdir', 'pushd', 'popd', 'z', 'zi', 'j', 'set-location', 'sl', 'push-location', 'pop-location']);

function hasWildcard(s: string): boolean {
	return /[*?[]/.test(s);
}

/** Splits a listing argument into the folder part and a wildcard pattern, if any */
function pathAndFilter(arg: string | undefined): { path?: string; filter?: string } {
	if (!arg) {
		return {};
	}
	if (!hasWildcard(arg)) {
		return { path: arg };
	}
	const cut = Math.max(arg.lastIndexOf('/'), arg.lastIndexOf('\\'));
	return cut === -1 ? { filter: arg } : { path: arg.slice(0, cut) || arg.slice(0, 1), filter: arg.slice(cut + 1) };
}

function posixListing(program: string, args: string[]): IFolderListing {
	let hidden = program === 'll' || program === 'la';
	let details = program === 'll' || program === 'vdir';
	let sort: FolderSortKey = 'name';
	let reverse = false;
	let only: 'folders' | 'files' | undefined;
	const paths: string[] = [];
	const exa = program === 'exa' || program === 'eza' || program === 'lsd';
	for (let i = 0; i < args.length; i++) {
		const a = args[i];
		if (a === '--') {
			paths.push(...args.slice(i + 1));
			break;
		}
		if (a.startsWith('--')) {
			const [name, value] = a.slice(2).split('=', 2);
			switch (name) {
				case 'all': case 'almost-all': hidden = true; break;
				case 'long': details = true; break;
				case 'reverse': reverse = !reverse; break;
				case 'only-dirs': case 'directory': case 'directories-only': only = 'folders'; break;
				case 'only-files': case 'files': only = 'files'; break;
				case 'sort': {
					const v = (value ?? args[++i] ?? '').toLowerCase();
					sort = /^(time|modified|mtime|date|newest|age)$/.test(v) ? 'time' : /^(size)$/.test(v) ? 'size' : /^(extension|ext)$/.test(v) ? 'extension' : 'name';
					// exa sorts by date oldest first unless reversed
					if (exa && sort === 'time' && v !== 'newest') {
						reverse = !reverse;
					}
					break;
				}
			}
			continue;
		}
		if (a.startsWith('-') && a.length > 1) {
			for (const f of a.slice(1)) {
				switch (f) {
					case 'a': case 'A': hidden = true; break;
					case 'l': case 'g': case 'o': case 'n': details = true; break;
					case 't': sort = 'time'; break;
					case 'S': sort = 'size'; break;
					case 'X': sort = 'extension'; break;
					case 'U': case 'f': sort = 'name'; break;
					case 'r': reverse = !reverse; break;
					case 'D': if (exa) { only = 'folders'; } break;
					case 's': if (exa) { i++; } break;
				}
			}
			continue;
		}
		paths.push(a);
	}
	return { hidden, details, sort, reverse, only, ...pathAndFilter(paths[0]) };
}

/** PowerShell accepts any unambiguous prefix of a parameter name */
function isParam(arg: string, name: string, minLength = 2): boolean {
	const a = arg.toLowerCase().replace(/:.*$/, '');
	return a.startsWith('-') && a.length - 1 >= minLength && name.toLowerCase().startsWith(a.slice(1));
}

function powershellListing(args: string[], following: string[][]): IFolderListing {
	let hidden = false;
	let details = true; // Get-ChildItem shows Mode, LastWriteTime and Length
	let sort: FolderSortKey = 'name';
	let reverse = false;
	let only: 'folders' | 'files' | undefined;
	let filter: string | undefined;
	let path: string | undefined;
	for (let i = 0; i < args.length; i++) {
		const a = args[i];
		if (a.startsWith('-')) {
			if (isParam(a, 'Force') || isParam(a, 'Hidden', 1) || a.toLowerCase() === '-ah') {
				hidden = true;
			} else if (isParam(a, 'Name', 1)) {
				details = false;
			} else if (isParam(a, 'Directory', 1) || a.toLowerCase() === '-ad') {
				only = 'folders';
			} else if (isParam(a, 'File', 3) || a.toLowerCase() === '-af') {
				only = 'files';
			} else if (isParam(a, 'Filter', 3) || isParam(a, 'Include', 1)) {
				filter = args[++i];
			} else if (isParam(a, 'Path', 1) || isParam(a, 'LiteralPath', 1) || a.toLowerCase() === '-lp') {
				path = args[++i];
			} else if (isParam(a, 'Exclude', 1) || isParam(a, 'Depth', 2) || isParam(a, 'Attributes', 2)) {
				i++;
			}
			continue;
		}
		if (path === undefined) {
			path = a;
		}
	}
	// `| Sort-Object LastWriteTime -Descending` and the like, later in the pipeline
	for (const stage of following) {
		const { program, args: sortArgs } = programOf(stage);
		if (program === 'sort' || program === 'sort-object') {
			const property = sortArgs.find(a => !a.startsWith('-'))?.toLowerCase() ?? 'name';
			const descending = sortArgs.some(a => isParam(a, 'Descending', 1));
			if (/^(lastwritetime|lastaccesstime|creationtime|lastwritetimeutc)$/.test(property)) {
				sort = 'time';
				reverse = !descending; // the panel's "time" is newest first
			} else if (property === 'length') {
				sort = 'size';
				reverse = !descending; // the panel's "size" is largest first
			} else if (property === 'extension') {
				sort = 'extension';
				reverse = descending;
			} else {
				sort = 'name';
				reverse = descending;
			}
		}
	}
	const split = path !== undefined && hasWildcard(path) ? pathAndFilter(path) : { path };
	return { hidden, details, sort, reverse, only, path: split.path, filter: filter ?? split.filter };
}

function cmdListing(args: string[]): IFolderListing {
	let hidden = false;
	let details = true;
	let sort: FolderSortKey = 'name';
	let reverse = false;
	let only: 'folders' | 'files' | undefined;
	const paths: string[] = [];
	for (const a of args) {
		if (!a.startsWith('/')) {
			paths.push(a);
			continue;
		}
		const sw = a.slice(1).toLowerCase();
		if (sw.startsWith('a')) {
			const attrs = sw.slice(1).replace(':', '');
			hidden = attrs === '' || attrs.includes('h') && !attrs.includes('-h');
			only = attrs.includes('-d') ? 'files' : attrs.includes('d') ? 'folders' : only;
		} else if (sw.startsWith('o')) {
			const order = sw.slice(1).replace(':', '');
			const desc = order.startsWith('-');
			const key = order.replace('-', '')[0];
			if (key === 'd') {
				sort = 'time';
				reverse = !desc; // /o:d is oldest first
			} else if (key === 's') {
				sort = 'size';
				reverse = !desc; // /o:s is smallest first
			} else if (key === 'e') {
				sort = 'extension';
				reverse = desc;
			} else {
				sort = 'name';
				reverse = desc;
			}
		} else if (sw === 'b' || sw === 'w' || sw === 'd') {
			details = false;
		}
	}
	return { hidden, details, sort, reverse, only, ...pathAndFilter(paths[0]) };
}

/** What a command line means for the folder panel */
export function interpretCommandLine(line: string, shell: FolderShellKind): IFolderCommandEffect {
	const tokens = tokenizeCommandLine(line.trim(), shell);
	const mentioned: string[] = [];
	let listing: IFolderListing | undefined;
	let changesFolder = false;

	// Pipelines of stages; a redirection's target is a path the command names
	const pipelines: string[][][] = [[[]]];
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if (t.operator) {
			if (redirections.has(t.text)) {
				const target = tokens[i + 1];
				if (target && !target.operator && !/^&\d$/.test(target.text)) {
					mentioned.push(target.text);
					i++;
				}
			} else if (t.text === '|') {
				pipelines[pipelines.length - 1].push([]);
			} else if (separators.has(t.text)) {
				pipelines.push([[]]);
			}
			continue;
		}
		const pipeline = pipelines[pipelines.length - 1];
		pipeline[pipeline.length - 1].push(t.text);
	}

	for (const pipeline of pipelines) {
		pipeline.forEach((stage, index) => {
			if (!stage.length) {
				return;
			}
			const { program, args } = programOf(stage);
			if (folderChangers.has(program)) {
				changesFolder = true;
				return;
			}
			const lister = shell === 'posix' ? posixListers.has(program) : shell === 'powershell' ? powershellListers.has(program) : program === 'dir';
			if (lister && index === 0) {
				listing = shell === 'posix' ? posixListing(program, args)
					: shell === 'powershell' ? powershellListing(args, pipeline.slice(1))
						: cmdListing(args);
				return;
			}
			for (const a of args) {
				if (isPathLike(a, shell)) {
					mentioned.push(a);
				}
			}
		});
	}
	return { listing, mentioned, changesFolder };
}

function isPathLike(arg: string, shell: FolderShellKind): boolean {
	if (!arg || arg.startsWith('-') || (shell === 'cmd' && arg.startsWith('/') && arg.length <= 3)) {
		return false;
	}
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(arg) || arg.startsWith('$') || arg.startsWith('%') || arg.startsWith('@') || arg.includes('=') || /^\{.*\}$/.test(arg)) {
		return false;
	}
	return arg !== '.' && arg !== '..';
}

/** A wildcard pattern (`*.log`, `app-?.txt`, `[ab]*`) as a regular expression for one name */
export function wildcardToRegExp(pattern: string, ignoreCase: boolean): RegExp {
	let source = '';
	for (let i = 0; i < pattern.length; i++) {
		const c = pattern[i];
		if (c === '*') {
			source += '.*';
		} else if (c === '?') {
			source += '.';
		} else if (c === '[') {
			const end = pattern.indexOf(']', i + 1);
			if (end === -1) {
				source += '\\[';
			} else {
				source += '[' + pattern.slice(i + 1, end).replace(/^!/, '^').replace(/\\/g, '\\\\') + ']';
				i = end;
			}
		} else {
			source += c.replace(/[.+^${}()|\\\]]/g, '\\$&');
		}
	}
	return new RegExp(`^${source}$`, ignoreCase ? 'i' : '');
}
