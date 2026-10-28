/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Prints the CHANGELOG.md section for a version (default: `forge.version` in
// product.json), to use as release notes. Fails when the version has no
// section, so a release can't go out without notes.
//
//   node build/ddo/releaseNotes.ts [version]

import * as fs from 'fs';
import * as path from 'path';

const root = path.join(import.meta.dirname, '..', '..');
const version = process.argv[2] || JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8')).forge.version;
const lines = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8').split(/\r?\n/);

const start = lines.findIndex(line => line.startsWith(`## [${version}]`));
if (start < 0) {
	console.error(`CHANGELOG.md has no "## [${version}]" section. Describe what changed in this version before releasing it.`);
	process.exit(1);
}
let end = lines.findIndex((line, i) => i > start && line.startsWith('## ['));
if (end < 0) {
	end = lines.length;
}

const body = lines.slice(start + 1, end).join('\n').trim();
if (!body) {
	console.error(`The CHANGELOG.md section for ${version} is empty.`);
	process.exit(1);
}
console.log(`**${lines[start].replace(/^## \[[^\]]+\]\s*-?\s*/, '')}**\n\n${body}`);
