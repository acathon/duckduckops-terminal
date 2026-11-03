// @ts-check
'use strict';
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');

// The Duck agents: custom agents (`.agent.md`) in ~/.ddo/agents, which DuckDuckOps
// adds to `chat.agentFilesLocations`. Each has its own Copilot model and only the
// tools its job needs (every tool description is sent with every request). The
// Lead hands work to the Operator and the Reviewer with the `runSubagent` tool.
const AGENTS_DIR = path.join(os.homedir(), '.ddo', 'agents');
const MARKER = '<!-- Written by DuckDuckOps. To change the models, run "DuckDuckOps: Set Up Agents". -->';

/**
 * @typedef {{ id: string, name: string, role: string, prefer: RegExp[], header: (env: string) => string, body: string }} Role
 * @type {Role[]}
 */
const ROLES = [
	{
		id: 'lead',
		name: 'Duck Lead',
		role: 'plans the work and hands it to the others',
		prefer: [/opus/i, /gpt-5(?!.*mini)/i, /sonnet/i],
		header: () => [
			'description: Plans an ops task, has the Duck Operator carry it out and the Duck Reviewer check it',
			'tools: [\'agent\', \'read/terminalLastCommand\', \'read/terminalSelection\', \'execute/getTerminalOutput\', \'read/readFile\']',
			'agents: [\'Duck Operator\', \'Duck Reviewer\']',
			'handoffs:',
			'  - label: Let the Operator do it',
			'    agent: Duck Operator',
			'    prompt: Carry out the plan above, one step at a time.',
			'    send: false',
			'  - label: Ask the Reviewer',
			'    agent: Duck Reviewer',
			'    prompt: Review the plan above before anything runs.',
			'    send: false',
		].join('\n'),
		body: [
			'You are the Duck Lead in DuckDuckOps, an IT/ops terminal. You plan; you do not run commands yourself.',
			'',
			'1. Read the terminal first (#terminalLastCommand, #terminalSelection, #getTerminalOutput): the user and the agents share it.',
			'2. Write a short plan: what to check first (read-only), what might need changing.',
			'3. Hand each step to the Duck Operator with the runSubagent tool. Before any step that changes the system, have the Duck Reviewer check it.',
			'4. If the Operator reports the same failure twice, stop and ask the Reviewer for another approach instead of retrying.',
			'5. End with: what you found, what was changed, what is left to do.',
			'',
			'Be calm and short. No jokes. Never ask for passwords or keys in the chat.',
		].join('\n'),
	},
	{
		id: 'operator',
		name: 'Duck Operator',
		role: 'runs the commands in the terminal',
		prefer: [/sonnet/i, /gpt-5(?!.*mini)/i, /gpt/i],
		header: () => [
			'description: Runs diagnostics and fixes in the terminal, one command at a time',
			'tools: [\'execute/runInTerminal\', \'execute/getTerminalOutput\', \'execute/sendToTerminal\', \'execute/killTerminal\', \'read/terminalLastCommand\', \'read/terminalSelection\', \'read/readFile\']',
			'handoffs:',
			'  - label: Ask the Reviewer',
			'    agent: Duck Reviewer',
			'    prompt: Review what I ran and found above. Is it right, and is the next step safe?',
			'    send: false',
		].join('\n'),
		body: [
			'You are the Duck Operator in DuckDuckOps, an IT/ops terminal. You run commands in the terminal the user can see.',
			'',
			'- Read the terminal first (#terminalLastCommand): the user may already have run something.',
			'- Start with read-only diagnostics. Run one command at a time and read its output before the next.',
			'- Before a command that changes the system (restart, stop, delete, install, edit configuration), say what it does and what could go wrong, and wait for the user to approve it.',
			'- If a command fails twice for the same reason, stop. Do not retry it a third time: report what you tried and ask for the Duck Reviewer.',
			'- Never put passwords, tokens or keys in commands. Ask the user to enter them themselves.',
			'',
			'Be calm and short. No jokes.',
		].join('\n'),
	},
	{
		id: 'reviewer',
		name: 'Duck Reviewer',
		role: 'checks plans and commands before they run',
		prefer: [/gpt-5(?!.*mini)/i, /gpt/i, /gemini/i, /opus/i],
		header: () => [
			'description: Checks plans, commands and findings for risks and mistakes, without running anything',
			'tools: [\'read/terminalLastCommand\', \'read/terminalSelection\', \'execute/getTerminalOutput\', \'read/readFile\']',
			'handoffs:',
			'  - label: Back to the Operator',
			'    agent: Duck Operator',
			'    prompt: Apply the review above.',
			'    send: false',
		].join('\n'),
		body: [
			'You are the Duck Reviewer in DuckDuckOps, an IT/ops terminal. You never run commands.',
			'',
			'Check the plan, the command or the findings you are given, and the terminal output:',
			'- Is it correct for this machine and shell?',
			'- What could it break, and is there a safer or read-only way first?',
			'- Is something missing (a backup, a check before, a way back)?',
			'',
			'Answer with "OK to run" or a short list of concrete problems and what to do instead. When a step keeps failing, suggest a different approach.',
			'',
			'Be calm and short. No jokes.',
		].join('\n'),
	},
];

