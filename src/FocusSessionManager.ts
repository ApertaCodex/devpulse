import * as vscode from 'vscode';
import { Logger } from './logger';
import { StorageManager } from './StorageManager';
import { FocusSession } from './types';

/**
 * Manages focus session lifecycle: start, track, stop, score.
 * Emits `onDidChange` when session state changes.
 */
export class FocusSessionManager implements vscode.Disposable {
    private readonly context: vscode.ExtensionContext;
    private readonly storage: StorageManager;
    private readonly log: Logger;
    private currentSession: FocusSession | null = null;
    private sessionTimer?: ReturnType<typeof setInterval>;
    private readonly _onDidChange = new vscode.EventEmitter<void>();
    public readonly onDidChange = this._onDidChange.event;
    private switchCount = 0;
    private lastFile = '';
    private readonly sessionDisposables: vscode.Disposable[] = [];

    constructor(context: vscode.ExtensionContext, storage: StorageManager) {
        this.context = context;
        this.storage = storage;
        this.log = Logger.instance;
    }

    /** Start a new focus session with a goal and duration. */
    public startSession(goal: string, goalMinutes: number): void {
        if (this.currentSession) { this.stopSession(); }

        const folders = vscode.workspace.workspaceFolders;
        const project = folders ? folders[0].name : 'Unknown';

        this.currentSession = {
            id: `focus-${Date.now()}`,
            goal,
            startTime: Date.now(),
            durationMinutes: 0,
            goalMinutes,
            flowScore: 0,
            contextSwitches: 0,
            interruptions: 0,
            filesWorkedOn: [],
            project
        };
        this.switchCount = 0;
        this.lastFile = '';

        // Track file switches
        const editorListener = vscode.window.onDidChangeActiveTextEditor(editor => {
            if (!this.currentSession || !editor) { return; }
            const file = editor.document.uri.fsPath;
            if (file !== this.lastFile) {
                this.switchCount++;
                this.currentSession.contextSwitches = this.switchCount;
                if (!this.currentSession.filesWorkedOn.includes(file)) {
                    this.currentSession.filesWorkedOn.push(file);
                }
                this.lastFile = file;
            }
        });
        this.sessionDisposables.push(editorListener);

        // Goal completion timer
        const goalMs = goalMinutes * 60 * 1000;
        const goalTimer = setTimeout(() => {
            if (this.currentSession) {
                vscode.window.showInformationMessage(
                    `$(target) Focus goal reached! ${goalMinutes} minutes completed.`,
                    'Stop Session'
                ).then(choice => {
                    if (choice === 'Stop Session') {
                        vscode.commands.executeCommand('devpulse.stopFocusSession');
                    }
                });
            }
        }, goalMs);
        this.sessionDisposables.push({ dispose: () => clearTimeout(goalTimer) });

        // Minute ticker
        this.sessionTimer = setInterval(() => {
            if (this.currentSession) {
                this.currentSession.durationMinutes = Math.round(
                    (Date.now() - this.currentSession.startTime) / 60000
                );
                this._onDidChange.fire();
            }
        }, 60_000);

        this.log.info(`Focus session started: "${goal}" (${goalMinutes}m)`);
        this._onDidChange.fire();
    }

    /** Stop the current focus session and return its summary. */
    public stopSession(): FocusSession | null {
        if (!this.currentSession) { return null; }

        if (this.sessionTimer) {
            clearInterval(this.sessionTimer);
            this.sessionTimer = undefined;
        }
        this.sessionDisposables.forEach(d => d.dispose());
        this.sessionDisposables.length = 0;

        const session = this.currentSession;
        session.endTime = Date.now();
        session.durationMinutes = Math.round((session.endTime - session.startTime) / 60000);

        // Flow score: goal completion weighted + low switching bonus
        const goalRatio = Math.min(1, session.durationMinutes / session.goalMinutes);
        const switchPenalty = Math.min(1, session.contextSwitches / 20);
        session.flowScore = Math.round((goalRatio * 8 + (1 - switchPenalty) * 2) * 10) / 10;

        this.storage.saveFocusSession(session).catch(() => {});

        // Also save to today's stats
        const todayStats = this.storage.getTodayStats();
        todayStats.focusSessions.push(session);
        this.storage.saveDayStats(todayStats).catch(() => {});

        this.currentSession = null;
        this.log.info(`Focus session ended. Duration: ${session.durationMinutes}m, Flow: ${session.flowScore}/10`);
        this._onDidChange.fire();
        return session;
    }

    public getCurrentSession(): FocusSession | null { return this.currentSession; }
    public isActive(): boolean { return this.currentSession !== null; }

    public getElapsedMinutes(): number {
        if (!this.currentSession) { return 0; }
        return Math.round((Date.now() - this.currentSession.startTime) / 60000);
    }

    public getRecentSessions(limit = 10): FocusSession[] {
        return this.storage.getFocusSessions().slice(-limit).reverse();
    }

    public dispose(): void {
        if (this.currentSession) { this.stopSession(); }
        this.sessionDisposables.forEach(d => d.dispose());
        this._onDidChange.dispose();
    }
}
