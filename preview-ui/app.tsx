import {createRoot} from 'react-dom/client'
import {Panel} from '../apps/obsidian/src/panel'
import {SessionDraftStore} from '../apps/obsidian/src/session-drafts'
import {translate} from '../apps/obsidian/src/locale'
import type {Session,Message} from '../packages/agent-core/src/contracts'

const now=Date.now()
const user=(text:string):Message=>({id:crypto.randomUUID(),role:'user',text,tools:[],status:'complete'})
const assistant=(text:string,status:Message['status']='complete'):Message=>({id:crypto.randomUUID(),role:'assistant',text,tools:[],status,startedAt:now-20000,completedAt:status==='complete'?now:undefined})
const makeSession=(title='新对话',messages:Message[]=[]):Session=>({id:crypto.randomUUID(),title,personaId:'aria',messages,transcript:[],updated:Date.now()})
const saved=[
  makeSession('整理产品路线图',[user('帮我整理一下 Catea 接下来的开发重点。'),assistant('我会先对照现有功能和笔记，整理可执行的开发重点。会话标签在上方，切换后当前回复仍可在后台继续。','streaming')]),
  makeSession('周报里的关键决策',[user('总结这周笔记里最重要的三个决定。'),assistant('目前有三个主题：**发布准备**、插件交互和知识库整理。每个会话的消息与草稿都独立保存。')]),
  makeSession('新对话'),
]

class PreviewAgent {
  session:Session
  running=false
  historyBusy=false
  compaction=undefined
  private timer?:number
  constructor(session:Session,private plugin:PreviewPlugin){this.session=session}
  list(){return Promise.resolve(this.plugin.saved.map(session=>({id:session.id,title:session.title})))}
  async open(id:string){const session=this.plugin.saved.find(item=>item.id===id);if(session)this.session=session;this.plugin.emit()}
  async send(text:string,_context:string,_files:unknown[]=[]){
    if(this.running)return
    const reply=assistant('正在整理回复…','streaming')
    this.session.messages.push(user(text),reply)
    if(this.session.messages.length===2)this.session.title=text.slice(0,40)
    this.running=true;this.plugin.remember(this.session);this.plugin.emit()
    this.timer=window.setTimeout(()=>{reply.text='这是直接使用插件 Panel 组件的预览。侧栏布局、组件和样式与当前插件构建一致；这里的回复数据由预览环境模拟。';reply.status='complete';reply.completedAt=Date.now();this.running=false;this.plugin.emit()},2200)
  }
  steer(text:string){this.session.messages.push(user(text));this.plugin.emit()}
  stop(){if(this.timer)window.clearTimeout(this.timer);this.running=false;const reply=this.session.messages.at(-1);if(reply?.role==='assistant'&&reply.status==='streaming')reply.status='stopped';this.plugin.emit()}
}

class PreviewPlugin {
  app={workspace:{openLinkText:async(_path:string,_source:string)=>{}},vault:{getAllLoadedFiles:()=>[]}}
  drafts=new SessionDraftStore()
  agentSettings={language:'zh' as const,enabled:true,web:true,memory:false,shell:false,models:[{id:'preview',name:'MiniMax M2.7',protocol:'openai' as const,baseUrl:'https://example.invalid/v1',model:'preview',apiKey:'preview'}],modelId:'preview',personaId:'aria',skills:[],mcp:[],includeCurrentNote:false}
  tabs:PreviewAgent[]=[]
  agent!:PreviewAgent
  saved=[...saved]
  private listeners=new Set<()=>void>()
  constructor(){this.tabs=this.saved.map(session=>new PreviewAgent(session,this));this.agent=this.tabs[0];this.tabs[0].running=true}
  t=(text:string)=>translate(this.agentSettings.language,text)
  subscribe(fn:()=>void){this.listeners.add(fn);return()=>this.listeners.delete(fn)}
  emit(){for(const listener of this.listeners)listener()}
  remember(session:Session){if(!this.saved.includes(session))this.saved.unshift(session)}
  get selections(){return this.drafts.get(this.agent.session.id).quotes}
  set selections(value:ReturnType<SessionDraftStore['get']>['quotes']){this.drafts.update(this.agent.session.id,draft=>({...draft,quotes:value}))}
  get question(){return undefined}
  hasQuestion(_id:string){return false}
  newTab(){const agent=new PreviewAgent(makeSession(),this);this.tabs.push(agent);this.agent=agent;this.emit()}
  async openTab(id:string){let agent=this.tabs.find(tab=>tab.session.id===id);if(!agent){const session=this.saved.find(item=>item.id===id);if(!session)return;agent=new PreviewAgent(session,this);this.tabs.push(agent)}this.agent=agent;this.emit()}
  async closeTab(id:string){const index=this.tabs.findIndex(tab=>tab.session.id===id);if(index<0)return;const [closed]=this.tabs.splice(index,1);closed.stop();if(!this.tabs.length)this.tabs.push(new PreviewAgent(makeSession(),this));if(this.agent===closed)this.agent=this.tabs[Math.min(index,this.tabs.length-1)];this.emit()}
  async deleteSession(id:string){this.saved=this.saved.filter(session=>session.id!==id);this.drafts.delete(id);await this.closeTab(id)}
  async saveAgentSettings(){this.emit()}
  noteContext(){return Promise.resolve('')}
  openAgentSettings(){alert('预览模式：此处会打开 Obsidian 的插件设置。')}
  showDetail(title:string,detail:string){alert(`${title}\n\n${detail}`)}
}

const plugin=new PreviewPlugin()
createRoot(document.getElementById('root')!).render(<Panel plugin={plugin as unknown as Parameters<typeof Panel>[0]['plugin']}/> )
