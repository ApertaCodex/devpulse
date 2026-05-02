import * as vscode from 'vscode';
import { Logger } from '../logger';
import { StorageManager } from '../StorageManager';
import { InsightsEngine } from '../InsightsEngine';
import { ProjectStats, WorkIntent } from '../types';

/**
 * Tree node for the Projects & Languages sidebar view.
 */
class ProjectNode extends vscode.TreeItem {
    public children?: ProjectNode[];
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
 * TreeDataProvider for "Projects & Languages" sidebar view.
 * Shows all-time project breakdown with languages, intents, and branches.
 */
export class ProjectsTreeProvider implements vscode.TreeDataProvider<ProjectNode> {
    private readonly _onDidChange = new vscode.EventEmitter<ProjectNode | undefined | void>();
    public readonly onDidChangeTreeData = this._onDidChange.event;

    private readonly storage: StorageManager;
    private readonly insights: InsightsEngine;
    private readonly log: Logger;

    constructor(storage: StorageManager, insights: InsightsEngine) {
        this.storage = storage;
        this.insights = insights;
        this.log = Logger.instance;
    }

    public refresh(): void { this._onDidChange.fire(); }

    public getTreeItem(el: ProjectNode): vscode.TreeItem { return el; }

    public getChildren(el?: ProjectNode): ProjectNode[] {
        if (el) { return el.children ?? []; }
        return this.buildRoot();
    }

    private buildRoot(): ProjectNode[] {
        try {
            const projects = this.storage.getProjectStats();
            const sorted = Object.values(projects).sort((a, b) => b.totalSeconds - a.totalSeconds);

            if (sorted.length === 0) {
                const empty = new ProjectNode('No projects tracked yet', 'info');
                empty.description = 'Open a workspace to start tracking';
                return [empty];
            }

            return sorted.map(p => this.buildProject(p));
        } catch (err) {
            this.log.error('ProjectsTreeProvider error', err);
            return [new ProjectNode('Error loading projects', 'error')];
        }
    }

    private buildProject(proj: ProjectStats): ProjectNode {
        const node = new ProjectNode(proj.name, 'folder', vscode.TreeItemCollapsibleState.Collapsed);
        node.description = this.insights.formatDuration(proj.totalSeconds);
        node.tooltip = `Last active: ${new Date(proj.lastActive).toLocaleString()}`;
        node.children = [];

        // Languages
        const langEntries = Object.entries(proj.languages).sort((a, b) => b[1] - a[1]).slice(0, 5);
        if (langEntries.length > 0) {
            const langParent = new ProjectNode('Languages', 'code', vscode.TreeItemCollapsibleState.Expanded);
            langParent.children = langEntries.map(([lang, secs]) => {
                const n = new ProjectNode(lang, 'symbol-file');
                n.description = this.insights.formatDuration(secs);
                return n;
            });
            node.children.push(langParent);
        }

        // Intent breakdown
        const intentLabels: Record<WorkIntent, string> = {
            creating: 'Creating', debugging: 'Debugging', refactoring: 'Refactoring',
            exploring: 'Exploring', idle: 'Idle', unknown: 'Mixed'
        };
        const intentEntries = Object.entries(proj.intentBreakdown)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1]);
        if (intentEntries.length > 0) {
            const intentParent = new ProjectNode('Work Breakdown', 'pie-chart', vscode.TreeItemCollapsibleState.Collapsed);
            intentParent.children = intentEntries.map(([intent, secs]) => {
                const pct = proj.totalSeconds > 0 ? Math.round((secs / proj.totalSeconds) * 100) : 0;
                const n = new ProjectNode(intentLabels[intent as WorkIntent] ?? intent, 'symbol-misc');
                n.description = `${this.insights.formatDuration(secs)} (${pct}%)`;
                return n;
            });
            node.children.push(intentParent);
        }

        // Branches
        if (proj.branches.length > 0) {
            const branchParent = new ProjectNode('Branches', 'git-branch', vscode.TreeItemCollapsibleState.Collapsed);
            branchParent.children = proj.branches.slice(-10).map(b => {
                return new ProjectNode(b, 'git-commit');
            });
            node.children.push(branchParent);
        }

        return node;
    }
}
