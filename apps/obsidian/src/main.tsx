/**
 * [WHO]: Provides Catea, default
 * [FROM]: Depends on ./note-thumbnails, ./note-previews, ./locale, ./selection, ../../../packages/agent-core/src/types, obsidian, react-dom/client, ./paper.cjs, ../../../packages/agent-core/src, ../../../packages/integrations/src/storage, ./panel, ./obsidian-tools, ./skills/obsidian.md, catea-components, ./settings, ./composition, node:fs/promises
 * [TO]: Consumed by apps/obsidian/src/note-previews.ts, apps/obsidian/src/note-thumbnails.ts,
 *   apps/obsidian/src/obsidian-tools.ts, apps/obsidian/src/panel.tsx,
 *   apps/obsidian/src/selection.ts, apps/obsidian/src/settings.ts
 * [HERE]: apps/obsidian/src/main.tsx - plugin entry: class Catea extends Paper, wiring config, secure secrets, ObsidianTools, Agent, settings tab and the sidebar view; 60 s memory interval
 */
import {installNoteThumbnails} from './note-thumbnails'
import {registerNotePreviews} from './note-previews'
import {translate} from './locale'
import {installSelectionAction} from './selection'
import type {AskUserQuestion,AskUserQuestionAnswer} from '../../../packages/agent-core/src/types'
import {Plugin,ItemView,Modal,Setting,FileSystemAdapter,Notice,WorkspaceLeaf} from 'obsidian'
import {createRoot,type Root} from 'react-dom/client'
import Paper from './paper.cjs'
import type {Agent,Settings} from '../../../packages/agent-core/src'
import {readJson,writeJson,within,Serial} from '../../../packages/integrations/src/storage'
import {Panel} from './panel'
import {ObsidianTools,obsidianTools} from './obsidian-tools'
import obsidianSkill from './skills/obsidian.md'
import {ChangePreview} from 'catea-components'
import {CateaSettings} from './settings'
import {createAgent} from './composition'
import {mkdir} from 'node:fs/promises'
const VIEW='catea-agent'
interface PaperSurface {
  settings: Record<string, boolean>
  apply(): void
  bars?: Map<string, HTMLElement>
  explorerMenus?: Map<string, {button: HTMLElement}>
  sync?(): void
}
const Base=Paper as unknown as {new(...args: ConstructorParameters<typeof Plugin>): Plugin & PaperSurface}
export default class Catea extends Base {
  declare settings:Record<string,boolean>
  agentSettings:Settings & {includeCurrentNote:boolean}={language:"zh",enabled:true,web:true,models:[],modelId:'',personaId:'aria',skills:[],mcp:[],memory:true,shell:true,includeCurrentNote:true,permissionMode:"assist"}
  refreshThumbnails:()=>void=()=>{}
  obsidian!:ObsidianTools;agent!:Agent;vaultPath='';private configWrites=new Serial();private listeners=new Set<()=>void>();private dialogs=new Set<Modal>()
  async onload(){
    await super.onload()
    if(!(this.app.vault.adapter instanceof FileSystemAdapter)){new Notice(this.t("Catea Agent 需要桌面文件系统"));return}
    this.vaultPath=this.app.vault.adapter.getBasePath()
    const directory=await within(this.vaultPath,'.catea');await mkdir(directory,{recursive:true})
    for(const part of ['skills','memory','sessions'])await mkdir(await within(this.vaultPath,`.catea/${part}`),{recursive:true})
    this.agentSettings={...this.agentSettings,...await readJson(await within(this.vaultPath,'.catea/config.json'),{})}
    if(!this.agentSettings.permissionDefaultsVersion){
      this.agentSettings.shell=true
      this.agentSettings.permissionMode='assist'
      this.agentSettings.permissionDefaultsVersion=1
      await this.saveAgentSettings()
    }
    const secrets=this.secretStore()
    for(const model of this.agentSettings.models)model.apiKey=secrets?.getSecret(this.key(model.id))||''
    for(const server of this.agentSettings.mcp)server.token=secrets?.getSecret(this.key(`mcp-${server.id}`))||''
    this.refreshPaperLanguage()
    await this.addMiniMaxModels()
    this.installRibbonHover()
    installSelectionAction(this)
    registerNotePreviews(this)
    this.refreshThumbnails=installNoteThumbnails(this)
    this.obsidian=new ObsidianTools(this,(title,detail,signal)=>this.confirm(title,detail,signal))
    this.agent=createAgent(this.vaultPath,()=>this.agentSettings,{host:{tools:obsidianTools,skill:obsidianSkill,run:(name,args,signal)=>this.obsidian.run(name,args,signal)},change:()=>this.emit(),notice:text=>new Notice(text),approve:(title,detail,signal)=>this.confirm(title,detail,signal),ask:(q,signal)=>this.ask(q,signal)})
    this.agent.memory.setEnabled(this.agentSettings.enabled&&this.agentSettings.memory)
    this.registerView(VIEW,leaf=>new AgentView(leaf,this));this.addSettingTab(new CateaSettings(this.app,this))
    this.addRibbonIcon('messages-square','Catea agent',()=>void this.openAgent())
    this.addCommand({id:'open-agent',name:this.t("打开 Agent"),callback:()=>void this.openAgent()})
    this.addCommand({id:'memory-insights',name:this.t("查看记忆概览"),callback:()=>void this.agent.memory.run('memory_insights',{},this.agentSettings.personaId,this.agentSettings.modelId).then(data=>this.showDetail(this.t("记忆概览"),data)).catch((e:unknown)=>new Notice(e instanceof Error?e.message:String(e)))})
    this.registerInterval(window.setInterval(()=>{if(this.agentSettings.enabled&&this.agentSettings.memory)void this.agent.memory.process()},60000))
  }
  private installRibbonHover(){
    const documents=new Set<Document>()
    const clear=(doc:Document)=>doc.querySelectorAll('.catea-dock-near,.catea-dock-far').forEach(el=>el.removeClass('catea-dock-near','catea-dock-far'))
    const bind=()=>{
      const docs=new Set([document,...this.app.workspace.getLeavesOfType('markdown').map(leaf=>leaf.view.containerEl.ownerDocument)])
      for(const doc of docs){
        if(documents.has(doc))continue
        documents.add(doc)
        this.registerDomEvent(doc,'mouseover',event=>{
          if(!doc.defaultView||!(event.target instanceof doc.defaultView.Element))return
          const action=event.target.closest('.side-dock-actions .side-dock-ribbon-action')
          clear(doc)
          if(!action)return
          const near=action.previousElementSibling
          if(near?.matches('.side-dock-ribbon-action')){
            near.addClass('catea-dock-near')
            const far=near.previousElementSibling
            if(far?.matches('.side-dock-ribbon-action'))far.addClass('catea-dock-far')
          }
        })
        this.registerDomEvent(doc,'mouseout',event=>{if(!event.relatedTarget)clear(doc)})
      }
    }
    bind();this.registerEvent(this.app.workspace.on('layout-change',bind))
    this.register(()=>documents.forEach(clear))
  }
  t=(text:string)=>translate(this.agentSettings.language||'zh',text)
  refreshPaperLanguage(){
    for(const bar of this.bars?.values()||[])bar.remove()
    this.bars?.clear();this.sync?.()
    for(const state of this.explorerMenus?.values()||[])state.button.setAttribute('aria-label',this.t('更多文件操作'))
  }
  selections:Array<{id:string;path:string;text:string}>=[]
  async addSelection(path:string,text:string){
    if(!text.trim())return
    if(!this.selections.some(s=>s.path===path&&s.text===text))this.selections.push({id:crypto.randomUUID(),path,text})
    await this.openAgent();this.emit()
    window.setTimeout(()=>document.querySelector<HTMLTextAreaElement>('.catea-panel textarea')?.focus(),50)
  }
  async addMiniMaxModels(){
    if(this.agentSettings.miniMaxPresetsAdded)return
    const source=this.agentSettings.models.find(m=>m.apiKey&&/^https:\/\/api\.minimax(?:i)?\.(?:cn|com|io)\//.test(m.baseUrl))
    if(!source)return
    for(const [model,contextWindow] of [['MiniMax-M2.7',204800],['MiniMax-M3',1000000]] as const){
      if(this.agentSettings.models.some(m=>m.model===model&&m.baseUrl===source.baseUrl))continue
      const id=crypto.randomUUID();this.saveSecret(id,source.apiKey)
      this.agentSettings.models.push({...source,id,name:model.replace('MiniMax-','MiniMax '),model,contextWindow})
    }
    this.agentSettings.miniMaxPresetsAdded=true
    await this.saveAgentSettings()
  }
  key(id:string){return `catea-${id.toLowerCase().replace(/[^a-z0-9-]/g,'-')}`.slice(0,64)}
  async saveAgentSettings(){
    const clone=structuredClone(this.agentSettings)
    for(const m of clone.models)m.apiKey=''
    for(const m of clone.mcp){m.token='';delete m.env}
    await this.configWrites.run(async()=>writeJson(await within(this.vaultPath,'.catea/config.json'),clone));this.emit()
  }
  private secretStore(){
    // Optional host capability: Obsidian 1.8 lacks secure storage, so keys stay
    // in memory on those versions. Do not raise the minimum version for it.
    return (this.app as unknown as {secretStorage?:{getSecret(key:string):string|null;setSecret(key:string,value:string):void}}).secretStorage
  }
  saveSecret(id:string,value:string){
    const secrets=this.secretStore()
    if(!secrets){new Notice(this.t("当前版本无安全密钥存储；密钥仅保留到本次退出"));return}
    try{secrets.setSecret(this.key(id),value)}catch{new Notice(this.t("密钥无法持久保存，仅在当前运行期间使用"))}
  }
  subscribe(fn:()=>void){this.listeners.add(fn);return()=>{this.listeners.delete(fn)}}
  emit(){for(const fn of this.listeners)fn()}
  async openAgent(){let leaf=this.app.workspace.getLeavesOfType(VIEW)[0];if(!leaf){leaf=this.app.workspace.getRightLeaf(false)!;await leaf.setViewState({type:VIEW,active:true})}await this.app.workspace.revealLeaf(leaf)}
  openAgentSettings(){const settings=(this.app as typeof this.app & {setting?: {open():void;openTabById(id:string):void}}).setting;settings?.open();settings?.openTabById(this.manifest.id)}
  async noteContext(enabled:boolean){
    if(!enabled)return ''
    return JSON.stringify(await this.obsidian.context())
  }
  showDetail(title:string,detail:string){const modal=new Modal(this.app);modal.titleEl.setText(title);modal.contentEl.createEl('pre',{text:detail,attr:{style:'white-space:pre-wrap;max-height:65vh;overflow:auto'}});modal.open()}
  private confirm(title:string,detail:string,signal:AbortSignal):Promise<boolean>{
    signal.throwIfAborted()
    if(this.agentSettings.permissionMode==='full')return Promise.resolve(true)
    return new Promise(resolve=>{
      const modal=new Modal(this.app);let settled=false;let preview:Root|undefined
      const done=(value:boolean)=>{if(settled)return;settled=true;preview?.unmount();signal.removeEventListener('abort',abort);this.dialogs.delete(modal);resolve(value);modal.close()}
      const abort=()=>done(false);modal.onClose=()=>done(false);signal.addEventListener('abort',abort,{once:true})
      modal.titleEl.setText(title)
      let change:Record<string,unknown>|undefined;try{const parsed:unknown=JSON.parse(detail);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))change=parsed as Record<string,unknown>}catch{/* Non-JSON details use the plain-text preview. */}
      if(change&&typeof change.after==='string'&&typeof change.path==='string'){
        preview=createRoot(modal.contentEl.createDiv());preview.render(<ChangePreview language={this.agentSettings.language} path={change.path} before={typeof change.before==='string'?change.before:null} after={change.after}/>)
      }else modal.contentEl.createEl('pre',{text:detail,attr:{style:'white-space:pre-wrap;max-height:55vh;overflow:auto'}})
      new Setting(modal.contentEl).addButton(b=>b.setButtonText(this.t("拒绝")).onClick(()=>done(false))).addButton(b=>b.setButtonText(this.t("确认这一次")).setCta().onClick(()=>done(true)))
      this.dialogs.add(modal);if(signal.aborted)done(false);else modal.open()
    })
  }
  question?:{id:string;questions:AskUserQuestion[];answer:(answers:AskUserQuestionAnswer)=>void;dismiss:()=>void}
  private ask(questions:AskUserQuestion[],signal:AbortSignal):Promise<AskUserQuestionAnswer>{
    return new Promise((resolve,reject)=>{
      let settled=false
      const done=(answers?:AskUserQuestionAnswer)=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);this.question=undefined;this.emit();if(answers)resolve(answers);else reject(new Error(this.t("用户取消回答；不要假定答案或重复询问")))}
      const abort=()=>done()
      this.question={id:crypto.randomUUID(),questions,answer:answers=>{for(const q of questions)if(typeof answers[q.question]!=='string'||!answers[q.question].trim())throw new Error(this.t("请回答所有问题"));done(answers)},dismiss:abort}
      signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();else this.emit()
    })
  }

  onunload(){for(const dialog of this.dialogs)dialog.close();void this.agent?.close();super.onunload()}
}
class AgentView extends ItemView {
  private root?:Root
  constructor(leaf:WorkspaceLeaf,private plugin:Catea){super(leaf)}
  getViewType(){return VIEW}getDisplayText(){return 'Catea'}getIcon(){return 'messages-square'}
  async onOpen(){this.root=createRoot(this.contentEl);this.root.render(<Panel plugin={this.plugin} agent={this.plugin.agent}/>)}
  async onClose(){this.root?.unmount()}
}
