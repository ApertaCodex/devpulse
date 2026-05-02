import * as vscode from 'vscode';

let _terminal: vscode.Terminal | undefined;

/** Open (or reuse) a DevPulse terminal. */
export function openTerminal(): vscode.Terminal {
    if (!_terminal || _terminal.exitStatus !== undefined) {
        _terminal = vscode.window.createTerminal({ name: 'DevPulse' });
    }
    _terminal.show();
    return _terminal;
}

/** Send a command string to the DevPulse terminal. */
export function sendCommand(cmd: string): void {
    const t = openTerminal();
    t.sendText(cmd);
}
