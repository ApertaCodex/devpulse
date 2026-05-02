import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from './logger';
import { Config } from './config';
import { StorageManager } from './StorageManager';
import { WorkIntent } from './types';

/**
 * Internal heartbeat state for the activity tracker.
 */
interface HeartbeatState {
    filePath: string;
    language: string;
    project: string;
    branch: string;
    lastActiveAt: number;
    sessionStartAt: number;
    currentIntent: WorkIntent;
    contextSwitches: number;
    currentFileEnteredAt: number;
    lastSavedAt: number;
    currentFocusStart: number;
    longestFocusSoFar: number;
}

/**
 * Core activity tracking engine.
 * Listens to editor events, detects work intent, measures active time,
 * and flushes aggregated data to StorageManager.
 */
export class ActivityTracker implements vscode.Disposable {
    private readonly storage: StorageManager;
    private readonly log: Logger;
    private readonly listeners: vscode.Disposable[] = [];
    private heartbeatTimer?: ReturnType<typeof setInterval>;
    private saveTimer?: ReturnType<typeof setInterval>;
    private isEnabled = false;
    private isIdle = false;
    private state: HeartbeatState;
    private totalTodaySeconds = 0;
    private lastSavedTodaySeconds = 0;

    constructor(storage: StorageManager) {
        this.storage = storage;
        this.log = Logger.instance;
        this.state = this.initialState();
        this.loadTodaySeconds();
    }

    /** Start tracking. Registers all editor listeners and timers. */
    public enable(): void {
        if (this.isEnabled) { return; }
        this.isEnabled = true;
        this.registerListeners();
        this.heartbeatTimer = setInterval(() => this.heartbeat(), 5_000);
        this.saveTimer = setInterval(() => this.flush(), 30_000);
        this.log.info('Activity tracking enabled.');
    }

    /** Stop tracking. Flushes pending data and clears listeners. */
    public disable(): void {
        if (!this.isEnabled) { return; }
        this.isEnabled = false;
        this.flush();
        this.stopTimers();
        this.clearListeners();
        this.log.info('Activity tracking disabled.');
    }

    public getTodayActiveSeconds(): number { return this.totalTodaySeconds; }
    public getCurrentProject(): string { return this.state.project; }
    public getCurrentLanguage(): string { return this.state.language; }
    public getCurrentIntent(): WorkIntent { return this.state.currentIntent; }
    public isCurrentlyIdle(): boolean { return this.isIdle; }

    public dispose(): void {
        this.disable();
    }

    // ---- Private ----

    private initialState(): HeartbeatState {
        const now = Date.now();
        return {
            filePath: '',
            language: '',
            project: this.resolveProject(),
            branch: '',
            lastActiveAt: now,
            sessionStartAt: now,
            currentIntent: 'unknown',
            contextSwitches: 0,
            currentFileEnteredAt: now,
            lastSavedAt: now,
            currentFocusStart: now,
            longestFocusSoFar: 0
        };
    }

    private resolveProject(): string {
        const folders = vscode.workspace.workspaceFolders;
        return folders && folders.length > 0
            ? path.basename(folders[0].uri.fsPath)
            : 'Unknown Project';
    }

    private registerListeners(): void {
        this.listeners.push(
            vscode.window.onDidChangeActiveTextEditor(e => {
                if (e) { this.onFileChange(e.document); }
            }),
            vscode.workspace.onDidChangeTextDocument(e => {
                if (e.contentChanges.length > 0) { this.onTextChange(e); }
            }),
            vscode.window.onDidChangeTextEditorSelection(() => this.onActivity()),
            vscode.workspace.onDidOpenTextDocument(() => this.onActivity()),
            vscode.workspace.onDidSaveTextDocument(() => this.onActivity())
        );

        // Seed with current editor
        const active = vscode.window.activeTextEditor;
        if (active) { this.onFileChange(active.document); }
    }

    private clearListeners(): void {
        this.listeners.forEach(d => d.dispose());
        this.listeners.length = 0;
    }

