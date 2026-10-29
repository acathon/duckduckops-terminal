/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/forge.css';
import { mainWindow } from '../../base/browser/window.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { localize } from '../../nls.js';
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
import { ForgeTerminalGreetingContribution, TERMINAL_GREETING_SETTING } from './forgeTerminalGreeting.js';

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
		'window.autoDetectColorScheme': true,
		// The duck greets in the first terminal instead, see `ForgeTerminalGreetingContribution`
		'terminal.integrated.initialHint': false,
		// Copilot CLI sessions and the Codex agent need the Copilot CLI runtime
		// (Agent Host), see `forge.copilotRuntime`
		...(product.forge?.copilotRuntime ? {} : {
			'github.copilot.chat.backgroundAgent.enabled': false,
			'chat.agentHost.codexAgent.enabled': false,
		}),
	},
	donotCache: true,
	preventExperimentOverride: true,
	source: 'forgeDefaults'
}]);

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	id: 'ddo',
	title: 'DuckDuckOps',
	type: 'object',
	properties: {
		[TERMINAL_GREETING_SETTING]: {
			type: 'boolean',
			default: true,
			description: localize('ddo.terminal.greeting', "Show the duck and how to reach the chat in the first terminal of a window."),
		}
	}
});

registerWorkbenchContribution2(ForgeTerminalGreetingContribution.ID, ForgeTerminalGreetingContribution, WorkbenchPhase.BlockRestore);

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
