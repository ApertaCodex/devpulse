import * as vscode from 'vscode';
import { Logger } from './logger';
import { Config } from './config';
import { StatusBarManager } from './statusBar';
import { StorageManager } from './StorageManager';
import { ActivityTracker } from './ActivityTracker';
import { InsightsEngine } from './InsightsEngine';
import { FocusSessionManager } from './FocusSessionManager';
import { registerCommands } from './commands';
import { TodayTreeProvider } from './providers/TodayTreeProvider';
import { InsightsTreeProvider } from './providers/InsightsTreeProvider';
import { ProjectsTreeProvider } from './providers/ProjectsTreeProvider';
import { FocusTreeProvider } from './providers/FocusTreeProvider';
import { DashboardWebviewProvider } from './providers/DashboardWebviewProvider';

/** Global extension context, available to other modules if needed. */
export let extensionContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext): void {
    extensionContext = context;

    // ---- Logger (singleton) ----
    const log = Logger.create('DevPulse');
    log.info('DevPulse activating...');

    // ---- Core services ----
    const storage = new StorageManager(context);
    const tracker = new ActivityTracker(storage);
    const insights = new InsightsEngine(storage);
    const focus = new FocusSessionManager(context, storage);
    const statusBar = new StatusBarManager();

    // ---- Tree view providers ----
    const todayProvider = new TodayTreeProvider(storage, tracker, insights);
    const insightsProvider = new InsightsTreeProvider(insights, storage);
    const projectsProvider = new ProjectsTreeProvider(storage, insights);
    const focusProvider = new FocusTreeProvider(focus, storage, insights);

    // ---- Webview sidebar provider ----
    const dashboardSidebarProvider = new DashboardWebviewProvider(storage, insights, focus);

    // ---- Register tree views ----
    const registrations: vscode.Disposable[] = [
        vscode.window.createTreeView('devpulse.todayView', {
            treeDataProvider: todayProvider, showCollapseAll: false
        }),
        vscode.window.createTreeView('devpulse.insightsView', {
            treeDataProvider: insightsProvider, showCollapseAll: false
        }),
        vscode.window.createTreeView('devpulse.projectsView', {
            treeDataProvider: projectsProvider, showCollapseAll: true
        }),
        vscode.window.createTreeView('devpulse.focusView', {
            treeDataProvider: focusProvider, showCollapseAll: false
        }),
        vscode.window.registerWebviewViewProvider(
            DashboardWebviewProvider.viewType,
            dashboardSidebarProvider
        )
    ];

    // ---- Refresh helper ----
    const refreshAll = (): void => {
        todayProvider.refresh();
        insightsProvider.refresh();
        projectsProvider.refresh();
        focusProvider.refresh();
        dashboardSidebarProvider.refresh();
        updateStatusBar();
    };

    // ---- Status bar update helper ----
    const updateStatusBar = (): void => {
        if (!Config.showStatusBar) {
            statusBar.updateMain('');
            statusBar.updateFocus('');
            return;
        }

        const totalSeconds = tracker.getTodayActiveSeconds();
        const format = Config.statusBarFormat;

        let text = '';
        if (!Config.enabled) {
            text = '$(debug-pause) DevPulse: Paused';
        } else if (format === 'time') {
            text = `$(clock) ${insights.formatDuration(totalSeconds)}`;
        } else if (format === 'time+intent') {
            const idle = tracker.isCurrentlyIdle();
            const intentIcons: Record<string, string> = {
                creating: '$(add)', debugging: '$(debug)', refactoring: '$(edit)',
                exploring: '$(search)', idle: '$(coffee)', unknown: '$(pulse)'
            };
            const icon = idle ? '$(coffee)' : (intentIcons[tracker.getCurrentIntent()] ?? '$(pulse)');
            text = idle
                ? `${icon} ${insights.formatDuration(totalSeconds)} \u00b7 idle`
                : `${icon} ${insights.formatDuration(totalSeconds)}`;
        } else {
            // focus format
            const session = focus.getCurrentSession();
            if (session) {
                const elapsed = focus.getElapsedMinutes();
                text = `$(target) ${elapsed}/${session.goalMinutes}m`;
            } else {
                text = `$(clock) ${insights.formatDuration(totalSeconds)}`;
            }
        }
        statusBar.updateMain(text);

        // Focus item
        const session = focus.getCurrentSession();
        if (session) {
            const elapsed = focus.getElapsedMinutes();
            const progress = Math.min(100, Math.round((elapsed / session.goalMinutes) * 100));
            statusBar.updateFocus(`$(target) Focus: ${elapsed}m/${session.goalMinutes}m (${progress}%)`);
        } else {
            statusBar.updateFocus('');
        }
    };

    // ---- Register all commands ----
    const commandDisposables = registerCommands({
        context, storage, tracker, insights, focus, statusBar, refreshAll
    });
    registrations.push(...commandDisposables);

    // ---- Periodic refresh (every 60s) ----
    const refreshInterval = setInterval(refreshAll, 60_000);
    registrations.push({ dispose: () => clearInterval(refreshInterval) });

    // ---- Config change listener ----
    registrations.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('devpulse')) {
                refreshAll();
            }
        })
    );

    // ---- Focus session change listener ----
    registrations.push(
        focus.onDidChange(() => updateStatusBar())
    );

    // ---- Disposable managers ----
    registrations.push(tracker, statusBar, focus);

    // ---- Push all registrations ----
    registrations.forEach(r => context.subscriptions.push(r));

    // ---- Start tracking if enabled ----
    if (Config.enabled) {
        tracker.enable();
        vscode.commands.executeCommand('setContext', 'devpulse.focusActive', false);
    }

    // ---- Initial render ----
    updateStatusBar();
    log.info('DevPulse activated successfully.');
}

export function deactivate(): void {
    try {
        Logger.instance.info('DevPulse deactivated.');
    } catch {
        // Logger may not exist if activation failed
    }
}
