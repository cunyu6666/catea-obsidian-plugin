/**
 * [WHO]: Provides DiagramDialog
 * [FROM]: Depends on react, react-dom
 * [TO]: Consumed by apps/obsidian/src/MermaidDiagram.tsx
 * [HERE]: apps/obsidian/src/DiagramDialog.tsx - portal wrapper around a native dialog element providing Escape handling, focus trap and focus restore for diagram zoom
 */
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Native modal provides Escape, focus trapping and focus restoration in Obsidian. */
export function DiagramDialog({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
}) {
  const titleId = useId()
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])
  return createPortal(
    <div className="catea-ui">
      <dialog
        ref={ref}
        className="catea-ui chat-mermaid-preview"
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault()
          onOpenChange(false)
        }}
        onClose={() => onOpenChange(false)}
      >
        <span id={titleId} hidden>
          {title}
        </span>
        {children}
      </dialog>
    </div>,
    document.body,
  )
}
