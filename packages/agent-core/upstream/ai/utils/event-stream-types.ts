/**
 * [WHO]: Provides AsyncEventStream structural contract for provider stream types
 * [FROM]: No runtime dependencies; pure stream type contract
 * [TO]: Consumed by core/lib/ai/src/types.ts and utils/event-stream.ts
 * [HERE]: core/lib/ai/src/utils/event-stream-types.ts - acyclic type seam between message types and stream implementation
 */

export interface AsyncEventStream<T, R = T> extends AsyncIterable<T> {
  push(event: T): void;
  end(result?: R): void;
  result(): Promise<R>;
  resultIfResolved(): R | undefined;
}
