/**
 * [WHO]: readNotes and writeNote maintain bounded versioned working notes on the current branch
 * [FROM]: Depends on the public session entry type contract
 * [TO]: Consumed by context-management tools and regression tests
 * [HERE]: extensions/builtin/context-management/notes.ts - session notes, independent of long-term memory
 */
import type { SessionEntry } from "../../../session.js";

export const NOTE_ENTRY_TYPE = "context-working-note";
export interface WorkingNote { name: string; content: string; revision: number; }

export function readNotes(branch: SessionEntry[]): Map<string, WorkingNote & { entry_id: string }> {
  const notes = new Map<string, WorkingNote & { entry_id: string }>();
  for (const entry of branch) {
    if (entry.type !== "custom" || entry.customType !== NOTE_ENTRY_TYPE) continue;
    const value = entry.data as Partial<WorkingNote> | undefined;
    if (value && typeof value.name === "string" && typeof value.content === "string" &&
      typeof value.revision === "number" && value.name.length <= 64 && value.content.length <= 12000) {
      notes.set(value.name, { name: value.name, content: value.content, revision: value.revision, entry_id: entry.id });
    }
  }
  return notes;
}

export function writeNote(
  branch: SessionEntry[], name: string, content: string, append: boolean,
  persist: (type: string, data: WorkingNote) => void,
): WorkingNote {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) throw new Error("Note name must contain 1-64 letters, numbers, underscores, or hyphens.");
  const notes = readNotes(branch);
  const previous = notes.get(name);
  const combined = append && previous ? `${previous.content}\n${content}` : content;
  if (combined.length > 12000) throw new Error("Note exceeds 12000 characters; rewrite it concisely.");
  if (!previous && notes.size >= 16) throw new Error("At most 16 working notes are allowed; update an existing note.");
  const total = [...notes.values()].reduce((sum, note) => sum + note.content.length, 0);
  if (total - (previous?.content.length ?? 0) + combined.length > 32000) throw new Error("Working notes exceed 32000 characters; shorten existing notes.");
  const note = { name, content: combined, revision: (previous?.revision ?? 0) + 1 };
  persist(NOTE_ENTRY_TYPE, note);
  return note;
}
