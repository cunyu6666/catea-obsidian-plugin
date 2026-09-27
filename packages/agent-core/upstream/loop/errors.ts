/**
 * [WHO]: AgentError hierarchy — AgentError, NetworkError, ContextOverflowError, ToolExecutionError, ValidationError, ExtensionError
 * [FROM]: No external dependencies
 * [TO]: Consumed by agent-loop, agent, proxy, and downstream consumers
 * [HERE]: core/lib/agent-core/src/errors.ts - unified error type system
 */

// =============================================================================
// Base Error
// =============================================================================

/**
 * Base error class for all agent-related errors.
 * Provides structured error info (code, retriable flag) for consistent handling.
 */
export class AgentError extends Error {
	public readonly code: string;
	public readonly retriable: boolean;
	public readonly details?: unknown;

	constructor(
		message: string,
		code: string,
		retriable: boolean = false,
		details?: unknown,
	) {
		super(message);
		this.name = "AgentError";
		this.code = code;
		this.retriable = retriable;
		this.details = details;
	}
}

// =============================================================================
// Network Errors (retriable)
// =============================================================================

export class NetworkError extends AgentError {
	public readonly statusCode?: number;

	constructor(
		message: string,
		statusCode?: number,
		details?: unknown,
	) {
		super(message, "NETWORK_ERROR", true, details);
		this.name = "NetworkError";
		this.statusCode = statusCode;
	}
}

export class RateLimitError extends NetworkError {
	public readonly retryAfterMs?: number;

	constructor(
		message: string,
		retryAfterMs?: number,
	) {
		super(message, 429);
		this.name = "RateLimitError";
		this.retryAfterMs = retryAfterMs;
	}
}

export class TimeoutError extends NetworkError {
	constructor(message: string, details?: unknown) {
		super(message, undefined, details);
		this.name = "TimeoutError";
	}
}

export class ConnectionError extends NetworkError {
	constructor(message: string, details?: unknown) {
		super(message, undefined, details);
		this.name = "ConnectionError";
	}
}

// =============================================================================
// Context Errors
// =============================================================================

export class ContextOverflowError extends AgentError {
	public readonly estimatedTokens?: number;
	public readonly contextWindow?: number;

	constructor(
		message: string,
		estimatedTokens?: number,
		contextWindow?: number,
	) {
		super(message, "CONTEXT_OVERFLOW", false, { estimatedTokens, contextWindow });
		this.name = "ContextOverflowError";
		this.estimatedTokens = estimatedTokens;
		this.contextWindow = contextWindow;
	}
}

// =============================================================================
// Tool Errors
// =============================================================================

export class ToolExecutionError extends AgentError {
	public readonly toolName: string;
	public readonly toolCallId?: string;

	constructor(
		message: string,
		toolName: string,
		toolCallId?: string,
	) {
		super(message, "TOOL_EXECUTION_ERROR", false, { toolName, toolCallId });
		this.name = "ToolExecutionError";
		this.toolName = toolName;
		this.toolCallId = toolCallId;
	}
}

export class ToolTimeoutError extends ToolExecutionError {
	constructor(toolName: string, toolCallId: string, timeoutMs: number) {
		super(`Tool "${toolName}" timed out after ${timeoutMs}ms`, toolName, toolCallId);
		this.name = "ToolTimeoutError";
	}
}

export class ToolNotFoundError extends ToolExecutionError {
	constructor(toolName: string) {
		super(`Tool "${toolName}" not found`, toolName);
		this.name = "ToolNotFoundError";
	}
}

export class ToolPermissionDeniedError extends ToolExecutionError {
	public readonly policyId?: string;

	constructor(message: string, toolName: string, toolCallId?: string, policyId?: string) {
		super(message, toolName, toolCallId);
		this.name = "ToolPermissionDeniedError";
		this.policyId = policyId;
	}
}

// =============================================================================
// Validation Errors (non-retriable)
// =============================================================================

export class ValidationError extends AgentError {
	constructor(message: string, details?: unknown) {
		super(message, "VALIDATION_ERROR", false, details);
		this.name = "ValidationError";
	}
}

// =============================================================================
// Extension Errors (isolated — should not crash the agent)
// =============================================================================

export class ExtensionError extends AgentError {
	public readonly extensionName?: string;

	constructor(
		message: string,
		extensionName?: string,
	) {
		super(message, "EXTENSION_ERROR", false, { extensionName });
		this.name = "ExtensionError";
		this.extensionName = extensionName;
	}
}

// =============================================================================
// Helpers
// =============================================================================

/** Type guard: is the error retriable? */
export function isRetriableError(error: unknown): boolean {
	return error instanceof AgentError && error.retriable;
}

/** Type guard: is this a context overflow error? */
export function isContextOverflowError(error: unknown): boolean {
	return error instanceof ContextOverflowError;
}

/**
 * Classify an HTTP-like error (status code + message) into the appropriate AgentError subclass.
 * Useful for normalizing raw provider errors into the typed hierarchy.
 */
export function classifyApiError(statusCode: number | undefined, message: string): AgentError {
	if (statusCode === 429) {
		const match = message.match(/retry[_-]after[:\s]+(\d+)/i);
		const retryAfterMs = match ? parseInt(match[1], 10) * 1000 : undefined;
		return new RateLimitError(message, retryAfterMs);
	}

	if (statusCode === 413 || (statusCode === 400 && /context|token|prompt.*too long|overflow/i.test(message))) {
		return new ContextOverflowError(message);
	}

	if (statusCode !== undefined && statusCode >= 500) {
		return new NetworkError(message, statusCode);
	}

	if (statusCode !== undefined && statusCode >= 400) {
		return new ValidationError(message, { statusCode });
	}

	return new NetworkError(message, statusCode);
}
