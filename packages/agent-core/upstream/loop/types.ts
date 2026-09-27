/**
 * [WHO]: AgentLoopFramework, AgentLoopTransition, AgentRunResult with transition history, AgentModelErrorRecoveryResult, AgentLoopConfig, CustomAgentMessages, AgentState, AgentToolResult, AgentTool, AgentToolConcurrencySafety, AgentToolInterruptBehavior; synchronous committed context preparation contract
 * [FROM]: Depends on ai message/stream/schema types and local tool-policy, checkpoint, and trace contracts
 * [TO]: Consumed by core/lib/agent-core/src/index.ts
 * [HERE]: core/lib/agent-core/src/types.ts -
 */

import type {
	AssistantMessageEvent,
	DocumentContent,
	ImageContent,
	Message,
	Model,
	SimpleStreamOptions,
	TextContent,
	Tool,
	ToolResultMessage,
	Usage,
} from "@catui/ai/types";
import type { streamSimple } from "@catui/ai/stream";
import type { Static, TSchema } from "@catui/ai/schema";
import type { AgentToolPolicy } from "./tool-policy.js";
import type { CheckpointStore } from "./run-checkpoint.js";
import type { RunTraceRecorder } from "./run-trace-recorder.js";

/** Stream function - can return sync or Promise for async config lookup */
export type StreamFn = (
	...args: Parameters<typeof streamSimple>
) => ReturnType<typeof streamSimple> | Promise<ReturnType<typeof streamSimple>>;

export type AgentLoopFramework = "standard" | "weak-model-compatible";
export type AgentLoopFrameworkInput =
	| AgentLoopFramework
	| "high-intelligence"
	| "low-intelligence"
	| "structured-adaptive";

export type AgentLoopTransition =
	| { reason: "start" }
	| { reason: "tool_result"; toolCallCount: number }
	| { reason: "follow_up" }
	| { reason: "livelock_detected"; fingerprint: string; repeatCount: number }
	| { reason: "approval_required"; checkpointId: string; policyId?: string }
	| { reason: "max_turns_reached"; maxTurns: number; turnCount: number }
	| {
			reason: "tool_call_limit_reached";
			maxToolCalls: number;
			requestedToolCalls: number;
			toolCallCount: number;
	  }
	| {
			reason: "stop_hook_limit_reached";
			maxContinuations: number;
			continuationCount: number;
	  }
	| { reason: "max_output_tokens_recovery"; attempt: number }
	| { reason: "stop_hook_blocking"; continuationCount: number }
	| { reason: "model_error_recovery"; subtype: string; attempt: number }
	| {
			reason: "token_budget_continuation";
			continuationCount: number;
			outputTokens: number;
			targetTokens: number;
	  };

export interface AgentRunResult {
	stopReason: string;
	loopFramework?: AgentLoopFramework;
	loopPolicy?: AgentRunPolicy;
	turnCount: number;
	toolCallCount: number;
	durationMs: number;
	usage?: Usage;
	permissionDenialCount?: number;
	permissionDenials?: AgentToolPermissionDenial[];
	transitions?: AgentLoopTransition[];
	lastTransition?: AgentLoopTransition;
	errorMessage?: string;
	errorSubtype?: string;
	checkpointId?: string;
}

export interface AgentRunPolicy {
	maxModelErrorRecoveryAttempts?: number;
	maxOutputTokenRecoveryAttempts?: number;
	outputTokenBudget?: {
		targetTokens: number;
		thresholdPct?: number;
		maxContinuations?: number;
	};
	maxStopHookContinuations?: number;
	maxToolConcurrency?: number;
	maxToolResultBatchSizeChars?: number;
	maxTurnsPerPrompt?: number;
	maxToolCallsPerPrompt?: number;
	loopProgress?: { repetitionThreshold: number; historySize?: number };
}

export function normalizeAgentLoopFramework(
	value: AgentLoopFrameworkInput | undefined,
): AgentLoopFramework | undefined {
	if (value === "high-intelligence") return "standard";
	if (value === "low-intelligence" || value === "structured-adaptive") return "weak-model-compatible";
	return value;
}

export type AgentToolPermissionDecision =
	| { decision: "allow" }
	| { decision: "deny"; reason?: string };

export interface AgentToolPermissionDenial {
	toolCallId: string;
	toolName: string;
	reason?: string;
}

