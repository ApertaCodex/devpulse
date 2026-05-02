# DevPulse \u2014 Developer Productivity Insights

> A VS Code extension that tracks not just **time**, but **output, focus, and productivity patterns**.

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/apertacodex/devpulse)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

---

## \u{1F680} Overview

**DevPulse** automatically tracks your coding activity and transforms it into meaningful productivity insights \u2014 going far beyond simple time tracking.

Instead of just telling you *\"you coded 5 hours\"*, DevPulse tells you:
> *\"3h building features, 1.5h debugging, 30m reading code \u2014 and you work best between 10\u201312 AM.\"*

---

## \u2728 Features

### \u23F1 Automatic Time Tracking
- Tracks coding activity in real time \u2014 no manual timers
- Detects active coding vs idle time
- Tracks time per file, language, and project
- Runs silently in the background with minimal overhead

### \u{1F9E0} Work Intent Detection
| Intent | Description |
|---|---|
| **Creating** | Writing new code (more additions than deletions) |
| **Debugging** | Balanced edits, fixing issues |
| **Refactoring** | Heavy deletions and rewrites |
| **Exploring** | Reading and navigating code |

### \u{1F3AF} Focus Session Management
- Start timed focus sessions with a goal description
- Track context switches and files worked on during the session
- Automatic flow score calculation (0\u201310)
- Goal completion notifications
- Historical session log with scores

### \u{1F500} Context Switching Detection
- Counts file/project switches throughout the day
- Optional notification when excessive switching is detected
- Per-hour context switch rate in weekly reports

### \u{1F4CA} Interactive Dashboard
- **Today Tab**: Hourly heatmap, work breakdown, language stats
- **Weekly Tab**: 7-day trend, top projects, top languages
- **AI Insights Tab**: Productivity score, coaching tips, peak hours
- **Focus Tab**: Active session controls, recent session history

### \u{1F916} AI Coaching
- Productivity score (0\u2013100) based on your patterns
- Focus score (0\u201310) based on session depth
- Personalized recommendations generated from your data
- Peak hour identification
- Context switching warnings

### \u{1F512} Privacy-First
- All data stored locally using VS Code's built-in global state
- No API keys, no cloud sync, no external requests
- Configurable data retention (7\u2013365 days)
- Full data export to JSON
- One-click data deletion

---

## \u{1F4E6} Installation

1. Open VS Code
2. Press `Ctrl+P` / `Cmd+P`
3. Type `ext install apertacodex.devpulse`
4. Press Enter

---

## \u{1F3AE} Usage

### Sidebar Panel
Click the **DevPulse icon** (pulse wave) in the Activity Bar to open the sidebar with five views:
- **Today's Activity** \u2014 live stats for the current day
- **Insights & Coaching** \u2014 AI-generated tips and quick stats
- **Projects & Languages** \u2014 breakdown by project and language
- **Focus & Flow** \u2014 manage and review focus sessions
- **Quick Dashboard** \u2014 compact webview summary

### Keyboard Shortcuts
| Shortcut | Action |
|---|---|
| `Ctrl+Alt+F` / `Cmd+Alt+F` | Start/Stop Focus Session |
| `Ctrl+Alt+D` / `Cmd+Alt+D` | Open Dashboard |
| `Ctrl+Alt+R` / `Cmd+Alt+R` | Show Weekly Report |

### Command Palette
All commands are available via `Ctrl+Shift+P`:
- `DevPulse: Open Dashboard`
- `DevPulse: Start Focus Session`
- `DevPulse: Show Weekly Report`
- `DevPulse: Generate AI Insights`
- `DevPulse: Toggle Tracking On/Off`
- `DevPulse: Export Data as JSON`
- `DevPulse: Clear All Tracking Data`
- `DevPulse: Show Info`
- `DevPulse: Configure DevPulse Settings`

---

## \u2699\uFE0F Configuration

| Setting | Default | Description |
|---|---|---|
| `devpulse.enabled` | `true` | Enable/disable tracking |
| `devpulse.idleThresholdMinutes` | `5` | Minutes before session is idle |
| `devpulse.focusSessionGoalMinutes` | `90` | Default focus session duration |
| `devpulse.contextSwitchThresholdSeconds` | `30` | Seconds before a file change counts as a switch |
| `devpulse.showStatusBar` | `true` | Show time in status bar |
| `devpulse.statusBarFormat` | `time+intent` | Status bar display: `time`, `time+intent`, `focus` |
| `devpulse.privacyMode` | `true` | Local-only storage |
| `devpulse.dataRetentionDays` | `90` | Days to keep historical data |
| `devpulse.aiInsightsEnabled` | `true` | Enable AI coaching |
| `devpulse.notifyContextSwitching` | `false` | Alert on excessive context switching |
| `devpulse.workdayStartHour` | `9` | Workday start (for analysis) |
| `devpulse.workdayEndHour` | `18` | Workday end (for analysis) |
| `devpulse.excludePatterns` | `["**/node_modules/**", ...]` | Files to exclude from tracking |

---

## \u{1F3D7} Architecture

```
src/
\u251C\u2500\u2500 extension.ts              # Activation, registrations array
\u251C\u2500\u2500 commands.ts               # COMMANDS const + registerCommands()
\u251C\u2500\u2500 logger.ts                 # Singleton Logger with OutputChannel
\u251C\u2500\u2500 config.ts                 # Typed Config wrapper
\u251C\u2500\u2500 statusBar.ts              # StatusBarManager
\u251C\u2500\u2500 terminal.ts               # Terminal utilities
\u251C\u2500\u2500 types.ts                  # Shared TypeScript interfaces
\u251C\u2500\u2500 ActivityTracker.ts        # Core event-based tracking engine
\u251C\u2500\u2500 InsightsEngine.ts         # Analytics and AI coaching
\u251C\u2500\u2500 FocusSessionManager.ts    # Focus session lifecycle
\u251C\u2500\u2500 StorageManager.ts         # VS Code globalState persistence
\u251C\u2500\u2500 DashboardPanel.ts         # Full webview dashboard panel
\u2514\u2500\u2500 providers/
    \u251C\u2500\u2500 TodayTreeProvider.ts      # Today's activity tree view
    \u251C\u2500\u2500 InsightsTreeProvider.ts   # Insights tree view
    \u251C\u2500\u2500 ProjectsTreeProvider.ts   # Projects tree view
    \u251C\u2500\u2500 FocusTreeProvider.ts      # Focus sessions tree view
    \u2514\u2500\u2500 DashboardWebviewProvider.ts # Sidebar webview
```

---

## \u{1F91D} Contributing

Pull requests are welcome! Please open an issue first to discuss major changes.

```bash
git clone https://github.com/apertacodex/devpulse.git
cd devpulse
npm install
npm run watch
# Press F5 in VS Code to launch Extension Development Host
```

---

## \u{1F4C4} License

MIT \u00A9 [apertacodex](https://github.com/apertacodex)
