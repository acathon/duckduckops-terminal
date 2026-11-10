/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../base/common/async.js';
import { CancellationToken } from '../../base/common/cancellation.js';
import { Disposable, DisposableStore } from '../../base/common/lifecycle.js';
import { language } from '../../base/common/platform.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { asText, IRequestService } from '../../platform/request/common/request.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../workbench/common/contributions.js';
import { ITerminalInstance, ITerminalService } from '../../workbench/contrib/terminal/browser/terminal.js';

// A few lines at the top of each new terminal: the date and the weather, then an
// ops joke or a DuckDuckOps tip. They are written to the terminal's screen just
// before the shell's first output, so they never reach the shell. Settings (in the
// ddo extension): `ddo.terminal.welcomeLines` and `ddo.terminal.weatherLocation`.

type WelcomeLine = 'weather' | 'joke' | 'tip';

const LINES_SETTING = 'ddo.terminal.welcomeLines';
const LOCATION_SETTING = 'ddo.terminal.weatherLocation';

/** The weather is fetched again after this long */
const WEATHER_TTL = 30 * 60 * 1000;
/** After a failure (offline, blocked), the next try waits this long */
const WEATHER_RETRY = 5 * 60 * 1000;
/** Without any shell output, the lines are written after this long anyway */
const WRITE_TIMEOUT = 1500;

const jokes = [
	'There are 10 kinds of people: those who read binary and those who restart the router.',
	'It works on my machine. Then we\'ll ship your machine.',
	'DNS: it\'s not DNS. There\'s no way it\'s DNS. It was DNS.',
	'A sysadmin\'s favourite day? Read-only Friday.',
	'"Have you tried turning it off and on again?" is a full incident response plan.',
	'The cloud is just someone else\'s computer, and it\'s also down.',
	'Uptime 400 days. Nobody knows the root password. Nobody dares to reboot.',
	'Backups are fine. Restores are a matter of faith.',
	'chmod 777: the "I\'ll fix it properly later" of permissions.',
	'There\'s no place like 127.0.0.1.',
	'Kubernetes: because one container wasn\'t confusing enough.',
	'A YAML file walks into a bar. It\'s indented wrong, so it walks out.',
	'The S in IoT stands for Security.',
	'Monitoring said everything was green. Monitoring was down.',
	'"Temporary" fix, deployed 2019.',
	'The ticket says "urgent". It was opened three weeks ago.',
	'Production is the best test environment: it has real users.',
	'rm -rf is only scary if you read what you typed.',
	'Every server is a pet until you have three hundred of them.',
	'The network is slow. The network is always slow. It\'s never the network.',
	'Logs are the diary of a system that never tells you how it feels.',
	'"It\'s just a small config change." Famous last words, chapter 12.',
	'Two hard things in IT: cache invalidation, naming things, and off-by-one errors.',
	'The printer has detected that you are in a hurry.',
	'SSH: Secure Shell, or Several Sessions Hanging.',
	'Ping is the IT equivalent of "are you awake?" at 3 a.m.',
	'The firewall rule was "allow any any". Temporarily. Since the last century.',
	'Documentation: the thing we\'ll write right after the incident.',
	'sudo make me a coffee.',
	'git push --force: because "probably fine" is a deployment strategy.',
	'An expired certificate is just a surprise with a date.',
	'Cron runs at midnight so you can sleep through the failure.',
	'There\'s always one more disk to fill up.',
	'The duck has heard your explanation. The bug is now embarrassed.',
	'A good sysadmin automates the task. A great one automates the excuse.',
	'Load average 42: the answer, and also the problem.',
	'Shadow IT: when the spreadsheet becomes the database.',
	'The VPN works perfectly as long as you don\'t need it.',
	'"Nobody touched anything." The logs disagree.',
	'Hardware: the part of the computer you can kick.',
];

const tips = [
	'Tip: the folder panel follows the terminal: try ls -la, then dir /o:-d.',
	'Tip: a command failed? Click "Ask the duck" in the status bar.',
	'Tip: @duck /summary turns your terminal session into an incident report.',
	'Tip: select text in the terminal, right-click, Ask the Duck.',
	'Tip: Sessions in the activity bar keeps your SSH, tunnels and Remote Desktop servers.',
	'Tip: Add Chat stacks a second chat; Let the Chats Talk makes them check each other.',
	'Tip: Record in the terminal title saves a .cast you can replay and edit.',
	'Tip: DuckDuckOps: Choose Theme has Forge and Forge Hackerman, light, dark or like Windows.',
	'Tip: double-click a folder in the folder panel to cd there.',
	'Tip: drag a file from the folder panel onto the terminal to type its path.',
	'Tip: DuckDuckOps: Show or Hide the Duck lets the duck keep you company.',
	'Tip: copilot in the terminal starts GitHub Copilot CLI.',
];

