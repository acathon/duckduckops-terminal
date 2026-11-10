/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../nls.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { IChatPetService } from '../../workbench/contrib/chat/browser/chatPetService.js';

// The chat pet is the duck (product.json `forge.petSprites`). VS Code shows it with
// the /vscode-pet chat command; this puts it in the Command Palette too.
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'ddo.toggleDuckPet',
			title: localize2('ddo.toggleDuckPet', "Show or Hide the Duck"),
			category: localize2('ddo.category', "DuckDuckOps"),
			f1: true,
		});
	}

	run(accessor: ServicesAccessor): void {
		accessor.get(IChatPetService).toggle();
	}
});
