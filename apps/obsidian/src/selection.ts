/**
 * [WHO]: Provides installSelectionAction
 * [FROM]: Depends on obsidian, ./main
 * [TO]: Consumed by apps/obsidian/src/main.tsx
 * [HERE]: apps/obsidian/src/selection.ts - adds an editor-menu entry and a floating add-to-Catea popup positioned via CodeMirror coordsAtPos, rebinding listeners on layout change
 */
import {MarkdownView,setIcon} from 'obsidian'
import type Catea from './main'

/** CodeMirror owns selection state; DOM selection is only an optional anchor. */
export function installSelectionAction(plugin:Catea){
  let surface:HTMLDivElement|undefined,frame=0,frameWindow:Window=window
  const clear=()=>{frameWindow.cancelAnimationFrame(frame);surface?.remove();surface=undefined}
  const capture=()=>{
    const view=plugin.app.workspace.getActiveViewOfType(MarkdownView)
    const text=view?.editor?.getSelection()
    return view?.file&&text?.trim()?{view,path:view.file.path,text}:undefined
  }
  plugin.registerEvent(plugin.app.workspace.on('editor-menu',(menu,editor,view)=>{
    const text=editor.getSelection(),path=view.file?.path
    if(text.trim()&&path)menu.addItem(item=>item.setTitle(plugin.t('添加到 Catea')).setIcon('messages-square').onClick(()=>{clear();void plugin.addSelection(path,text)}))
  }))
  const show=(event?:MouseEvent)=>{
    clear()
    frameWindow=plugin.app.workspace.getActiveViewOfType(MarkdownView)?.containerEl.ownerDocument.defaultView??window
    frame=frameWindow.requestAnimationFrame(()=>{
      const selected=capture();if(!selected)return
      const doc=selected.view.containerEl.ownerDocument,win=doc.defaultView;if(!win)return
      if(event&&event.target instanceof win.Node&&!selected.view.containerEl.contains(event.target))return
      let anchor:{left:number;bottom:number}|undefined
      // CodeMirror 6 often exposes only a collapsed DOM selection, or none.
      const cm=(selected.view.editor as typeof selected.view.editor & {cm?:{state?:{selection?:{main?:{head?:number}}};coordsAtPos(pos:number):{left:number;bottom:number}|null}}).cm
      const head=cm?.state?.selection?.main?.head
      if(typeof head==='number')anchor=cm?.coordsAtPos(head)||undefined
      if(!anchor&&event)anchor={left:event.clientX,bottom:event.clientY}
      if(!anchor){
        const range=win.getSelection()?.rangeCount?win.getSelection()!.getRangeAt(0):undefined
        if(range&&selected.view.containerEl.contains(range.commonAncestorContainer))anchor=range.getBoundingClientRect()
      }
      if(!anchor)return
      // Styles are scoped to .catea-ui; the floating control needs its own host.
      surface=doc.body.createDiv({cls:'catea-ui catea-selection-surface'})
      const menu=surface.createDiv({cls:'catea-action-menu',attr:{role:'menu','aria-label':plugin.t('选区操作')}})
      menu.style.left=`${Math.max(8,Math.min(anchor.left,win.innerWidth-196))}px`
      menu.style.top=`${Math.max(8,Math.min(anchor.bottom+6,win.innerHeight-52))}px`
      const actions=[{label:plugin.t('添加到 Catea'),icon:'messages-square',run:()=>void plugin.addSelection(selected.path,selected.text)}]
      for(const action of actions){
        const button=menu.createEl('button',{cls:'catea-action-menu__item',attr:{type:'button',role:'menuitem'}})
        setIcon(button.createSpan(),action.icon);button.createSpan({text:action.label})
        button.addEventListener('mousedown',e=>e.preventDefault())
        button.addEventListener('click',()=>{clear();action.run()})
      }

    })
  }
  const documents=new Set<Document>()
  const bind=()=>{
    const docs=new Set([document,...plugin.app.workspace.getLeavesOfType('markdown').map(leaf=>leaf.view.containerEl.ownerDocument)])
    for(const doc of docs){
      if(documents.has(doc))continue;documents.add(doc)
      const isAction=(target:EventTarget|null)=>!!doc.defaultView&&target instanceof doc.defaultView.Element&&!!target.closest('.catea-selection-surface')
      plugin.registerDomEvent(doc,'mouseup',e=>{if(e.button===0&&!isAction(e.target))show(e)})
      plugin.registerDomEvent(doc,'keyup',e=>{if(e.key==='Escape')clear();else if(!isAction(e.target))show()})
      plugin.registerDomEvent(doc,'mousedown',e=>{if(!isAction(e.target))clear()})
      plugin.registerDomEvent(doc,'scroll',clear,true)
    }
  }
  bind();plugin.registerEvent(plugin.app.workspace.on('layout-change',()=>{clear();bind()}))
  plugin.register(clear)
}
