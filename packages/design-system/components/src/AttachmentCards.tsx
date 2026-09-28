import {Icon} from './Icon'

export interface AttachmentCardItem {
  id:string
  name:string
  path:string
  detail:string
  kind:'image'|'file'|'folder'
  previewUrl?:string
}

export function AttachmentCards({items,mode='message',removeLabel='Remove attachment',onRemove}:{items:AttachmentCardItem[];mode?:'composer'|'message';removeLabel?:string;onRemove?:(id:string)=>void}){
  if(!items.length)return null
  return <div className="anno-attachments" data-mode={mode}>{items.map(item=><div className="anno-attachment" data-kind={item.kind} key={item.id} title={item.path}>
    {onRemove&&<button type="button" className="anno-attachment__remove" aria-label={removeLabel} title={removeLabel} onClick={()=>onRemove(item.id)}><Icon name="close" size={12}/></button>}
    {item.kind==='image'&&item.previewUrl?<img className="anno-attachment__image" src={item.previewUrl} alt={item.name}/>:<span className="anno-attachment__preview"><Icon name={item.kind==='folder'?'folder':'file'} size={20}/></span>}
    {item.kind!=='image'&&<span className="anno-attachment__text"><strong>{item.name}</strong><small>{item.detail}</small></span>}
  </div>)}</div>
}
