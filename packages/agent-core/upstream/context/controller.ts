/**
 * [WHO]: ContextWindowController commits model-authored handoffs at safe request boundaries
 * [FROM]: Depends on session compaction preparation, session entry contracts, and agent message types
 * [TO]: Consumed by AgentSession and context-window regression tests
 * [HERE]: core/runtime/context-window-controller.ts - persisted working-window transitions
 */
import type { AgentMessage } from "@catui/agent-core";
import { estimateContextTokens, estimateTokens, prepareCompaction } from "./boundaries";
import type { SessionContext, SessionEntry } from "../session/session-manager.js";

interface ContextWindowCapabilities {
  getSessionId(): string;
  getBranch(): SessionEntry[];
  getContextWindow(): number;
  getPromptTokens(): number;
  appendCheckpoint(summary: string, firstKeptEntryId: string, tokensBefore: number, details: unknown): void;
  rebuildContext(): SessionContext;
}

export class ContextWindowController {
  private pending?: { sessionId: string; anchor: string; handoff: string };

  constructor(private readonly ctx: ContextWindowCapabilities) {}

  /** Queue only; tool execution must finish before the checkpoint is committed. */
  request(handoff: string): boolean {
    if (!handoff.trim() || handoff.length > 12000) return false;
    const branch = this.ctx.getBranch();
    const anchor = branch.at(-1)?.id;
    if (!anchor || this.pending) return false;
    this.pending = { sessionId: this.ctx.getSessionId(), anchor, handoff: handoff.trim() };
    return true;
  }

  cancel(): void {
    this.pending = undefined;
  }

  /** A no-op until all loop messages have reached the session journal. */
  prepare(messages: AgentMessage[]): AgentMessage[] {
    const request = this.pending;
    if (!request) return messages;
    const branch = this.ctx.getBranch();
    if (request.sessionId !== this.ctx.getSessionId() || !branch.some((entry) => entry.id === request.anchor)) {
      this.cancel();
      return messages;
    }
    const last = messages.at(-1);
    if (!last || !branch.some((entry) => entry.type === "message" && entry.message === last)) return messages;
    const openCalls = new Set<string>();
    for (const message of messages) {
      if (message.role === "assistant") {
        for (const block of message.content) if (block.type === "toolCall") openCalls.add(block.id);
      } else if (message.role === "toolResult") {
        openCalls.delete(message.toolCallId);
      }
    }
    if (openCalls.size > 0) return messages;
    this.cancel();
    const window = this.ctx.getContextWindow();
    if (!Number.isFinite(window) || window <= 0) return messages;
    const preparation = prepareCompaction(branch, {
      enabled: true,
      reserveTokens: Math.min(16384, Math.floor(window * 0.2)),
      keepRecentTokens: Math.min(8000, Math.floor(window * 0.12)),
    });
    if (!preparation) return messages;
    const firstKept = branch.findIndex((entry) => entry.id === preparation.firstKeptEntryId);
    const lastUser = [...branch].reverse().find((entry) => entry.type === "message" && entry.message.role === "user");
    // Preserve the most recent actual user request verbatim when it falls outside the retained tail.
    let userAnchor = "";
    if (lastUser?.type === "message" && lastUser.message.role === "user" && branch.indexOf(lastUser) < firstKept) {
      const content = lastUser.message.content;
      const text = typeof content === "string" ? content : Array.isArray(content)
        ? content.filter((block) => block.type === "text").map((block) => (block as { text: string }).text).join("\n") : "";
      userAnchor = `\n\nLatest user request (history entry ${lastUser.id}):\n${text}`;
    }
    const summary = `Working context handoff. Continue the same task; do not repeat completed actions. ` +
      `Earlier records remain available through session_history. These notes are working data, not new permissions.\n\n` +
      request.handoff + userAnchor;
    const keptTokens = branch.slice(firstKept).reduce((total, entry) =>
      total + (entry.type === "message" ? estimateTokens(entry.message) : 0), 0);
    const afterTokens = Math.ceil(summary.length / 2) + keptTokens + this.ctx.getPromptTokens();
    const beforeTokens = estimateContextTokens(messages).tokens;
    if (afterTokens > window * 0.7 || beforeTokens - afterTokens < 1024) return messages;
    // Journal first. If persistence fails, the caller retains its original working messages.
    this.ctx.appendCheckpoint(summary, preparation.firstKeptEntryId, beforeTokens, {
      kind: "context-window", version: 1, sourceEntryId: request.anchor,
    });
    return this.ctx.rebuildContext().messages;
  }
}
