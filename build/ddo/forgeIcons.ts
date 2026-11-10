/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Builds DuckDuckOps' icons from Phosphor's duotone icons (MIT, phosphoricons.com):
// - "Forge Icons", the file icon theme of the `ddo` extension: one colour per kind
//   of file or folder (extensions/ddo/icons);
// - the activity bar icons, as masks that take the theme's colours
//   (src/vs/forge/browser/media/forgeIcons.css), and the Sessions icon.
//
//   npm pack @phosphor-icons/core && tar -xzf phosphor-icons-core-*.tgz
//   node build/ddo/forgeIcons.ts <unpacked package folder>

import * as fs from 'fs';
import * as path from 'path';

const root = path.join(import.meta.dirname, '..', '..');
const phosphor = process.argv[2];
if (!phosphor) {
	console.error('usage: node build/ddo/forgeIcons.ts <unpacked @phosphor-icons/core folder>');
	process.exit(2);
}

function svg(icon: string): string {
	const file = path.join(phosphor, 'assets', 'duotone', `${icon}-duotone.svg`);
	return fs.readFileSync(file, 'utf8').trim();
}

/** The icon in one colour, its light layer a bit stronger than Phosphor's 20% so the colour shows */
function colored(icon: string, color: string): string {
	return svg(icon).replace('fill="currentColor"', `fill="${color}"`).replace(/opacity="0\.2"/g, 'opacity="0.32"');
}

// Kinds of files and folders: [Phosphor icon, colour]. The colours read on light and dark themes.
const kinds: Record<string, [string, string]> = {
	'file': ['file', '#8A9AA9'],
	'folder': ['folder-simple', '#E2A33B'],
	'folder-open': ['folder-open', '#E2A33B'],
	'folder-git': ['folder-simple', '#F05033'],
	'folder-git-open': ['folder-open', '#F05033'],
	'folder-dev': ['folder-simple-star', '#5C6BC0'],
	'folder-dev-open': ['folder-open', '#5C6BC0'],
	'folder-src': ['folder-simple', '#42A5F5'],
	'folder-src-open': ['folder-open', '#42A5F5'],
	'folder-docs': ['folder-simple', '#29B6F6'],
	'folder-docs-open': ['folder-open', '#29B6F6'],
	'folder-scripts': ['folder-simple', '#43A047'],
	'folder-scripts-open': ['folder-open', '#43A047'],
	'folder-config': ['folder-simple', '#78909C'],
	'folder-config-open': ['folder-open', '#78909C'],
	'folder-logs': ['folder-simple', '#90A4AE'],
	'folder-logs-open': ['folder-open', '#90A4AE'],
	'folder-build': ['folder-simple', '#8D6E63'],
	'folder-build-open': ['folder-open', '#8D6E63'],
	'folder-test': ['folder-simple', '#26A69A'],
	'folder-test-open': ['folder-open', '#26A69A'],
	'folder-packages': ['folder-simple', '#7CB342'],
	'folder-packages-open': ['folder-open', '#7CB342'],
	'folder-secure': ['folder-simple-lock', '#7E57C2'],
	'folder-secure-open': ['folder-open', '#7E57C2'],
	'log': ['article', '#90A4AE'],
	'text': ['file-txt', '#90A4AE'],
	'markdown': ['file-md', '#42A5F5'],
	'readme': ['book-open-text', '#42A5F5'],
	'json': ['brackets-curly', '#E2B714'],
	'yaml': ['file-code', '#E5534B'],
	'xml': ['file-code', '#FF8A65'],
	'config': ['gear-six', '#78909C'],
	'ini': ['file-ini', '#78909C'],
	'env': ['lock-key', '#E2A33B'],
	'shell': ['terminal', '#43A047'],
	'powershell': ['terminal-window', '#2F80ED'],
	'batch': ['terminal-window', '#7E8B97'],
	'python': ['file-py', '#3B82C4'],
	'javascript': ['file-js', '#E2B714'],
	'typescript': ['file-ts', '#3178C6'],
	'jsx': ['file-jsx', '#22A6C9'],
	'tsx': ['file-tsx', '#22A6C9'],
	'html': ['file-html', '#E34F26'],
	'css': ['file-css', '#1572B6'],
	'vue': ['file-vue', '#41B883'],
	'code': ['file-code', '#8A9AA9'],
	'go': ['file-code', '#00ADD8'],
	'java': ['file-code', '#E76F00'],
	'ruby': ['file-code', '#CC342D'],
	'php': ['file-code', '#777BB4'],
	'rust': ['file-rs', '#CE422B'],
	'c': ['file-c', '#5C6BC0'],
	'cpp': ['file-cpp', '#00599C'],
	'csharp': ['file-c-sharp', '#8E44AD'],
	'sql': ['file-sql', '#F29111'],
	'database': ['database', '#0288D1'],
	'csv': ['file-csv', '#2E7D32'],
	'excel': ['file-xls', '#1D6F42'],
	'word': ['file-doc', '#2B579A'],
	'powerpoint': ['file-ppt', '#D24726'],
	'pdf': ['file-pdf', '#E53935'],
	'archive': ['file-zip', '#8D6E63'],
	'image': ['file-image', '#AB47BC'],
	'svg': ['file-svg', '#FFB300'],
	'audio': ['file-audio', '#EC407A'],
	'video': ['file-video', '#EF5350'],
	'certificate': ['certificate', '#C9A227'],
	'key': ['key', '#7E57C2'],
	'lock': ['file-lock', '#90A4AE'],
	'git': ['git-branch', '#F05033'],
	'docker': ['cube', '#2496ED'],
	'kubernetes': ['cube', '#326CE5'],
	'terraform': ['cube', '#7B42BC'],
	'package': ['package', '#CB3837'],
	'license': ['certificate', '#C9A227'],
	'make': ['gear-six', '#6D8086'],
	'hosts': ['globe', '#26A69A'],
	'sessions': ['hard-drives', '#26A69A'],
	'remote-desktop': ['app-window', '#0078D4'],
	'program': ['app-window', '#607D8B'],
	'disk': ['hard-drives', '#607D8B'],
	'diff': ['file-code', '#43A047'],
};

