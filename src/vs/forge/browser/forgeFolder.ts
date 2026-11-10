/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/forgeFolder.css';
import * as dom from '../../base/browser/dom.js';
import { IDragAndDropData } from '../../base/browser/dnd.js';
import { IListVirtualDelegate } from '../../base/browser/ui/list/list.js';
import { ElementsDragAndDropData } from '../../base/browser/ui/list/listView.js';
import { IListAccessibilityProvider } from '../../base/browser/ui/list/listWidget.js';
import { IAsyncDataSource, ITreeContextMenuEvent, ITreeDragAndDrop, ITreeNode, ITreeRenderer } from '../../base/browser/ui/tree/tree.js';
import { IAction, Separator, toAction } from '../../base/common/actions.js';
import { RunOnceScheduler } from '../../base/common/async.js';
import { Codicon } from '../../base/common/codicons.js';
import { fromNow } from '../../base/common/date.js';
import { toErrorMessage } from '../../base/common/errorMessage.js';
import { DisposableStore, MutableDisposable } from '../../base/common/lifecycle.js';
import { Schemas } from '../../base/common/network.js';
import { posix, win32 } from '../../base/common/path.js';
import { isWindows } from '../../base/common/platform.js';
import { URI } from '../../base/common/uri.js';
import { localize, localize2 } from '../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../platform/actions/common/actions.js';
import { IClipboardService } from '../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../platform/contextview/browser/contextView.js';
import { ByteSize, FileKind, IFileService, IFileStatWithMetadata } from '../../platform/files/common/files.js';
import { IHoverService } from '../../platform/hover/browser/hover.js';
import { SyncDescriptor } from '../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../platform/keybinding/common/keybinding.js';
import { WorkbenchAsyncDataTree } from '../../platform/list/browser/listService.js';
import { IOpenerService } from '../../platform/opener/common/opener.js';
import { IQuickInputService, IQuickPickItem } from '../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../platform/storage/common/storage.js';
import { ICommandDetectionCapability, ICwdDetectionCapability, ITerminalCommand, TerminalCapability } from '../../platform/terminal/common/capabilities/capabilities.js';
import { IThemeService } from '../../platform/theme/common/themeService.js';
import { fillEditorsDragData } from '../../workbench/browser/dnd.js';
import { IResourceLabel, ResourceLabels } from '../../workbench/browser/labels.js';
import { IViewPaneOptions, ViewPane } from '../../workbench/browser/parts/views/viewPane.js';
import { IViewContainersRegistry, IViewDescriptorService, IViewsRegistry, ViewContainer, Extensions as ViewExtensions } from '../../workbench/common/views.js';
import { ITerminalInstance, ITerminalService } from '../../workbench/contrib/terminal/browser/terminal.js';
import { TERMINAL_VIEW_ID } from '../../workbench/contrib/terminal/common/terminal.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../workbench/services/editor/common/editorService.js';
import { IViewsService } from '../../workbench/services/views/common/viewsService.js';
import { defaultFolderListing, FolderShellKind, FolderSortKey, IFolderListing, interpretCommandLine, wildcardToRegExp } from '../common/forgeFolderCommands.js';

// The folder panel: right of the terminal, in the terminal's own panel (shown as a
// card of its own), it shows the folder the active terminal is in as a tree, with
// sizes and dates in columns, and follows what the terminal does. A listing
// command (ls -la, dir /a, Get-ChildItem -Force | sort LastWriteTime...) sets how
// it shows the folder; after any command it marks what was added, changed or
// deleted, and the files the command named; a file watcher keeps it current while
// a command runs. A click expands a folder, a double-click runs `cd` there in the
// terminal; a file opens above the terminal.

export const FOLDER_VIEW_ID = 'ddo.folder';

const ShowsHiddenContext = new RawContextKey<boolean>('ddo.folderShowsHidden', false);
const ShowsDetailsContext = new RawContextKey<boolean>('ddo.folderShowsDetails', false);
const ShowsOtherFolderContext = new RawContextKey<boolean>('ddo.folderShowsOtherFolder', false);

/** At most this many rows per folder, so a huge folder doesn't slow the panel down */
const MAX_ROWS = 3000;

const DETAILS_STORAGE_KEY = 'ddo.folder.details';

type Mark = 'added' | 'changed' | 'removed' | 'mentioned';

interface IFolderEntry {
	readonly kind: 'entry' | 'parent' | 'more';
	readonly name: string;
	/** The path from the folder shown, with `/` (`logs/app.log` for a file in an expanded folder) */
	readonly relative: string;
	readonly resource: URI;
	readonly isDirectory: boolean;
	readonly isSymbolicLink: boolean;
	readonly size: number | undefined;
	readonly mtime: number | undefined;
	readonly mark?: Mark;
}

/** Files Windows hides from `dir` and `Get-ChildItem` without /a or -Force (by name: the attribute isn't known here) */
const windowsHidden = /^(desktop\.ini|thumbs\.db|ntuser\..*|\$recycle\.bin|system volume information|pagefile\.sys|hiberfil\.sys|swapfile\.sys|dumpstack\.log.*|\.git)$/i;

class FolderDelegate implements IListVirtualDelegate<IFolderEntry> {
	getHeight(): number {
		return 22;
	}
	getTemplateId(): string {
		return FolderRenderer.ID;
	}
}

interface IFolderTemplate {
	readonly row: HTMLElement;
	readonly label: IResourceLabel;
	readonly time: HTMLElement;
	readonly size: HTMLElement;
	readonly badge: HTMLElement;
}

const markBadges: Record<Mark, string> = { added: 'A', changed: 'M', removed: 'D', mentioned: '\u2022' };

