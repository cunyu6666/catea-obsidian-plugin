/**
 * [WHO]: validateToolCall, validateToolArguments
 * [FROM]: Depends on ajv, ajv-formats
 * [TO]: Consumed by core/lib/ai/src/index.ts
 * [HERE]: core/lib/ai/src/utils/validation.ts -
 */

import { Ajv, type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import type { Tool, ToolCall } from "../types.js";

// Desktop host: validation is mandatory. Initialization failure must not trust model arguments.
const ajv = new Ajv({ allErrors: true, strict: false, coerceTypes: true });
addFormats(ajv);

/**
 * Finds a tool by name and validates the tool call arguments against its TypeBox schema
 * @param tools Array of tool definitions
 * @param toolCall The tool call from the LLM
 * @returns The validated arguments
 * @throws Error if tool is not found or validation fails
 */
export function validateToolCall(tools: Tool[], toolCall: ToolCall): Record<string, unknown> {
	const tool = tools.find((t) => t.name === toolCall.name);
	if (!tool) {
		throw new Error(`Tool "${toolCall.name}" not found`);
	}
	return validateToolArguments(tool, toolCall);
}

/**
 * Validates tool call arguments against the tool's TypeBox schema
 * @param tool The tool definition with TypeBox schema
 * @param toolCall The tool call from the LLM
 * @returns The validated (and potentially coerced) arguments
 * @throws Error with formatted message if validation fails
 */
export function validateToolArguments(tool: Tool, toolCall: Omit<ToolCall, "arguments"> & { arguments: unknown }): Record<string, unknown> {
	// Compile the schema
	const validate = ajv.compile<Record<string, unknown>>(tool.parameters);

	// Clone arguments so AJV can safely mutate for type coercion
	const args = structuredClone(toolCall.arguments);

	// Validate the arguments (AJV mutates args in-place for type coercion)
	if (validate(args)) {
		return args;
	}

	// Format validation errors nicely
	const errors =
		validate.errors
			?.map((err: ErrorObject) => {
				const path = err.instancePath ? err.instancePath.substring(1) : (typeof err.params.missingProperty === "string" ? err.params.missingProperty : "root");
				return `  - ${path}: ${err.message}`;
			})
			.join("\n") || "Unknown validation error";

	const errorMessage = `Validation failed for tool "${toolCall.name}":\n${errors}\n\nReceived arguments:\n${JSON.stringify(toolCall.arguments, null, 2)}`;

	throw new Error(errorMessage);
}