    private stopTimers(): void {
        if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = undefined; }
        if (this.saveTimer) { clearInterval(this.saveTimer); this.saveTimer = undefined; }
    }

    private onFileChange(doc: vscode.TextDocument): void {
        const filePath = doc.uri.fsPath;
        if (this.shouldExclude(filePath)) { return; }

        const now = Date.now();
        const prevFile = this.state.filePath;
        const timeInPrev = (now - this.state.currentFileEnteredAt) / 1000;

        // Context switch detection
        if (prevFile && prevFile !== filePath && timeInPrev >= Config.contextSwitchThresholdSeconds) {
            this.state.contextSwitches++;
            if (Config.notifyContextSwitching && this.state.contextSwitches % 5 === 0) {
                vscode.window.showWarningMessage(
                    `$(warning) DevPulse: ${this.state.contextSwitches} context switches today. Consider batching tasks.`
                );
            }
        }

        this.state.filePath = filePath;
        this.state.language = doc.languageId;
        this.state.currentFileEnteredAt = now;
        this.state.project = this.resolveProject();
        this.onActivity();
    }

    private onTextChange(event: vscode.TextDocumentChangeEvent): void {
        if (this.shouldExclude(event.document.uri.fsPath)) { return; }

        const changes = event.contentChanges;
        const added = changes.reduce((s, c) => s + c.text.length, 0);
        const deleted = changes.reduce((s, c) => s + c.rangeLength, 0);

        if (added > deleted * 2) {
            this.state.currentIntent = 'creating';
        } else if (deleted > added * 2) {
            this.state.currentIntent = 'refactoring';
        } else if (added > 0 && deleted > 0) {
            this.state.currentIntent = 'debugging';
        } else {
            this.state.currentIntent = 'exploring';
        }
        this.onActivity();
    }

    private onActivity(): void {
        const now = Date.now();
        if (this.isIdle) {
            this.isIdle = false;
            this.state.currentFocusStart = now;
        }
        this.state.lastActiveAt = now;
    }

    private heartbeat(): void {
        if (!this.isEnabled) { return; }
        const now = Date.now();
        const idleMs = Config.idleThresholdMinutes * 60 * 1000;
        const elapsed = now - this.state.lastActiveAt;

        if (elapsed > idleMs) {
            if (!this.isIdle) {
                this.isIdle = true;
                const focusDur = (now - this.state.currentFocusStart) / 1000;
                if (focusDur > this.state.longestFocusSoFar) {
                    this.state.longestFocusSoFar = focusDur;
                }
            }
            return;
        }
        // Accumulate 5 seconds of active time
        this.totalTodaySeconds += 5;
    }

    private async flush(): Promise<void> {
        if (this.totalTodaySeconds === this.lastSavedTodaySeconds) { return; }
        try {
            const stats = this.storage.getTodayStats();
            const delta = this.totalTodaySeconds - this.lastSavedTodaySeconds;
            stats.totalActiveSeconds = this.totalTodaySeconds;

            const hour = new Date().getHours();
            stats.hourlyActivity[hour] = (stats.hourlyActivity[hour] ?? 0) + delta;

            const intent = this.state.currentIntent;
            stats.intentBreakdown[intent] = (stats.intentBreakdown[intent] ?? 0) + delta;

            const lang = this.state.language || 'unknown';
            stats.languageBreakdown[lang] = (stats.languageBreakdown[lang] ?? 0) + delta;

            const proj = this.state.project || 'Unknown Project';
            stats.projectBreakdown[proj] = (stats.projectBreakdown[proj] ?? 0) + delta;

            stats.contextSwitches = this.state.contextSwitches;

            if (this.state.longestFocusSoFar > stats.longestFocusSeconds) {
                stats.longestFocusSeconds = this.state.longestFocusSoFar;
            }

            // Compute peak hour
            let maxHour = 0;
            let maxVal = 0;
            for (let i = 0; i < 24; i++) {
                if (stats.hourlyActivity[i] > maxVal) {
                    maxVal = stats.hourlyActivity[i];
                    maxHour = i;
                }
            }
            stats.peakHour = maxHour;

            await this.storage.saveDayStats(stats);
            this.storage.updateProjectStats(proj, delta, lang, this.state.branch, intent);
            this.lastSavedTodaySeconds = this.totalTodaySeconds;
            this.storage.pruneOldData(Config.dataRetentionDays);
        } catch (err) {
            this.log.error('Failed to flush activity data', err);
        }
    }

    private loadTodaySeconds(): void {
        const stats = this.storage.getTodayStats();
        this.totalTodaySeconds = stats.totalActiveSeconds;
        this.lastSavedTodaySeconds = stats.totalActiveSeconds;
    }

    private shouldExclude(filePath: string): boolean {
        const patterns = Config.excludePatterns;
        for (const pattern of patterns) {
            const normalized = pattern.replace(/\*\*/g, '').replace(/\*/g, '');
            if (filePath.includes(normalized.replace(/\//g, path.sep))) {
                return true;
            }
        }
        return false;
    }
}
