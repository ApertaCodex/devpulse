import * as vscode from 'vscode';
import { Logger } from './logger';
import { DailyStats, FocusSession, ProjectStats, WorkIntent } from './types';

const KEYS = {
    DAILY_PREFIX: 'devpulse.daily.',
    PROJECTS: 'devpulse.projects',
    FOCUS_SESSIONS: 'devpulse.focusSessions',
    LAST_INSIGHT: 'devpulse.lastInsight'
} as const;

/**
 * Manages all DevPulse data persistence via VS Code globalState.
 * Privacy-first: all data stays local on the user's machine.
 */
export class StorageManager {
    private readonly state: vscode.Memento;
    private readonly log: Logger;

    constructor(context: vscode.ExtensionContext) {
        this.state = context.globalState;
        this.log = Logger.instance;
    }

    // ---- Date helpers ----

    public getTodayKey(): string {
        return new Date().toISOString().slice(0, 10);
    }

    // ---- Daily stats ----

    public getTodayStats(): DailyStats {
        return this.getDayStats(this.getTodayKey());
    }

    public getDayStats(dateKey: string): DailyStats {
        const stored = this.state.get<DailyStats>(KEYS.DAILY_PREFIX + dateKey);
        return stored ?? this.emptyDay(dateKey);
    }

    public async saveDayStats(stats: DailyStats): Promise<void> {
        try {
            await this.state.update(KEYS.DAILY_PREFIX + stats.date, stats);
        } catch (err) {
            this.log.error('Failed to save day stats', err);
        }
    }

    public getLastNDays(n: number): DailyStats[] {
        const results: DailyStats[] = [];
        const now = new Date();
        for (let i = n - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            results.push(this.getDayStats(d.toISOString().slice(0, 10)));
        }
        return results;
    }

    // ---- Project stats ----

    public getProjectStats(): Record<string, ProjectStats> {
        return this.state.get<Record<string, ProjectStats>>(KEYS.PROJECTS, {});
    }

    public async saveProjectStats(stats: Record<string, ProjectStats>): Promise<void> {
        try {
            await this.state.update(KEYS.PROJECTS, stats);
        } catch (err) {
            this.log.error('Failed to save project stats', err);
        }
    }

    public updateProjectStats(
        project: string,
        seconds: number,
        language: string,
        branch: string,
        intent: WorkIntent
    ): void {
        const all = this.getProjectStats();
        if (!all[project]) {
            all[project] = {
                name: project,
                totalSeconds: 0,
                lastActive: Date.now(),
                languages: {},
                branches: [],
                intentBreakdown: { creating: 0, debugging: 0, refactoring: 0, exploring: 0, idle: 0, unknown: 0 }
            };
        }
        const p = all[project];
        p.totalSeconds += seconds;
        p.lastActive = Date.now();
        p.languages[language] = (p.languages[language] ?? 0) + seconds;
        if (branch && !p.branches.includes(branch)) {
            p.branches.push(branch);
        }
        p.intentBreakdown[intent] = (p.intentBreakdown[intent] ?? 0) + seconds;
        this.saveProjectStats(all).catch(() => {});
    }

    // ---- Focus sessions ----

    public getFocusSessions(): FocusSession[] {
        return this.state.get<FocusSession[]>(KEYS.FOCUS_SESSIONS, []);
    }

    public async saveFocusSession(session: FocusSession): Promise<void> {
        const sessions = this.getFocusSessions();
        const idx = sessions.findIndex(s => s.id === session.id);
        if (idx >= 0) {
            sessions[idx] = session;
        } else {
            sessions.push(session);
        }
        // Keep only last 100
        const trimmed = sessions.slice(-100);
        try {
            await this.state.update(KEYS.FOCUS_SESSIONS, trimmed);
        } catch (err) {
            this.log.error('Failed to save focus session', err);
        }
    }

    // ---- Data management ----

    public async clearAllData(): Promise<void> {
        const keys = this.state.keys();
        for (const key of keys) {
            if (key.startsWith('devpulse.')) {
                await this.state.update(key, undefined);
            }
        }
        this.log.info('All DevPulse data cleared.');
    }

    public async exportAll(): Promise<Record<string, unknown>> {
        const result: Record<string, unknown> = {};
        for (const key of this.state.keys()) {
            if (key.startsWith('devpulse.')) {
                result[key] = this.state.get(key);
            }
        }
        return result;
    }

    public pruneOldData(retentionDays: number): void {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - retentionDays);
        for (const key of this.state.keys()) {
            if (key.startsWith(KEYS.DAILY_PREFIX)) {
                const dateStr = key.replace(KEYS.DAILY_PREFIX, '');
                if (new Date(dateStr) < cutoff) {
                    this.state.update(key, undefined).catch(() => {});
                }
            }
        }
    }

    // ---- Helpers ----

    private emptyDay(dateKey: string): DailyStats {
        return {
            date: dateKey,
            totalActiveSeconds: 0,
            totalIdleSeconds: 0,
            intentBreakdown: { creating: 0, debugging: 0, refactoring: 0, exploring: 0, idle: 0, unknown: 0 },
            languageBreakdown: {},
            projectBreakdown: {},
            contextSwitches: 0,
            longestFocusSeconds: 0,
            peakHour: -1,
            hourlyActivity: new Array(24).fill(0),
            focusSessions: [],
            filesEdited: 0
        };
    }
}
