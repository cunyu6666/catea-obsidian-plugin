import {ActionMenu} from './ActionMenu'
import { useId, useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Icon } from './Icon'

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder: string
  mode: 'search' | 'ai'
  inputLabel: string
  submitLabel: string
  running?: boolean
  stopLabel?: string
  onStop?: () => void
  leading?: ReactNode
  trailing?: ReactNode
  attachments?: ReactNode
  onDropFiles?: (dataTransfer: DataTransfer) => void
  onPickFolder?: () => void
  folderLabel?: string
  onPickFiles?: (files: FileList) => void
  workingDirectory?: ReactNode
  fileLabel?: string
  attachLabel?: string
  dropLabel?: string
  hasSubmitContent?: boolean
  disabled?: boolean
  busy?: boolean
  autoFocus?: boolean
  className?: string
}

export function Composer({ value, onChange, onSubmit, placeholder, mode, inputLabel, submitLabel, running = false, stopLabel = 'Stop', onStop, leading, trailing, attachments, onDropFiles, onPickFiles, onPickFolder, folderLabel, workingDirectory, attachLabel, fileLabel, dropLabel, hasSubmitContent, disabled, busy, autoFocus, className = '' }: ComposerProps) {
  const inputLabelId = useId()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const [dragging, setDragging] = useState(false)
  const stopping = running && !!onStop
  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    // Drop the inline height so scrollHeight reports the content box, then pin it.
    input.style.removeProperty('height')
    input.style.height = `${Math.min(input.scrollHeight, 260)}px`
  }, [value])

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    if ((value.trim() || hasSubmitContent) && !disabled && !busy) onSubmit()
  }

  function hasFiles(event: DragEvent<HTMLDivElement>) {
    return onDropFiles && [...event.dataTransfer.types].includes('Files')
  }

  return (
    <div className={`anno-composer ${className}`}
      onDragEnter={event => {
        if (!hasFiles(event)) return
        event.preventDefault()
        dragDepth.current += 1
        setDragging(true)
      }}
      onDragOver={event => {
        if (!hasFiles(event)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={event => {
        if (!dragging) return
        event.preventDefault()
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (!dragDepth.current) setDragging(false)
      }}
      onDrop={event => {
        if (!hasFiles(event)) return
        event.preventDefault()
        dragDepth.current = 0
        setDragging(false)
        onDropFiles?.(event.dataTransfer)
      }}>
      {attachments}
      {/* Obsidian turns aria-label into a hover tooltip; a referenced label preserves the accessible name without it. */}
      <span id={inputLabelId} hidden>{inputLabel}</span>
      <textarea
        aria-labelledby={inputLabelId}
        ref={inputRef}
        autoFocus={autoFocus}
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={event=>{if(onPickFiles&&event.clipboardData.files.length){event.preventDefault();onPickFiles(event.clipboardData.files)}}}
        placeholder={placeholder}
        disabled={disabled}
        rows={2}
        className="anno-composer__input anno-auto-scrollbar"
      />
      <div className="anno-composer__toolbar">
        <div className="anno-composer__toolbar-group">
          {onPickFiles&&<input ref={fileInputRef} className="anno-composer__file-input" type="file" multiple tabIndex={-1} onChange={event=>{if(event.target.files?.length)onPickFiles(event.target.files);event.target.value=''}}/>}
          {(onPickFiles||onPickFolder)&&<ActionMenu label={attachLabel||'Add'} icon={<Icon name="add" size={17}/>} items={[
            ...(onPickFiles?[{id:'file',label:fileLabel||'Add files',icon:<Icon name="file" size={15}/>,onSelect:()=>fileInputRef.current?.click()}]:[]),
            ...(onPickFolder?[{id:'folder',label:folderLabel||'Add folder',icon:<Icon name="folder" size={15}/>,onSelect:onPickFolder}]:[]),
          ]}/>}
          {workingDirectory}
          {leading}
        </div>
        <div className="anno-composer__toolbar-group">{trailing}
          <button
            type="button"
            data-state={stopping ? 'stop' : 'submit'}
            disabled={stopping ? disabled : (!value.trim() && !hasSubmitContent) || disabled || busy}
            onClick={stopping ? onStop : onSubmit}
            className="anno-composer__send"
          ><span className="catea-sr-only">{stopping ? stopLabel : submitLabel}</span><Icon name={stopping ? 'stop' : mode === 'search' ? 'search' : 'arrow-up'} size={stopping ? 14 : 16} /></button>
        </div>
      </div>
      {dragging && <div className="anno-composer__drop-overlay" role="status"><Icon name="upload" size={18} />{dropLabel}</div>}
    </div>
  )
}
