import { Logger } from './logger';
import { StorageManager } from './StorageManager';
import { AIInsight, DailyStats, WeeklyReport, WorkIntent } from './types';

/**
 * Analytics engine that computes productivity insights,
 * weekly reports, and AI coaching recommendations.
 * All computation is local — no external API calls.
 */
export class InsightsEngine {
    private readonly storage: StorageManager;
    private readonly log: Logger;
    private cachedInsight: AIInsight | null = null;
    private lastInsightTime = 0;

    constructor(storage: StorageManager) {
        this.storage = storage;
        this.log = Logger.instance;
    }

    /**
     * Generate AI insights from the last 7 days of activity.
     * Results are cached for 15 minutes unless `force` is true.
     */
    public async generateAIInsights(force = false): Promise<AIInsight> {
        const now = Date.now();
        if (!force && this.cachedInsight && (now - this.lastInsightTime) < 15 * 60 * 1000) {
            return this.cachedInsight;
        }
        try {
            const last7 = this.storage.getLastNDays(7);
            const insights = this.computeInsights(last7);
            this.cachedInsight = insights;
            this.lastInsightTime = now;
            return insights;
        } catch (err) {
            this.log.error('Failed to generate insights', err);
            return this.defaultInsight();
        }
    }

    /** Get the cached insight (or null). */
    public getCachedInsight(): AIInsight | null {
        return this.cachedInsight;
    }

    /** Build a full weekly report. */
    public getWeeklyReport(): WeeklyReport {
        const last7 = this.storage.getLastNDays(7);
        const projects = this.storage.getProjectStats();
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - 6);

        const totalActive = last7.reduce((s, d) => s + d.totalActiveSeconds, 0);
        const dailyBreakdown = last7.map(d => ({ date: d.date, seconds: d.totalActiveSeconds }));

        // Aggregate languages
        const langMap: Record<string, number> = {};
        for (const day of last7) {
            for (const [lang, secs] of Object.entries(day.languageBreakdown)) {
                langMap[lang] = (langMap[lang] ?? 0) + secs;
            }
        }
        const topLanguages = Object.entries(langMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([language, seconds]) => ({ language, seconds }));

        // Aggregate intents
        const intentMap: Record<WorkIntent, number> = {
            creating: 0, debugging: 0, refactoring: 0, exploring: 0, idle: 0, unknown: 0
        };
        for (const day of last7) {
            for (const [intent, secs] of Object.entries(day.intentBreakdown)) {
                intentMap[intent as WorkIntent] = (intentMap[intent as WorkIntent] ?? 0) + secs;
            }
        }

        // Top projects
        const topProjects = Object.values(projects)
            .sort((a, b) => b.totalSeconds - a.totalSeconds)
            .slice(0, 5);

        // Focus sessions this week
        const allFocus = this.storage.getFocusSessions();
        const weekFocus = allFocus.filter(s => s.startTime >= weekStart.getTime());
        const avgFlow = weekFocus.length > 0
            ? weekFocus.reduce((s, f) => s + f.flowScore, 0) / weekFocus.length
            : 0;

        // Context switch rate
        const totalSwitches = last7.reduce((s, d) => s + d.contextSwitches, 0);
        const switchRate = totalActive > 0 ? totalSwitches / (totalActive / 3600) : 0;

        // Most productive hour
        const hourlyTotals = new Array(24).fill(0);
        for (const day of last7) {
            for (let h = 0; h < 24; h++) {
                hourlyTotals[h] += day.hourlyActivity[h] ?? 0;
            }
        }
        const mostProductiveHour = hourlyTotals.indexOf(Math.max(...hourlyTotals));

        const insights = this.computeInsights(last7);

