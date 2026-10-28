/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// DuckDuckOps loads a reduced copy of `workbench.desktop.main.ts`, see
// `forge.common.main.ts`. When merging upstream, diff this file against
// `workbench.desktop.main.ts`.

//#region --- workbench common

import './forge.common.main.js';

//#endregion


//#region --- workbench (desktop main)

import '../workbench/electron-browser/desktop.main.js';
import '../workbench/electron-browser/desktop.contribution.js';

//#endregion


//#region --- workbench parts

import '../workbench/electron-browser/parts/dialogs/dialog.contribution.js';

//#endregion


//#region --- workbench services

import '../workbench/services/textfile/electron-browser/nativeTextFileService.js';
import '../workbench/services/dialogs/electron-browser/fileDialogService.js';
import '../workbench/services/workspaces/electron-browser/workspacesService.js';
import '../workbench/services/menubar/electron-browser/menubarService.js';
import '../workbench/services/update/electron-browser/updateService.js';
import '../workbench/services/url/electron-browser/urlService.js';
import '../workbench/services/lifecycle/electron-browser/lifecycleService.js';
import '../workbench/services/title/electron-browser/titleService.js';
import '../workbench/services/host/electron-browser/nativeHostService.js';
import '../platform/meteredConnection/electron-browser/meteredConnectionService.js';
import '../workbench/services/request/electron-browser/requestService.js';
import '../workbench/services/github/electron-browser/githubService.js';
import '../platform/customizationMarketplace/electron-browser/customizationMarketplaceService.js';
import '../workbench/services/clipboard/electron-browser/clipboardService.js';
import '../workbench/services/contextmenu/electron-browser/contextmenuService.js';
import '../workbench/services/workspaces/electron-browser/workspaceEditingService.js';
import '../workbench/services/configurationResolver/electron-browser/configurationResolverService.js';
import '../workbench/services/accessibility/electron-browser/accessibilityService.js';
import '../workbench/services/keybinding/electron-browser/nativeKeyboardLayout.js';
import '../workbench/services/path/electron-browser/pathService.js';
import '../workbench/services/themes/electron-browser/nativeHostColorSchemeService.js';
import '../workbench/services/extensionManagement/electron-browser/extensionManagementService.js';
import '../workbench/services/mcp/electron-browser/mcpGalleryManifestService.js';
import '../workbench/services/mcp/electron-browser/mcpWorkbenchManagementService.js';
import '../workbench/services/encryption/electron-browser/encryptionService.js';
import '../workbench/services/imageResize/electron-browser/imageResizeService.js';
import '../workbench/services/localTranscription/electron-browser/localTranscriptionService.js';
import '../workbench/services/secrets/electron-browser/secretStorageService.js';
import '../workbench/services/localization/electron-browser/languagePackService.js';
import '../workbench/services/telemetry/electron-browser/telemetryService.js';
import '../workbench/services/extensions/electron-browser/extensionHostStarter.js';
import '../platform/extensionResourceLoader/common/extensionResourceLoaderService.js';
import '../workbench/services/localization/electron-browser/localeService.js';
import '../workbench/services/extensions/electron-browser/extensionsScannerService.js';
import '../workbench/services/extensionManagement/electron-browser/extensionManagementServerService.js';
import '../workbench/services/extensionManagement/electron-browser/extensionGalleryManifestService.js';
import '../workbench/services/extensionManagement/electron-browser/extensionGalleryAccountService.js';
import '../workbench/services/extensionManagement/electron-browser/extensionTipsService.js';
import '../workbench/services/userDataSync/electron-browser/userDataSyncService.js';
import '../workbench/services/userDataSync/electron-browser/userDataAutoSyncService.js';
import '../workbench/services/timer/electron-browser/timerService.js';
import '../workbench/services/environment/electron-browser/shellEnvironmentService.js';
import '../workbench/services/integrity/electron-browser/integrityService.js';
import '../workbench/services/workingCopy/electron-browser/workingCopyBackupService.js';
import '../workbench/services/checksum/electron-browser/checksumService.js';
import '../platform/remote/electron-browser/sharedProcessTunnelService.js';
import '../workbench/services/tunnel/electron-browser/tunnelService.js';
import '../platform/diagnostics/electron-browser/diagnosticsService.js';
import '../platform/profiling/electron-browser/profilingService.js';
import '../platform/telemetry/electron-browser/customEndpointTelemetryService.js';
import '../platform/remoteTunnel/electron-browser/remoteTunnelService.js';
import '../workbench/services/files/electron-browser/elevatedFileService.js';
import '../workbench/services/search/electron-browser/searchService.js';
import '../workbench/services/workingCopy/electron-browser/workingCopyHistoryService.js';
import '../workbench/services/userDataSync/browser/userDataSyncEnablementService.js';
import '../workbench/services/extensions/electron-browser/nativeExtensionService.js';
import '../platform/userDataProfile/electron-browser/userDataProfileStorageService.js';
import '../workbench/services/auxiliaryWindow/electron-browser/auxiliaryWindowService.js';
import '../platform/extensionManagement/electron-browser/extensionsProfileScannerService.js';
import '../platform/sandbox/electron-browser/sandboxHelperService.js';
import '../platform/webContentExtractor/electron-browser/webContentExtractorService.js';
import '../workbench/services/agentHost/electron-browser/agentHostService.js';
import '../platform/agentHost/electron-browser/remoteAgentHostService.js';
import '../platform/agentHost/electron-browser/agentHostMcpOAuthMetadataService.js';
import './browser/forgeAgentHostEnablementService.js';
import '../workbench/services/browserView/electron-browser/playwrightWorkbenchService.js';
import '../workbench/services/process/electron-browser/processService.js';
import '../workbench/services/power/electron-browser/powerService.js';

