import {useEffect,useRef,type ReactNode} from 'react'
import {createPortal} from 'react-dom'

/** Native modal provides Escape, focus trapping and focus restoration in Obsidian. */
export function DiagramDialog({open,onOpenChange,title,children}:{open:boolean;onOpenChange:(open:boolean)=>void;title:string;children:ReactNode}){
  const ref=useRef<HTMLDialogElement>(null)
  useEffect(()=>{
    const dialog=ref.current;if(!dialog)return
    if(open&&!dialog.open)dialog.showModal()
    else if(!open&&dialog.open)dialog.close()
  },[open])
  return createPortal(<div className="catea-ui"><dialog ref={ref} className="catea-ui chat-mermaid-preview" aria-label={title} onCancel={event=>{event.preventDefault();onOpenChange(false)}} onClose={()=>onOpenChange(false)}>{children}</dialog></div>,document.body)
}
