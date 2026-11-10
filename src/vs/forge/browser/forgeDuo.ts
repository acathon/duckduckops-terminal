/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../base/common/lifecycle.js';
import { autorun } from '../../base/common/observable.js';
import { localize, localize2 } from '../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { EditPresentationTypes, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../platform/instantiation/common/descriptors.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../platform/notification/common/notification.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../platform/storage/common/storage.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../workbench/common/contributions.js';
import { IViewContainersRegistry, IViewDescriptor, IViewsRegistry, Extensions as ViewExtensions } from '../../workbench/common/views.js';
import { ChatViewContainerId, ChatViewId } from '../../workbench/contrib/chat/browser/chat.js';
import { ChatViewPane } from '../../workbench/contrib/chat/browser/widgetHosts/viewPane/chatViewPane.js';
import { IViewsService } from '../../workbench/services/views/common/viewsService.js';

// The Duo: up to three chats stacked in the chat column, each with its own model
// and session target, which can pass their answers to each other in turn.

const MAX_CHATS = 3;
/** Chat 1 is the usual chat view; chats 2 and 3 are added below it */
const CHAT_VIEW_IDS = [ChatViewId, 'workbench.panel.chat.view.ddo.chat2', 'workbench.panel.chat.view.ddo.chat3'];
const COUNT_STORAGE_KEY = 'ddo.duo.chatCount';

const DuoChatCount = new RawContextKey<number>('ddo.duoChatCount', 1);
const DuoTalking = new RawContextKey<boolean>('ddo.duoTalking', false);

const MAX_TURNS_SETTING = 'ddo.duo.maxTurns';
const INSTRUCTION_SETTING = 'ddo.duo.instruction';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'ddoDuo',
	title: localize('ddo.duo', "DuckDuckOps: Duo"),
	type: 'object',
	properties: {
		[MAX_TURNS_SETTING]: {
			type: 'number',
			default: 6,
			minimum: 1,
			maximum: 30,
			description: localize('ddo.duo.maxTurns', "How many answers the chats pass to each other before they stop. Every turn is a Copilot request."),
		},
		[INSTRUCTION_SETTING]: {
			type: 'string',
			default: 'Check this answer. If something is wrong, unsafe or missing, say what and why. If it is right, take the next step. When the task is finished, end your answer with DONE on its own line.',
			editPresentation: EditPresentationTypes.Multiline,
			description: localize('ddo.duo.instruction', "What a chat is asked to do with the answer it receives from the chat before it."),
		},
	},
});

// Chats 2 and 3: chat views like the first one, shown while the count includes them
const chatContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).get(ChatViewContainerId);
if (chatContainer) {
	Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews(CHAT_VIEW_IDS.slice(1).map((id, index): IViewDescriptor => ({
		id,
		name: localize2('ddo.duo.chatName', "Chat {0}", index + 2),
		containerIcon: chatContainer.icon,
		ctorDescriptor: new SyncDescriptor(ChatViewPane),
		canToggleVisibility: false,
		canMoveView: false,
		order: 100 + index,
		when: ContextKeyExpr.greaterEquals(DuoChatCount.key, index + 2),
	})), chatContainer);
}

/**
 * Keeps the number of chats, and passes each finished answer to the next chat
 * while the chats are talking.
 */
