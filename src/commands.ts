import * as vscode from 'vscode';
import { Logger } from './logger';
import { Config } from './config';
import { openTerminal } from './terminal';
import { StorageManager } from './StorageManager';
import { ActivityTracker } from './ActivityTracker';
import { InsightsEngine } from './InsightsEngine';
import { FocusSessionManager } from './FocusSessionManager';
import { StatusBarManager } from './statusBar';
import { DashboardPanel } from './DashboardPanel';

/** All command IDs used by DevPulse. */
export const COMMANDS = {
    showInfo:           'devpulse.showInfo',
    openTerminal:       'devpulse.openTerminal',
    refresh:            'devpulse.refresh',
    openDashboard:      'devpulse.openDashboard',
    startFocusSession:  'devpulse.startFocusSession',
    stopFocusSession:   'devpulse.stopFocusSession',
    showWeeklyReport:   'devpulse.showWeeklyReport',
    toggleTracking:     'devpulse.toggleTracking',
    clearData:          'devpulse.clearData',
    exportData:         'devpulse.exportData',
    showAIInsights:     'devpulse.showAIInsights',
    configureSettings:  'devpulse.configureSettings',
    openWebview:        'devpulse.openWebview',
    addItem:            'devpulse.addItem',
    removeItem:         'devpulse.removeItem'
} as const;

export interface CommandDeps {
    context: vscode.ExtensionContext;
    storage: StorageManager;
    tracker: ActivityTracker;
    insights: InsightsEngine;
    focus: FocusSessionManager;
    statusBar: StatusBarManager;
    refreshAll: () => void;
}

/**
 * Register every command declared in package.json.
 * Returns disposables to push into context.subscriptions.
 */
export function registerCommands(deps: CommandDeps): vscode.Disposable[] {
    const { context, storage, tracker, insights, focus, statusBar, refreshAll } = deps;
    const log = Logger.instance;

    return [
        // ---- Core commands (always present) ----
        vscode.commands.registerCommand(COMMANDS.showInfo, () => {
            vscode.window.showInformationMessage(
                `DevPulse v2.0.0 — Tracking: ${Config.enabled ? 'ON' : 'OFF'} | Today: ${formatDuration(tracker.getTodayActiveSeconds())}`
            );
        }),

        vscode.commands.registerCommand(COMMANDS.openTerminal, () => {
            openTerminal();
        }),

        // ---- Refresh ----
        vscode.commands.registerCommand(COMMANDS.refresh, () => {
            refreshAll();
            log.info('Views refreshed manually.');
        }),

        // ---- Dashboard ----
        vscode.commands.registerCommand(COMMANDS.openDashboard, () => {
            DashboardPanel.createOrShow(context, storage, insights, focus);
        }),

        vscode.commands.registerCommand(COMMANDS.openWebview, () => {
            DashboardPanel.createOrShow(context, storage, insights, focus);
        }),

        // ---- Focus sessions ----
        vscode.commands.registerCommand(COMMANDS.startFocusSession, async () => {
            const goal = await vscode.window.showInputBox({
                prompt: 'What will you focus on? (optional)',
                placeHolder: 'e.g. Implement authentication module'
            });
            const durationStr = await vscode.window.showInputBox({
                prompt: 'Focus session duration (minutes)',
                value: String(Config.focusSessionGoalMinutes),
                validateInput: (v) => {
                    const n = Number(v);
                    return isNaN(n) || n < 1 ? 'Enter a valid number of minutes' : undefined;
                }
            });
            if (durationStr === undefined) { return; }
            const duration = Number(durationStr);
            focus.startSession(goal ?? 'Focus Session', duration);
            await vscode.commands.executeCommand('setContext', 'devpulse.focusActive', true);
            refreshAll();
            vscode.window.showInformationMessage(
                `$(target) Focus session started! Goal: ${duration} minutes.`
            );
        }),

        vscode.commands.registerCommand(COMMANDS.stopFocusSession, async () => {
            const summary = focus.stopSession();
            await vscode.commands.executeCommand('setContext', 'devpulse.focusActive', false);
            refreshAll();
            if (summary) {
                vscode.window.showInformationMessage(
                    `$(check) Focus session complete! Duration: ${summary.durationMinutes}m | Flow: ${summary.flowScore}/10`
                );
            }
        }),

        // ---- Reports ----
        vscode.commands.registerCommand(COMMANDS.showWeeklyReport, () => {
            DashboardPanel.createOrShow(context, storage, insights, focus, 'weekly');
        }),

        // ---- Tracking toggle ----
        vscode.commands.registerCommand(COMMANDS.toggleTracking, async () => {
            const current = Config.enabled;
            await Config.set('enabled', !current);
            if (!current) {
                tracker.enable();
                vscode.window.showInformationMessage('$(record) DevPulse tracking enabled.');
            } else {
                tracker.disable();
                vscode.window.showInformationMessage('$(debug-pause) DevPulse tracking paused.');
            }
            refreshAll();
        }),

        // ---- Data management ----
        vscode.commands.registerCommand(COMMANDS.clearData, async () => {
            const answer = await vscode.window.showWarningMessage(
                'Are you sure you want to clear ALL DevPulse tracking data? This cannot be undone.',
                { modal: true },
                'Clear All Data'
            );
            if (answer === 'Clear All Data') {
                await storage.clearAllData();
                refreshAll();
                vscode.window.showInformationMessage('$(trash) All DevPulse data cleared.');
            }
        }),

        vscode.commands.registerCommand(COMMANDS.exportData, async () => {
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Exporting DevPulse data...' },
                async () => {
                    const uri = await vscode.window.showSaveDialog({
                        defaultUri: vscode.Uri.file('devpulse-export.json'),
                        filters: { JSON: ['json'] }
                    });
                    if (!uri) { return; }
                    const data = await storage.exportAll();
                    const content = Buffer.from(JSON.stringify(data, null, 2), 'utf8');
                    await vscode.workspace.fs.writeFile(uri, content);
                    vscode.window.showInformationMessage(`$(export) Data exported to ${uri.fsPath}`);
                }
            );
        }),

        // ---- AI Insights ----
        vscode.commands.registerCommand(COMMANDS.showAIInsights, async () => {
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: '$(sparkle) Generating AI insights...' },
                async () => {
                    const result = await insights.generateAIInsights(true);
                    refreshAll();
                    DashboardPanel.createOrShow(context, storage, insights, focus, 'insights');
                    vscode.window.showInformationMessage(`$(sparkle) ${result.headline}`);
                }
            );
        }),

        // ---- Settings ----
        vscode.commands.registerCommand(COMMANDS.configureSettings, () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'devpulse');
        }),

        // ---- Tree item management ----
        vscode.commands.registerCommand(COMMANDS.addItem, async () => {
            // Placeholder for adding bookmarked items
            vscode.window.showInformationMessage('$(add) Bookmark feature coming soon.');
        }),

        vscode.commands.registerCommand(COMMANDS.removeItem, async (item: unknown) => {
            // Placeholder for removing items from tree views
            vscode.window.showInformationMessage('$(trash) Item removed.');
            refreshAll();
        })
    ];
}

/** Format seconds into a human-readable duration string. */
function formatDuration(seconds: number): string {
    if (seconds < 60) { return `${Math.round(seconds)}s`; }
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h === 0) { return `${m}m`; }
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