const fileExtensions: Record<string, string> = {
	'log': 'log', 'out': 'log', 'err': 'log', 'trace': 'log',
	'txt': 'text', 'text': 'text',
	'md': 'markdown', 'markdown': 'markdown',
	'json': 'json', 'jsonc': 'json', 'json5': 'json',
	'yaml': 'yaml', 'yml': 'yaml',
	'xml': 'xml', 'xsd': 'xml', 'xsl': 'xml', 'plist': 'xml', 'config': 'xml',
	'toml': 'config', 'conf': 'config', 'cfg': 'config', 'properties': 'config', 'service': 'config', 'socket': 'config', 'timer': 'config',
	'ini': 'ini', 'reg': 'ini', 'inf': 'ini',
	'env': 'env',
	'sh': 'shell', 'bash': 'shell', 'zsh': 'shell', 'fish': 'shell', 'ksh': 'shell',
	'ps1': 'powershell', 'psm1': 'powershell', 'psd1': 'powershell', 'ps1xml': 'powershell',
	'bat': 'batch', 'cmd': 'batch',
	'py': 'python', 'pyw': 'python', 'ipynb': 'python',
	'js': 'javascript', 'mjs': 'javascript', 'cjs': 'javascript',
	'ts': 'typescript', 'mts': 'typescript', 'cts': 'typescript',
	'jsx': 'jsx', 'tsx': 'tsx',
	'html': 'html', 'htm': 'html',
	'css': 'css', 'scss': 'css', 'sass': 'css', 'less': 'css',
	'vue': 'vue',
	'go': 'go', 'java': 'java', 'kt': 'java', 'rb': 'ruby', 'php': 'php', 'rs': 'rust',
	'c': 'c', 'h': 'c', 'cpp': 'cpp', 'cc': 'cpp', 'hpp': 'cpp', 'cs': 'csharp',
	'lua': 'code', 'pl': 'code', 'r': 'code', 'swift': 'code', 'groovy': 'code', 'gradle': 'code',
	'sql': 'sql',
	'db': 'database', 'sqlite': 'database', 'sqlite3': 'database', 'mdb': 'database', 'accdb': 'database',
	'csv': 'csv', 'tsv': 'csv',
	'xls': 'excel', 'xlsx': 'excel', 'xlsm': 'excel',
	'doc': 'word', 'docx': 'word', 'rtf': 'word', 'odt': 'word',
	'ppt': 'powerpoint', 'pptx': 'powerpoint',
	'pdf': 'pdf',
	'zip': 'archive', 'tar': 'archive', 'gz': 'archive', 'tgz': 'archive', '7z': 'archive', 'rar': 'archive', 'bz2': 'archive', 'xz': 'archive', 'zst': 'archive', 'cab': 'archive', 'nupkg': 'archive', 'deb': 'archive', 'rpm': 'archive', 'jar': 'archive',
	'png': 'image', 'jpg': 'image', 'jpeg': 'image', 'gif': 'image', 'bmp': 'image', 'webp': 'image', 'ico': 'image', 'tif': 'image', 'tiff': 'image',
	'svg': 'svg',
	'mp3': 'audio', 'wav': 'audio', 'flac': 'audio', 'ogg': 'audio', 'm4a': 'audio',
	'mp4': 'video', 'mkv': 'video', 'avi': 'video', 'mov': 'video', 'webm': 'video',
	'pem': 'certificate', 'crt': 'certificate', 'cer': 'certificate', 'csr': 'certificate', 'pfx': 'certificate', 'p12': 'certificate', 'der': 'certificate',
	'key': 'key', 'pub': 'key', 'ppk': 'key', 'gpg': 'key', 'asc': 'key', 'kdbx': 'key',
	'lock': 'lock',
	'tf': 'terraform', 'tfvars': 'terraform', 'hcl': 'terraform', 'tfstate': 'terraform',
	'rdp': 'remote-desktop',
	'exe': 'program', 'msi': 'program', 'dll': 'program', 'appx': 'program', 'msix': 'program',
	'iso': 'disk', 'img': 'disk', 'vhd': 'disk', 'vhdx': 'disk', 'vmdk': 'disk', 'qcow2': 'disk',
	'diff': 'diff', 'patch': 'diff',
	'dockerfile': 'docker',
};

