import * as vscode from 'vscode';
import { Logger } from '../logger';
import { InsightsEngine } from '../InsightsEngine';
import { StorageManager } from '../StorageManager';
import { AIInsight } from '../types';

/**
 * Tree node for the Insights & Coaching sidebar view.
 */
class InsightNode extends vscode.TreeItem {
    public children?: InsightNode[];
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
 * TreeDataProvider for "Insights & Coaching" sidebar view.
 * Shows quick stats, AI coaching, and 7-day trend.
 */
export class InsightsTreeProvider implements vscode.TreeDataProvider<InsightNode> {
    private readonly _onDidChange = new vscode.EventEmitter<InsightNode | undefined | void>();
    public readonly onDidChangeTreeData = this._onDidChange.event;

    private readonly insights: InsightsEngine;
    private readonly storage: StorageManager;
    private readonly log: Logger;

    constructor(insights: InsightsEngine, storage: StorageManager) {
        this.insights = insights;
        this.storage = storage;
        this.log = Logger.instance;
    }

    public refresh(): void { this._onDidChange.fire(); }

    public getTreeItem(el: InsightNode): vscode.TreeItem { return el; }

    public getChildren(el?: InsightNode): InsightNode[] {
        if (el) { return el.children ?? []; }
        return this.buildRoot();
    }

    private buildRoot(): InsightNode[] {
        try {
            const items: InsightNode[] = [];

            // Quick stats
            const quickStats = this.insights.getQuickStats();
            const statsParent = new InsightNode('Quick Stats', 'graph', vscode.TreeItemCollapsibleState.Expanded);
            statsParent.children = quickStats.map(s => {
                const node = new InsightNode(s.label, s.icon);
                node.description = s.value;
                return node;
            });
            items.push(statsParent);

            // AI Insights
            const cached = this.insights.getCachedInsight();
            if (cached) {
                const aiParent = new InsightNode('AI Coaching', 'sparkle', vscode.TreeItemCollapsibleState.Expanded);
                aiParent.children = [];

                const headline = new InsightNode(cached.headline, 'lightbulb');
                headline.tooltip = cached.summary;
                aiParent.children.push(headline);

                const score = new InsightNode(`Productivity: ${cached.productivityScore}/100`, 'star');
                score.description = `Focus: ${cached.focusScore}/10`;
                aiParent.children.push(score);

                const peak = new InsightNode(`Peak Hours: ${cached.peakHours}`, 'flame');
                aiParent.children.push(peak);

                if (cached.contextSwitchWarning) {
                    const warn = new InsightNode('Context Switch Warning', 'warning');
                    warn.description = cached.contextSwitchWarning;
                    warn.tooltip = cached.contextSwitchWarning;
                    aiParent.children.push(warn);
                }

                const tipsParent = new InsightNode('Recommendations', 'checklist', vscode.TreeItemCollapsibleState.Expanded);
                tipsParent.children = cached.tips.map((tip, i) => {
                    const tipNode = new InsightNode(`Tip ${i + 1}`, 'arrow-right');
                    tipNode.description = tip.length > 60 ? tip.slice(0, 57) + '...' : tip;
                    tipNode.tooltip = tip;
                    return tipNode;
                });
                aiParent.children.push(tipsParent);
                items.push(aiParent);
            } else {
                const gen = new InsightNode('Generate AI Insights', 'sparkle');
                gen.command = { command: 'devpulse.showAIInsights', title: 'Generate AI Insights' };
                gen.description = 'Click to analyze your patterns';
                items.push(gen);
            }

            // 7-day trend
            const last7 = this.storage.getLastNDays(7);
            const trendParent = new InsightNode('7-Day Trend', 'graph-line', vscode.TreeItemCollapsibleState.Collapsed);
            trendParent.children = last7.map(day => {
                const node = new InsightNode(day.date, 'calendar');
                node.description = day.totalActiveSeconds > 0
                    ? this.insights.formatDuration(day.totalActiveSeconds)
                    : 'No activity';
                return node;
            });
            items.push(trendParent);

            return items;
        } catch (err) {
            this.log.error('InsightsTreeProvider error', err);
            return [new InsightNode('Error loading insights', 'error')];
        }
    }
}
