import { useState } from 'react'
import { Icon } from './Icon'

export interface AgentActivityItem {
  id: string
  name: string
  summary?: string
  status: 'running' | 'completed' | 'error'
}

interface AgentActivitiesProps {
  items: AgentActivityItem[]
  preview: string
  autoExpand?: boolean
  thinking: boolean
  labels: { thinking: string; details: string }
  onOpenDetails: (id: string) => void
}

// Adapted from Craft Agents' TurnCard activity header and rows.
export function AgentActivities({ items, preview, autoExpand = false, thinking, labels, onOpenDetails }: AgentActivitiesProps) {
  const [manual, setManual] = useState<{phase:boolean;expanded:boolean}|null>(null)
  const expanded = manual?.phase === autoExpand ? manual.expanded : autoExpand
  if (!items.length) return thinking ? <ThinkingIndicator label={labels.thinking} /> : null

  return <section className="anno-activities" aria-label={preview}>
    <button className="anno-activities__toggle" type="button" aria-expanded={expanded} onClick={() => setManual({phase:autoExpand,expanded:!expanded})}>
      <span className="anno-activities__indicator">
        <span className="anno-activities__count">{items.length}</span>
        <span className={`anno-activities__chevron ${expanded ? 'is-expanded' : ''}`} aria-hidden="true"><Icon name="chevron-right" size={12} /></span>
      </span>
      <span className="anno-activities__preview">{preview}</span>
    </button>
    {expanded && <div className="anno-activities__list anno-auto-scrollbar">
      {items.map(item => <button key={item.id} className="anno-activities__row" type="button" onClick={() => item.status !== 'running' && onOpenDetails(item.id)} disabled={item.status === 'running'} aria-label={`${labels.details}: ${item.name}`}>
        <span className={`anno-activities__status is-${item.status}`}><Icon name={item.status === 'running' ? 'loading' : item.status === 'error' ? 'tool-error' : 'tool-done'} size={12} className={item.status === 'running' ? 'anno-spin' : undefined} /></span>
        <span className="anno-activities__name">{item.name}</span>
        {item.summary && <span className="anno-activities__summary">· {item.summary}</span>}
        {item.status !== 'running' && <Icon name="arrow-up-right" size={12} className="anno-activities__open" />}
      </button>)}
      {thinking && !items.some(item => item.status === 'running') && <ThinkingIndicator label={labels.thinking} />}
    </div>}
  </section>
}

export function ThinkingIndicator({ label }: { label: string }) {
  return <div className="anno-thinking" role="status" aria-label={label}><span className="anno-thinking__fish" aria-hidden="true" /><span>{label}</span></div>
}
