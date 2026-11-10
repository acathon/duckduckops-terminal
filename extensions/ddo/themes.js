/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check

// Choose Theme: Forge or Forge Hackerman, light, dark, or like Windows (light or
// dark following the Windows setting, through window.autoDetectColorScheme).

const vscode = require('vscode');

const families = [
	{ name: 'Forge', light: 'Forge Light', dark: 'Forge Dark' },
	{ name: 'Forge Hackerman', light: 'Forge Hackerman Light', dark: 'Forge Hackerman Dark' },
];

/**
 * @typedef {vscode.QuickPickItem & { apply?: () => Thenable<void>, current?: boolean }} ThemeItem
 */

async function chooseTheme() {
	const config = vscode.workspace.getConfiguration();
	const followsWindows = config.get('window.autoDetectColorScheme', false);
	const preferredLight = config.get('workbench.preferredLightColorTheme');
	const preferredDark = config.get('workbench.preferredDarkColorTheme');
	const current = config.get('workbench.colorTheme');
	const global = vscode.ConfigurationTarget.Global;

	/** @type {ThemeItem[]} */
	const items = [];
	for (const family of families) {
		items.push({ label: family.name, kind: vscode.QuickPickItemKind.Separator });
		items.push({
			label: `$(color-mode) ${family.name}`,
			description: 'like Windows: light or dark',
			current: followsWindows && preferredLight === family.light && preferredDark === family.dark,
			apply: async () => {
				await config.update('workbench.preferredLightColorTheme', family.light, global);
				await config.update('workbench.preferredDarkColorTheme', family.dark, global);
				await config.update('window.autoDetectColorScheme', true, global);
			},
		});
		for (const [icon, theme] of [['$(sun)', family.light], ['$(moon)', family.dark]]) {
			items.push({
				label: `${icon} ${theme}`,
				current: !followsWindows && current === theme,
				apply: async () => {
					await config.update('window.autoDetectColorScheme', false, global);
					await config.update('workbench.colorTheme', theme, global);
				},
			});
		}
	}
	for (const item of items) {
		if (item.current) {
			item.description = item.description ? `${item.description} (current)` : 'current';
		}
	}

	const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Choose a theme', matchOnDescription: true });
	await picked?.apply?.();
}

module.exports = { chooseTheme };