export type AgentModelErrorRecoveryResult =
	| { action: "stop" }
	| {
			action: "retry";
			messages: AgentMessage[];
			transition?: AgentLoopTransition;
	  };

/**
 * Configuration for the agent loop.
 */
export interface AgentLoopConfig extends SimpleStreamOptions {
	model: Model<any>;
	loopFramework?: AgentLoopFrameworkInput;

	/**
	 * Converts AgentMessage[] to LLM-compatible Message[] before each LLM call.
	 *
	 * Each AgentMessage must be converted to a UserMessage, AssistantMessage, or ToolResultMessage
	 * that the LLM can understand. AgentMessages that cannot be converted (e.g., UI-only notifications,
	 * status messages) should be filtered out.
	 *
	 * @example
	 * ```typescript
	 * convertToLlm: (messages) => messages.flatMap(m => {
	 *   if (m.role === "custom") {
	 *     // Convert custom message to user message
	 *     return [{ role: "user", content: m.content, timestamp: m.timestamp }];
	 *   }
	 *   if (m.role === "notification") {
	 *     // Filter out UI-only messages
	 *     return [];
	 *   }
	 *   // Pass through standard LLM messages
	 *   return [m];
	 * })
	 * ```
	 */
	convertToLlm: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;

	/**
	 * Optional transform applied to the context before `convertToLlm`.
	 *
	 * Use this for operations that work at the AgentMessage level:
	 * - Context window management (pruning old messages)
	 * - Injecting context from external sources
	 *
	 * @example
	 * ```typescript
	 * transformContext: async (messages) => {
	 *   if (estimateTokens(messages) > MAX_TOKENS) {
	 *     return pruneOldMessages(messages);
	 *   }
	 *   return messages;
	 * }
	 * ```
	 */
	transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
	/** Commit a persisted working-context boundary before transient transforms. Must be synchronous. */
	prepareContext?: (messages: AgentMessage[]) => AgentMessage[];

	/**
	 * Resolves an API key dynamically for each LLM call.
	 *
	 * Useful for short-lived OAuth tokens (e.g., GitHub Copilot) that may expire
	 * during long-running tool execution phases.
	 */
	getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;

	/**
	 * Returns steering messages to inject into the conversation mid-run.
	 *
	 * Called after each tool execution to check for user interruptions.
	 * If messages are returned, remaining tool calls are skipped and
	 * these messages are added to the context before the next LLM call.
	 *
	 * Use this for "steering" the agent while it's working.
	 */
	getSteeringMessages?: () => Promise<AgentMessage[]>;

	/**
	 * Returns follow-up messages to process after the agent would otherwise stop.
	 *
	 * Called when the agent has no more tool calls and no steering messages.
	 * If messages are returned, they're added to the context and the agent
	 * continues with another turn.
	 *
	 * Use this for follow-up messages that should wait until the agent finishes.
	 */
	getFollowUpMessages?: () => Promise<AgentMessage[]>;

	/**
	 * Optional tool permission gate for agent loop tool execution.
	 *
	 * Called after schema/custom validation and before the tool executes.
	 * Return "deny" to feed a permission-denied tool_result back to the model
	 * without crashing the loop.
	 */
	canUseTool?: (event: {
		toolCallId: string;
		toolName: string;
		requestedToolName: string;
		input: unknown;
		rawInput: unknown;
		tool: AgentTool<any>;
	}) => Promise<AgentToolPermissionDecision> | AgentToolPermissionDecision;

	/** Ordered host policies evaluated before the legacy canUseTool adapter. */
	toolPolicies?: readonly AgentToolPolicy[];

	/** Optional persistence port used when a tool policy pauses for approval. */
	checkpointStore?: CheckpointStore;
	checkpointTtlMs?: number;

	/** Optional versioned semantic trace recorder. Tracing is disabled when omitted. */
	runTrace?: RunTraceRecorder;

	/**
	 * Optional in-loop model error recovery hook.
	 *
	 * Hosts can use this to recover from context overflow or transient provider
	 * errors before the loop reaches agent_end. Return retry with a replacement
	 * AgentMessage context to make the next model call use recovered state.
	 */
	recoverModelError?: (event: {
		message: AgentMessage;
		messages: AgentMessage[];
		errorSubtype: string;
		attempt: number;
	}) => Promise<AgentModelErrorRecoveryResult> | AgentModelErrorRecoveryResult;

