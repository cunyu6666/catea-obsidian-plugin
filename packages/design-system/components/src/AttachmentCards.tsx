import { Icon } from './Icon'

export interface AttachmentCardItem {
  id: string
  name: string
  path: string
  detail: string
  kind: 'image' | 'file' | 'folder'
  previewUrl?: string
}

export function AttachmentCards({
  items,
  mode = 'message',
  removeLabel = 'Remove attachment',
  onRemove,
  onOpen,
}: {
  items: AttachmentCardItem[]
  mode?: 'composer' | 'message'
  removeLabel?: string
  onRemove?: (id: string) => void
  onOpen?: (path: string) => void
}) {
  if (!items.length) return null
  return (
    <div className="anno-attachments" data-mode={mode}>
      {items.map((item) => (
        <div className="anno-attachment" data-kind={item.kind} key={item.id} title={item.path}>
          {onOpen && (
            <button
              type="button"
              className="anno-attachment__open"
              aria-label={item.name}
              onClick={() => onOpen(item.path)}
            />
          )}
          {onRemove && (
            <button
              type="button"
              className="anno-attachment__remove"
              onClick={() => onRemove(item.id)}
            >
              <span className="catea-sr-only">{removeLabel}</span>
              <Icon name="close" size={12} />
            </button>
          )}
          {item.kind === 'image' && item.previewUrl ? (
            <img className="anno-attachment__image" src={item.previewUrl} alt={item.name} />
          ) : (
            <span className="anno-attachment__preview">
              <Icon name={item.kind === 'folder' ? 'folder' : 'file'} size={20} />
            </span>
          )}
          {item.kind !== 'image' && (
            <span className="anno-attachment__text">
              <strong>{item.name}</strong>
              <small>{item.detail}</small>
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
