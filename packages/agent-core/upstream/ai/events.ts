/**
 * [WHO]: EventStream, AssistantMessageEventStream, createAssistantMessageEventStream, AsyncEventStream
 * [FROM]: Depends on AI event stream implementation and structural event stream types
 * [TO]: Consumed by @catui/ai/events subpath consumers
 * [HERE]: core/lib/ai/src/events.ts - additive events subpath entry for AI package
 */

export * from "./utils/event-stream.js";
export type * from "./utils/event-stream-types.js";
