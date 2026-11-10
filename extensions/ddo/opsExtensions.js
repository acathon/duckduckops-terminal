// @ts-check
'use strict';
const vscode = require('vscode');

// Extensions for IT/ops work from Open VSX, offered in one list
// ("DuckDuckOps: Recommended Extensions for Ops") instead of the coding extensions
// that top Open VSX's popular list.

const RECOMMENDED = [
	{ id: 'ms-vscode.powershell', label: 'PowerShell', detail: 'Syntax, IntelliSense and script analysis for PowerShell' },
	{ id: 'redhat.vscode-yaml', label: 'YAML', detail: 'YAML with schema validation (Kubernetes, Ansible, CI files)' },
	{ id: 'ms-azuretools.vscode-docker', label: 'Docker', detail: 'Containers, images and Dockerfiles' },
	{ id: 'ms-kubernetes-tools.vscode-kubernetes-tools', label: 'Kubernetes', detail: 'Clusters, workloads and manifests' },
	{ id: 'redhat.ansible', label: 'Ansible', detail: 'Playbooks and roles' },
	{ id: 'hashicorp.terraform', label: 'Terraform', detail: 'Terraform and HCL files' },
	{ id: 'timonwong.shellcheck', label: 'ShellCheck', detail: 'Finds mistakes in shell scripts' },
	{ id: 'emilast.LogFileHighlighter', label: 'Log File Highlighter', detail: 'More colours for log files' },
	{ id: 'mechatroner.rainbow-csv', label: 'Rainbow CSV', detail: 'Columns of CSV and TSV files in colours' },
	{ id: 'redhat.vscode-xml', label: 'XML', detail: 'XML with schema validation' },
	{ id: 'jeanp413.open-remote-ssh', label: 'Open Remote - SSH', detail: 'Opens folders on a server over SSH' },
];

async function showRecommendedExtensions() {
	const installed = new Set(vscode.extensions.all.map(e => e.id.toLowerCase()));
	const items = RECOMMENDED.map(r => ({
		label: r.label,
		description: installed.has(r.id.toLowerCase()) ? 'installed' : r.id,
		detail: r.detail,
		id: r.id,
		picked: false,
	})).filter(item => item.description !== 'installed');
	if (!items.length) {
		vscode.window.showInformationMessage('All recommended extensions for ops are installed.');
		return;
	}
	const picked = await vscode.window.showQuickPick(items, { title: 'Recommended Extensions for Ops', placeHolder: 'Pick the extensions to install from Open VSX', canPickMany: true, matchOnDetail: true });
	for (const item of picked ?? []) {
		try {
			await vscode.commands.executeCommand('workbench.extensions.installExtension', item.id);
		} catch (error) {
			vscode.window.showWarningMessage(`${item.label} could not be installed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}

/** Offers the list once, on the first start */
async function offerOnFirstRun(/** @type {vscode.ExtensionContext} */ context) {
	if (context.globalState.get('opsExtensionsOffered')) { return; }
	await context.globalState.update('opsExtensionsOffered', true);
	const action = await vscode.window.showInformationMessage('Install extensions for ops work (PowerShell, YAML, Docker, Kubernetes, Ansible, ...)?', 'Show List');
	if (action === 'Show List') { await showRecommendedExtensions(); }
}

module.exports = { showRecommendedExtensions, offerOnFirstRun };
