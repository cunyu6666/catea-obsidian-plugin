/**
 * [WHO]: TypeBox schema re-exports, StringEnum, validateToolCall, validateToolArguments
 * [FROM]: Depends on @sinclair/typebox and AI validation/typebox helper modules
 * [TO]: Consumed by @catui/ai/schema subpath consumers
 * [HERE]: core/lib/ai/src/schema.ts - additive schema subpath entry for AI package
 */

export type { Static, TSchema } from "@sinclair/typebox";
export { Type } from "@sinclair/typebox";

export * from "./utils/typebox-helpers.js";
export * from "./utils/validation.js";
