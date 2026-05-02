import * as vscode from 'vscode';

const SECTION = 'devpulse';

/**
 * Typed configuration wrapper for DevPulse settings.
 * Reads from `devpulse.*` configuration namespace.
 */
export const Config = {
    get<T>(key: string, fallback: T): T {
        return vscode.workspace.getConfiguration(SECTION).get<T>(key, fallback);
    },

    async set(key: string, value: unknown, global = true): Promise<void> {
        const target = global
            ? vscode.ConfigurationTarget.Global
            : vscode.ConfigurationTarget.Workspace;
        await vscode.workspace.getConfiguration(SECTION).update(key, value, target);
    },

    /** Whether tracking is enabled. */
    get enabled(): boolean { return Config.get<boolean>('enabled', true); },

    /** Idle threshold in minutes. */
    get idleThresholdMinutes(): number { return Config.get<number>('idleThresholdMinutes', 5); },

    /** Default focus session goal in minutes. */
    get focusSessionGoalMinutes(): number { return Config.get<number>('focusSessionGoalMinutes', 90); },

    /** Context switch threshold in seconds. */
    get contextSwitchThresholdSeconds(): number { return Config.get<number>('contextSwitchThresholdSeconds', 30); },

    /** Whether to show the status bar item. */
    get showStatusBar(): boolean { return Config.get<boolean>('showStatusBar', true); },

    /** Status bar display format. */
    get statusBarFormat(): string { return Config.get<string>('statusBarFormat', 'time+intent'); },

    /** Data retention in days. */
    get dataRetentionDays(): number { return Config.get<number>('dataRetentionDays', 90); },

    /** Whether AI insights are enabled. */
    get aiInsightsEnabled(): boolean { return Config.get<boolean>('aiInsightsEnabled', true); },

    /** Whether to notify on excessive context switching. */
    get notifyContextSwitching(): boolean { return Config.get<boolean>('notifyContextSwitching', false); },

    /** Glob patterns for files to exclude. */
    get excludePatterns(): string[] {
        return Config.get<string[]>('excludePatterns', [
            '**/node_modules/**', '**/.git/**', '**/dist/**', '**/out/**'
        ]);
    }
} as const;
