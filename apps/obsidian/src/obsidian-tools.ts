/**
 * [WHO]: Provides ObsidianTools, obsidianTools
 * [FROM]: Depends on ../../../packages/agent-core/src/i18n, obsidian, ./main, ../../../packages/agent-core/src/providers, ../../../packages/integrations/src/tools
 * [TO]: Consumed by apps/obsidian/src/main.tsx
 * [HERE]: apps/obsidian/src/obsidian-tools.ts - seven obsidian_* tools over the Obsidian API with hidden-path guards; search 50 hits, read 300 lines x 2000 chars, note cap 2 MB, write cap 100 KB
 */
import {textValue} from '../../../packages/agent-core/src/i18n'
import {TFile,MarkdownView,getAllTags} from 'obsidian'
import type Catea from './main'
import type {ToolDefinition} from '../../../packages/agent-core/src/providers'
import type {Approve} from '../../../packages/integrations/src/tools'
const str={type:'string'},integer={type:'integer',minimum:0}
const tool=(name:string,description:string,properties:Record<string,unknown>,required:string[]=[]):ToolDefinition=>({name,description,parameters:{type:'object',properties,required,additionalProperties:false}})
export const obsidianTools=[
 tool('obsidian_context','Get current Obsidian main note, editor selection and mode even when chat has focus.',{}),
 tool('obsidian_search','Search vault Markdown notes by title, path, content, tag or frontmatter property. Returns internal wikilinks.',{query:str,scope:{enum:['title','content','all'],type:'string'},tag:str,property:str,value:str,limit:integer}),
 tool('obsidian_open','Open an existing note INSIDE Obsidian, never in a system application.',{path:str,target:{type:'string',enum:['current','tab','split']}},['path']),
 tool('obsidian_read','Read an existing Markdown note with zero-based line offset; use for large notes and directory AGENTS.md.',{path:str,offset:integer,limit:integer},['path']),
 tool('obsidian_edit','Replace one unique exact occurrence in a note after showing a diff and receiving approval.',{path:str,oldText:str,newText:str},['path','oldText','newText']),
 tool('obsidian_manage','Create, rename/move, or trash a note via Obsidian APIs. Always requires user confirmation.',{action:{type:'string',enum:['create','rename','trash']},path:str,newPath:str,content:str},['action','path']),
 tool('obsidian_settings','Read/change only supported Catea boolean preferences, or open Catea settings. No secrets or arbitrary Obsidian settings.',{action:{type:'string',enum:['get','set','open']},key:str,value:{type:'boolean'}},['action'])
]
const appearance=['toolbar','tablerIcons','hideProperties','hideRibbon','hideStatus'] as const
const agentKeys=['web','memory'] as const
export class ObsidianTools {
 private lastPath=''
 constructor(private plugin:Catea,private approve:Approve){
  this.lastPath=plugin.app.workspace.getActiveFile()?.path||''
  plugin.registerEvent(plugin.app.workspace.on('file-open',file=>{if(file)this.lastPath=file.path}))
 }
 private get app(){return this.plugin.app}
 private path(value:unknown){const path=textValue(value).replace(/\\/g,'/');if(!path||path.startsWith('/')||path.split('/').some(p=>!p||p.startsWith('.'))||path.includes(':'))throw new Error('请使用知识库内的完整相对路径，不访问隐藏目录');return path}
 private file(value:unknown){const path=this.path(value),file=this.app.vault.getAbstractFileByPath(path);if(!(file instanceof TFile))throw new Error('笔记不存在，请先搜索并使用完整路径');return file}
 private writable(path:string){if(/^raw(?:\/|$)/.test(path))throw new Error('raw 原始资料不可修改');if(!/\.md$/i.test(path))throw new Error('此工具只修改 Markdown 笔记')}
 private view(file:TFile){return this.app.workspace.getLeavesOfType('markdown').map(l=>l.view).find((v):v is MarkdownView=>v instanceof MarkdownView&&v.file===file)}
 private async content(file:TFile){if(file.extension!=='md')throw new Error('不是 Markdown 笔记，不能读取为正文');if(file.stat.size>2000000)throw new Error('笔记超过 2 MB');return this.view(file)?.editor?.getValue()??await this.app.vault.read(file)}
 current(){const recent=this.app.workspace.getMostRecentLeaf()?.view;const file=recent instanceof MarkdownView&&recent.file?recent.file:this.app.vault.getAbstractFileByPath(this.lastPath);return file instanceof TFile?file:null}
 async context(){const file=this.current();if(!file)return {path:null};const view=this.view(file);return {path:file.path,title:file.basename,type:file.extension,mode:view?.getMode()||null,selection:view?.editor?.getSelection()?.slice(0,16000)||'',cursor:view?.editor?.getCursor()||null,...(file.extension==='md'?{excerpt:(await this.content(file)).slice(0,12000)}:{notice:'非 Markdown 文件，仅返回元信息'})}}
 private async approved(title:string,detail:unknown,signal:AbortSignal){if(!await this.approve(title,JSON.stringify(detail,null,2),signal))throw new Error('用户取消操作');signal.throwIfAborted()}
 async run(name:string,a:Record<string,unknown>,signal:AbortSignal):Promise<string>{
  signal.throwIfAborted()
  if(name==='obsidian_context')return JSON.stringify(await this.context())
  if(name==='obsidian_search'){
   const q=textValue(a.query||'').trim().toLowerCase(),limit=Math.min(50,Math.max(1,Number(a.limit)||10)),hits:Array<Record<string,unknown>>=[]
   const files=this.app.vault.getMarkdownFiles().filter(f=>!f.path.split('/').some(p=>p.startsWith('.'))).sort((a,b)=>Number(b.basename.toLowerCase().includes(q))-Number(a.basename.toLowerCase().includes(q))||a.path.localeCompare(b.path))
   for(const f of files){
    signal.throwIfAborted();const cache=this.app.metadataCache.getFileCache(f),tags=cache?getAllTags(cache)||[]:[]
    if(a.tag&&!tags.some(t=>t.replace(/^#/,'').toLowerCase()===textValue(a.tag).replace(/^#/,'').toLowerCase()))continue
    if(a.property){const value:unknown=cache?.frontmatter?.[textValue(a.property)];if(value===undefined)continue;if(a.value!==undefined&&!JSON.stringify(value).toLowerCase().includes(textValue(a.value).toLowerCase()))continue}
    let matched=!q||f.path.toLowerCase().includes(q),excerpt=''
    if(a.scope==='content'||(!matched&&a.scope!=='title')){if(f.stat.size>2000000)continue;const body=await this.content(f),i=body.toLowerCase().indexOf(q);matched=i>=0;if(matched)excerpt=body.slice(Math.max(0,i-60),i+220)}
    if(matched)hits.push({path:f.path,title:f.basename,tags,link:`[[${f.path}|${f.basename}]]`,excerpt})
    if(hits.length>=limit)break
   }
   return JSON.stringify({results:hits,limit,limitReached:hits.length===limit})
  }
  if(name==='obsidian_settings'){
   const shell=this.plugin,values=Object.fromEntries<boolean|undefined>([...appearance.map(k=>[k,shell.settings[k]] as const),...agentKeys.map(k=>[k,this.plugin.agentSettings[k]] as const)])
   if(a.action==='get')return JSON.stringify({scope:'Catea',values,supportedKeys:Object.keys(values)})
   if(a.action==='open'){this.plugin.openAgentSettings();return JSON.stringify({opened:'Catea settings'})}
   if(a.action!=='set'||!Object.hasOwn(values,textValue(a.key))||typeof a.value!=='boolean')throw new Error('仅支持列出的 Catea 布尔设置')
   const key=textValue(a.key);await this.approved(`更改 Catea 设置：${key}`,{key,before:values[key],after:a.value},signal)
   if(appearance.some(item=>item===key)){shell.settings[key]=a.value;await this.plugin.saveData(shell.settings);shell.apply()}
   else{this.plugin.agentSettings[key as typeof agentKeys[number]]=a.value;this.plugin.agent.memory.setEnabled(this.plugin.agentSettings.enabled&&this.plugin.agentSettings.memory);await this.plugin.saveAgentSettings()}
   return JSON.stringify({key,value:a.value})
  }
  if(name==='obsidian_manage'&&a.action==='create'){
   const path=this.path(a.path);this.writable(path);const content=textValue(a.content||'');if(content.length>100000)throw new Error('单次写入最多 100 KB');if(this.app.vault.getAbstractFileByPath(path))throw new Error('路径已存在')
   const parent=path.includes('/')?path.slice(0,path.lastIndexOf('/')):'';if(parent&&!this.app.vault.getAbstractFileByPath(parent))throw new Error('请使用已有文件夹')
   await this.approved('新建笔记',{path,before:null,after:content},signal);await this.app.vault.create(path,content);return JSON.stringify({created:path})
  }
  const file=this.file(a.path),path=file.path
  if(name==='obsidian_open'){
   const target=textValue(a.target||'current');if(!['current','tab','split'].includes(target))throw new Error('无效打开方式')
   const recent=this.app.workspace.getMostRecentLeaf();const leaf=target==='current'&&recent&&recent.view instanceof MarkdownView?recent:this.app.workspace.getLeaf(target==='split'?'split':'tab')
   await leaf.openFile(file);await this.app.workspace.revealLeaf(leaf);this.lastPath=path;return JSON.stringify({opened:path,target,inside:'Obsidian'})
  }
  if(name==='obsidian_read'){const lines=(await this.content(file)).split('\n'),offset=Math.max(0,Math.floor(Number(a.offset)||0)),limit=Math.min(300,Math.max(1,Math.floor(Number(a.limit)||120)));const selected=lines.slice(offset,offset+limit);return JSON.stringify({path,lines:selected.map(line=>line.slice(0,2000)),truncatedLongLines:selected.some(line=>line.length>2000),nextOffset:offset+limit<lines.length?offset+limit:null})}
  this.writable(path)
  const before=await this.content(file)
  if(name==='obsidian_edit'){
   const oldText=textValue(a.oldText??''),newText=textValue(a.newText??'');if(!oldText||before.split(oldText).length!==2)throw new Error('原文必须唯一匹配，请重新读取')
   const after=before.replace(oldText,()=>newText);if(after.length>100000)throw new Error('单次修改最多 100 KB');if(path==='wiki/log.md'&&!after.startsWith(before))throw new Error('日志只允许追加')
   await this.approved('修改笔记',{path,before,after},signal)
   if(file.path!==path||await this.content(file)!==before)throw new Error('笔记已变化，请重新读取并确认')
   await this.app.vault.process(file,current=>{if(current!==before)throw new Error('文件尚未同步或已变化，请稍后重试');return after});return JSON.stringify({updated:path})
  }
  if(name==='obsidian_manage'){
   if(path==='wiki/log.md')throw new Error('不可移动或删除操作日志')
   if(a.action==='rename'){
    const newPath=this.path(a.newPath);this.writable(newPath);if(newPath==='wiki/log.md'||this.app.vault.getAbstractFileByPath(newPath))throw new Error('目标路径不可用')
    await this.approved('移动或重命名笔记',{path,newPath,notice:'按 Obsidian 的链接更新设置维护内部链接'},signal)
    if(file.path!==path||await this.content(file)!==before)throw new Error('笔记已变化，请重试')
    await this.app.fileManager.renameFile(file,newPath);return JSON.stringify({renamed:path,newPath})
   }
   if(a.action==='trash'){
    await this.approved('将笔记移入回收站',{path},signal)
    if(file.path!==path||await this.content(file)!==before)throw new Error('笔记已变化，请重试')
    await this.app.fileManager.trashFile(file);return JSON.stringify({trashed:path})
   }
  }
  throw new Error('未知 Obsidian 操作')
 }
}
