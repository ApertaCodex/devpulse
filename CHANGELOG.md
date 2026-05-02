# Changelog

All notable changes to **DevPulse** will be documented in this file.

## [2.0.1] - 2025-01-16

### Fixed
- Fixed README.md containing raw Unicode escape sequences (e.g. `\u{1F680}`) instead of actual emoji characters
- Cleaned up all markdown files to render properly on GitHub and the VS Code Marketplace

## [2.0.0] - 2025-01-15

### Changed
- Complete rewrite using new scaffolding architecture
- Singleton Logger pattern with `Logger.create()` / `Logger.instance`
- Typed `Config` wrapper for all settings
- `StatusBarManager` with clean `updateMain()` / `updateFocus()` API
- Centralized command registration in `commands.ts` with `COMMANDS` const
- All tree providers moved to `src/providers/` directory
- Added `DashboardWebviewProvider` for sidebar quick dashboard
- Added Getting Started walkthrough with 5 onboarding steps
- Terminal utilities (`openTerminal`, `sendCommand`)
- Cleaner `activate()` with registrations array pattern

### Added
- `devpulse.showInfo` command showing extension status
- `devpulse.openTerminal` command
- `devpulse.openWebview` command (alias for dashboard)
- `devpulse.addItem` / `devpulse.removeItem` placeholder commands
- Quick Dashboard sidebar webview panel
- Walkthrough: Explore, Dashboard, Focus, Insights, Configure steps
- Walkthrough markdown resources

## [1.10.0] - 2025-01-01

### Added
- Initial release of DevPulse
- Automatic activity tracking with idle detection
- Work intent detection: creating, debugging, refactoring, exploring
- Focus session management with flow scoring
- Context switching detection and alerts
- AI-powered productivity insights and coaching
- Interactive dashboard with Today, Weekly, AI Insights, and Focus tabs
- Hourly activity heatmap
- Language and project breakdown
- Git branch tracking per project
- Privacy-first local storage
- Status bar integration
- 7-day trend analysis
- Data export to JSON