        return {
            weekStart: weekStart.toISOString().slice(0, 10),
            weekEnd: now.toISOString().slice(0, 10),
            totalActiveSeconds: totalActive,
            dailyBreakdown,
            topProjects,
            topLanguages,
            intentBreakdown: intentMap,
            totalFocusSessions: weekFocus.length,
            avgFocusScore: Math.round(avgFlow * 10) / 10,
            contextSwitchRate: Math.round(switchRate * 10) / 10,
            mostProductiveHour,
            insights
        };
    }

    /** Quick stats for sidebar display. */
    public getQuickStats(): { label: string; value: string; icon: string }[] {
        const today = this.storage.getTodayStats();
        const last7 = this.storage.getLastNDays(7);
        const weekTotal = last7.reduce((s, d) => s + d.totalActiveSeconds, 0);
        const topIntent = this.topIntent(today.intentBreakdown);
        const topLang = this.topKey(today.languageBreakdown);
        const topProj = this.topKey(today.projectBreakdown);

        return [
            { icon: 'clock', label: 'Today', value: this.formatDuration(today.totalActiveSeconds) },
            { icon: 'calendar', label: 'This Week', value: this.formatDuration(weekTotal) },
            { icon: 'symbol-misc', label: 'Top Activity', value: topIntent },
            { icon: 'code', label: 'Top Language', value: topLang || 'N/A' },
            { icon: 'folder', label: 'Top Project', value: topProj || 'N/A' },
            { icon: 'arrow-swap', label: 'Context Switches', value: String(today.contextSwitches) },
            { icon: 'eye', label: 'Longest Focus', value: this.formatDuration(today.longestFocusSeconds) },
            { icon: 'flame', label: 'Peak Hour', value: today.peakHour >= 0 ? `${today.peakHour}:00` : 'N/A' }
        ];
    }

    /** Format seconds to human-readable duration. */
    public formatDuration(seconds: number): string {
        if (seconds < 60) { return `${Math.round(seconds)}s`; }
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h === 0) { return `${m}m`; }
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }

    // ---- Private ----

    private computeInsights(days: DailyStats[]): AIInsight {
        const totalActive = days.reduce((s, d) => s + d.totalActiveSeconds, 0);
        const avgDaily = days.length > 0 ? totalActive / days.length : 0;

        // Hourly totals
        const hourly = new Array(24).fill(0);
        for (const day of days) {
            for (let h = 0; h < 24; h++) {
                hourly[h] += day.hourlyActivity[h] ?? 0;
            }
        }
        const peakHour = hourly.indexOf(Math.max(...hourly));
        const secondPeak = hourly.indexOf(
            Math.max(...hourly.map((v, i) => i === peakHour ? 0 : v))
        );

        // Intent totals
        const intents: Record<WorkIntent, number> = {
            creating: 0, debugging: 0, refactoring: 0, exploring: 0, idle: 0, unknown: 0
        };
        for (const day of days) {
            for (const [k, v] of Object.entries(day.intentBreakdown)) {
                intents[k as WorkIntent] += v;
            }
        }

        // Context switch analysis
        const totalSwitches = days.reduce((s, d) => s + d.contextSwitches, 0);
        const switchRate = totalActive > 0 ? totalSwitches / (totalActive / 3600) : 0;

        // Productivity score (0-100)
        const focusRatio = totalActive > 0
            ? (intents.creating + intents.debugging) / totalActive
            : 0;
        const productivityScore = Math.min(100, Math.round(
            focusRatio * 60 +
            (switchRate < 5 ? 20 : switchRate < 10 ? 10 : 0) +
            (avgDaily > 14400 ? 20 : avgDaily > 7200 ? 10 : 5)
        ));

        // Focus score
        const avgLongestFocus = days.reduce((s, d) => s + d.longestFocusSeconds, 0) / Math.max(days.length, 1);
        const focusScore = Math.min(10, Math.round(avgLongestFocus / 1800));

        // Build tips
        const tips: string[] = [];
        if (switchRate > 10) {
            tips.push(`You switch context ~${Math.round(switchRate)} times/hour. Try time-blocking to reduce cognitive overhead.`);
        }
        if (intents.debugging > intents.creating) {
            tips.push('More time debugging than creating. Consider writing more tests to catch issues earlier.');
        }
        if (avgLongestFocus < 1800) {
            tips.push('Average focus under 30 minutes. Try the Pomodoro technique for deeper work.');
        }
        if (focusRatio < 0.4) {
            tips.push('Less than 40% of time in active creation/debugging. Identify and reduce distractions.');
        }
        if (intents.refactoring > intents.creating * 0.5) {
            tips.push('High refactoring ratio. Good hygiene, but ensure you are also shipping new features.');
        }
        if (tips.length === 0) {
            tips.push('Great work! Keep maintaining your productive coding habits.');
            tips.push(`Your peak window (${peakHour}:00\u2013${(peakHour + 2) % 24}:00) is ideal for complex tasks.`);
        }

        const pct = (intent: WorkIntent) =>
            totalActive > 0 ? Math.round((intents[intent] / totalActive) * 100) : 0;

        const contextSwitchWarning = switchRate > 8
            ? `You lose ~${Math.round(switchRate * 5)}% productivity to context switching. Consider batching similar tasks.`
            : undefined;

        return {
            headline: productivityScore >= 70
                ? `Strong week! Productivity score: ${productivityScore}/100`
                : `Productivity score: ${productivityScore}/100 \u2014 here's how to improve`,
            summary: `Over 7 days: ${pct('creating')}% building, ${pct('debugging')}% debugging, ${pct('refactoring')}% refactoring, ${pct('exploring')}% exploring. Peak: ${peakHour}:00\u2013${(peakHour + 2) % 24}:00.`,
            tips,
            peakHours: `${peakHour}:00\u2013${(peakHour + 2) % 24}:00 and ${secondPeak}:00\u2013${(secondPeak + 1) % 24}:00`,
            contextSwitchWarning,
            focusScore,
            productivityScore,
            generatedAt: Date.now()
        };
    }

    private topIntent(breakdown: Record<WorkIntent, number>): string {
        let top: WorkIntent = 'unknown';
        let max = 0;
        for (const [k, v] of Object.entries(breakdown)) {
            if (v > max) { max = v; top = k as WorkIntent; }
        }
        const labels: Record<WorkIntent, string> = {
            creating: 'Creating', debugging: 'Debugging', refactoring: 'Refactoring',
            exploring: 'Exploring', idle: 'Idle', unknown: 'Mixed'
        };
        return labels[top];
    }

    private topKey(map: Record<string, number>): string {
        let top = '';
        let max = 0;
        for (const [k, v] of Object.entries(map)) {
            if (v > max) { max = v; top = k; }
        }
        return top;
    }

    private defaultInsight(): AIInsight {
        return {
            headline: 'Start coding to generate insights!',
            summary: 'DevPulse will analyze your activity as you code.',
            tips: ['Open a project and start coding to see personalized insights.'],
            peakHours: 'N/A',
            focusScore: 0,
            productivityScore: 0,
            generatedAt: Date.now()
        };
    }
}
