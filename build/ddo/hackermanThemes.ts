/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Builds Forge Hackerman Dark and Light from Forge Dark and Light: the same
// layout and every colour key, with a phosphor-green palette, a green terminal
// and green, cyan and amber syntax colours. Run it again after changing a Forge
// theme.
//
//   node build/ddo/hackermanThemes.ts

import * as fs from 'fs';
import * as path from 'path';

const themes = path.join(import.meta.dirname, '..', '..', 'extensions', 'ddo', 'themes');

interface IVariant {
	readonly from: string;
	readonly to: string;
	readonly name: string;
	/** Forge colour (6 digits, upper case) to Hackerman colour; an alpha suffix is kept */
	readonly palette: Record<string, string>;
	/** Keys set outright, after the palette */
	readonly colors: Record<string, string>;
}

const dark: IVariant = {
	from: 'forge-dark-color-theme.json',
	to: 'forge-hackerman-dark-color-theme.json',
	name: 'Forge Hackerman Dark',
	palette: {
		// Frame, surfaces, lines
		'#141517': '#040704', '#18191B': '#060A06', '#1E1F22': '#0A110B', '#26282C': '#0F1A12', '#26282E': '#0F1A12',
		'#2B2D30': '#11201A', '#2E3035': '#163020', '#313438': '#1A3022', '#373B41': '#1C3322', '#393B40': '#1C3322',
		'#3B3D42': '#22402A', '#43454A': '#24432C', '#4B5059': '#2B4F34', '#4E5157': '#2D5235', '#5A5D63': '#3B6A45',
		// Text, from dim to bright
		'#6F737A': '#4F8A5B', '#7A7E85': '#5A9466', '#868A91': '#63A872', '#A1A3AB': '#82CC90', '#BABABA': '#A3E3AD',
		'#BCBEC4': '#A9EBB3', '#CED0D6': '#BFF5C6', '#DFE1E5': '#CCFFD3', '#FFFFFF': '#F0FFF2',
		// The accent: neon green instead of blue
		'#3574F0': '#00E05A', '#366ACE': '#00B84A', '#375FAD': '#0A8F3C', '#548AF7': '#39FF88', '#6E9EF8': '#7DFFAD',
		'#2E436E': '#0F3D1E', '#35497A': '#145026', '#25324D': '#0D2A16', '#2E3B57': '#10301A', '#2B3A59': '#10301A', '#214283': '#145A2A',
		// Syntax and states
		'#CF8E6D': '#00FFA3', '#6AAB73': '#B4FF39', '#56A8F5': '#4DE8FF', '#2AACB8': '#FFD866', '#C77DBB': '#7CF0B4',
		'#E0B95C': '#FFC94D', '#B3AE60': '#D6E85C', '#8888C6': '#8BE9C9', '#94558D': '#5FD38D', '#5FB865': '#3DDC84',
		'#549159': '#2FB45A', '#5F826B': '#4F8A5B', '#D5B778': '#E6D27A', '#F2C55C': '#FFD54F', '#E08855': '#FF9F43',
		'#D79BD1': '#9BF5C4', '#47C5CF': '#5CF2FF', '#F75464': '#FF4D6A', '#FA6675': '#FF6B81',
		'#32593D': '#1E5C2E', '#2D543F': '#1E5C2E', '#402929': '#3A1418', '#3D3223': '#3A3010', '#3C2F3E': '#1F3A2A',
	},
	colors: {
		'button.foreground': '#021A08',
		'button.hoverBackground': '#2BFF7A',
		'statusBarItem.prominentForeground': '#021A08',
		'badge.foreground': '#021A08',
		'activityBarBadge.foreground': '#021A08',
		'terminal.foreground': '#33FF66',
		'terminalCursor.foreground': '#33FF66',
		'terminal.ansiBlack': '#0A110B',
		'terminal.ansiRed': '#FF4D6A',
		'terminal.ansiGreen': '#00FF66',
		'terminal.ansiYellow': '#FFD84D',
		'terminal.ansiBlue': '#3D9BFF',
		'terminal.ansiMagenta': '#D86BFF',
		'terminal.ansiCyan': '#3DF5F5',
		'terminal.ansiWhite': '#B8F5C0',
		'terminal.ansiBrightBlack': '#4F8A5B',
		'terminal.ansiBrightRed': '#FF7A90',
		'terminal.ansiBrightGreen': '#7DFFAD',
		'terminal.ansiBrightYellow': '#FFE680',
		'terminal.ansiBrightBlue': '#78B8FF',
		'terminal.ansiBrightMagenta': '#E59BFF',
		'terminal.ansiBrightCyan': '#8AFFFF',
		'terminal.ansiBrightWhite': '#F0FFF2',
	},
};