	/**
	 * Optional non-blocking summary for completed tool batches.
	 *
	 * The loop starts this after a tool batch finishes. If the summary is
	 * already settled at the start of a later turn, it is emitted as a normal
	 * AgentMessage and included in that model request. If it is still pending,
	 * the model request proceeds without waiting.
	 */
	createToolUseSummary?: (event: {
		assistantMessage: AgentMessage;
		toolResults: ToolResultMessage[];
		contextMessages: AgentMessage[];
		messages: AgentMessage[];
	}) => AgentMessage | undefined | Promise<AgentMessage | undefined>;

	/**
	 * Maximum model-error recovery retries for one prompt. Defaults to 1.
	 */
	maxModelErrorRecoveryAttempts?: number;

	/**
	 * Maximum assistant turns allowed for one prompt/continue loop.
	 *
	 * Prevents runaway model/tool/follow-up cycles from consuming unbounded
	 * tokens when the model keeps asking for tools or queued messages keep the
	 * loop alive.
	 */
	maxTurnsPerPrompt?: number;

	/**
	 * Maximum tool calls allowed for one prompt/continue loop.
	 *
	 * The loop stops before executing a batch that would exceed this limit and
	 * emits a controlled assistant error message.
	 */
	maxToolCallsPerPrompt?: number;

	/** Optional no-progress detector. Disabled unless explicitly configured. */
	loopProgress?: { repetitionThreshold: number; historySize?: number };
	getProgressMarker?: () => string | undefined | Promise<string | undefined>;

	/**
	 * Maximum concurrency for one batch of concurrency-safe tool calls in the
	 * weak-model-compatible loop. Defaults to 10.
	 */
	maxToolConcurrency?: number;

	/**
	 * Maximum combined text characters from one assistant tool-use batch that
	 * may be fed into the next model request.
	 *
	 * This aggregate guard complements per-tool maxResultSizeChars: it prevents
	 * several individually valid read/search results from flooding the next
	 * context turn. Loops preserve tool_result order and trim the largest
	 * successful results first.
	 */
	maxToolResultBatchSizeChars?: number;

	/**
	 * Maximum automatic continuations after a model stops because it hit its
	 * output-token limit. Defaults to 1.
	 */
	maxOutputTokenRecoveryAttempts?: number;

	/**
	 * Optional output-token budget target for long-form agent turns.
	 *
	 * If the assistant stops naturally before cumulative output reaches
	 * thresholdPct * targetTokens, the loop injects a meta continuation prompt.
	 * This is distinct from max-output-token recovery: it handles
	 * under-complete answers, not hard length stops.
	 */
	outputTokenBudget?: {
		targetTokens: number;
		thresholdPct?: number;
		maxContinuations?: number;
	};

	/**
	 * Optional stop hook. Called when the assistant would stop without tool
	 * calls. Return action "continue" with messages to force a
	 * correction/validation turn; return "stop" to allow completion.
	 */
	runStopHooks?: (event: {
		message: AgentMessage;
		messages: AgentMessage[];
	}) => Promise<StructuredAdaptiveStopHookResult> | StructuredAdaptiveStopHookResult;

	/**
	 * Maximum stop-hook continuation turns for one prompt. Defaults to 3.
	 */
	maxStopHookContinuations?: number;
}

export type StructuredAdaptiveStopHookResult =
	| { action: "stop" }
	| { action: "continue"; messages: AgentMessage[]; reason?: string };

/**
 * Thinking/reasoning level for models that support it.
 * Note: "xhigh" is only supported by OpenAI gpt-5.1-codex-max, gpt-5.2, gpt-5.2-codex, gpt-5.3, and gpt-5.3-codex models.
 */
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

/**
 * Extensible interface for custom app messages.
 * Apps can extend via declaration merging:
 *
 * @example
 * ```typescript
 * declare module "@catui/agent-core" {
 *   interface CustomAgentMessages {
 *     artifact: ArtifactMessage;
 *     notification: NotificationMessage;
 *   }
 * }
 * ```
 */
export interface CustomAgentMessages {
	// Empty by default - apps extend via declaration merging
}

