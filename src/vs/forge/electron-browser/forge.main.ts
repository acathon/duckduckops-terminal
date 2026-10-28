/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServiceCollection } from '../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../platform/log/common/log.js';
import { INativeWindowConfiguration } from '../../platform/window/common/window.js';
import { IWorkbenchOptions, Workbench } from '../../workbench/browser/workbench.js';
import { DesktopMain } from '../../workbench/electron-browser/desktop.main.js';
import { ForgeWorkbench } from '../browser/forgeWorkbench.js';

class ForgeDesktopMain extends DesktopMain {

	protected override createWorkbench(parent: HTMLElement, options: IWorkbenchOptions, serviceCollection: ServiceCollection, logService: ILogService): Workbench {
		return new ForgeWorkbench(parent, options, serviceCollection, logService);
	}
}

export function main(configuration: INativeWindowConfiguration): Promise<void> {
	const workbench = new ForgeDesktopMain(configuration);

	return workbench.open();
}
