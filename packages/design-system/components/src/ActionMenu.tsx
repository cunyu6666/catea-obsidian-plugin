import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface ActionMenuItem {
  id: string
  label: string
  icon?: ReactNode
  onSelect: () => void
  checked?: boolean
  detail?: string
  separatorBefore?: boolean
}
export function ActionMenu({
  label,
  icon,
  items,
  disabled = false,
  className = '',
  menuClassName = '',
  placement = 'auto',
}: {
  label: string
  icon: ReactNode
  items: ActionMenuItem[]
  disabled?: boolean
  className?: string
  menuClassName?: string
  placement?: 'auto' | 'bottom'
}) {
  const trigger = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState({ left: 0, top: 0 })
  const close = (restore = false) => {
    setOpen(false)
    if (restore) trigger.current?.focus()
  }
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return
    const rect = trigger.current.getBoundingClientRect(),
      win = trigger.current.ownerDocument.defaultView!
    const height = menu.current.offsetHeight,
      width = menu.current.offsetWidth
    setPosition({
      left: Math.max(8, Math.min(rect.left, win.innerWidth - width - 8)),
      top:
        placement === 'auto' && rect.top - height - 6 >= 8
          ? rect.top - height - 6
          : Math.min(rect.bottom + 6, win.innerHeight - height - 8),
    })
    menu.current
      .querySelector<HTMLButtonElement>('[aria-checked="true"]')
      ?.focus({ preventScroll: true })
    if (!menu.current.contains(menu.current.ownerDocument.activeElement))
      menu.current.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  }, [open, placement])
  useEffect(() => {
    if (!open) return
    const doc = trigger.current!.ownerDocument,
      win = doc.defaultView!
    const outside = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node))
        close()
    }
    // Streaming replies scroll the message pane; that does not move this trigger.
    const scroll = (e: Event) => {
      const target = e.target
      if (
        target === doc ||
        target === win ||
        target === doc.scrollingElement ||
        (target instanceof Element && trigger.current && target.contains(trigger.current))
      )
        close()
    }
    const resize = () => close()
    doc.addEventListener('pointerdown', outside)
    doc.addEventListener('scroll', scroll, true)
    win.addEventListener('resize', resize)
    return () => {
      doc.removeEventListener('pointerdown', outside)
      doc.removeEventListener('scroll', scroll, true)
      win.removeEventListener('resize', resize)
    }
  }, [open])
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`anno-composer__attach ${className}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        <span className="catea-sr-only">{label}</span>
        {icon}
      </button>
      {open &&
        createPortal(
          <div className="catea-ui">
            <div
              ref={menu}
              role="menu"
              className={`catea-action-menu ${menuClassName}`}
              style={position}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  e.stopPropagation()
                  close(true)
                }
                if (e.key === 'Tab') close()
                const buttons = Array.from(
                  menu.current?.querySelectorAll<HTMLButtonElement>(
                    '[role="menuitem"], [role="menuitemradio"]',
                  ) || [],
                )
                const index = buttons.indexOf(e.target as HTMLButtonElement)
                if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
                  e.preventDefault()
                  buttons[
                    e.key === 'Home'
                      ? 0
                      : e.key === 'End'
                        ? buttons.length - 1
                        : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
                          buttons.length
                  ]?.focus()
                }
              }}
            >
              <span className="catea-sr-only">{label}</span>
              {items.map((item) => (
                <div role="none" key={item.id}>
                  {item.separatorBefore && (
                    <div className="catea-action-menu__separator" role="separator" />
                  )}
                  <button
                    type="button"
                    role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
                    aria-checked={item.checked}
                    className="catea-action-menu__item"
                    title={item.label}
                    onClick={() => {
                      close(true)
                      item.onSelect()
                    }}
                  >
                    {item.icon}
                    <span className="catea-action-menu__label">{item.label}</span>
                    {item.detail && (
                      <span className="catea-action-menu__detail">{item.detail}</span>
                    )}
                    {item.checked && (
                      <span className="catea-action-menu__check" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>,
          trigger.current!.ownerDocument.body,
        )}
    </>
  )
}