/** The tree's input: the folder shown. A new input (another folder) collapses everything. */
interface IFolderInput {
	readonly folder: string;
}

function isFolderInput(element: IFolderInput | IFolderEntry): element is IFolderInput {
	return !('kind' in element);
}

class FolderRenderer implements ITreeRenderer<IFolderEntry, void, IFolderTemplate> {

	static readonly ID = 'ddo.folder.entry';
	readonly templateId = FolderRenderer.ID;

	constructor(
		private readonly labels: ResourceLabels,
		private readonly showsDetails: () => boolean,
	) { }

	renderTemplate(container: HTMLElement): IFolderTemplate {
		const row = dom.append(container, dom.$('.forge-folder-row'));
		const label = this.labels.create(row, { supportHighlights: false });
		const badge = dom.append(row, dom.$('span.forge-folder-badge'));
		const time = dom.append(row, dom.$('span.forge-folder-column.time'));
		const size = dom.append(row, dom.$('span.forge-folder-column.size'));
		return { row, label, time, size, badge };
	}

	renderElement(node: ITreeNode<IFolderEntry, void>, _index: number, template: IFolderTemplate): void {
		const entry = node.element;
		template.row.className = `forge-folder-row${entry.mark ? ` ${entry.mark}` : ''}`;
		template.badge.textContent = entry.mark ? markBadges[entry.mark] : '';
		const details = this.showsDetails() && entry.kind === 'entry';
		template.time.classList.toggle('hidden', !this.showsDetails());
		template.size.classList.toggle('hidden', !this.showsDetails());
		template.time.textContent = details && entry.mtime ? fromNow(entry.mtime, true) : '';
		template.time.title = details && entry.mtime ? new Date(entry.mtime).toLocaleString() : '';
		template.size.textContent = details && !entry.isDirectory && entry.size !== undefined ? ByteSize.formatSize(entry.size) : '';
		if (entry.kind === 'more') {
			template.label.setLabel(entry.name, undefined, { italic: true, hideIcon: true });
			return;
		}
		if (entry.kind === 'parent') {
			template.label.setResource({ resource: entry.resource, name: '..' }, { fileKind: FileKind.FOLDER, fileDecorations: { colors: false, badges: false }, title: localize('ddo.folder.parent', "Up to the parent folder (double-click to go there)") });
			return;
		}
		template.label.setResource({ resource: entry.resource, name: entry.name }, {
			fileKind: entry.isDirectory ? FileKind.FOLDER : FileKind.FILE,
			fileDecorations: { colors: false, badges: false },
			strikethrough: entry.mark === 'removed',
			italic: entry.isSymbolicLink,
			title: entry.mark === 'removed' ? localize('ddo.folder.removedTitle', "{0} (deleted by the last command)", entry.name) : undefined,
		});
	}

	disposeTemplate(template: IFolderTemplate): void {
		template.label.dispose();
	}
}

class FolderAccessibilityProvider implements IListAccessibilityProvider<IFolderEntry> {
	getWidgetAriaLabel(): string {
		return localize('ddo.folder.aria', "Files in the terminal's folder");
	}
	getAriaLabel(entry: IFolderEntry): string {
		if (entry.kind === 'parent') {
			return localize('ddo.folder.ariaParent', "Parent folder");
		}
		const kind = entry.isDirectory ? localize('ddo.folder.ariaFolder', "folder") : localize('ddo.folder.ariaFile', "file");
		switch (entry.mark) {
			case 'added': return localize('ddo.folder.ariaAdded', "{0}, {1}, new", entry.name, kind);
			case 'changed': return localize('ddo.folder.ariaChanged', "{0}, {1}, changed", entry.name, kind);
			case 'removed': return localize('ddo.folder.ariaRemoved', "{0}, {1}, deleted", entry.name, kind);
			case 'mentioned': return localize('ddo.folder.ariaMentioned', "{0}, {1}, used by the last command", entry.name, kind);
		}
		return `${entry.name}, ${kind}`;
	}
}

export class ForgeFolderView extends ViewPane {

	private tree: WorkbenchAsyncDataTree<IFolderInput, IFolderEntry> | undefined;
	private input: IFolderInput | undefined;
	/** The folder's own rows, as the tree shows them at the top level */
	private rows: IFolderEntry[] = [];
	private statusElement: HTMLElement | undefined;
	private columnsElement: HTMLElement | undefined;
	private messageElement: HTMLElement | undefined;
	private bodySize: { height: number; width: number } | undefined;
	/** Sizes and dates in columns, the details view: on unless turned off */
	private detailsShown: boolean;

	private readonly terminalStore = this._register(new DisposableStore());
	private readonly watcher = this._register(new MutableDisposable<DisposableStore>());
	private readonly refreshScheduler = this._register(new RunOnceScheduler(() => this.refresh(), 120));
	private refreshId = 0;

	private terminal: ITerminalInstance | undefined;
	/** The terminal's folder, as the shell reports it */
	private cwd: string | undefined;
	/** A folder a listing command showed (`ls /var/log`), as typed */
	private listedPath: string | undefined;
	private listing: IFolderListing = defaultFolderListing;
	private lastCommandListed = false;

	/** The folder as read last, by name key */
	private entries = new Map<string, IFolderEntry>();
	/** The folder when the running or last command started: what it changed shows against this */
	private before: { readonly folder: string; readonly entries: Map<string, IFolderEntry> } | undefined;
	private mentioned = new Set<string>();
	private revealAfterRefresh = false;
	private watched: string | undefined;
	private shownPath: string | undefined;
	private summary: { added: number; changed: number; removed: number } | undefined;

