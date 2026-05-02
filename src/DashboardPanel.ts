import * as vscode from 'vscode';
import { Logger } from './logger';
import { StorageManager } from './StorageManager';
import { InsightsEngine } from './InsightsEngine';
import { FocusSessionManager } from './FocusSessionManager';

export type DashboardTab = 'today' | 'weekly' | 'insights' | 'focus';

/**
 * Full-page webview panel for the DevPulse Dashboard.
 * Supports four tabs: Today, Weekly, AI Insights, Focus.
 */
export class DashboardPanel {
    private static instance: DashboardPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly storage: StorageManager;
    private readonly insights: InsightsEngine;
    private readonly focus: FocusSessionManager;
    private readonly log: Logger;
    private currentTab: DashboardTab;
    private readonly disposables: vscode.Disposable[] = [];

    public static createOrShow(
        context: vscode.ExtensionContext,
        storage: StorageManager,
        insights: InsightsEngine,
        focus: FocusSessionManager,
        tab: DashboardTab = 'today'
    ): void {
        const column = vscode.window.activeTextEditor?.viewColumn;
        if (DashboardPanel.instance) {
            DashboardPanel.instance.panel.reveal(column);
            DashboardPanel.instance.currentTab = tab;
            DashboardPanel.instance.render();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'devpulseDashboard', 'DevPulse Dashboard',
            column ?? vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        DashboardPanel.instance = new DashboardPanel(panel, storage, insights, focus, tab);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        storage: StorageManager,
        insights: InsightsEngine,
        focus: FocusSessionManager,
        tab: DashboardTab
    ) {
        this.panel = panel;
        this.storage = storage;
        this.insights = insights;
        this.focus = focus;
        this.log = Logger.instance;
        this.currentTab = tab;

        this.render();

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage(msg => this.onMessage(msg), null, this.disposables);

        const timer = setInterval(() => this.render(), 30_000);
        this.disposables.push({ dispose: () => clearInterval(timer) });
    }

    private async onMessage(msg: { command: string; tab?: string }): Promise<void> {
        switch (msg.command) {
            case 'switchTab':
                this.currentTab = (msg.tab as DashboardTab) ?? 'today';
                this.render();
                break;
            case 'startFocus':
                await vscode.commands.executeCommand('devpulse.startFocusSession');
                this.render();
                break;
            case 'stopFocus':
                await vscode.commands.executeCommand('devpulse.stopFocusSession');
                this.render();
                break;
            case 'generateInsights':
                await vscode.commands.executeCommand('devpulse.showAIInsights');
                this.render();
                break;
            case 'refresh':
                this.render();
                break;
        }
    }

    private render(): void {
        const tabTitles: Record<DashboardTab, string> = {
            today: 'Today', weekly: 'Weekly Report', insights: 'AI Insights', focus: 'Focus Sessions'
        };
        this.panel.title = `DevPulse \u2014 ${tabTitles[this.currentTab]}`;
        this.panel.webview.html = this.buildHtml();
    }

    private buildHtml(): string {
        const today = this.storage.getTodayStats();
        const last7 = this.storage.getLastNDays(7);
        const projects = this.storage.getProjectStats();
        const focusSessions = this.focus.getRecentSessions(10);
        const weeklyReport = this.insights.getWeeklyReport();

        const todayFormatted = this.insights.formatDuration(today.totalActiveSeconds);
        const weekTotal = this.insights.formatDuration(weeklyReport.totalActiveSeconds);

        // Hourly data (minutes)
        const hourData = today.hourlyActivity.map(s => Math.round(s / 60));

        // Daily trend
        const dailyLabels = last7.map(d => d.date.slice(5));
        const dailyData = last7.map(d => Math.round(d.totalActiveSeconds / 60));

        // Intent colors
        const iColors: Record<string, string> = {
            creating: '#22c55e', debugging: '#f59e0b', refactoring: '#3b82f6',
            exploring: '#8b5cf6', idle: '#6b7280', unknown: '#9ca3af'
        };
        const intentData = Object.entries(today.intentBreakdown)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => ({ label: k, value: Math.round(v / 60), color: iColors[k] ?? '#9ca3af' }));

        const topLangs = Object.entries(today.languageBreakdown)
            .sort((a, b) => b[1] - a[1]).slice(0, 6)
            .map(([lang, secs]) => ({ lang, minutes: Math.round(secs / 60) }));

        const topProjects = Object.values(projects)
            .sort((a, b) => b.totalSeconds - a.totalSeconds).slice(0, 5)
            .map(p => ({ name: p.name, hours: Math.round(p.totalSeconds / 360) / 10 }));

        const focusHtml = focusSessions.map(s =>
            `<div class="focus-card"><div class="focus-goal">${this.esc(s.goal)}</div><div class="focus-meta"><span class="badge">${s.durationMinutes}m</span><span class="badge badge-flow">Flow: ${s.flowScore}/10</span><span class="badge">${s.contextSwitches} switches</span></div><div class="focus-date">${new Date(s.startTime).toLocaleDateString()}</div></div>`
        ).join('');

        const tipsHtml = weeklyReport.insights.tips.map((tip, i) =>
            `<div class="tip-card"><span class="tip-num">${i + 1}</span><span class="tip-text">${this.esc(tip)}</span></div>`
        ).join('');

        const tab = this.currentTab;

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DevPulse Dashboard</title>
<style>
:root{--bg:var(--vscode-editor-background);--bg2:var(--vscode-sideBar-background);--fg:var(--vscode-editor-foreground);--accent:var(--vscode-button-background);--accent-fg:var(--vscode-button-foreground);--border:var(--vscode-panel-border);--card-bg:var(--vscode-editorWidget-background);--muted:var(--vscode-descriptionForeground);--success:#22c55e;--warning:#f59e0b;--danger:#ef4444}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);background:var(--bg);color:var(--fg);font-size:13px}
.container{max-width:1100px;margin:0 auto;padding:20px}
.header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border)}
.header h1{font-size:20px;font-weight:700;display:flex;align-items:center;gap:8px}
.pulse-dot{width:10px;height:10px;border-radius:50%;background:var(--success);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.tabs{display:flex;gap:4px;margin-bottom:20px}
.tab{padding:7px 16px;border:1px solid var(--border);border-radius:6px;cursor:pointer;background:transparent;color:var(--fg);font-size:12px;transition:all .15s}
.tab:hover{background:var(--card-bg)}
.tab.active{background:var(--accent);color:var(--accent-fg);border-color:var(--accent)}
.grid{display:grid;gap:16px}.grid-4{grid-template-columns:repeat(4,1fr)}.grid-2{grid-template-columns:repeat(2,1fr)}
@media(max-width:800px){.grid-4{grid-template-columns:repeat(2,1fr)}.grid-2{grid-template-columns:1fr}}
.card{background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:16px}
.card-title{font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:8px}
.card-value{font-size:28px;font-weight:700;line-height:1.2}
.card-sub{font-size:11px;color:var(--muted);margin-top:4px}
.section-title{font-size:14px;font-weight:600;margin:20px 0 12px;display:flex;align-items:center;gap:6px}
.bar-chart{display:flex;flex-direction:column;gap:6px}
.bar-row{display:flex;align-items:center;gap:8px}
.bar-label{width:80px;font-size:11px;color:var(--muted);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar-track{flex:1;height:14px;background:var(--bg2);border-radius:7px;overflow:hidden}
.bar-fill{height:100%;border-radius:7px;transition:width .5s ease}
.bar-val{width:40px;font-size:11px;color:var(--muted)}
.hour-chart{display:flex;align-items:flex-end;gap:2px;height:60px;padding:4px 0}
.hour-bar{flex:1;background:var(--accent);border-radius:2px 2px 0 0;min-height:2px;opacity:.8;transition:opacity .2s;cursor:default}
.hour-bar:hover{opacity:1}
.intent-grid{display:flex;flex-wrap:wrap;gap:8px}
.intent-chip{display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:500}
.intent-dot{width:8px;height:8px;border-radius:50%}
.focus-card{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px}
.focus-goal{font-weight:600;margin-bottom:6px}
.focus-meta{display:flex;gap:6px;flex-wrap:wrap}
.focus-date{font-size:11px;color:var(--muted);margin-top:4px}
.badge{background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:2px 8px;font-size:11px}
.badge-flow{border-color:var(--success);color:var(--success)}
.tip-card{display:flex;gap:10px;align-items:flex-start;padding:10px;background:var(--bg2);border-radius:8px;margin-bottom:8px}
.tip-num{background:var(--accent);color:var(--accent-fg);border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0}
.tip-text{font-size:12px;line-height:1.5}
.score-ring{display:flex;align-items:center;gap:16px}
.score-circle{width:80px;height:80px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;border:4px solid var(--accent)}
.btn{padding:8px 16px;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;transition:opacity .15s}
.btn-primary{background:var(--accent);color:var(--accent-fg)}
.btn-danger{background:var(--danger);color:white}
.btn:hover{opacity:.85}
.tab-content{display:none}.tab-content.active{display:block}
.no-data{text-align:center;padding:40px;color:var(--muted)}
.weekly-day{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)}
.weekly-day-label{width:80px;font-size:12px}
.weekly-day-bar{flex:1;height:10px;background:var(--bg2);border-radius:5px;overflow:hidden}
.weekly-day-fill{height:100%;background:var(--accent);border-radius:5px}
.weekly-day-val{width:50px;font-size:11px;color:var(--muted);text-align:right}
</style>
</head>
<body>
<div class="container">
<div class="header"><h1><div class="pulse-dot"></div> DevPulse Dashboard</h1><div style="display:flex;gap:8px;align-items:center"><span style="font-size:11px;color:var(--muted)">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span><button class="btn btn-primary" onclick="refresh()">\u21BB Refresh</button></div></div>
<div class="tabs">
<button class="tab ${tab === 'today' ? 'active' : ''}" onclick="switchTab('today')">\u{1F4C5} Today</button>
<button class="tab ${tab === 'weekly' ? 'active' : ''}" onclick="switchTab('weekly')">\u{1F4CA} Weekly</button>
<button class="tab ${tab === 'insights' ? 'active' : ''}" onclick="switchTab('insights')">\u{1F9E0} AI Insights</button>
<button class="tab ${tab === 'focus' ? 'active' : ''}" onclick="switchTab('focus')">\u{1F3AF} Focus</button>
</div>

<div class="tab-content ${tab === 'today' ? 'active' : ''}" id="tab-today">
<div class="grid grid-4" style="margin-bottom:16px">
<div class="card"><div class="card-title">\u23F1 Active Today</div><div class="card-value">${todayFormatted}</div><div class="card-sub">Coding time</div></div>
<div class="card"><div class="card-title">\u{1F500} Context Switches</div><div class="card-value">${today.contextSwitches}</div><div class="card-sub">${today.contextSwitches > 10 ? '\u26A0 High switching' : '\u2713 Manageable'}</div></div>
<div class="card"><div class="card-title">\u{1F441} Longest Focus</div><div class="card-value">${this.insights.formatDuration(today.longestFocusSeconds)}</div><div class="card-sub">Uninterrupted session</div></div>
<div class="card"><div class="card-title">\u{1F525} Peak Hour</div><div class="card-value">${today.peakHour >= 0 ? today.peakHour + ':00' : '\u2014'}</div><div class="card-sub">Most productive</div></div>
</div>
<div class="grid grid-2">
<div class="card"><div class="card-title">Hourly Activity (minutes)</div><div class="hour-chart">${hourData.map((m, i) => { const mx = Math.max(...hourData, 1); const h = Math.max(4, Math.round((m / mx) * 56)); return `<div class="hour-bar" style="height:${h}px" title="${i}:00 \u2014 ${m}m"></div>`; }).join('')}</div><div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:var(--muted)"><span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div></div>
<div class="card"><div class="card-title">Work Breakdown</div>${intentData.length > 0 ? `<div class="intent-grid">${intentData.map(d => `<div class="intent-chip" style="background:${d.color}22;border:1px solid ${d.color}44"><div class="intent-dot" style="background:${d.color}"></div><span>${d.label}</span><strong>${d.value}m</strong></div>`).join('')}</div>` : '<div class="no-data">No activity yet today</div>'}</div>
</div>
<div class="section-title">\u{1F4DA} Top Languages Today</div>
<div class="card"><div class="bar-chart">${topLangs.length > 0 ? topLangs.map(l => { const mx = Math.max(...topLangs.map(x => x.minutes), 1); const pct = Math.round((l.minutes / mx) * 100); return `<div class="bar-row"><div class="bar-label">${this.esc(l.lang)}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:var(--accent)"></div></div><div class="bar-val">${l.minutes}m</div></div>`; }).join('') : '<div class="no-data">No language data yet</div>'}</div></div>
</div>

<div class="tab-content ${tab === 'weekly' ? 'active' : ''}" id="tab-weekly">
<div class="grid grid-4" style="margin-bottom:16px">
<div class="card"><div class="card-title">\u{1F4C5} Week Total</div><div class="card-value">${weekTotal}</div><div class="card-sub">${weeklyReport.weekStart} \u2013 ${weeklyReport.weekEnd}</div></div>
<div class="card"><div class="card-title">\u{1F3AF} Focus Sessions</div><div class="card-value">${weeklyReport.totalFocusSessions}</div><div class="card-sub">Avg flow: ${weeklyReport.avgFocusScore}/10</div></div>
<div class="card"><div class="card-title">\u{1F500} Switch Rate</div><div class="card-value">${weeklyReport.contextSwitchRate}/h</div><div class="card-sub">${weeklyReport.contextSwitchRate > 8 ? '\u26A0 High' : '\u2713 Normal'}</div></div>
<div class="card"><div class="card-title">\u{1F525} Peak Hour</div><div class="card-value">${weeklyReport.mostProductiveHour}:00</div><div class="card-sub">Most productive</div></div>
</div>
<div class="section-title">\u{1F4C8} Daily Trend</div>
<div class="card">${dailyData.map((mins, i) => { const mx = Math.max(...dailyData, 1); const pct = Math.round((mins / mx) * 100); return `<div class="weekly-day"><div class="weekly-day-label">${dailyLabels[i]}</div><div class="weekly-day-bar"><div class="weekly-day-fill" style="width:${pct}%"></div></div><div class="weekly-day-val">${mins >= 60 ? Math.round(mins / 60 * 10) / 10 + 'h' : mins + 'm'}</div></div>`; }).join('')}</div>
<div class="grid grid-2" style="margin-top:16px">
<div class="card"><div class="card-title">Top Projects</div><div class="bar-chart">${topProjects.length > 0 ? topProjects.map(p => { const mx = Math.max(...topProjects.map(x => x.hours), 1); const pct = Math.round((p.hours / mx) * 100); return `<div class="bar-row"><div class="bar-label">${this.esc(p.name)}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:#8b5cf6"></div></div><div class="bar-val">${p.hours}h</div></div>`; }).join('') : '<div class="no-data">No project data</div>'}</div></div>
<div class="card"><div class="card-title">Top Languages (Week)</div><div class="bar-chart">${weeklyReport.topLanguages.slice(0, 6).map(l => { const mx = Math.max(...weeklyReport.topLanguages.map(x => x.seconds), 1); const pct = Math.round((l.seconds / mx) * 100); return `<div class="bar-row"><div class="bar-label">${this.esc(l.language)}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:#22c55e"></div></div><div class="bar-val">${Math.round(l.seconds / 60)}m</div></div>`; }).join('')}</div></div>
</div>
</div>

<div class="tab-content ${tab === 'insights' ? 'active' : ''}" id="tab-insights">
<div class="card" style="margin-bottom:16px"><div class="score-ring"><div class="score-circle">${weeklyReport.insights.productivityScore}</div><div><div style="font-size:16px;font-weight:700;margin-bottom:4px">${this.esc(weeklyReport.insights.headline)}</div><div style="font-size:12px;color:var(--muted);line-height:1.5">${this.esc(weeklyReport.insights.summary)}</div><div style="margin-top:8px;font-size:11px;color:var(--muted)">Peak hours: ${this.esc(weeklyReport.insights.peakHours)}</div></div></div></div>
${weeklyReport.insights.contextSwitchWarning ? `<div class="card" style="border-color:#f59e0b;margin-bottom:16px"><div style="color:#f59e0b;font-weight:600;margin-bottom:4px">\u26A0 Context Switching Alert</div><div style="font-size:12px">${this.esc(weeklyReport.insights.contextSwitchWarning)}</div></div>` : ''}
<div class="section-title">\u{1F4A1} Recommendations</div>
${tipsHtml || '<div class="no-data">Start coding to generate personalized tips!</div>'}
<div style="margin-top:16px;text-align:center"><button class="btn btn-primary" onclick="generateInsights()">\u2728 Regenerate Insights</button></div>
</div>

<div class="tab-content ${tab === 'focus' ? 'active' : ''}" id="tab-focus">
${this.focus.isActive() ? `<div class="card" style="border-color:var(--success);margin-bottom:16px"><div style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:14px;font-weight:700;color:var(--success)">\u{1F3AF} Focus Session Active</div><div style="font-size:12px;margin-top:4px">${this.esc(this.focus.getCurrentSession()?.goal ?? '')}</div><div style="font-size:11px;color:var(--muted);margin-top:4px">${this.focus.getElapsedMinutes()}m elapsed of ${this.focus.getCurrentSession()?.goalMinutes ?? 0}m goal</div></div><button class="btn btn-danger" onclick="stopFocus()">\u23F9 Stop</button></div></div>` : `<div style="text-align:center;padding:20px 0;margin-bottom:16px"><div style="font-size:14px;margin-bottom:12px;color:var(--muted)">No active focus session</div><button class="btn btn-primary" onclick="startFocus()">\u{1F3AF} Start Focus Session</button></div>`}
<div class="section-title">\u{1F550} Recent Sessions</div>
${focusHtml || '<div class="no-data">No focus sessions yet. Start one to track deep work!</div>'}
</div>
</div>
<script>
const vscode=acquireVsCodeApi();
function switchTab(t){vscode.postMessage({command:'switchTab',tab:t})}
function startFocus(){vscode.postMessage({command:'startFocus'})}
function stopFocus(){vscode.postMessage({command:'stopFocus'})}
function generateInsights(){vscode.postMessage({command:'generateInsights'})}
function refresh(){vscode.postMessage({command:'refresh'})}
</script>
</body>
</html>`;
    }

    private esc(text: string): string {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    private dispose(): void {
        DashboardPanel.instance = undefined;
        this.disposables.forEach(d => d.dispose());
    }
}
