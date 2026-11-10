/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/forge.css';
import './media/forgeIcons.css';
import './forgeDuo.js';
import './forgeFolder.js';
import './forgePet.js';
import { mainWindow } from '../../base/browser/window.js';
import { Codicon } from '../../base/common/codicons.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { localize } from '../../nls.js';
import { MenuId, MenuRegistry } from '../../platform/actions/common/actions.js';
import { BrowserViewCommandId } from '../../platform/browserView/common/browserView.js';
import { Extensions, IConfigurationRegistry } from '../../platform/configuration/common/configurationRegistry.js';
import product from '../../platform/product/common/product.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../workbench/common/contributions.js';
import { IViewContainersRegistry, ViewContainerLocation, Extensions as ViewExtensions } from '../../workbench/common/views.js';
import { VIEWLET_ID as EXTENSIONS_VIEWLET_ID } from '../../workbench/contrib/extensions/common/extensions.js';
import { VIEWLET_ID as EXPLORER_VIEWLET_ID } from '../../workbench/contrib/files/common/files.js';
import { IEditorGroupsService } from '../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../workbench/services/editor/common/editorService.js';
import { IWorkbenchLayoutService, Parts } from '../../workbench/services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../workbench/services/panecomposite/browser/panecomposite.js';

// The files contribution (opening files) also registers the Explorer view
// container. Take it out again before the views service picks it up: views
// that are later registered into it are then ignored.
const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const explorerViewContainer = viewContainersRegistry.get(EXPLORER_VIEWLET_ID);
if (explorerViewContainer) {
	viewContainersRegistry.deregisterViewContainer(explorerViewContainer);
}

// Defaults for the terminal-first layout, see `ForgeWorkbench`: the terminal
// (panel) above the files and browser pages (editor), the chat (secondary side
// bar) to their right, and the primary side bar (Extensions, Accounts) on the
// far right next to a compact activity bar. The title bar has buttons to
// toggle each part. The theme follows the Windows light or dark mode. Only the
// DuckDuckOps window loads this file.
Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerDefaultConfigurations([{
	overrides: {
		'workbench.startupEditor': 'none',
		'workbench.tips.enabled': false,
		'onboarding.enabled': false,
		'workbench.panel.defaultLocation': 'top',
		'workbench.sideBar.location': 'right',
		'workbench.secondarySideBar.defaultVisibility': 'visible',
		'workbench.activityBar.compact': true,
		'workbench.layoutControl.enabled': true,
		'workbench.layoutControl.type': 'toggles',
		'workbench.experimental.modernUI': true,
		// The parts are cards with gaps between them (wider than in VS Code, see
		// `forge.css`), the menu is a button in the activity bar, the terminal and
		// chat titles show icons instead of labels
		'window.menuBarVisibility': 'compact',
		'workbench.panel.showLabels': false,
		'workbench.secondarySideBar.showLabels': false,
		// Forge Light and Forge Dark from the `ddo` extension
		'window.autoDetectColorScheme': true,
		'workbench.preferredLightColorTheme': 'Forge Light',
		'workbench.preferredDarkColorTheme': 'Forge Dark',
		// Forge Icons from the `ddo` extension: Phosphor's duotone icons, one colour per
		// kind of file (build/ddo/forgeIcons.ts)
		'workbench.iconTheme': 'forge-icons',
		// The Duck agents (Lead, Operator, Reviewer) that the `ddo` extension writes
		// on first start, next to the usual agent folders
		'chat.agentFilesLocations': {
			'.github/agents': true,
			'.claude/agents': true,
			'~/.copilot/agents': true,
			'~/.ddo/agents': true,
		},
		// The terminal is shared: commands that the chat runs show in the terminal,
		// not only in the chat
		'chat.tools.terminal.outputLocation': 'terminal',
		// Added to Copilot's own rules (object defaults merge): ops diagnostics run
		// without asking, changes to services, machines and clusters always ask
		'chat.tools.terminal.autoApprove': {
			'/^(uptime|hostname|whoami|id|date|uname|free|lsblk|ps|ss|netstat|nslookup|dig|host|systeminfo|tasklist)\\b/': true,
			'/^ip\\s+(a|addr|address|r|route|link)(\\s+(show|list))?\\s*$/': true,
			'/^ipconfig(\\s+\\/all)?\\s*$/i': true,
			'/^ping\\s+(-c|-n)\\s+\\d+\\s+\\S+$/': true,
			'/^(systemctl|service)\\s+(status|is-active|is-enabled|list-units|list-unit-files)\\b/': true,
			'/^journalctl\\b(?!.*--(vacuum|rotate|flush))/': true,
			'/^kubectl\\s+(get|describe|logs|top|version|explain|api-resources|cluster-info)\\b/': true,
			'/^kubectl\\s+config\\s+(view|get-contexts|current-context)\\b/': true,
			'/^(Test-NetConnection|Resolve-DnsName|Get-NetIPAddress|Get-NetAdapter)\\b/i': true,
			'/^(shutdown|reboot|halt|poweroff|Restart-Computer|Stop-Computer|format|mkfs\\S*|dd)\\b/i': false,
			'/^(systemctl|service)\\s+(stop|restart|disable|mask|kill)\\b/': false,
			'/^(Stop-Service|Restart-Service|Set-Service|Stop-Process)\\b/i': false,
			'/^kubectl\\s+(delete|drain|cordon|scale|rollout|apply|edit|patch|replace)\\b/': false,
			'/^(terraform|tofu)\\s+(apply|destroy|import|state)\\b/': false,
			'/^helm\\s+(install|upgrade|uninstall|rollback)\\b/': false,
			'/^docker\\s+(rm|rmi|kill|stop|restart|system\\s+prune|volume\\s+rm|network\\s+rm)\\b/': false,
		},
		// The Copilot harness (Agent Host, `forge.copilotRuntime`) can be picked in the
		// chat's session target, but new chats keep the Local harness, where @duck and
		// the Duck agents run. No Codex agent, and no terminal hint to type `copilot`.
		'chat.defaultToCopilotHarness': false,
		'chat.editor.preferCopilotHarness': false,
		'chat.agentHost.codexAgent.enabled': false,
		'terminal.integrated.initialHint': false,
		...(product.forge?.copilotRuntime ? {} : {
			'github.copilot.chat.backgroundAgent.enabled': false,
		}),
	},
	donotCache: true,
	preventExperimentOverride: true,
	source: 'forgeDefaults'
}]);

