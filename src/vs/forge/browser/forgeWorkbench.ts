/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Workbench } from '../../workbench/browser/workbench.js';

/**
 * The DuckDuckOps workbench: the standard workbench parts in a terminal-first
 * arrangement. With the primary side bar on the right, the standard layout puts
 * the secondary side bar on the left, which is where DuckDuckOps wants its folder
 * panel; the chat is moved to the primary side bar (`forge.contribution.ts`):
 *
 * ```
 * +--------+-------------------+----------+----+
 * | folder |  files, browser   |   chat,  |    |
 * |        +-------------------+ Sessions | AB |
 * |        |     terminal      |          |    |
 * +--------+-------------------+----------+----+
 * ```
 *
 * Until 0.7.2 the chat was the secondary side bar, and this class moved it to the
 * right of the terminal; the layout is now VS Code's own.
 */
export class ForgeWorkbench extends Workbench { }