const fileNames: Record<string, string> = {
	'dockerfile': 'docker', 'containerfile': 'docker', '.dockerignore': 'docker',
	'docker-compose.yml': 'docker', 'docker-compose.yaml': 'docker', 'compose.yml': 'docker', 'compose.yaml': 'docker',
	'.gitignore': 'git', '.gitattributes': 'git', '.gitmodules': 'git', '.gitconfig': 'git',
	'makefile': 'make', 'jenkinsfile': 'make', 'vagrantfile': 'make',
	'readme.md': 'readme', 'readme': 'readme', 'readme.txt': 'readme',
	'license': 'license', 'license.md': 'license', 'license.txt': 'license', 'copying': 'license',
	'package.json': 'package', 'package-lock.json': 'lock', 'yarn.lock': 'lock', 'pnpm-lock.yaml': 'lock',
	'.env': 'env', '.env.local': 'env', '.env.production': 'env', '.env.development': 'env', '.envrc': 'env',
	'id_rsa': 'key', 'id_ed25519': 'key', 'id_ecdsa': 'key', 'known_hosts': 'key', 'authorized_keys': 'key',
	'hosts': 'hosts', 'resolv.conf': 'hosts',
	'sessions.json': 'sessions',
	'kubeconfig': 'kubernetes', 'chart.yaml': 'kubernetes', 'kustomization.yaml': 'kubernetes',
	'.bashrc': 'shell', '.zshrc': 'shell', '.profile': 'shell', '.bash_profile': 'shell', '.bash_aliases': 'shell', '.bash_history': 'log',
	'microsoft.powershell_profile.ps1': 'powershell',
};

const folderNames: Record<string, string> = {
	'.git': 'folder-git',
	'.github': 'folder-dev', '.vscode': 'folder-dev', '.ddo': 'folder-dev', '.devcontainer': 'folder-dev',
	'src': 'folder-src', 'source': 'folder-src', 'lib': 'folder-src', 'app': 'folder-src',
	'docs': 'folder-docs', 'doc': 'folder-docs', 'documentation': 'folder-docs',
	'scripts': 'folder-scripts', 'script': 'folder-scripts', 'bin': 'folder-scripts', 'tools': 'folder-scripts', 'runbooks': 'folder-scripts',
	'config': 'folder-config', 'configs': 'folder-config', 'conf': 'folder-config', 'etc': 'folder-config', 'settings': 'folder-config',
	'log': 'folder-logs', 'logs': 'folder-logs',
	'dist': 'folder-build', 'build': 'folder-build', 'out': 'folder-build', 'target': 'folder-build', 'release': 'folder-build',
	'test': 'folder-test', 'tests': 'folder-test', '__tests__': 'folder-test', 'spec': 'folder-test',
	'node_modules': 'folder-packages', 'vendor': 'folder-packages', 'packages': 'folder-packages', '.venv': 'folder-packages', 'venv': 'folder-packages',
	'.ssh': 'folder-secure', '.gnupg': 'folder-secure', 'secrets': 'folder-secure', 'certs': 'folder-secure', 'ssl': 'folder-secure', 'keys': 'folder-secure',
};