	private readonly showsHidden: IContextKey<boolean>;
	private readonly showsDetailsKey: IContextKey<boolean>;
	private readonly showsOtherFolder: IContextKey<boolean>;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@IFileService private readonly fileService: IFileService,
		@IEditorService private readonly editorService: IEditorService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@ICommandService private readonly commandService: ICommandService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this.detailsShown = this.storageService.getBoolean(DETAILS_STORAGE_KEY, StorageScope.PROFILE, true);
		this.showsHidden = ShowsHiddenContext.bindTo(contextKeyService);
		this.showsDetailsKey = ShowsDetailsContext.bindTo(contextKeyService);
		this.showsOtherFolder = ShowsOtherFolderContext.bindTo(contextKeyService);

		this._register(this.terminalService.onDidChangeActiveInstance(instance => {
			if (instance !== this.terminal) {
				this.bindTerminal(instance);
			}
		}));
		this.bindTerminal(this.terminalService.activeInstance);
		this._register(this.onDidChangeBodyVisibility(visible => {
			if (visible) {
				this.refreshScheduler.schedule(0);
			}
		}));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		container.classList.add('forge-folder', 'show-file-icons');
		this.statusElement = dom.append(container, dom.$('.forge-folder-status'));
		this.columnsElement = dom.append(container, dom.$('.forge-folder-columns'));
		this.messageElement = dom.append(container, dom.$('.forge-folder-message'));
		const treeContainer = dom.append(container, dom.$('.forge-folder-list'));

