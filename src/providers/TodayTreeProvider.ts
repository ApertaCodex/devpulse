import * as vscode from 'vscode';
import { Logger } from '../logger';
import { StorageManager } from '../StorageManager';
import { ActivityTracker } from '../ActivityTracker';
import { InsightsEngine } from '../InsightsEngine';
import { WorkIntent } from '../types';

/**
 * Tree node for the Today's Activity sidebar view.
 */
class TodayNode extends vscode.TreeItem {
    public children?: TodayNode[];
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
 * TreeDataProvider for "Today's Activity" sidebar view.
 * Shows live stats, work breakdown, languages, and session stats.
 */
export class TodayTreeProvider implements vscode.TreeDataProvider<TodayNode> {
    private readonly _onDidChange = new vscode.EventEmitter<TodayNode | undefined | void>();
    public readonly onDidChangeTreeData = this._onDidChange.event;

    private readonly storage: StorageManager;
    private readonly tracker: ActivityTracker;
    private readonly insights: InsightsEngine;
    private readonly log: Logger;

    constructor(storage: StorageManager, tracker: ActivityTracker, insights: InsightsEngine) {
        this.storage = storage;
        this.tracker = tracker;
        this.insights = insights;
        this.log = Logger.instance;
    }

    public refresh(): void { this._onDidChange.fire(); }

    public getTreeItem(el: TodayNode): vscode.TreeItem { return el; }

    public getChildren(el?: TodayNode): TodayNode[] {
        if (el) { return el.children ?? []; }
        return this.buildRoot();
    }

    private buildRoot(): TodayNode[] {
        try {
            const stats = this.storage.getTodayStats();
            const items: TodayNode[] = [];

            // Summary
            const total = new TodayNode(
                `Today: ${this.insights.formatDuration(stats.totalActiveSeconds)}`,
                'clock'
            );
            total.description = new Date().toLocaleDateString();
            total.tooltip = 'Total active coding time today';
            items.push(total);

            // Current status
            const idle = this.tracker.isCurrentlyIdle();
            const intent = this.tracker.getCurrentIntent();
            const status = new TodayNode(
                idle ? 'Status: Idle' : `Status: ${this.cap(intent)}`,
                idle ? 'coffee' : this.intentIcon(intent)
            );
            status.description = idle ? 'No recent activity' : this.tracker.getCurrentProject();
            items.push(status);

            // Work breakdown
            const intentParent = new TodayNode('Work Breakdown', 'pie-chart', vscode.TreeItemCollapsibleState.Expanded);
            intentParent.children = this.buildIntentItems(stats.intentBreakdown, stats.totalActiveSeconds);
            if (intentParent.children.length > 0) { items.push(intentParent); }

            // Languages
            const langParent = new TodayNode('Languages', 'code', vscode.TreeItemCollapsibleState.Collapsed);
            langParent.children = this.buildMapItems(stats.languageBreakdown, stats.totalActiveSeconds, 'symbol-file');
            if (langParent.children.length > 0) { items.push(langParent); }

            // Session stats
            const statsParent = new TodayNode('Session Stats', 'graph', vscode.TreeItemCollapsibleState.Collapsed);
            statsParent.children = [
                this.stat('Context Switches', String(stats.contextSwitches), 'arrow-swap'),
                this.stat('Longest Focus', this.insights.formatDuration(stats.longestFocusSeconds), 'eye'),
                this.stat('Peak Hour', stats.peakHour >= 0 ? `${stats.peakHour}:00` : 'N/A', 'flame'),
                this.stat('Files Edited', String(stats.filesEdited), 'file-code')
            ];
            items.push(statsParent);

            return items;
        } catch (err) {
            this.log.error('TodayTreeProvider error', err);
            return [new TodayNode('Error loading data', 'error')];
        }
    }

    private buildIntentItems(breakdown: Record<WorkIntent, number>, total: number): TodayNode[] {
        const labels: Record<WorkIntent, string> = {
            creating: 'Creating', debugging: 'Debugging', refactoring: 'Refactoring',
            exploring: 'Exploring', idle: 'Idle', unknown: 'Mixed'
        };
        return Object.entries(breakdown)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([intent, secs]) => {
                const pct = total > 0 ? Math.round((secs / total) * 100) : 0;
                const node = new TodayNode(labels[intent as WorkIntent] ?? intent, this.intentIcon(intent));
                node.description = `${this.insights.formatDuration(secs)} (${pct}%)`;
                return node;
            });
    }

    private buildMapItems(map: Record<string, number>, total: number, icon: string): TodayNode[] {
        return Object.entries(map)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([key, secs]) => {
                const pct = total > 0 ? Math.round((secs / total) * 100) : 0;
                const node = new TodayNode(key, icon);
                node.description = `${this.insights.formatDuration(secs)} (${pct}%)`;
                return node;
            });
    }

    private stat(label: string, value: string, icon: string): TodayNode {
        const node = new TodayNode(label, icon);
        node.description = value;
        return node;
    }

    private intentIcon(intent: string): string {
        const map: Record<string, string> = {
            creating: 'add', debugging: 'debug', refactoring: 'edit',
            exploring: 'search', idle: 'coffee', unknown: 'pulse'
        };
        return map[intent] ?? 'pulse';
    }

    private cap(s: string): string {
        return s.charAt(0).toUpperCase() + s.slice(1);
    }
}
