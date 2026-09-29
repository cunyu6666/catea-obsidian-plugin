/**
 * [WHO]: Provides SessionDraftStore, SessionDraft, SelectedQuote
 * [FROM]: Depends on ../../../packages/agent-core/src/types
 * [TO]: Consumed by apps/obsidian/src/main.tsx, apps/obsidian/src/panel.tsx
 * [HERE]: apps/obsidian/src/session-drafts.ts - session-keyed composer state, including per-message skill tags, with safe asynchronous updates
 */
import type { ChatAttachment } from '../../../packages/agent-core/src/types'

export interface SelectedQuote {
  id: string
  path: string
  text: string
  comment?: string
}
export interface SessionDraft {
  text: string
  attachments: ChatAttachment[]
  quotes: SelectedQuote[]
  /** Skill ids tagged through the composer slash picker for the next send. */
  skills: string[]
}

const empty = (): SessionDraft => ({ text: '', attachments: [], quotes: [], skills: [] })

export class SessionDraftStore {
  private drafts = new Map<string, SessionDraft>()

  get(sessionId: string): SessionDraft {
    let draft = this.drafts.get(sessionId)
    if (!draft) {
      draft = empty()
      this.drafts.set(sessionId, draft)
    }
    return draft
  }

  update(sessionId: string, change: (draft: SessionDraft) => SessionDraft): SessionDraft {
    const next = change(this.get(sessionId))
    this.drafts.set(sessionId, next)
    return next
  }

  clear(sessionId: string): void {
    this.drafts.set(sessionId, empty())
  }
  delete(sessionId: string): void {
    this.drafts.delete(sessionId)
  }

  restore(sessionId: string, sent: SessionDraft): void {
    this.update(sessionId, (current) => ({
      text: current.text ? `${sent.text}\n${current.text}` : sent.text,
      attachments: [
        ...sent.attachments,
        ...current.attachments.filter(
          (file) => !sent.attachments.some((previous) => previous.id === file.id),
        ),
      ],
      quotes: [
        ...sent.quotes,
        ...current.quotes.filter(
          (quote) => !sent.quotes.some((previous) => previous.id === quote.id),
        ),
      ],
      skills: [...sent.skills, ...current.skills.filter((id) => !sent.skills.includes(id))],
    }))
  }
}