/**
 * AgentMessage: Union of LLM messages + custom messages.
 * This abstraction allows apps to add custom message types while maintaining
 * type safety and compatibility with the base LLM messages.
 */
export type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages];

/**
 * Agent state containing all configuration and conversation data.
 */
export interface AgentState {
	systemPrompt: string;
	model: Model<any>;
	thinkingLevel: ThinkingLevel;
	tools: AgentTool<any>[];
	messages: AgentMessage[]; // Can include attachments + custom message types
	isStreaming: boolean;
	streamMessage: AgentMessage | null;
	pendingToolCalls: Set<string>;
	lastResult?: AgentRunResult;
	error?: string;
}

export interface AgentToolResult<T> {
	// Content blocks supporting text, images, and documents (PDFs)
	content: (TextContent | ImageContent | DocumentContent)[];
	// Details to be displayed in a UI or logged
	details: T;
	/**
	 * Optional messages appended after the corresponding tool_result messages.
	 * Use this for tool-generated attachments or context updates that should not
	 * interrupt assistant tool_use -> tool_result pairing.
	 */
	contextMessages?: AgentMessage[];
}

// Callback for streaming tool execution updates
export type AgentToolUpdateCallback<T = any> = (partialResult: AgentToolResult<T>) => void;

export type AgentToolConcurrencySafety<TParameters extends TSchema = TSchema> =
	| boolean
	| ((params: Static<TParameters>) => boolean);

export type AgentToolInterruptBehavior<TParameters extends TSchema = TSchema> =
	| "cancel"
	| "block"
	| ((params: Static<TParameters>) => "cancel" | "block");

// AgentTool extends Tool but adds the execute function
export interface AgentTool<TParameters extends TSchema = TSchema, TDetails = any> extends Tool<TParameters> {
	// A human-readable label for the tool to be displayed in UI
	label: string;
	/** Alternative model-facing names accepted for transcript/tool compatibility. */
	aliases?: string[];
	/**
	 * Whether the tool can safely run alongside other concurrency-safe tools.
	 * The weak-model-compatible loop uses this to batch read-only work while keeping
	 * stateful tools such as edit/write/bash serialized.
	 */
	isConcurrencySafe?: AgentToolConcurrencySafety<TParameters>;
	/** Whether the tool only reads data without modifying filesystem or system state. */
	readOnly?: boolean;
	interruptBehavior?: AgentToolInterruptBehavior<TParameters>;
	/** Optional semantic validation after schema validation and before execute. */
	validateInput?: (params: Static<TParameters>) => void | string | Promise<void | string>;
	/** Optional maximum text result size enforced by agent loop tool orchestration. */
	maxResultSizeChars?: number;
	execute: (
		toolCallId: string,
		params: Static<TParameters>,
		signal?: AbortSignal,
		onUpdate?: AgentToolUpdateCallback<TDetails>,
	) => Promise<AgentToolResult<TDetails>>;
}

// AgentContext is like Context but uses AgentTool
export interface AgentContext {
	systemPrompt: string;
	messages: AgentMessage[];
	tools?: AgentTool<any>[];
}

/**
 * Events emitted by the Agent for UI updates.
 * These events provide fine-grained lifecycle information for messages, turns, and tool executions.
 */
export type AgentEvent =
	// Agent lifecycle
	| { type: "agent_start" }
	| { type: "agent_end"; messages: AgentMessage[] }
	| ({ type: "agent_result" } & AgentRunResult)
	| {
			type: "stream_request_start";
			model: string;
			provider: string;
			api: string;
			messageCount: number;
			maxTokens?: number;
	  }
	// Turn lifecycle - a turn is one assistant response + any tool calls/results
	| { type: "turn_start" }
	| { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
	// Message lifecycle - emitted for user, assistant, and toolResult messages
	| { type: "message_start"; message: AgentMessage }
	// Only emitted for assistant messages during streaming
	| { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }
	| { type: "message_end"; message: AgentMessage }
	// Tool execution lifecycle
	| { type: "tool_execution_start"; toolCallId: string; toolName: string; args: any }
	| { type: "tool_execution_update"; toolCallId: string; toolName: string; args: any; partialResult: any }
	| {
			type: "tool_execution_end";
			toolCallId: string;
			toolName: string;
			result: any;
			isError: boolean;
			durationMs?: number;
	  };