		const labels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility }));
		const dataSource: IAsyncDataSource<IFolderInput, IFolderEntry> = {
			hasChildren: element => isFolderInput(element) || (element.kind === 'entry' && element.isDirectory && element.mark !== 'removed'),
			getChildren: element => isFolderInput(element) ? this.rows : this.readChildren(element),
		};
		const tree = this.tree = this._register(this.instantiationService.createInstance(
			WorkbenchAsyncDataTree<IFolderInput, IFolderEntry>,
			'ForgeFolder', treeContainer, new FolderDelegate(), [new FolderRenderer(labels, () => this.showsDetails())], dataSource, {
			identityProvider: { getId: (entry: IFolderEntry) => `${entry.kind}:${entry.relative}` },
			accessibilityProvider: new FolderAccessibilityProvider(),
			multipleSelectionSupport: false,
			collapseByDefault: () => true,
			dnd: this.createDragAndDrop(),
		}));

		this._register(tree.onDidOpen(e => {
			const entry = e.element;
			if (!entry || entry.kind === 'more') {
				return;
			}
			if (entry.kind === 'parent' || entry.isDirectory) {
				// A click expands a folder; going there runs a command in the terminal, so it takes a double-click
				if (dom.isMouseEvent(e.browserEvent) && e.browserEvent.detail < 2) {
					return;
				}
				this.goInto(entry);
			} else if (entry.mark !== 'removed') {
				this.editorService.openEditor({ resource: entry.resource, options: { preserveFocus: e.editorOptions.preserveFocus, pinned: e.editorOptions.pinned } }, e.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
			}
		}));
		this._register(tree.onContextMenu(e => this.showContextMenu(e)));
		this.renderColumns();
		this.refreshScheduler.schedule(0);
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.bodySize = { height, width };
		// Next to the terminal the panel shows this view as a card of its own: the gap
		// before it (forgeFolder.css) comes out of its width
		const gap = Number.parseFloat(dom.getWindow(this.element).getComputedStyle(this.element).marginLeft) || 0;
		const statusHeight = this.statusElement?.classList.contains('visible') ? this.statusElement.offsetHeight : 0;
		const columnsHeight = this.columnsElement?.classList.contains('visible') ? this.columnsElement.offsetHeight : 0;
		this.tree?.layout(Math.max(0, height - statusHeight - columnsHeight), Math.max(0, width - gap));
	}

	// --- Following the terminal

	private bindTerminal(instance: ITerminalInstance | undefined): void {
		this.terminalStore.clear();
		this.terminal = instance;
		this.cwd = undefined;
		this.listedPath = undefined;
		this.before = undefined;
		this.mentioned.clear();
		this.summary = undefined;
		this.lastCommandListed = false;
		if (instance) {
			const capabilities = instance.capabilities;
			const onCwd = (cwd: string) => {
				if (!cwd || cwd === this.cwd) {
					return;
				}
				this.cwd = cwd;
				// `cd logs && ls *.log` reports the new folder after the listing: keep what it set
				if (!this.lastCommandListed) {
					this.listedPath = undefined;
					this.listing = { ...this.listing, filter: undefined };
				}
				this.refreshScheduler.schedule(0);
			};
			const bindCwd = (capability: ICwdDetectionCapability) => {
				this.terminalStore.add(capability.onDidChangeCwd(onCwd));
				onCwd(capability.getCwd());
			};
			const bindCommands = (capability: ICommandDetectionCapability) => {
				this.terminalStore.add(capability.onCommandExecuted(command => this.onCommandStarted(command)));
				this.terminalStore.add(capability.onCommandFinished(command => this.onCommandFinished(command)));
			};
			const cwdCapability = capabilities.get(TerminalCapability.CwdDetection);
			if (cwdCapability) {
				bindCwd(cwdCapability);
			}
			this.terminalStore.add(capabilities.onDidAddCwdDetectionCapability(bindCwd));
			const commandCapability = capabilities.get(TerminalCapability.CommandDetection);
			if (commandCapability) {
				bindCommands(commandCapability);
			}
			this.terminalStore.add(capabilities.onDidAddCommandDetectionCapability(bindCommands));
			if (!this.cwd) {
				if (instance.cwd) {
					onCwd(instance.cwd);
				} else {
					instance.getInitialCwd().then(cwd => {
						if (this.terminal === instance && !this.cwd) {
							onCwd(cwd);
						}
					}, () => { /* the terminal closed */ });
				}
			}
		}
		this.refreshScheduler.schedule(0);
	}

	private onCommandStarted(_command: ITerminalCommand): void {
		const folder = this.shownFolder();
		this.before = folder.uri ? { folder: folder.uri.toString(), entries: new Map(this.entries) } : undefined;
		this.mentioned.clear();
		this.summary = undefined;
		this.lastCommandListed = false;
		this.refreshScheduler.schedule();
	}

	private onCommandFinished(command: ITerminalCommand): void {
		const effect = interpretCommandLine(command.command, this.shellKind());
		this.lastCommandListed = !!effect.listing;
		if (effect.listing) {
			this.listing = effect.listing;
			this.listedPath = effect.listing.path;
			this.updateContextKeys();
		}
		this.mentioned = new Set(effect.mentioned.map(path => this.nameInShownFolder(path)).filter((name): name is string => !!name).map(name => this.key(name)));
		this.revealAfterRefresh = true;
		// The new folder (after cd) is reported just after the command finishes
		this.refreshScheduler.schedule(150);
	}

	// --- Where the folder is

	private shellKind(): FolderShellKind {
		const type = this.terminal?.shellType;
		if (type === 'pwsh') {
			return 'powershell';
		}
		if (type === 'cmd') {
			return 'cmd';
		}
		if (type) {
			return 'posix';
		}
		const exe = this.executableName();
		return /^(pwsh|powershell)$/.test(exe) ? 'powershell' : exe === 'cmd' ? 'cmd' : isWindows && !exe ? 'powershell' : 'posix';
	}

	private executableName(): string {
		const exe = this.terminal?.shellLaunchConfig.executable ?? '';
		return exe.replace(/^.*[\\/]/, '').replace(/\.exe$/i, '').toLowerCase();
	}

	private isRemoteShell(): boolean {
		return /^(ssh|plink|mosh|telnet)$/.test(this.executableName());
	}

	/** Paths in the shell's own form: Windows (C:\, \\server) or POSIX */
	private isWindowsPath(path: string): boolean {
		return /^[a-zA-Z]:([\\/]|$)/.test(path) || path.startsWith('\\\\');
	}

	private resolvePath(path: string, base: string): string {
		const lib = this.isWindowsPath(base) || this.isWindowsPath(path) ? win32 : posix;
		return lib.isAbsolute(path) ? lib.normalize(path) : lib.join(base, path);
	}

	private wslDistribution(): string | undefined {
		const config = this.terminal?.shellLaunchConfig;
		if (!config) {
			return undefined;
		}
		const args = Array.isArray(config.args) ? config.args : (config.args ?? '').split(/\s+/);
		const index = args.findIndex(a => a === '-d' || a === '--distribution');
		if (index !== -1 && args[index + 1]) {
			return args[index + 1];
		}
		const name = /^(.+) \(WSL\)$/.exec(config.name ?? this.terminal?.title ?? '');
		return name?.[1];
	}

	/** A path the shell reported, as something the file service can read */
	private toUri(path: string): URI | string {
		const terminal = this.terminal;
		if (terminal?.remoteAuthority) {
			return URI.from({ scheme: Schemas.vscodeRemote, authority: terminal.remoteAuthority, path: path.replace(/\\/g, '/') });
		}
		if (!isWindows || this.isWindowsPath(path)) {
			return URI.file(path);
		}
		const mount = /^\/mnt\/([a-zA-Z])(\/.*)?$/.exec(path);
		if (mount) {
			return URI.file(`${mount[1].toUpperCase()}:${mount[2] ?? '\\'}`);
		}
		if (terminal?.shellType === 'gitbash') {
			const drive = /^\/([a-zA-Z])(\/.*)?$/.exec(path);
			if (drive) {
				return URI.file(`${drive[1].toUpperCase()}:${drive[2] ?? '\\'}`);
			}
		}
		const distribution = this.wslDistribution();
		if (!distribution) {
			return localize('ddo.folder.unknownWsl', "Can't tell which WSL distribution this terminal runs, so its files can't be listed.");
		}
		return URI.file(`\\\\wsl.localhost\\${distribution}${path.replace(/\//g, '\\')}`);
	}

	private shownFolder(): { path?: string; uri?: URI; problem?: string } {
		if (!this.terminal) {
			return { problem: localize('ddo.folder.noTerminal', "Open a terminal: the folder it is in shows here.") };
		}
		if (this.isRemoteShell()) {
			return { problem: localize('ddo.folder.remote', "This terminal is connected to another computer: its files aren't listed here.") };
		}
		if (!this.cwd) {
			return { problem: localize('ddo.folder.noCwd', "Waiting for the terminal to report its folder.") };
		}
		const path = this.listedPath ? this.resolvePath(this.listedPath, this.cwd) : this.cwd;
		const uri = this.toUri(path);
		return typeof uri === 'string' ? { path, problem: uri } : { path, uri };
	}

	private key(name: string): string {
		return this.shownPath && this.isWindowsPath(this.shownPath) && !this.shownPath.startsWith('\\\\wsl') ? name.toLowerCase() : name;
	}

	/** The name of a path a command named, if it is in the folder shown */
	private nameInShownFolder(path: string): string | undefined {
		const folder = this.shownFolder().path;
		if (!folder) {
			return undefined;
		}
		const full = this.resolvePath(path.replace(/[\\/]+$/, ''), folder);
		const lib = this.isWindowsPath(full) ? win32 : posix;
		const same = lib === win32 ? lib.dirname(full).toLowerCase() === lib.normalize(folder).replace(/[\\/]+$/, '').toLowerCase() : lib.dirname(full) === lib.normalize(folder).replace(/\/+$/, '');
		return same ? lib.basename(full) : undefined;
	}

	private showsDetails(): boolean {
		return this.detailsShown || this.listing.details || this.listing.sort === 'time' || this.listing.sort === 'size';
	}

	private isHidden(name: string): boolean {
		return this.shellKind() === 'posix' ? name.startsWith('.') : windowsHidden.test(name);
	}

	// --- Reading and showing the folder

	private async refresh(): Promise<void> {
		const tree = this.tree;
		if (!tree || !this.isBodyVisible()) {
			return;
		}
		const id = ++this.refreshId;
		const folder = this.shownFolder();
		this.shownPath = folder.path;
		this.updateTitleDescription(folder.path ?? '');
		this.updateContextKeys();
		if (!folder.uri) {
			this.watcher.clear();
			this.watched = undefined;
			this.show([], folder.problem);
			return;
		}

		let stat: IFileStatWithMetadata;
		try {
			stat = await this.fileService.resolve(folder.uri, { resolveMetadata: true });
		} catch (error) {
			if (id === this.refreshId) {
				this.show([], localize('ddo.folder.cantRead', "Can't read {0}: {1}", folder.path, toErrorMessage(error)));
			}
			return;
		}
		if (id !== this.refreshId) {
			return;
		}
		this.watch(folder.uri);

		const now = new Map<string, IFolderEntry>();
		for (const child of stat.children ?? []) {
			now.set(this.key(child.name), {
				kind: 'entry',
				name: child.name,
				relative: child.name,
				resource: child.resource,
				isDirectory: child.isDirectory,
				isSymbolicLink: !!child.isSymbolicLink,
				size: child.isDirectory ? undefined : child.size,
				mtime: child.mtime,
			});
		}
		this.entries = now;

		// What the running or last command did here
		const before = this.before?.folder === folder.uri.toString() ? this.before.entries : undefined;
		const summary = { added: 0, changed: 0, removed: 0 };
		const rows: IFolderEntry[] = [];
		for (const [key, entry] of now) {
			let mark: Mark | undefined;
			if (before) {
				const previous = before.get(key);
				mark = !previous ? 'added' : previous.mtime !== entry.mtime || previous.size !== entry.size ? 'changed' : undefined;
			}
			mark ??= this.mentioned.has(key) ? 'mentioned' : undefined;
			if (mark === 'added' || mark === 'changed') {
				summary[mark]++;
			}
			rows.push(mark ? { ...entry, mark } : entry);
		}
		if (before) {
			for (const [key, entry] of before) {
				if (!now.has(key)) {
					summary.removed++;
					rows.push({ ...entry, mark: 'removed' });
				}
			}
		}
		this.summary = summary.added || summary.changed || summary.removed ? summary : undefined;

		const visible = this.sort(rows.filter(row => this.isShown(row)));
		const total = visible.length;
		this.capRows(visible, folder.uri, '');
		const lib = this.isWindowsPath(folder.path!) ? win32 : posix;
		const parentPath = lib.dirname(folder.path!);
		if (parentPath !== folder.path) {
			const parent = this.toUri(parentPath);
			if (typeof parent !== 'string') {
				visible.unshift({ kind: 'parent', name: '..', relative: '..', resource: parent, isDirectory: true, isSymbolicLink: false, size: undefined, mtime: undefined });
			}
		}

		const empty = total === 0
			? (now.size === 0 ? localize('ddo.folder.empty', "This folder is empty.") : localize('ddo.folder.noMatch', "Nothing here matches what the last listing showed."))
			: undefined;
		await this.show(visible, empty, folder.uri.toString());

		if (this.revealAfterRefresh && id === this.refreshId) {
			this.revealAfterRefresh = false;
			const first = visible.find(row => row.mark && row.mark !== 'removed');
			if (first && tree.hasNode(first)) {
				tree.reveal(first);
			}
		}
	}

	/** Cuts a folder's rows at MAX_ROWS, with a last row that says how many more there are */
	private capRows(rows: IFolderEntry[], folder: URI, relative: string): void {
		const total = rows.length;
		if (total > MAX_ROWS) {
			rows.splice(MAX_ROWS);
			const name = localize('ddo.folder.more', "{0} more not shown", total - MAX_ROWS);
			rows.push({ kind: 'more', name, relative: `${relative}/${name}`, resource: folder, isDirectory: false, isSymbolicLink: false, size: undefined, mtime: undefined });
		}
	}

	/** The rows of a folder expanded in the tree: shown and sorted like the folder itself */
	private async readChildren(parent: IFolderEntry): Promise<IFolderEntry[]> {
		let stat: IFileStatWithMetadata;
		try {
			stat = await this.fileService.resolve(parent.resource, { resolveMetadata: true });
		} catch {
			return [];
		}
		const rows: IFolderEntry[] = (stat.children ?? []).map(child => ({
			kind: 'entry',
			name: child.name,
			relative: `${parent.relative}/${child.name}`,
			resource: child.resource,
			isDirectory: child.isDirectory,
			isSymbolicLink: !!child.isSymbolicLink,
			size: child.isDirectory ? undefined : child.size,
			mtime: child.mtime,
		}));
		const shown = this.sort(rows.filter(row => (this.listing.hidden || !this.isHidden(row.name))));
		this.capRows(shown, parent.resource, parent.relative);
		return shown;
	}

	private isShown(entry: IFolderEntry): boolean {
		const listing = this.listing;
		if (entry.mark === 'removed' || entry.mark === 'added') {
			return true; // always show what the command did
		}
		if (!listing.hidden && this.isHidden(entry.name)) {
			return false;
		}
		if (listing.only === 'folders' && !entry.isDirectory || listing.only === 'files' && entry.isDirectory) {
			return false;
		}
		if (listing.filter && !wildcardToRegExp(listing.filter, this.shellKind() !== 'posix').test(entry.name)) {
			return false;
		}
		return true;
	}

	private sort(rows: IFolderEntry[]): IFolderEntry[] {
		const { sort, reverse } = this.listing;
		const byName = (a: IFolderEntry, b: IFolderEntry) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
		const compare: Record<FolderSortKey, (a: IFolderEntry, b: IFolderEntry) => number> = {
			name: byName,
			time: (a, b) => (b.mtime ?? 0) - (a.mtime ?? 0) || byName(a, b),
			size: (a, b) => (b.size ?? 0) - (a.size ?? 0) || byName(a, b),
			extension: (a, b) => posix.extname(a.name).localeCompare(posix.extname(b.name)) || byName(a, b),
		};
		return rows.sort((a, b) => {
			if (a.isDirectory !== b.isDirectory) {
				return a.isDirectory ? -1 : 1;
			}
			const result = compare[sort](a, b);
			return reverse ? -result : result;
		});
	}

	/** Shows the folder's rows: a new folder starts collapsed, the same folder keeps what is expanded */
	private async show(rows: IFolderEntry[], message: string | undefined, folder = ''): Promise<void> {
		this.rows = rows;
		if (this.messageElement) {
			this.messageElement.textContent = message ?? '';
			this.messageElement.classList.toggle('visible', !!message);
		}
		this.renderStatus();
		this.renderColumns();
		const tree = this.tree;
		if (!tree) {
			return;
		}
		try {
			if (!this.input || this.input.folder !== folder) {
				this.input = { folder };
				await tree.setInput(this.input);
			} else {
				await tree.updateChildren(this.input, true, true);
			}
		} catch {
			// A newer refresh replaced this one
		}
	}

	/** The column titles of the details view; a click sorts by the column, again reverses */
	private renderColumns(): void {
		const columns = this.columnsElement;
		if (!columns) {
			return;
		}
		dom.clearNode(columns);
		const visible = this.showsDetails() && this.rows.length > 0;
		const { sort, reverse } = this.listing;
		const column = (className: string, text: string, key: FolderSortKey) => {
			const active = sort === key;
			const title = dom.append(columns, dom.$(`a.forge-folder-column-title.${className}`, { role: 'button', tabIndex: 0 }));
			dom.append(title, dom.$('span', undefined, text));
			if (active) {
				dom.append(title, dom.$(`span.codicon.codicon-${reverse ? 'arrow-small-up' : 'arrow-small-down'}`));
			}
			title.title = localize('ddo.folder.sortColumn', "Sort by {0}", text);
			const run = () => this.setSort(key, active ? !reverse : false);
			title.addEventListener('click', run);
			title.addEventListener('keydown', e => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					run();
				}
			});
		};
		column('name', localize('ddo.folder.columnName', "Name"), 'name');
		column('time', localize('ddo.folder.columnModified', "Modified"), 'time');
		column('size', localize('ddo.folder.columnSize', "Size"), 'size');
		if (columns.classList.contains('visible') !== visible) {
			columns.classList.toggle('visible', visible);
			this.relayout();
		}
	}

	private renderStatus(): void {
		const status = this.statusElement;
		if (!status) {
			return;
		}
		dom.clearNode(status);
		const link = (text: string, run: () => void) => {
			const a = dom.append(status, dom.$('a.forge-folder-link', { role: 'button', tabIndex: 0 }, text));
			a.addEventListener('click', run);
			a.addEventListener('keydown', e => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					run();
				}
			});
		};
		if (this.listedPath) {
			dom.append(status, dom.$('span', undefined, localize('ddo.folder.listed', "Listed by the last command")));
			link(localize('ddo.folder.back', "Back to the terminal's folder"), () => this.followTerminal());
		}
		if (this.listing.filter) {
			dom.append(status, dom.$('span.forge-folder-filter', undefined, this.listing.filter));
			link(localize('ddo.folder.clearFilter', "Show all"), () => {
				this.listing = { ...this.listing, filter: undefined };
				this.refreshScheduler.schedule(0);
			});
		}
		if (this.summary) {
			const parts: [string, number, string][] = [
				['added', this.summary.added, localize('ddo.folder.addedCount', "{0} new", this.summary.added)],
				['changed', this.summary.changed, localize('ddo.folder.changedCount', "{0} changed", this.summary.changed)],
				['removed', this.summary.removed, localize('ddo.folder.removedCount', "{0} deleted", this.summary.removed)],
			];
			for (const [mark, count, text] of parts) {
				if (count) {
					dom.append(status, dom.$(`span.forge-folder-count.${mark}`, undefined, text));
				}
			}
		}
		const visible = status.childElementCount > 0;
		if (status.classList.contains('visible') !== visible) {
			status.classList.toggle('visible', visible);
			this.relayout();
		}
	}

	private relayout(): void {
		if (this.bodySize) {
			this.layoutBody(this.bodySize.height, this.bodySize.width);
		}
	}

	private watch(folder: URI): void {
		if (this.watched === folder.toString()) {
			return;
		}
		this.watched = folder.toString();
		const store = new DisposableStore();
		store.add(this.fileService.watch(folder, { recursive: false, excludes: [] }));
		store.add(this.fileService.onDidFilesChange(e => {
			if (e.affects(folder)) {
				this.refreshScheduler.schedule();
			}
		}));
		this.watcher.value = store;
	}

	private updateContextKeys(): void {
		this.showsHidden.set(this.listing.hidden);
		this.showsDetailsKey.set(this.showsDetails());
		this.showsOtherFolder.set(!!this.listedPath);
	}

	// --- Acting on the folder

	private quote(path: string): string {
		switch (this.shellKind()) {
			case 'cmd': return /[\s&()^]/.test(path) ? `"${path}"` : path;
			case 'powershell': return /[\s'`$&(){}@;,]/.test(path) ? `'${path.replace(/'/g, '\'\'')}'` : path;
			default: return /[^\w@%+=:,./~-]/.test(path) ? `'${path.replace(/'/g, '\'\\\'\'')}'` : path;
		}
	}

	/** The entry's path in the shell's own form, from the folder shown (`logs\app.log` in Windows shells) */
	private nativeRelative(entry: IFolderEntry): string {
		const relative = entry.kind === 'parent' ? '..' : entry.relative;
		return this.shellKind() === 'posix' ? relative : relative.replace(/\//g, '\\');
	}

	/** The entry's path as the terminal would type it: relative in the terminal's folder */
	private terminalPath(entry: IFolderEntry): string {
		const relative = this.nativeRelative(entry);
		const folder = this.shownFolder().path;
		return this.listedPath && folder ? this.resolvePath(relative, folder) : relative;
	}

	private goInto(entry: IFolderEntry): void {
		const terminal = this.terminal;
		const commands = terminal?.capabilities.get(TerminalCapability.CommandDetection);
		if (!terminal || this.isRemoteShell() || !commands || commands.executingCommandObject) {
			// The terminal is busy, or its prompt can't be told apart: browse here only
			const folder = this.shownFolder().path;
			if (folder && this.cwd) {
				this.listedPath = this.resolvePath(this.nativeRelative(entry), folder);
				this.listing = { ...this.listing, filter: undefined };
				this.refreshScheduler.schedule(0);
			}
			return;
		}
		const path = this.quote(this.terminalPath(entry));
		terminal.sendText(this.shellKind() === 'cmd' ? `cd /d ${path}` : `cd ${path}`, true);
	}

	private insertInTerminal(entry: IFolderEntry): void {
		const terminal = this.terminal;
		if (terminal) {
			terminal.sendText(`${this.quote(this.terminalPath(entry))} `, false);
			terminal.focus();
		}
	}

	followTerminal(): void {
		this.listedPath = undefined;
		this.listing = { ...this.listing, filter: undefined };
		this.refreshScheduler.schedule(0);
	}

	toggleHidden(): void {
		this.listing = { ...this.listing, hidden: !this.listing.hidden };
		this.refreshScheduler.schedule(0);
	}

	toggleDetails(): void {
		const details = !this.showsDetails();
		this.detailsShown = details;
		this.storageService.store(DETAILS_STORAGE_KEY, details, StorageScope.PROFILE, StorageTarget.USER);
		this.listing = { ...this.listing, details, sort: !details && (this.listing.sort === 'time' || this.listing.sort === 'size') ? 'name' : this.listing.sort };
		this.refreshScheduler.schedule(0);
	}

	setSort(sort: FolderSortKey, reverse: boolean): void {
		this.listing = { ...this.listing, sort, reverse };
		this.refreshScheduler.schedule(0);
	}

	get currentSort(): { sort: FolderSortKey; reverse: boolean } {
		return { sort: this.listing.sort, reverse: this.listing.reverse };
	}

	refreshNow(): void {
		this.refreshScheduler.schedule(0);
	}

	revealFolder(): void {
		const folder = this.shownFolder().uri;
		if (folder) {
			this.commandService.executeCommand('revealFileInOS', folder);
		}
	}

	private showContextMenu(e: ITreeContextMenuEvent<IFolderEntry | null>): void {
		const entry = e.element;
		if (!entry || entry.kind === 'more') {
			return;
		}
		const actions: IAction[] = [];
		if (entry.kind === 'parent' || entry.isDirectory) {
			actions.push(toAction({ id: 'ddo.folder.cd', label: localize('ddo.folder.goThere', "Go There in the Terminal"), run: () => this.goInto(entry) }));
		} else if (entry.mark !== 'removed') {
			actions.push(toAction({ id: 'ddo.folder.open', label: localize('ddo.folder.open', "Open"), run: () => this.editorService.openEditor({ resource: entry.resource, options: { pinned: true } }) }));
			actions.push(toAction({ id: 'ddo.folder.openSide', label: localize('ddo.folder.openSide', "Open to the Side"), run: () => this.editorService.openEditor({ resource: entry.resource, options: { pinned: true } }, SIDE_GROUP) }));
		}
		if (entry.kind === 'entry' && entry.mark !== 'removed') {
			actions.push(new Separator());
			actions.push(toAction({ id: 'ddo.folder.insert', label: localize('ddo.folder.insert', "Insert Path in the Terminal"), run: () => this.insertInTerminal(entry) }));
			actions.push(toAction({
				id: 'ddo.folder.copyPath', label: localize('ddo.folder.copyPath', "Copy Path"), run: () => {
					const folder = this.shownFolder().path;
					return this.clipboardService.writeText(folder ? this.resolvePath(this.nativeRelative(entry), folder) : entry.name);
				}
			}));
			actions.push(toAction({ id: 'ddo.folder.copyName', label: localize('ddo.folder.copyName', "Copy Name"), run: () => this.clipboardService.writeText(entry.name) }));
			actions.push(toAction({ id: 'ddo.folder.reveal', label: localize('ddo.folder.revealItem', "Reveal in File Explorer"), run: () => this.commandService.executeCommand('revealFileInOS', entry.resource) }));
		}
		if (actions.length) {
			this.contextMenuService.showContextMenu({ getAnchor: () => e.anchor, getActions: () => actions });
		}
	}

	private createDragAndDrop(): ITreeDragAndDrop<IFolderEntry> {
		const instantiationService = this.instantiationService;
		return {
			getDragURI: entry => entry.kind === 'entry' && entry.mark !== 'removed' ? entry.resource.toString() : null,
			getDragLabel: entries => entries.length === 1 ? entries[0].name : undefined,
			onDragStart: (data: IDragAndDropData, originalEvent: DragEvent) => {
				const entries = (data as ElementsDragAndDropData<IFolderEntry>).elements.filter(entry => entry.kind === 'entry' && entry.mark !== 'removed');
				if (entries.length) {
					instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, entries.map(entry => entry.resource), originalEvent));
				}
			},
			onDragOver: () => false,
			drop: () => { },
			dispose: () => { },
		};
	}
}

