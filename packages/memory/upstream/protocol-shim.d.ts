declare module "catui-protocol" {
	import type { Static, TSchema } from "@sinclair/typebox";

	export interface SessionManagerContract {
		getSessionFile(): string | undefined;
		countTouchedSince(
			cwd: string,
			sinceMs: number,
			options?: { sessionDir?: string; excludeBasename?: string; concurrency?: number },
		): Promise<number>;
	}

	export interface ExtensionUi {
		notify(message: string, type?: "info" | "warning" | "error"): void;
		setStatus(key: string, text: string | undefined): void;
	}

	export interface ExtensionContext {
		cwd: string;
		hasUI: boolean;
		sessionManager: SessionManagerContract;
		ui: ExtensionUi;
		getSettings?: () => { nanomem?: Record<string, any> } | undefined;
		completeSimple?: (systemPrompt: string, userMessage: string) => Promise<string | undefined>;
		completeJson?: (
			systemPrompt: string,
			userMessage: string,
			schema: Record<string, unknown>,
			options?: { toolName?: string; resultKey?: string },
		) => Promise<string | undefined>;
	}

	export type HookEventName =
		| "session_start"
		| "session_ready"
		| "session_shutdown"
		| "before_agent_start"
		| "agent_start"
		| "agent_end"
		| "agent_result"
		| "turn_start"
		| "turn_end"
		| "tool_execution_start"
		| "tool_execution_end";

	export type HookHandler = (event: any, ctx: ExtensionContext) => any | Promise<any>;

	export interface ExtensionCommand {
		description?: string;
		getArgumentCompletions?: (
			argumentPrefix: string,
			context?: { tokenIndex?: number; [key: string]: any },
		) => Array<{ value: string; label: string }> | null;
		handler: (args: string | undefined, ctx: ExtensionContext) => void | Promise<void>;
	}

	export type ToolRuntime = "local" | "mcp" | "remote" | "browser";

	export interface ToolPermissions {
		filesystem?: { read?: string[]; write?: string[] };
		process?: boolean;
		network?: string[];
	}

	export interface ToolRuntimeDescriptor {
		runtime?: ToolRuntime;
		permissions?: ToolPermissions;
	}

	export type ToolResultContent = { type: "text"; text: string } | { type: "image"; data: string; mimeType?: string };

	export interface ToolResult<TDetails = unknown> {
		content: ToolResultContent[];
		details?: TDetails;
		isError?: boolean;
	}

	export type ToolUpdateCallback<TDetails = unknown> = (details: TDetails) => void;

	export interface ToolContract<TParams extends TSchema = TSchema, TDetails = unknown> extends ToolRuntimeDescriptor {
		name: string;
		label?: string;
		description: string;
		parameters: TParams;
		aliases?: string[];
		isConcurrencySafe?: boolean;
		guidance?: string;
		execute: (
			toolCallId: string,
			params: Static<TParams>,
			signal?: AbortSignal,
			onUpdate?: ToolUpdateCallback<TDetails>,
			ctx?: ExtensionContext,
		) => Promise<ToolResult<TDetails>>;
	}

	export interface ExtensionAPI {
		on(event: HookEventName, handler: HookHandler): void;
		registerCommand(name: string, command: ExtensionCommand): void;
		registerTool<TParams extends TSchema = TSchema, TDetails = unknown>(tool: ToolContract<TParams, TDetails>): void;
	}

	export type ExtensionFactory = (api: ExtensionAPI) => void;
}