const light: IVariant = {
	from: 'forge-light-color-theme.json',
	to: 'forge-hackerman-light-color-theme.json',
	name: 'Forge Hackerman Light',
	palette: {
		// Frame, surfaces, lines
		'#FFFFFF': '#F7FFF8', '#F7F8FA': '#EEF8F0', '#F5F8FE': '#EEFAF1', '#F2F4F7': '#EAF5EC', '#ECEEF1': '#E4F2E7',
		'#EBECF0': '#DCEEDF', '#E6E9EE': '#D5EAD9', '#DFE1E5': '#CDE5D2', '#DCDFE6': '#C6E0CB', '#D3D7DF': '#BFDCC5',
		'#D3D5DB': '#BFDCC5', '#C9CCD6': '#A9CFB1', '#AEB3C2': '#86B591', '#A8ADBD': '#7FAF8A', '#8C8C8C': '#6B8F72',
		// Text
		'#767A8A': '#4F7457', '#6C707E': '#4A6B52', '#1E1F22': '#0B2912', '#080808': '#031A08', '#000000': '#031A08',
		// The accent: deep green instead of blue
		'#3574F0': '#0A8F3C', '#2A5ED6': '#087A33', '#3369D6': '#087A33', '#4682FA': '#12A84A', '#174AD4': '#066B2C',
		'#1750EB': '#B26B00', '#0037A6': '#066B2C', '#EDF3FF': '#E2F7E7', '#D5E1FF': '#C5EDD0', '#E3ECFF': '#D4F2DC',
		'#A6D2FF': '#9BE3AE', '#EDEBFC': '#E3F5E6',
		// Syntax and states
		'#0033B3': '#0A6E3A', '#067D17': '#5C7A00', '#871094': '#00796B', '#00627A': '#006D77', '#9E880D': '#8A7300',
		'#9E7A00': '#8A6A00', '#C27D04': '#B26B00', '#A46704': '#8F5600', '#000080': '#0B4F2A', '#1A8A9E': '#00838F',
		'#A93FB5': '#2F8F4F', '#94558D': '#3E7C17', '#3A9440': '#2E8B3A', '#5FB865': '#2FA84F',
	},
	colors: {
		'button.foreground': '#F7FFF8',
		'terminal.foreground': '#0B5D24',
		'terminalCursor.foreground': '#0A8F3C',
		'terminal.ansiBlack': '#031A08',
		'terminal.ansiRed': '#C7222D',
		'terminal.ansiGreen': '#0A8F3C',
		'terminal.ansiYellow': '#8F6A00',
		'terminal.ansiBlue': '#0B5FA5',
		'terminal.ansiMagenta': '#8E2C9E',
		'terminal.ansiCyan': '#00838F',
		'terminal.ansiWhite': '#86B591',
		'terminal.ansiBrightBlack': '#4A6B52',
		'terminal.ansiBrightRed': '#E5484D',
		'terminal.ansiBrightGreen': '#12A84A',
		'terminal.ansiBrightYellow': '#B28600',
		'terminal.ansiBrightBlue': '#1F7AD1',
		'terminal.ansiBrightMagenta': '#A84DBA',
		'terminal.ansiBrightCyan': '#13A3AE',
		'terminal.ansiBrightWhite': '#CDE5D2',
	},
};

for (const variant of [dark, light]) {
	const source = fs.readFileSync(path.join(themes, variant.from), 'utf8');
	const missing = new Set<string>();
	let text = source.replace(/#([0-9A-Fa-f]{6})([0-9A-Fa-f]{2})?\b/g, (match, rgb: string, alpha: string | undefined) => {
		const mapped = variant.palette[`#${rgb.toUpperCase()}`];
		if (!mapped) {
			if (rgb !== '000000' && rgb.toUpperCase() !== '808080' && rgb.toUpperCase() !== '7F7F7F') {
				missing.add(`#${rgb.toUpperCase()}`);
			}
			return match;
		}
		return mapped + (alpha ?? '');
	});
	const theme = JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
	theme.name = variant.name;
	Object.assign(theme.colors, variant.colors);
	text = JSON.stringify(theme, null, '\t') + '\n';
	fs.writeFileSync(path.join(themes, variant.to), text);
	console.log(`${variant.to}${missing.size ? `, kept from Forge: ${[...missing].join(' ')}` : ''}`);
}
