/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Workbench } from '../../workbench/browser/workbench.js';
import { isHorizontal, PanelAlignment, Position } from '../../workbench/services/layout/browser/layoutService.js';

/**
 * The DuckDuckOps workbench: the standard workbench parts in a terminal-first
 * arrangement. With the panel (terminal) above the editor (files and browser
 * pages) and the primary side bar on the right, the standard layout puts the
 * secondary side bar (chat) on the left. This workbench keeps it to the right of
 * the terminal instead, between the terminal and the primary side bar:
 *
 * ```
 * +-------------------+--------+----------+----+
 * |     terminal      |        |          |    |
 * +-------------------+  chat  | side bar | AB |
 * |  files, browser   |        |          |    |
 * +-------------------+--------+----------+----+
 * ```
 *
 * Any other panel or side bar position keeps the standard arrangement.
 */
export class ForgeWorkbench extends Workbench {

	private auxiliaryBarPlaced = false;

	protected override createWorkbenchLayout(): void {
		super.createWorkbenchLayout();

		this.placeAuxiliaryBarAfterEditorColumn();
	}

	protected override adjustPartPositions(sideBarPosition: Position, panelAlignment: PanelAlignment, panelPosition: Position): void {
		super.adjustPartPositions(sideBarPosition, panelAlignment, panelPosition);

		// The base layout moves the secondary side bar back to the far left
		this.auxiliaryBarPlaced = false;
		this.placeAuxiliaryBarAfterEditorColumn();
	}

	private placeAuxiliaryBarAfterEditorColumn(): void {
		if (
			this.auxiliaryBarPlaced ||
			this.getSideBarPosition() !== Position.RIGHT ||
			!isHorizontal(this.getPanelPosition()) ||
			this.getPanelAlignment() !== 'center'
		) {
			return;
		}

		// The middle row (title bar and banner come first) is then
		// [secondary side bar, editor and panel, side bar, activity bar].
		// Moving a view right counts the target index before the view is
		// taken out, so index 2 puts it between the editor column and side bar.
		this.workbenchGrid.moveViewTo(this.auxiliaryBarPartView, [2, 2]);

		this.auxiliaryBarPlaced = true;
	}
}