let weather: { text: string | undefined; time: number } | undefined;
let weatherFetch: Promise<void> | undefined;

class ForgeTerminalWelcomeContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.forgeTerminalWelcome';

	private lastJoke = -1;
	private count = 0;

	constructor(
		@ITerminalService terminalService: ITerminalService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IRequestService private readonly requestService: IRequestService,
	) {
		super();
		// Start early, so the weather is there for the first terminal
		this.refreshWeather();
		this._register(terminalService.onDidCreateInstance(instance => this.welcome(instance)));
	}

	private lines(): Set<WelcomeLine> {
		const value = this.configurationService.getValue<unknown>(LINES_SETTING);
		return new Set(Array.isArray(value) ? value.filter((v): v is WelcomeLine => v === 'weather' || v === 'joke' || v === 'tip') : ['weather', 'joke', 'tip']);
	}

	private refreshWeather(): Promise<void> {
		if (!this.lines().has('weather')) {
			return Promise.resolve();
		}
		const now = Date.now();
		if (weather && now - weather.time < (weather.text ? WEATHER_TTL : WEATHER_RETRY)) {
			return Promise.resolve();
		}
		if (!weatherFetch) {
			const location = (this.configurationService.getValue<string>(LOCATION_SETTING) ?? '').trim();
			const url = `https://wttr.in/${encodeURIComponent(location)}?m&lang=en&format=${encodeURIComponent('%l: %c %t, wind %w')}`;
			weatherFetch = this.requestService.request({ type: 'GET', url, timeout: 4000, headers: { 'User-Agent': 'curl/8.0' }, callSite: 'NO_FETCH_TELEMETRY' }, CancellationToken.None)
				.then(async context => {
					const text = context.res.statusCode === 200 ? (await asText(context))?.trim() : undefined;
					const ok = !!text && text.length < 120 && !/<|unknown|sorry|error/i.test(text);
					weather = { text: ok ? text : undefined, time: Date.now() };
				}, () => {
					weather = { text: undefined, time: Date.now() };
				})
				.finally(() => {
					weatherFetch = undefined;
				});
		}
		return weatherFetch;
	}

	private welcome(instance: ITerminalInstance): void {
		const config = instance.shellLaunchConfig;
		const executable = (config.executable ?? '').replace(/^.*[\\/]/, '').toLowerCase();
		if (config.hideFromUser || config.isFeatureTerminal || config.customPtyImplementation || config.attachPersistentProcess
			|| config.isExtensionOwnedTerminal || config.type === 'Task' || /^(ssh|plink|mosh|telnet)(\.exe)?$/.test(executable)) {
			return; // tasks, Copilot's terminals, sessions on other computers, restored terminals
		}
		const lines = this.lines();
		if (!lines.size) {
			return;
		}
		this.refreshWeather();

		const store = new DisposableStore();
		let written = false;
		const write = () => {
			if (written) {
				return;
			}
			written = true;
			store.dispose();
			const text = this.compose(lines);
			if (text) {
				instance.xterm?.raw.write(text);
			}
		};
		// Just before the shell's first output reaches the screen
		store.add(instance.onWillData(() => write()));
		store.add(instance.onDisposed(() => store.dispose()));
		instance.xtermReadyPromise.then(xterm => {
			if (!xterm) {
				store.dispose();
				return;
			}
			timeout(WRITE_TIMEOUT).then(write);
		});
	}

	private compose(lines: Set<WelcomeLine>): string {
		const dim = '\x1b[2m', italic = '\x1b[3m', cyan = '\x1b[36m', yellow = '\x1b[33m', reset = '\x1b[0m';
		const out: string[] = [];
		const date = new Date().toLocaleDateString(language, { weekday: 'long', day: 'numeric', month: 'long' });
		const forecast = lines.has('weather') ? weather?.text : undefined;
		out.push(`${dim}\u{1F986} ${date}${reset}${forecast ? `  ${cyan}${forecast}${reset}` : ''}`);

		this.count++;
		const tip = lines.has('tip') && (!lines.has('joke') || this.count % 3 === 0);
		if (tip) {
			out.push(`${yellow}${tips[Math.floor(Math.random() * tips.length)]}${reset}`);
		} else if (lines.has('joke')) {
			let index = Math.floor(Math.random() * jokes.length);
			if (index === this.lastJoke) {
				index = (index + 1) % jokes.length;
			}
			this.lastJoke = index;
			out.push(`${dim}${italic}${jokes[index]}${reset}`);
		}
		return out.join('\r\n') + '\r\n\r\n';
	}
}

registerWorkbenchContribution2(ForgeTerminalWelcomeContribution.ID, ForgeTerminalWelcomeContribution, WorkbenchPhase.BlockRestore);
