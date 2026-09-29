import { useLayoutEffect, useRef } from 'react'

export interface SkillPickerItem {
  id: string
  description: string
  enabled: boolean
}

// Token-boundary slash detection: "/skill" opens the picker only at the start of
// the text or after whitespace, so paths like notes/a/b never trigger it. The
// returned start index lets the caller strip the whole "/query" token on select.
export function parseSlashQuery(text: string): { query: string; start: number } | null {
  const match = /(^|\s)\/([\w-]*)$/.exec(text)
  if (!match) return null
  const query = match[2]
  return { query, start: text.length - query.length - 1 }
}

export function filterSkillItems(items: SkillPickerItem[], query: string): SkillPickerItem[] {
  if (!query) return items
  const needle = query.toLowerCase()
  return items.filter(
    (item) =>
      item.id.toLowerCase().includes(needle) || item.description.toLowerCase().includes(needle),
  )
}

export interface SkillPickerProps {
  items: SkillPickerItem[]
  activeIndex: number
  selectedIds?: string[]
  onSelect: (item: SkillPickerItem) => void
  listLabel: string
  emptyLabel: string
  enabledLabel: string
  addedLabel: string
}

export function SkillPicker({
  items,
  activeIndex,
  selectedIds,
  onSelect,
  listLabel,
  emptyLabel,
  enabledLabel,
  addedLabel,
}: SkillPickerProps) {
  const listRef = useRef<HTMLDivElement>(null)
  // Scroll the active option inside the menu's own box; scrollIntoView would
  // drag ancestor scrollers (the message pane) along.
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const active = list.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!active) return
    const top = active.offsetTop
    const bottom = top + active.offsetHeight
    if (top < list.scrollTop) list.scrollTop = top
    else if (bottom > list.scrollTop + list.clientHeight)
      list.scrollTop = bottom - list.clientHeight
  }, [activeIndex, items])
  return (
    <div className="catea-skill-menu" role="listbox" aria-label={listLabel} ref={listRef}>
      {items.length === 0 ? (
        <div className="catea-skill-menu__empty">{emptyLabel}</div>
      ) : (
        items.map((item, index) => (
          <div
            key={item.id}
            role="option"
            aria-selected={index === activeIndex}
            className="catea-skill-menu__option"
            data-active={index === activeIndex ? 'true' : undefined}
            // Keep the textarea focused: a click here must not move focus away.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(item)}
          >
            <span className="catea-skill-menu__id">{item.id}</span>
            {selectedIds?.includes(item.id) ? (
              <span className="catea-skill-menu__badge">{addedLabel}</span>
            ) : item.enabled ? (
              <span className="catea-skill-menu__badge">{enabledLabel}</span>
            ) : null}
            <span className="catea-skill-menu__desc">{item.description}</span>
          </div>
        ))
      )}
    </div>
  )
}
