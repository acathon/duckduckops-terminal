/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../platform/instantiation/common/extensions.js';
import { AgentHostEnablementService } from '../../platform/agentHost/browser/agentHostEnablementService.js';
import { IAgentHostEnablementService } from '../../platform/agentHost/common/agentHostEnablementService.js';
import { IManagedSettingsService } from '../../platform/policy/common/copilotManagedSettings.js';
import { IProductService } from '../../platform/product/common/productService.js';

/**
 * DuckDuckOps ships the Agent Host runtime (the Copilot CLI SDK) only when
 * `forge.copilotRuntime` is set in product.json. Without it the Agent Host
 * process is never started and its UI stays hidden.
 */
class ForgeAgentHostEnablementService extends AgentHostEnablementService {
	constructor(
		@IProductService productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IManagedSettingsService managedSettingsService: IManagedSettingsService,
	) {
		super(productService.forge?.copilotRuntime === true, configurationService, contextKeyService, managedSettingsService);
	}
}

registerSingleton(IAgentHostEnablementService, ForgeAgentHostEnablementService, InstantiationType.Eager);
