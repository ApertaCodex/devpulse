import * as vscode from 'vscode';
import { Config } from './config';

/**
 * Manages the DevPulse status bar items.
 * Shows coding time, current intent, and focus session progress.
 */
export class StatusBarManager implements vscode.Disposable {
    private readonly mainItem: vscode.StatusBarItem;
    private readonly focusItem: vscode.StatusBarItem;
    private text = '';
    private focusText = '';
    private focusVisible = false;

    constructor() {
        this.mainItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left, 100
        );
        this.mainItem.command = 'devpulse.openDashboard';
        this.mainItem.tooltip = 'DevPulse — Click to open dashboard';
        this.mainItem.name = 'DevPulse';

        this.focusItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left, 99
        );
        this.focusItem.command = 'devpulse.stopFocusSession';
        this.focusItem.tooltip = 'Focus session active — Click to stop';
        this.focusItem.name = 'DevPulse Focus';
    }

    /**
     * Update the main status bar text.
     * @param text The text to display (including codicon prefix).
     */
    public updateMain(text: string): void {
        this.text = text;
        this.render();
    }

    /**
     * Update the focus session status bar.
     * @param text The focus text to display, or empty to hide.
     */
    public updateFocus(text: string): void {
        this.focusText = text;
        this.focusVisible = text.length > 0;
        this.render();
    }

    private render(): void {
        if (!Config.showStatusBar) {
            this.mainItem.hide();
            this.focusItem.hide();
            return;
        }

        this.mainItem.text = this.text || '$(pulse) DevPulse';
        this.mainItem.show();

        if (this.focusVisible) {
            this.focusItem.text = this.focusText;
            this.focusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            this.focusItem.show();
        } else {
            this.focusItem.hide();
        }
    }

    public dispose(): void {
        this.mainItem.dispose();
        this.focusItem.dispose();
    }
}
