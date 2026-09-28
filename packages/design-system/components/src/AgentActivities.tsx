import { useEffect, useState } from 'react'
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
  thinkingContent?: string
  startedAt?: number
  labels: { thinking: string; thought: string; details: string }
  onOpenDetails: (id: string) => void
}

// Adapted from Craft Agents' TurnCard activity header and rows.
export function AgentActivities({ items, preview, autoExpand = false, thinking, thinkingContent, startedAt, labels, onOpenDetails }: AgentActivitiesProps) {
  const [manual, setManual] = useState<{phase:boolean;expanded:boolean}|null>(null)
  const expanded = manual?.phase === autoExpand ? manual.expanded : autoExpand
  if (!items.length) return thinking || thinkingContent?.trim() ? <ThinkingIndicator active={thinking} labels={labels} content={thinkingContent} startedAt={startedAt} /> : null

  return <section className="anno-activities" aria-label={preview}>
    <button className="anno-activities__toggle" type="button" aria-expanded={expanded} onClick={() => setManual({phase:autoExpand,expanded:!expanded})}>
      <span className="anno-activities__indicator">
        <span className="anno-activities__count">{items.length + (thinkingContent?.trim() ? 1 : 0)}</span>
        <span className={`anno-activities__chevron ${expanded ? 'is-expanded' : ''}`} aria-hidden="true"><Icon name="chevron-right" size={12} /></span>
      </span>
      <span className="anno-activities__preview">{preview}</span>
    </button>
    {expanded && <div className="anno-activities__list anno-auto-scrollbar">
      {!!thinkingContent?.trim() && <ThinkingIndicator active={thinking} labels={labels} content={thinkingContent} startedAt={startedAt} />}
      {items.map(item => <button key={item.id} className="anno-activities__row" type="button" onClick={() => item.status !== 'running' && onOpenDetails(item.id)} disabled={item.status === 'running'} aria-label={`${labels.details}: ${item.name}`}>
        <span className={`anno-activities__status is-${item.status}`}><Icon name={item.status === 'running' ? 'loading' : item.status === 'error' ? 'tool-error' : 'tool-done'} size={12} className={item.status === 'running' ? 'anno-spin' : undefined} /></span>
        <span className="anno-activities__name">{item.name}</span>
        {item.summary && <span className="anno-activities__summary">· {item.summary}</span>}
        {item.status !== 'running' && <Icon name="arrow-up-right" size={12} className="anno-activities__open" />}
      </button>)}
      {thinking && !thinkingContent?.trim() && !items.some(item => item.status === 'running') && <ThinkingIndicator active labels={labels} startedAt={startedAt} />}
    </div>}
  </section>
}

function formatElapsed(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${seconds % 60}s`
}

export function ThinkingIndicator({ active, labels, content, startedAt }: { active: boolean; labels: { thinking: string; thought: string }; content?: string; startedAt?: number }) {
  const [now,setNow]=useState(()=>Date.now())
  const [expanded,setExpanded]=useState(false)
  useEffect(()=>{
    if(!active||startedAt===undefined)return
    const timer=window.setInterval(()=>setNow(Date.now()),1000)
    return()=>window.clearInterval(timer)
  },[active,startedAt])
  const elapsed=active&&startedAt!==undefined?` · ${formatElapsed(now-startedAt)}`:''
  const heading=<><span className="anno-thinking__icon" aria-hidden="true"><Icon name={active?'loading':'chat'} size={14} className={active?'anno-spin':undefined}/></span><span>{active?labels.thinking:labels.thought}{elapsed}</span>{content&&<Icon name="chevron-right" size={12} className={`anno-thinking__chevron ${expanded?'is-expanded':''}`}/>}</>
  return <div className="anno-thinking">{content?<button className="anno-thinking__heading" type="button" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{heading}</button>:<div className="anno-thinking__heading" role="status">{heading}</div>}{content&&expanded&&<div className="anno-thinking__content anno-auto-scrollbar">{content}</div>}</div>
}