import { registerSingleton } from '../platform/instantiation/common/extensions.js';
import { IUserDataInitializationService, UserDataInitializationService } from '../workbench/services/userData/browser/userDataInit.js';
import { SyncDescriptor } from '../platform/instantiation/common/descriptors.js';

registerSingleton(IUserDataInitializationService, new SyncDescriptor(UserDataInitializationService, [[]], true));

//#endregion


//#region --- workbench contributions

// Logs
import '../workbench/contrib/logs/electron-browser/logs.contribution.js';

// Localizations
import '../workbench/contrib/localization/electron-browser/localization.contribution.js';

// Files
import '../workbench/contrib/files/electron-browser/fileActions.contribution.js';

// CodeEditor Contributions
import '../workbench/contrib/codeEditor/electron-browser/codeEditor.contribution.js';

// Debug
import '../workbench/contrib/debug/electron-browser/extensionHostDebugService.js';

// Extensions Management
import '../workbench/contrib/extensions/electron-browser/extensions.contribution.js';
import '../workbench/contrib/extensions/electron-browser/devtoolsExtensionHost.contribution.js';

// Issues
import '../workbench/contrib/issue/electron-browser/issue.contribution.js';

// Remote
import '../workbench/contrib/remote/electron-browser/remote.contribution.js';

// Terminal
import '../workbench/contrib/terminal/electron-browser/terminal.contribution.js';

// Themes
import '../workbench/services/themes/electron-browser/themes.contribution.js';

// Performance
import '../workbench/contrib/performance/electron-browser/performance.contribution.js';

// Tasks
import '../workbench/contrib/tasks/electron-browser/taskService.js';

// External terminal
import '../workbench/contrib/externalTerminal/electron-browser/externalTerminal.contribution.js';

// Webview
import '../workbench/contrib/webview/electron-browser/webview.contribution.js';

// Browser
import '../workbench/contrib/browserView/electron-browser/browserView.contribution.js';
import '../workbench/contrib/canvases/electron-browser/editorCanvases.contribution.js';

// Splash
import '../workbench/contrib/splash/electron-browser/splash.contribution.js';

// Multi Diff Editor
import '../workbench/contrib/multiDiffEditor/browser/multiDiffEditor.contribution.js';

// Chat
import '../workbench/contrib/chat/electron-browser/chat.contribution.js';

// Copilot Voice
import '../workbench/contrib/agentsVoice/electron-browser/agentsVoiceNativeCommands.js';

// Encryption
import '../workbench/contrib/encryption/electron-browser/encryption.contribution.js';

// Modern UI
import '../workbench/contrib/modernUI/electron-browser/frostedGlass.contribution.js';

// MCP
import '../workbench/contrib/mcp/electron-browser/mcp.contribution.js';

// Policy Export
import '../workbench/contrib/policyExport/electron-browser/policyExport.contribution.js';

//#endregion


//#region --- forge

import './browser/forge.contribution.js';

//#endregion

export { main } from './electron-browser/forge.main.js';
