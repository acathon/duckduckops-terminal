/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Finds services that the reduced DuckDuckOps workbench injects but no longer
// registers, which fail at runtime with "unknown service". Walks the import
// graph of the transpiled entry points in `out/` (run `npm run transpile-client`
// first) and reports injected service ids that the full desktop workbench
// registers but `vs/forge/forge.desktop.main` does not. Fix each by importing
// the contribution that registers it, or a null service (see
// `src/vs/forge/forge.common.main.ts`).
//
//   node build/ddo/checkServices.ts

import * as fs from 'fs';
import * as path from 'path';

const outDir = path.join(import.meta.dirname, '..', '..', 'out');
const forgeEntry = path.join(outDir, 'vs', 'forge', 'forge.desktop.main.js');
const workbenchEntry = path.join(outDir, 'vs', 'workbench', 'workbench.desktop.main.js');

// Services that kept code references but that are never created in DuckDuckOps:
// only the removed search view and the replaced test result service use them.
const knownUnused = new Set(['ISearchViewModelWorkbenchService', 'ITestResultStorage']);

function findServiceIds(dir: string, result = new Set<string>()): Set<string> {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const file = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			findServiceIds(file, result);
		} else if (file.endsWith('.js')) {
			for (const match of fs.readFileSync(file, 'utf8').matchAll(/(?:const|let|var)\s+(I\w+)\s*=\s*(?:\w+\.)?(?:createDecorator|refineServiceDecorator)\b/g)) {
				result.add(match[1]);
			}
		}
	}
	return result;
}

function importGraph(entry: string): Set<string> {
	const files = new Set<string>();
	const stack = [entry];
	while (stack.length) {
		const file = stack.pop()!;
		if (files.has(file) || !fs.existsSync(file)) {
			continue;
		}
		files.add(file);
		const source = fs.readFileSync(file, 'utf8');
		for (const match of source.matchAll(/(?:import|export)\s*(?:[\w*{}\s,$]+?\s*from\s*)?["']([^"']+\.js)["']|import\(\s*["']([^"']+\.js)["']\s*\)/g)) {
			const specifier = match[1] ?? match[2];
			if (specifier.startsWith('.')) {
				stack.push(path.resolve(path.dirname(file), specifier));
			}
		}
	}
	return files;
}

function analyze(entry: string, serviceIds: Set<string>) {
	const registered = new Set<string>();
	const injected = new Map<string, Set<string>>();
	for (const file of importGraph(entry)) {
		const source = fs.readFileSync(file, 'utf8');
		for (const match of source.matchAll(/register(?:Singleton|MainProcessRemoteService|SharedProcessRemoteService|RemoteService)\(\s*(I\w+)|\.set\(\s*(I\w+)\s*,/g)) {
			registered.add(match[1] ?? match[2]);
		}
		for (const match of source.matchAll(/__(?:decorateParam|param)\(\s*\d+\s*,\s*(I\w+)\s*\)|\.get\(\s*(I\w+)\s*\)/g)) {
			const id = match[1] ?? match[2];
			if (serviceIds.has(id)) {
				const users = injected.get(id) ?? new Set<string>();
				users.add(path.relative(outDir, file).replace(/\\/g, '/'));
				injected.set(id, users);
			}
		}
	}
	return { registered, injected };
}

if (!fs.existsSync(forgeEntry) || !fs.existsSync(workbenchEntry)) {
	console.error('Transpiled entry points not found, run `npm run transpile-client` first.');
	process.exit(2);
}

const serviceIds = findServiceIds(path.join(outDir, 'vs'));
const forge = analyze(forgeEntry, serviceIds);
const workbench = analyze(workbenchEntry, serviceIds);
const missing = [...forge.injected]
	.filter(([id]) => !forge.registered.has(id) && workbench.registered.has(id) && !knownUnused.has(id))
	.sort(([a], [b]) => a.localeCompare(b));

if (missing.length === 0) {
	console.log('DuckDuckOps registers every service its workbench injects.');
} else {
	console.error(`DuckDuckOps injects ${missing.length} service(s) it does not register:`);
	for (const [id, users] of missing) {
		console.error(`  ${id} <- ${[...users].join(', ')}`);
	}
	process.exit(1);
}
