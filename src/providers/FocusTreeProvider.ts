import * as vscode from 'vscode';
import { Logger } from '../logger';
import { FocusSessionManager } from '../FocusSessionManager';
import { StorageManager } from '../StorageManager';
import { InsightsEngine } from '../InsightsEngine';
import { FocusSession } from '../types';

/**
 * Tree node for the Focus & Flow sidebar view.
 */
class FocusNode extends vscode.TreeItem {
    public children?: FocusNode[];
    constructor(
        label: string,
        icon: string,
        collapsible: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
    ) {
        super(label, collapsible);
        this.iconPath = new vscode.ThemeIcon(icon);
    }
}

/**
 * TreeDataProvider for "Focus & Flow" sidebar view.
 * Shows active session, recent sessions, and all-time focus stats.
 */
export class FocusTreeProvider implements vscode.TreeDataProvider<FocusNode> {
    private readonly _onDidChange = new vscode.EventEmitter<FocusNode | undefined | void>();
    public readonly onDidChangeTreeData = this._onDidChange.event;

    private readonly focus: FocusSessionManager;
    private readonly storage: StorageManager;
    private readonly insights: InsightsEngine;
    private readonly log: Logger;

    constructor(focus: FocusSessionManager, storage: StorageManager, insights: InsightsEngine) {
        this.focus = focus;
        this.storage = storage;
        this.insights = insights;
        this.log = Logger.instance;

        // Auto-refresh when focus session changes
        focus.onDidChange(() => this.refresh());
    }

    public refresh(): void { this._onDidChange.fire(); }

    public getTreeItem(el: FocusNode): vscode.TreeItem { return el; }

    public getChildren(el?: FocusNode): FocusNode[] {
        if (el) { return el.children ?? []; }
        return this.buildRoot();
    }

    private buildRoot(): FocusNode[] {
        const items: FocusNode[] = [];

        // Active session
        const active = this.focus.getCurrentSession();
        if (active) {
            const elapsed = this.focus.getElapsedMinutes();
            const progress = Math.min(100, Math.round((elapsed / active.goalMinutes) * 100));

            const activeNode = new FocusNode(
                `Active: ${active.goal}`, 'target',
                vscode.TreeItemCollapsibleState.Expanded
            );
            activeNode.description = `${elapsed}/${active.goalMinutes}m`;
            activeNode.tooltip = `Focus session in progress \u2014 ${progress}% complete`;
            activeNode.children = [
                this.stat('Progress', `${progress}%`, 'loading~spin'),
                this.stat('Context Switches', String(active.contextSwitches), 'arrow-swap'),
                this.stat('Files', String(active.filesWorkedOn.length), 'file-code'),
                this.stat('Project', active.project, 'folder')
            ];

            const stopNode = new FocusNode('Stop Focus Session', 'debug-stop');
            stopNode.command = { command: 'devpulse.stopFocusSession', title: 'Stop' };
            stopNode.description = 'Click to end session';

            items.push(activeNode, stopNode);
        } else {
            const startNode = new FocusNode('Start Focus Session', 'target');
            startNode.command = { command: 'devpulse.startFocusSession', title: 'Start' };
            startNode.description = 'Ctrl+Alt+F';
            items.push(startNode);
        }

        // Recent sessions
        const recent = this.focus.getRecentSessions(5);
        if (recent.length > 0) {
            const recentParent = new FocusNode('Recent Sessions', 'history', vscode.TreeItemCollapsibleState.Expanded);
            recentParent.children = recent.map(s => this.sessionNode(s));
            items.push(recentParent);
        }

        // All-time stats
        const allSessions = this.storage.getFocusSessions();
        if (allSessions.length > 0) {
            const avgFlow = allSessions.reduce((s, f) => s + f.flowScore, 0) / allSessions.length;
            const totalTime = allSessions.reduce((s, f) => s + f.durationMinutes, 0);
            const statsParent = new FocusNode('All-Time Stats', 'graph', vscode.TreeItemCollapsibleState.Collapsed);
            statsParent.children = [
                this.stat('Total Sessions', String(allSessions.length), 'symbol-number'),
                this.stat('Total Focus Time', this.insights.formatDuration(totalTime * 60), 'clock'),
                this.stat('Avg Flow Score', `${Math.round(avgFlow * 10) / 10}/10`, 'star')
            ];
            items.push(statsParent);
        }

        return items;
    }

    private sessionNode(session: FocusSession): FocusNode {
        const icon = session.flowScore >= 7 ? 'star-full'
            : session.flowScore >= 4 ? 'star-half'
            : 'star-empty';
        const node = new FocusNode(session.goal, icon);
        node.description = `${session.durationMinutes}m \u00b7 Flow: ${session.flowScore}/10`;
        node.tooltip = `Started: ${new Date(session.startTime).toLocaleString()}\nSwitches: ${session.contextSwitches}`;
        return node;
    }

    private stat(label: string, value: string, icon: string): FocusNode {
        const node = new FocusNode(label, icon);
        node.description = value;
        return node;
    }
}
