import * as vscode from 'vscode';

/**
 * Centralized logger that writes to a VS Code OutputChannel.
 * Use the singleton via `Logger.instance` after calling `Logger.create()`.
 */
export class Logger {
    private static _instance: Logger | undefined;
    private readonly channel: vscode.OutputChannel;

    private constructor(name: string) {
        this.channel = vscode.window.createOutputChannel(name);
    }

    /** Create the singleton logger. Call once in `activate()`. */
    public static create(name: string): Logger {
        if (!Logger._instance) {
            Logger._instance = new Logger(name);
        }
        return Logger._instance;
    }

    /** Get the singleton instance. Throws if `create()` was not called. */
    public static get instance(): Logger {
        if (!Logger._instance) {
            throw new Error('Logger not initialised — call Logger.create() first');
        }
        return Logger._instance;
    }

    public info(msg: string): void {
        this.write('INFO', msg);
    }

    public warn(msg: string): void {
        this.write('WARN', msg);
    }

    public error(msg: string, err?: unknown): void {
        this.write('ERROR', msg);
        if (err instanceof Error) {
            this.write('ERROR', `  ${err.message}`);
            if (err.stack) { this.write('ERROR', err.stack); }
        } else if (err !== undefined) {
            this.write('ERROR', String(err));
        }
    }

    public show(): void {
        this.channel.show();
    }

    public dispose(): void {
        this.channel.dispose();
    }

    private write(level: string, msg: string): void {
        this.channel.appendLine(`[${new Date().toISOString()}] [${level}] ${msg}`);
    }
}
