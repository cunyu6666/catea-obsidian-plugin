/**
 * [WHO]: Provides MessageQuotes
 * [FROM]: Depends on ../../../packages/agent-core/src/contracts
 * [TO]: Consumed by apps/obsidian/src/panel.tsx
 * [HERE]: apps/obsidian/src/MessageQuotes.tsx - renders persisted user-message quotes as inert text with source and optional annotation
 */
import type { Message } from '../../../packages/agent-core/src/contracts'

export function MessageQuotes({ quotes }: { quotes: Message['quotes'] }) {
  if (!quotes?.length) return null
  return (
    <div className="catea-quotes catea-message-quotes">
      {quotes.map((quote) => (
        <div className="catea-quote" key={quote.id}>
          <div>
            <strong title={quote.path}>{quote.path}</strong>
            <blockquote>{quote.text}</blockquote>
            {quote.comment && <p>{quote.comment}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}