// --- The view, next to the terminal in the terminal's panel

function registerFolderView(container: ViewContainer): void {
	Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
		id: FOLDER_VIEW_ID,
		name: localize2('ddo.folder.name', "Folder"),
		containerIcon: Codicon.folder,
		ctorDescriptor: new SyncDescriptor(ForgeFolderView),
		canToggleVisibility: true,
		canMoveView: true,
		// A third of the width next to the terminal (whose weight is the default, 20)
		weight: 10,
		// After the terminal, which has no order (sorted as Number.MAX_VALUE)
		order: Number.POSITIVE_INFINITY,
	}], container);
}

const viewContainers = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const terminalContainer = viewContainers.get(TERMINAL_VIEW_ID);
if (terminalContainer) {
	registerFolderView(terminalContainer);
} else {
	const listener = viewContainers.onDidRegister(({ viewContainer }) => {
		if (viewContainer.id === TERMINAL_VIEW_ID) {
			listener.dispose();
			registerFolderView(viewContainer);
		}
	});
}

// --- Title actions

function folderView(accessor: ServicesAccessor): ForgeFolderView | undefined {
	return accessor.get(IViewsService).getViewWithId<ForgeFolderView>(FOLDER_VIEW_ID) ?? undefined;
}

const inFolderView = ContextKeyExpr.equals('view', FOLDER_VIEW_ID);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'ddo.folder.toggleHidden',
			title: localize2('ddo.folder.showHidden', "Show Hidden Files"),
			icon: Codicon.eyeClosed,
			toggled: { condition: ShowsHiddenContext, icon: Codicon.eye, title: localize('ddo.folder.hideHidden', "Hide Hidden Files") },
			menu: { id: MenuId.ViewTitle, when: inFolderView, group: 'navigation', order: 1 },
		});
	}
	run(accessor: ServicesAccessor): void {
		folderView(accessor)?.toggleHidden();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'ddo.folder.toggleDetails',
			title: localize2('ddo.folder.showDetails', "Show Sizes and Dates"),
			icon: Codicon.listFlat,
			toggled: { condition: ShowsDetailsContext, title: localize('ddo.folder.hideDetails', "Hide Sizes and Dates") },
			menu: { id: MenuId.ViewTitle, when: inFolderView, group: 'navigation', order: 2 },
		});
	}
	run(accessor: ServicesAccessor): void {
		folderView(accessor)?.toggleDetails();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'ddo.folder.sort',
			title: localize2('ddo.folder.sortBy', "Sort By..."),
			icon: Codicon.listOrdered,
			menu: { id: MenuId.ViewTitle, when: inFolderView, group: 'navigation', order: 3 },
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const view = folderView(accessor);
		if (!view) {
			return;
		}
		const quickInputService = accessor.get(IQuickInputService);
		const current = view.currentSort;
		const items: (IQuickPickItem & { sort: FolderSortKey; reverse: boolean })[] = [
			{ sort: 'name', reverse: false, label: localize('ddo.folder.sortName', "Name"), description: 'ls' },
			{ sort: 'time', reverse: false, label: localize('ddo.folder.sortTime', "Newest First"), description: 'ls -t' },
			{ sort: 'time', reverse: true, label: localize('ddo.folder.sortTimeOld', "Oldest First"), description: 'ls -tr' },
			{ sort: 'size', reverse: false, label: localize('ddo.folder.sortSize', "Largest First"), description: 'ls -S' },
			{ sort: 'extension', reverse: false, label: localize('ddo.folder.sortExtension', "Type"), description: 'ls -X' },
		];
		const picked = await quickInputService.pick(items, {
			placeHolder: localize('ddo.folder.sortPlaceholder', "Sort the folder by"),
			activeItem: items.find(item => item.sort === current.sort && item.reverse === current.reverse),
		});
		if (picked) {
			view.setSort(picked.sort, picked.reverse);
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'ddo.folder.follow',
			title: localize2('ddo.folder.followTerminal', "Back to the Terminal's Folder"),
			icon: Codicon.target,
			menu: { id: MenuId.ViewTitle, when: ContextKeyExpr.and(inFolderView, ShowsOtherFolderContext), group: 'navigation', order: 4 },
		});
	}
	run(accessor: ServicesAccessor): void {
		folderView(accessor)?.followTerminal();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'ddo.folder.refresh',
			title: localize2('ddo.folder.refresh', "Refresh"),
			icon: Codicon.refresh,
			menu: { id: MenuId.ViewTitle, when: inFolderView, group: 'navigation', order: 5 },
		});
	}
	run(accessor: ServicesAccessor): void {
		folderView(accessor)?.refreshNow();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'ddo.folder.revealFolder',
			title: localize2('ddo.folder.revealFolder', "Open in File Explorer"),
			menu: { id: MenuId.ViewTitle, when: inFolderView, group: 'more', order: 1 },
		});
	}
	run(accessor: ServicesAccessor): void {
		folderView(accessor)?.revealFolder();
	}
});