export class ForgeDuoContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.forgeDuo';
	static instance: ForgeDuoContribution | undefined;

	private readonly countKey: IContextKey<number>;
	private readonly talkingKey: IContextKey<boolean>;
	private readonly relay = this._register(new DisposableStore());
	private turns = 0;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IViewsService private readonly viewsService: IViewsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		ForgeDuoContribution.instance = this;
		this.countKey = DuoChatCount.bindTo(contextKeyService);
		this.talkingKey = DuoTalking.bindTo(contextKeyService);
		this.countKey.set(Math.min(MAX_CHATS, Math.max(1, this.storageService.getNumber(COUNT_STORAGE_KEY, StorageScope.PROFILE, 1))));
	}

	get count(): number {
		return this.countKey.get() ?? 1;
	}

	async setCount(count: number): Promise<void> {
		this.stop();
		this.countKey.set(count);
		this.storageService.store(COUNT_STORAGE_KEY, count, StorageScope.PROFILE, StorageTarget.USER);
		await this.viewsService.openView(CHAT_VIEW_IDS[count - 1], true);
	}

	private pane(index: number): ChatViewPane | undefined {
		return this.viewsService.getViewWithId<ChatViewPane>(CHAT_VIEW_IDS[index]) ?? undefined;
	}

	/** Starts passing answers on: chat 1's finished answer (if any) goes to chat 2 now */
	start(): void {
		const panes = Array.from({ length: this.count }, (_, i) => this.pane(i));
		if (this.count < 2 || panes.some(pane => !pane)) {
			this.notificationService.info(localize('ddo.duo.needTwo', "Open at least two chats (Add Chat) to let them talk."));
			return;
		}
		this.relay.clear();
		this.turns = 0;
		this.talkingKey.set(true);
		panes.forEach((pane, index) => this.watch(pane!, index));
		const first = panes[0]!.widget.viewModel?.model;
		const last = first?.getRequests().at(-1)?.response;
		if (last?.isComplete && !last.isCanceled && !first?.hasActiveRequest.get()) {
			this.forward(chatName(0), last.response.getFinalResponse(), 1);
		}
	}

	stop(): void {
		this.relay.clear();
		this.talkingKey.set(false);
	}

	/** Forwards the answers of chat `index`, also after its widget shows another session */
	private watch(pane: ChatViewPane, index: number): void {
		const store = this.relay.add(new DisposableStore());
		const watchModel = () => {
			store.clear();
			const model = pane.widget.viewModel?.model;
			if (!model) {
				return;
			}
			let wasActive = model.hasActiveRequest.get();
			store.add(autorun(reader => {
				const active = model.hasActiveRequest.read(reader);
				if (wasActive && !active) {
					const response = model.getRequests().at(-1)?.response;
					if (response?.isCanceled) {
						this.stop();
					} else if (response) {
						this.onAnswer(index, response.response.getFinalResponse());
					}
				}
				wasActive = active;
			}));
		};
		watchModel();
		this.relay.add(pane.widget.onDidChangeViewModel(() => watchModel()));
	}

	private onAnswer(index: number, text: string): void {
		const maxTurns = this.configurationService.getValue<number>(MAX_TURNS_SETTING) ?? 6;
		if (/(^|\n)\s*\**DONE\**\s*$/.test(text.trim())) {
			this.stop();
			this.notificationService.info(localize('ddo.duo.done', "Chat {0} says the task is done.", index + 1));
			return;
		}
		if (++this.turns >= maxTurns) {
			this.stop();
			this.notificationService.info(localize('ddo.duo.maxTurns.reached', "The chats stopped after {0} turns ({1}).", this.turns, MAX_TURNS_SETTING));
			return;
		}
		this.forward(chatName(index), text, (index + 1) % this.count);
	}

	private forward(from: string, text: string, to: number): void {
		const pane = this.pane(to);
		if (!pane || !text.trim()) {
			this.stop();
			return;
		}
		const instruction = this.configurationService.getValue<string>(INSTRUCTION_SETTING) ?? '';
		pane.widget.acceptInput(`${from} answered:\n\n${text}\n\n${instruction}`).catch(() => this.stop());
	}
}

function chatName(index: number): string {
	return localize('ddo.duo.chatLabel', "Chat {0}", index + 1);
}

registerWorkbenchContribution2(ForgeDuoContribution.ID, ForgeDuoContribution, WorkbenchPhase.AfterRestored);

const inChatViews = ContextKeyExpr.or(...CHAT_VIEW_IDS.map(id => ContextKeyExpr.equals('view', id)));

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'ddo.duo.addChat',
			title: localize2('ddo.duo.addChat', "Add Chat"),
			category: localize2('ddo.category', "DuckDuckOps"),
			icon: Codicon.splitVertical,
			f1: true,
			precondition: ContextKeyExpr.smallerEquals(DuoChatCount.key, MAX_CHATS - 1),
			menu: { id: MenuId.ViewTitle, when: ContextKeyExpr.and(ContextKeyExpr.equals('view', ChatViewId), ContextKeyExpr.smallerEquals(DuoChatCount.key, MAX_CHATS - 1)), group: 'navigation', order: 90 },
		});
	}
	async run(_accessor: ServicesAccessor): Promise<void> {
		const duo = ForgeDuoContribution.instance;
		if (duo && duo.count < MAX_CHATS) {
			await duo.setCount(duo.count + 1);
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'ddo.duo.removeChat',
			title: localize2('ddo.duo.removeChat', "Close This Chat"),
			category: localize2('ddo.category', "DuckDuckOps"),
			icon: Codicon.close,
			menu: CHAT_VIEW_IDS.slice(1).map((id, index) => ({
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', id), ContextKeyExpr.equals(DuoChatCount.key, index + 2)),
				group: 'navigation',
				order: 100,
			})),
		});
	}
	async run(_accessor: ServicesAccessor): Promise<void> {
		const duo = ForgeDuoContribution.instance;
		if (duo && duo.count > 1) {
			await duo.setCount(duo.count - 1);
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'ddo.duo.talk',
			title: localize2('ddo.duo.talk', "Let the Chats Talk"),
			category: localize2('ddo.category', "DuckDuckOps"),
			icon: Codicon.commentDiscussion,
			f1: true,
			precondition: ContextKeyExpr.greaterEquals(DuoChatCount.key, 2),
			menu: { id: MenuId.ViewTitle, when: ContextKeyExpr.and(ContextKeyExpr.equals('view', ChatViewId), ContextKeyExpr.greaterEquals(DuoChatCount.key, 2), DuoTalking.negate()), group: 'navigation', order: 91 },
		});
	}
	run(_accessor: ServicesAccessor): void {
		ForgeDuoContribution.instance?.start();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'ddo.duo.stop',
			title: localize2('ddo.duo.stop', "Stop the Chats Talking"),
			category: localize2('ddo.category', "DuckDuckOps"),
			icon: Codicon.debugStop,
			f1: true,
			precondition: DuoTalking,
			menu: { id: MenuId.ViewTitle, when: ContextKeyExpr.and(inChatViews, DuoTalking), group: 'navigation', order: 91 },
		});
	}
	run(_accessor: ServicesAccessor): void {
		ForgeDuoContribution.instance?.stop();
	}
});
