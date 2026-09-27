/**
 * [WHO]: readHistory provides bounded active-branch listing, searching, and original text retrieval
 * [FROM]: Depends on the public session entry type contract
 * [TO]: Consumed by context-management tools and regression tests
 * [HERE]: extensions/builtin/context-management/history.ts - on-demand evidence retrieval
 */
import type { SessionEntry } from "../../../session.js";

export interface HistoryQuery {
  action: "list" | "search" | "read" | "windows";
  query?: string;
  entry_id?: string;
  offset?: number;
  limit?: number;
}

/** Only visible conversation content; never replay hidden reasoning or executable objects. */
export function entryText(entry: SessionEntry): string {
  if (entry.type === "compaction" || entry.type === "branch_summary") return entry.summary;
  if (entry.type !== "message" && entry.type !== "custom_message") return "";
  const message = entry.type === "message" ? entry.message : entry;
  if (!("content" in message)) return "";
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content.map((block) => {
    if (block.type === "text") return block.text;
    if (block.type === "toolCall") return `Tool call ${block.name} (${block.id}): ${JSON.stringify(block.arguments)}`;
    return "";
  }).filter(Boolean).join("\n");
}

export function readHistory(branch: SessionEntry[], input: HistoryQuery): unknown {
  const offset = Math.max(0, Math.floor(input.offset ?? 0));
  const limit = Math.max(1, Math.min(10, Math.floor(input.limit ?? 5)));
  if (input.action === "read") {
    const entry = branch.find((candidate) => candidate.id === input.entry_id);
    if (!entry || entry.type === "custom") return { error: "Entry not found in the active branch." };
    const text = entryText(entry);
    return { entry_id: entry.id, text: text.slice(offset, offset + 4000),
      next_offset: offset + 4000 < text.length ? offset + 4000 : null, total_chars: text.length };
  }
  const query = input.query?.trim().toLowerCase() ?? "";
  if (input.action === "search" && !query) return { error: "A non-empty search query is required." };
  let windowId = "start";
  const rows: Array<{ entry_id: string; window_id: string; type: string; timestamp: string; preview: string }> = [];
  for (const entry of branch) {
    if (entry.type === "compaction") windowId = entry.id;
    if (input.action === "windows" && entry.type !== "compaction") continue;
    const text = entryText(entry);
    if (!text) continue;
    const match = input.action === "search" ? text.toLowerCase().indexOf(query) : 0;
    if (match < 0) continue;
    const start = Math.max(0, match - 100);
    rows.push({ entry_id: entry.id, window_id: windowId,
      type: entry.type === "message" ? entry.message.role : entry.type,
      timestamp: entry.timestamp, preview: text.slice(start, start + 350) });
  }
  rows.reverse();
  return { items: rows.slice(offset, offset + limit), total: rows.length,
    next_offset: offset + limit < rows.length ? offset + limit : null };
}
