import {MarkdownRenderChild} from 'obsidian'
import type Catea from './main'

/** Obsidian uses code-block processors in both Reading view and Live Preview.
 * Its native edit-code control keeps the source editable in CodeMirror.
 */
export function registerNotePreviews(plugin:Catea){
  for(const language of ['html','svg'])plugin.registerMarkdownCodeBlockProcessor(language,(source,el,ctx)=>{
    const child=new MarkdownRenderChild(el);ctx.addChild(child)
    const tr=(zh:string,en:string)=>plugin.agentSettings.language==='en'?en:zh
    const card=el.createDiv({cls:'catea-note-preview'})
    const header=card.createDiv({cls:'catea-note-preview__header'})
    header.createSpan({text:language.toUpperCase(),cls:'catea-note-preview__label'})
    const tabs=header.createDiv({cls:'catea-note-preview__tabs'})
    const previewButton=tabs.createEl('button',{text:tr('预览','Preview'),attr:{type:'button','aria-pressed':'true'}})
    const sourceButton=tabs.createEl('button',{text:tr('源码','Source'),attr:{type:'button','aria-pressed':'false'}})
    const copy=tabs.createEl('button',{text:tr('复制','Copy'),attr:{type:'button'}})
    const viewport=card.createDiv({cls:'catea-note-preview__viewport'})
    const frame=viewport.createEl('iframe',{attr:{title:tr(`${language.toUpperCase()} 正文预览`,`${language.toUpperCase()} note preview`),sandbox:'',referrerpolicy:'no-referrer'}})
    // No scripts, forms, parent navigation or network requests. The preview
    // shares neither the editor DOM nor Obsidian's privileged Electron context.
    const document=new DOMParser().parseFromString(source,'text/html')
    const policy=document.createElement('meta');policy.httpEquiv='Content-Security-Policy'
    policy.content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'"
    document.head.prepend(policy)
    const baseStyle=document.createElement('style');baseStyle.textContent=':root{color-scheme:light}body{margin:16px;font:14px/1.5 system-ui;color:#253c31;background:white}img,svg{max-width:100%;height:auto}*{box-sizing:border-box}'
    document.head.insertBefore(baseStyle,policy.nextSibling)
    frame.srcdoc='<!doctype html>'+document.documentElement.outerHTML
    const pre=card.createEl('pre',{cls:'catea-note-preview__source'});pre.createEl('code',{text:source});pre.hidden=true
    const choose=(preview:boolean)=>{viewport.hidden=!preview;pre.hidden=preview;previewButton.setAttribute('aria-pressed',String(preview));sourceButton.setAttribute('aria-pressed',String(!preview))}
    child.registerDomEvent(previewButton,'click',()=>choose(true))
    child.registerDomEvent(sourceButton,'click',()=>choose(false))
    child.registerDomEvent(copy,'click',()=>{void navigator.clipboard.writeText(source).then(()=>{copy.textContent=tr('已复制','Copied')}).catch(()=>{copy.textContent=tr('复制失败','Copy failed')})})
    child.register(()=>{frame.srcdoc='';card.remove()})
  })
}
