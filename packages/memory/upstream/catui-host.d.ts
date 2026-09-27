/**
 * [WHO]: Type declarations for @catui/agent host interface
 * [FROM]: No external dependencies
 * [TO]: Residual after S3 (P3.2b): src/ no longer imports the host; only test/extension-commands.test.ts
 *       still references the host package. Remove together with that test relocation (P3 follow-up).
 * [HERE]: packages/mem-core/src/catui-agent-host.d.ts - ambient type declarations (legacy host shim)
 */

declare module "@catui/agent" {
	export type ExtensionContext = {
		cwd: string;
		hasUI?: boolean;
		sessionManager: {
			getSessionFile(): string | undefined;
		};
		ui: {
			setStatus(namespace: string, message: string): void;
			notify(message: string, level?: string): void;
		};
		getSettings?: () => {
			nanomem?: {
				autoDream?: {
					enabled?: boolean;
					minHours?: number;
					minSessions?: number;
					scanIntervalMinutes?: number;
				};
				dream?: {
					lockStaleMinutes?: number;
				};
			};
		};
	};

	export type ExtensionEventMap = {
		session_start: unknown;
		turn_end: unknown;
		before_agent_start: { prompt?: string };
		tool_execution_start: {
			toolCallId: string;
			toolName: string;
			args: Record<string, unknown>;
		};
		tool_execution_end: {
			toolCallId: string;
			toolName: string;
			result: unknown;
			isError: boolean;
		};
		agent_end: {
			messages: Array<{ role: string; content?: unknown }>;
		};
		session_shutdown: unknown;
	};

	export type ExtensionAPI = {
		events: {
			emit(channel: string, data: unknown): void;
		};
		on<TEvent extends keyof ExtensionEventMap>(
			event: TEvent,
			handler: (event: ExtensionEventMap[TEvent], context: ExtensionContext) => unknown,
		): void;
		on(event: string, handler: (event: unknown, context: ExtensionContext) => unknown): void;
		registerCommand(
			name: string,
			command: {
				description: string;
				getArgumentCompletions?: (
					argumentPrefix: string,
					context?: {
						commandName: string;
						argumentText: string;
						argumentPrefix: string;
						tokenIndex: number;
						previousTokens: string[];
					},
				) => Array<{ value: string; label: string; description?: string }> | null;
				handler: (args: string, context: ExtensionContext) => unknown;
			},
		): void;
		registerTool(tool: unknown): void;
	};

	export class SessionManager {
		static countTouchedSince(
			cwd: string,
			lastAtMs: number,
			options?: {
				excludeBasename?: string;
			},
		): Promise<number>;
	}
}