const languageIds: Record<string, string> = {
	'json': 'json', 'jsonc': 'json', 'yaml': 'yaml', 'markdown': 'markdown', 'xml': 'xml', 'ini': 'ini', 'properties': 'config',
	'shellscript': 'shell', 'powershell': 'powershell', 'bat': 'batch', 'python': 'python', 'javascript': 'javascript',
	'typescript': 'typescript', 'html': 'html', 'css': 'css', 'sql': 'sql', 'dockerfile': 'docker', 'makefile': 'make',
	'log': 'log', 'plaintext': 'text', 'diff': 'diff', 'csv': 'csv', 'terraform': 'terraform',
};

// The file icon theme
const iconsDir = path.join(root, 'extensions', 'ddo', 'icons');
fs.rmSync(iconsDir, { recursive: true, force: true });
fs.mkdirSync(iconsDir, { recursive: true });
const iconDefinitions: Record<string, { iconPath: string }> = {};
for (const [kind, [icon, color]] of Object.entries(kinds)) {
	fs.writeFileSync(path.join(iconsDir, `${kind}.svg`), colored(icon, color) + '\n');
	iconDefinitions[`_${kind}`] = { iconPath: `./${kind}.svg` };
}
const ref = (kind: string) => {
	if (!kinds[kind]) {
		throw new Error(`unknown kind ${kind}`);
	}
	return `_${kind}`;
};
const mapValues = (map: Record<string, string>, f: (v: string) => string) => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, f(v)]));
const theme = {
	iconDefinitions,
	file: '_file',
	folder: '_folder',
	folderExpanded: '_folder-open',
	rootFolder: '_folder',
	rootFolderExpanded: '_folder-open',
	folderNames: mapValues(folderNames, ref),
	folderNamesExpanded: mapValues(folderNames, kind => ref(`${kind}-open`)),
	fileExtensions: mapValues(fileExtensions, ref),
	fileNames: mapValues(fileNames, ref),
	languageIds: mapValues(languageIds, ref),
	hidesExplorerArrows: false,
};
fs.writeFileSync(path.join(iconsDir, 'forge-icon-theme.json'), JSON.stringify(theme, null, '\t') + '\n');
fs.writeFileSync(path.join(iconsDir, 'LICENSE-phosphor.txt'), fs.readFileSync(path.join(phosphor, 'LICENSE'), 'utf8'));

// The Sessions icon in the activity bar: drawn as a mask, so its colours come from the theme
fs.writeFileSync(path.join(root, 'extensions', 'ddo', 'media', 'sessions.svg'), svg('hard-drives') + '\n');

// The built-in activity bar icons (codicons): replaced by masks of the duotone icons
const activityBar: [string, string][] = [
	['extensions-view-icon', 'puzzle-piece'],
	['accounts-view-bar-icon', 'user-circle'],
	['settings-view-bar-icon', 'gear-six'],
	['menubar-more', 'list'],
];
const dataUri = (icon: string) => `url("data:image/svg+xml;base64,${Buffer.from(svg(icon)).toString('base64')}")`;
const css = [
	'/*---------------------------------------------------------------------------------------------',
	' *  Copyright (c) Microsoft Corporation. All rights reserved.',
	' *  Licensed under the MIT License. See License.txt in the project root for license information.',
	' *--------------------------------------------------------------------------------------------*/',
	'',
	'/* Generated by build/ddo/forgeIcons.ts from Phosphor\'s duotone icons (MIT, phosphoricons.com). */',
	'/* The activity bar shows them as masks in its own colours, the light layer at 20%. */',
	'',
	...activityBar.map(([codicon, icon]) => [
		`.monaco-workbench .activitybar .codicon-${codicon}::before { content: ""; }`,
		`.monaco-workbench .activitybar .codicon-${codicon} {`,
		// 1em: the codicon's own size, 24px or 16px in the compact activity bar
		`\t-webkit-mask: ${dataUri(icon)} no-repeat 50% 50% / 1em 1em;`,
		`\tmask: ${dataUri(icon)} no-repeat 50% 50% / 1em 1em;`,
		'\tbackground-color: currentColor;',
		'}',
		'',
	].join('\n')),
].join('\n');
fs.writeFileSync(path.join(root, 'src', 'vs', 'forge', 'browser', 'media', 'forgeIcons.css'), css);

console.log(`${Object.keys(kinds).length} file icons, ${activityBar.length} activity bar icons`);
