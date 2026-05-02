import * as vscode from 'vscode';
import { Logger } from '../logger';
import { StorageManager } from '../StorageManager';
import { InsightsEngine } from '../InsightsEngine';
import { FocusSessionManager } from '../FocusSessionManager';

/**
 * WebviewViewProvider for the "Quick Dashboard" sidebar panel.
 * Shows a compact summary of today's activity.
 */
export class DashboardWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'devpulse.dashboardSidebar';
    private view?: vscode.WebviewView;
    private readonly storage: StorageManager;
    private readonly insights: InsightsEngine;
    private readonly focus: FocusSessionManager;
    private readonly log: Logger;

    constructor(storage: StorageManager, insights: InsightsEngine, focus: FocusSessionManager) {
        this.storage = storage;
        this.insights = insights;
        this.focus = focus;
        this.log = Logger.instance;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        this.updateContent();

        webviewView.webview.onDidReceiveMessage(msg => {
            switch (msg.command) {
                case 'openDashboard':
                    vscode.commands.executeCommand('devpulse.openDashboard');
                    break;
                case 'startFocus':
                    vscode.commands.executeCommand('devpulse.startFocusSession');
                    break;
                case 'refresh':
                    this.updateContent();
                    break;
            }
        });
    }

    public refresh(): void {
        this.updateContent();
    }

    private updateContent(): void {
        if (!this.view) { return; }

        const today = this.storage.getTodayStats();
        const todayTime = this.insights.formatDuration(today.totalActiveSeconds);
        const quickStats = this.insights.getQuickStats();
        const focusActive = this.focus.isActive();
        const focusSession = this.focus.getCurrentSession();

        const statsHtml = quickStats.slice(0, 4).map(s =>
            `<div class="stat"><span class="stat-label">${this.esc(s.label)}</span><span class="stat-value">${this.esc(s.value)}</span></div>`
        ).join('');

        this.view.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: var(--vscode-font-family); background: var(--vscode-sideBar-background); color: var(--vscode-foreground); padding: 12px; margin: 0; font-size: 12px; }
  .header { font-size: 14px; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
  .pulse { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .big-number { font-size: 28px; font-weight: 700; margin: 8px 0; }
  .stat { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--vscode-panel-border); }
  .stat-label { color: var(--vscode-descriptionForeground); }
  .stat-value { font-weight: 600; }
  .btn { display: block; width: 100%; padding: 8px; margin-top: 12px; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; text-align: center; }
  .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .btn:hover { opacity: 0.85; }
  .focus-active { background: #22c55e22; border: 1px solid #22c55e44; border-radius: 8px; padding: 8px; margin-top: 8px; }
  .focus-active-title { color: #22c55e; font-weight: 600; }
</style>
</head>
<body>
  <div class="header"><div class="pulse"></div> DevPulse</div>
  <div class="big-number">${this.esc(todayTime)}</div>
  <div style="color:var(--vscode-descriptionForeground);margin-bottom:12px">Active coding today</div>
  ${statsHtml}
  ${focusActive && focusSession
    ? `<div class="focus-active">
         <div class="focus-active-title">\u{1F3AF} Focus: ${this.esc(focusSession.goal)}</div>
         <div style="margin-top:4px">${this.focus.getElapsedMinutes()}m / ${focusSession.goalMinutes}m</div>
       </div>`
    : `<button class="btn btn-secondary" onclick="vscode.postMessage({command:'startFocus'})">\u{1F3AF} Start Focus Session</button>`}
  <button class="btn btn-primary" onclick="vscode.postMessage({command:'openDashboard'})">\u{1F4CA} Open Full Dashboard</button>
  <button class="btn btn-secondary" onclick="vscode.postMessage({command:'refresh'})">\u{21BB} Refresh</button>
  <script>const vscode = acquireVsCodeApi();</script>
</body>
</html>`;
    }

    private esc(text: string): string {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}