// The integrated browser, one click away in the title bar
MenuRegistry.appendMenuItem(MenuId.TitleBar, {
	command: {
		id: BrowserViewCommandId.Open,
		title: localize('forge.openBrowser', "Open Integrated Browser"),
		icon: Codicon.globe,
	},
	group: 'navigation',
	order: 1,
});

/**
 * Starts every window with the terminal and the primary side bar shown.
 * Showing the terminal panel creates a terminal when there is none. With the
 * Explorer removed the side bar has no default view, so it opens Extensions
 * unless a view is already restored there.
 */
class ForgeStartupLayoutContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.forgeStartupLayout';

	constructor(
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IPaneCompositePartService paneCompositeService: IPaneCompositePartService
	) {
		super();

		layoutService.setPartHidden(false, Parts.PANEL_PART);
		if (!paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar)) {
			paneCompositeService.openPaneComposite(EXTENSIONS_VIEWLET_ID, ViewContainerLocation.Sidebar, false);
		}
		layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
	}
}

registerWorkbenchContribution2(ForgeStartupLayoutContribution.ID, ForgeStartupLayoutContribution, WorkbenchPhase.AfterRestored);

/**
 * Shows the editor area below the terminal only while it has something open
 * (a file, a log, a browser page). Otherwise the terminal takes the full height.
 */
class ForgeEditorAreaContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.forgeEditorArea';

	constructor(
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IEditorService editorService: IEditorService
	) {
		super();

		this._register(editorService.onDidEditorsChange(() => this.update()));
		this.update();
	}

	private update(): void {
		const hasEditors = this.editorGroupsService.mainPart.groups.some(group => !group.isEmpty);
		if (this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow) !== hasEditors) {
			this.layoutService.setPartHidden(!hasEditors, Parts.EDITOR_PART);
		}
	}
}

registerWorkbenchContribution2(ForgeEditorAreaContribution.ID, ForgeEditorAreaContribution, WorkbenchPhase.AfterRestored);