/** @returns {Promise<vscode.LanguageModelChat[]>} */
async function copilotModels() {
	try {
		return (await vscode.lm.selectChatModels({ vendor: 'copilot' })).filter(m => m.id !== 'auto');
	} catch {
		return [];
	}
}

/** @param {vscode.LanguageModelChat[]} models @param {RegExp[]} prefer */
function defaultModel(models, prefer) {
	for (const re of prefer) {
		const model = models.find(m => re.test(m.name) || re.test(m.family));
		if (model) { return model; }
	}
	return models[0];
}

/** `Name (vendor)`, the form `model:` takes in agent files */
const modelRef = (/** @type {vscode.LanguageModelChat} */ m) => `${m.name} (${m.vendor})`;

function environment() {
	const shell = vscode.env.shell || 'the default shell';
	const system = { win32: 'Windows', darwin: 'macOS' }[process.platform] ?? 'Linux';
	return `This machine: ${system} ${os.release()}, terminal shell ${path.basename(shell)}. Use commands for that shell.`;
}

/** @param {Role} role @param {vscode.LanguageModelChat} model */
function agentFile(role, model) {
	return [
		'---',
		`name: ${role.name}`,
		`model: ${JSON.stringify(modelRef(model))}`,
		role.header(environment()),
		'---',
		MARKER,
		'',
		role.body,
		'',
		environment(),
		'',
	].join('\n');
}

const fileOf = (/** @type {Role} */ role) => path.join(AGENTS_DIR, `duck-${role.id}.agent.md`);

/** @param {Map<Role, vscode.LanguageModelChat | undefined>} choice */
function writeAgents(choice) {
	fs.mkdirSync(AGENTS_DIR, { recursive: true });
	for (const [role, model] of choice) {
		if (model) {
			fs.writeFileSync(fileOf(role), agentFile(role, model));
		} else {
			fs.rmSync(fileOf(role), { force: true });
		}
	}
}

/** @param {Map<Role, vscode.LanguageModelChat | undefined>} choice */
function summary(choice) {
	return [...choice].filter(([, m]) => m).map(([role, m]) => `${role.name.replace('Duck ', '')} on ${m?.name}`).join(', ');
}

async function openChat() {
	await vscode.commands.executeCommand('workbench.action.chat.open', { mode: 'Duck Lead' }).then(undefined, () =>
		vscode.commands.executeCommand('workbench.action.chat.open'));
}

/** Lets the user pick a model, or none, for each agent */
async function setUpAgents() {
	const models = await copilotModels();
	if (!models.length) {
		vscode.window.showInformationMessage('Sign in to GitHub Copilot first (Accounts menu), then run "DuckDuckOps: Set Up Agents" again.');
		return;
	}
	/** @type {Map<Role, vscode.LanguageModelChat | undefined>} */
	const choice = new Map();
	for (const role of ROLES) {
		const current = defaultModel(models, role.prefer);
		/** @type {(vscode.QuickPickItem & { model?: vscode.LanguageModelChat })[]} */
		const items = [
			...models.map(model => ({ label: model.name, description: model === current ? 'suggested' : model.family, model })),
			{ label: '$(circle-slash) Not used', description: `no ${role.name}` },
		];
		const quickPick = vscode.window.createQuickPick();
		quickPick.title = `${role.name}: ${role.role}`;
		quickPick.placeholder = 'Model for this agent';
		quickPick.items = items;
		quickPick.activeItems = items.filter(item => item.model === current);
		const picked = await new Promise(resolve => {
			quickPick.onDidAccept(() => { resolve(quickPick.selectedItems[0]); quickPick.hide(); });
			quickPick.onDidHide(() => resolve(undefined));
			quickPick.show();
		});
		quickPick.dispose();
		if (!picked) { return; }
		choice.set(role, /** @type {typeof items[number]} */(picked).model);
	}
	writeAgents(choice);
	const action = await vscode.window.showInformationMessage(`Duck agents: ${summary(choice) || 'none'}.`, 'Open Chat');
	if (action === 'Open Chat') { await openChat(); }
}

/**
 * On the first start with Copilot models available, writes the agents with a
 * suggested model each, unless agent files are already there.
 * @param {vscode.ExtensionContext} context
 */
function setUpOnFirstRun(context) {
	if (context.globalState.get('agentsSetUp')) { return; }
	let running = false;
	const tryNow = async () => {
		if (running || context.globalState.get('agentsSetUp')) { return; }
		running = true;
		try {
			const models = await copilotModels();
			if (!models.length) { return; }
			await context.globalState.update('agentsSetUp', true);
			listener.dispose();
			if (ROLES.some(role => fs.existsSync(fileOf(role)))) { return; }
			/** @type {Map<Role, vscode.LanguageModelChat | undefined>} */
			const choice = new Map(ROLES.map(role => [role, defaultModel(models, role.prefer)]));
			writeAgents(choice);
			const action = await vscode.window.showInformationMessage(
				`Your Duck agents are ready: ${summary(choice)}. Pick Duck Lead in the chat to start.`, 'Open Chat', 'Change Models');
			if (action === 'Open Chat') { await openChat(); }
			if (action === 'Change Models') { await setUpAgents(); }
		} finally {
			running = false;
		}
	};
	const listener = vscode.lm.onDidChangeChatModels(() => tryNow());
	context.subscriptions.push(listener);
	tryNow();
}

module.exports = { setUpAgents, setUpOnFirstRun };
