/**
 * [WHO]: Provides CateaSettings
 * [FROM]: Depends on obsidian, ./main, ../../../packages/agent-core/src/types, ../../../packages/agent-core/src/byok, ../../../packages/integrations/src/skills, ../../../packages/personas/src
 * [TO]: Consumed by apps/obsidian/src/main.tsx
 * [HERE]: apps/obsidian/src/settings.ts - plugin settings tab for language, paper toggles, Agent persona and capabilities, BYOK models and MCP servers; ModelModal validates through normalizeModel
 */
import {App,PluginSettingTab,Setting,Notice,Modal,type SettingDefinitionItem} from 'obsidian'
import type Catea from './main'
import type {ModelConfig} from '../../../packages/agent-core/src/types'
import {defaultBaseUrl,normalizeModel,selectedModel} from '../../../packages/agent-core/src/byok'
import {listSkills} from '../../../packages/integrations/src/skills'
import {persona,personas} from '../../../packages/personas/src'
interface SettingsRow {
  name: string
  desc?: string
  render: (setting: Setting) => void
}
interface SettingsSection { heading?: string; rows: SettingsRow[] }

export class CateaSettings extends PluginSettingTab {
  constructor(app:App,private owner:Catea){super(app,owner)}

  // Use the same definitions for 1.13+ search and the 1.8+ imperative fallback.
  getSettingDefinitions(): SettingDefinitionItem[] {
    return this.sections().map(section=>({type:'group',heading:section.heading,items:section.rows}))
  }
  display(){this.renderLegacy()}
  private refresh(){
    const update=(this as unknown as {update?:()=>void}).update
    if(update)update.call(this)
    else this.renderLegacy()
  }
  private renderLegacy(){
    this.containerEl.empty()
    for(const section of this.sections()){
      if(section.heading)new Setting(this.containerEl).setName(section.heading).setHeading()
      for(const row of section.rows){
        const setting=new Setting(this.containerEl).setName(row.name)
        if(row.desc)setting.setDesc(row.desc)
        row.render(setting)
      }
    }
  }
  private sections(): SettingsSection[] {
    const p=this.owner,tr=p.t,c=p.agentSettings
    const appearance:SettingsRow[]=[{name:tr('语言 / Language'),render:s=>{s.addDropdown(d=>d.addOption('zh',tr('简体中文')).addOption('en','English').setValue(c.language||'zh').onChange(async value=>{c.language=value==='en'?'en':'zh';await p.saveAgentSettings();p.refreshPaperLanguage();this.refresh()}))}}]
    for(const [key,label] of [['enabled','启用纸张界面'],['toolbar','格式工具栏'],['tablerIcons','Tabler 图标'],['hideProperties','隐藏正文属性'],['hideRibbon','隐藏导航栏'],['hideStatus','隐藏状态栏']] as const){
      appearance.push({name:tr(label),render:s=>{s.addToggle(t=>t.setValue(p.settings[key]).onChange(async value=>{p.settings[key]=value;await p.saveData(p.settings);p.apply()}))}})
    }
    appearance.push({name:tr('笔记缩略图'),desc:tr('文件树显示真实标题、正文和首张本地图片的缩略预览。'),render:s=>{s.addToggle(t=>t.setValue(c.noteThumbnails!==false).onChange(async value=>{c.noteThumbnails=value;await p.saveAgentSettings();p.refreshThumbnails()}))}})
    const agent:SettingsRow[]=[
      {name:tr('启用 Agent'),render:s=>{s.addToggle(t=>t.setValue(c.enabled).onChange(async value=>{c.enabled=value;if(!value)p.agent.stop();p.agent.memory.setEnabled(value&&c.memory);await p.saveAgentSettings()}))}},
      {name:tr('人格'),desc:tr('选择 Agent 的对话风格；从下一条消息开始使用。'),render:s=>{s.addDropdown(d=>{for(const item of personas)d.addOption(item.id,item.name);d.setValue(persona(c.personaId).id).onChange(async value=>{c.personaId=persona(value).id;await p.saveAgentSettings()})})}},
      {name:tr('附带当前笔记'),desc:tr('发送消息时将当前笔记内容加入上下文。默认开启。'),render:s=>{s.addToggle(t=>t.setValue(c.includeCurrentNote!==false).onChange(async value=>{c.includeCurrentNote=value;await p.saveAgentSettings()}))}},
      {name:tr('网络搜索与网页读取'),desc:tr('复用 CatUI 联网工具：Exa / agent-reach（支持时）/ Jina / DuckDuckGo；无需模型 Key 之外的搜索 Key。搜索词和目标 URL 会发送到联网服务。'),render:s=>{s.addToggle(t=>t.setValue(c.web).onChange(async value=>{c.web=value;p.agent.stop();await p.saveAgentSettings()}))}},
      {name:tr('长期记忆'),desc:tr('自动提取、召回和巩固；保存在当前知识库 .catea/memory。'),render:s=>{s.addToggle(t=>t.setValue(c.memory).onChange(async value=>{c.memory=value;if(!value)p.agent.stop();p.agent.memory.setEnabled(value&&c.enabled);await p.saveAgentSettings()}))}},
      {name:'Bash',desc:tr('默认开启，命令执行遵循下方权限模式。'),render:s=>{s.addToggle(t=>t.setValue(c.shell).onChange(async value=>{c.shell=value;p.agent.stop();await p.saveAgentSettings()}))}},
      {name:tr('权限模式'),desc:tr('帮我批准：自动放行 pwd、ls 等简单目录查看，其余操作请求确认。完全访问：跳过 Bash、文件修改、MCP 和记忆更新的审批，命令可访问知识库之外。'),render:s=>{s.addDropdown(d=>d.addOption('assist',tr('帮我批准')).addOption('full',tr('完全访问')).setValue(c.permissionMode||'assist').onChange(async value=>{p.agent.stop();c.permissionMode=value==='full'?'full':'assist';await p.saveAgentSettings()}))}},
    ]
    const models:SettingsRow[]=c.models.map(model=>({name:model.name,desc:`${model.protocol==='openai'?tr('OpenAI 兼容'):tr('Anthropic 兼容')} · ${model.model} · ${model.baseUrl}${model.apiKey?'':tr(' · 请补充 API Key')}`,render:s=>{
      s.addButton(b=>b.setButtonText(tr('编辑')).onClick(()=>new ModelModal(p,model,()=>this.refresh()).open()))
      s.addButton(b=>b.setButtonText(tr('移除')).onClick(async()=>{
        const previous=c.models,previousId=c.modelId
        c.models=c.models.filter(m=>m.id!==model.id);c.modelId=selectedModel(c.models,c.modelId)?.id||''
        try{await p.saveAgentSettings();p.saveSecret(model.id,'');this.refresh()}
        catch{c.models=previous;c.modelId=previousId;new Notice(tr('模型移除失败，请重试'))}
      }))
    }}))
    models.push({name:tr('添加模型'),desc:tr('使用自己的 API Key，直接连接 OpenAI / Anthropic 兼容服务。仅显示你配置的模型。'),render:s=>{s.addButton(b=>b.setButtonText(tr('添加模型')).onClick(()=>new ModelModal(p,{id:crypto.randomUUID(),name:'',protocol:'openai',baseUrl:defaultBaseUrl('openai'),apiKey:'',model:''},()=>this.refresh()).open()))}})
    const skills:SettingsRow[]=[
      {name:tr('Obsidian 操作 · 内置'),desc:tr('随 Agent 启用：当前笔记、搜索、内部打开、阅读与编辑；写入和设置变更需确认。'),render:()=>{}},
      {name:'Skills',desc:tr('将 Skill 文件夹放到 .catea/skills/<名称>/SKILL.md，再启用。'),render:s=>{
        const box=s.settingEl.createDiv()
        void listSkills(p.vaultPath).then(ids=>{
          if(!box.isConnected)return
          for(const id of ids)new Setting(box).setName(id).addToggle(t=>t.setValue(c.skills.includes(id)).onChange(async value=>{c.skills=value?[...new Set([...c.skills,id])]:c.skills.filter(item=>item!==id);await p.saveAgentSettings()}))
        }).catch((error:unknown)=>new Notice(error instanceof Error?error.message:String(error)))
      }},
    ]
    const mcp:SettingsRow[]=[]
    for(const server of c.mcp){
      mcp.push({name:server.id,render:s=>{s.addToggle(t=>t.setValue(server.enabled).onChange(async value=>{server.enabled=value;await p.saveAgentSettings()}))}})
      mcp.push({name:tr('连接方式'),render:s=>{s.addDropdown(d=>d.addOption('http','HTTP').addOption('stdio',tr('本地 stdio')).setValue(server.transport).onChange(async value=>{server.transport=value==='stdio'?'stdio':'http';await p.saveAgentSettings();this.refresh()}))}})
      const key=server.transport==='http'?'url':'command'
      mcp.push({name:tr(key==='url'?'服务器地址':'可执行程序'),render:s=>{s.addText(t=>t.setValue(server[key]||'').onChange(async value=>{server[key]=value;await p.saveAgentSettings()}))}})
      if(server.transport==='stdio')mcp.push({name:tr('参数（JSON 数组）'),render:s=>{s.addTextArea(t=>t.setValue(JSON.stringify(server.args||[])).onChange(async value=>{
        let parsed:unknown
        try{parsed=JSON.parse(value)}catch{return}
        if(!Array.isArray(parsed)||!parsed.every((arg:unknown)=>typeof arg==='string'))return
        server.args=parsed;await p.saveAgentSettings()
      }))}})
      else mcp.push({name:'Bearer token',render:s=>{s.addText(t=>{t.inputEl.type='password';t.setValue(server.token||'').onChange(value=>{server.token=value;p.saveSecret(`mcp-${server.id}`,value)})})}})
      mcp.push({name:tr('移除 MCP'),render:s=>{s.addButton(b=>b.setButtonText(tr('移除 MCP')).onClick(async()=>{c.mcp=c.mcp.filter(item=>item!==server);await p.saveAgentSettings();this.refresh()}))}})
    }
    mcp.push({name:tr('添加 MCP'),render:s=>{s.addButton(b=>b.setButtonText(tr('添加 MCP')).onClick(async()=>{c.mcp.push({id:crypto.randomUUID(),enabled:false,transport:'http',url:''});await p.saveAgentSettings();this.refresh()}))}})
    return [{rows:appearance},{heading:'Agent',rows:agent},{heading:tr('BYOK 模型'),rows:models},{heading:'Skills',rows:skills},{heading:'MCP',rows:mcp}]
  }
}

class ModelModal extends Modal {
  private draft:ModelConfig
  constructor(private owner:Catea,model:ModelConfig,private saved:()=>void){super(owner.app);this.draft={...model}}
  onOpen(){
    const tr=this.owner.t,d=this.draft,el=this.contentEl
    this.titleEl.setText(this.owner.agentSettings.models.some(m=>m.id===d.id)?tr('编辑 BYOK 模型'):tr('添加 BYOK 模型'))
    new Setting(el).setName(tr('显示名称')).addText(t=>t.setValue(d.name).onChange(v=>{d.name=v}))
    let address:{setValue:(value:string)=>unknown}|undefined
    new Setting(el).setName(tr('协议')).addDropdown(t=>t.addOption('openai',tr('OpenAI 兼容')).addOption('anthropic',tr('Anthropic 兼容')).setValue(d.protocol).onChange(v=>{
      d.protocol=v as ModelConfig['protocol'];d.baseUrl=defaultBaseUrl(d.protocol);address?.setValue(d.baseUrl)
    }))
    new Setting(el).setName(tr('API 地址')).addText(t=>{address=t;t.setValue(d.baseUrl).onChange(v=>{d.baseUrl=v})})
    new Setting(el).setName(tr('模型 ID')).addText(t=>t.setValue(d.model).onChange(v=>{d.model=v}))
    new Setting(el).setName(tr('上下文窗口（tokens）')).setDesc(tr('按模型实际上限填写；用于自动提示交接，默认 128000。')).addText(t=>t.setValue(String(d.contextWindow||128000)).onChange(v=>{d.contextWindow=Number(v)}))
    new Setting(el).setName('API key').setDesc(tr('优先保存到 Obsidian 安全存储；不可用时仅本次运行有效，不写入 .catea。')).addText(t=>{
      t.inputEl.type='password';t.inputEl.autocomplete='off';t.setValue(d.apiKey).onChange(v=>{d.apiKey=v})
    })
    const error=el.createEl('p',{attr:{role:'alert'}})
    new Setting(el).addButton(b=>b.setButtonText(tr('取消')).onClick(()=>this.close())).addButton(b=>b.setButtonText(tr('保存模型')).setCta().onClick(async()=>{
      let model:ModelConfig
      try{model=normalizeModel(d)}catch(e){error.setText(e instanceof Error?tr(e.message):tr('请检查配置'));return}
      b.setDisabled(true)
      const c=this.owner.agentSettings,previous=c.models,previousId=c.modelId
      c.models=c.models.filter(m=>m.id!==model.id).concat(model);c.modelId=selectedModel(c.models,c.modelId)?.id||model.id
      try{
        await this.owner.saveAgentSettings();this.owner.saveSecret(model.id,model.apiKey)
        await this.owner.addMiniMaxModels()
        this.saved();this.close()
      }catch{c.models=previous;c.modelId=previousId;this.owner.emit();error.setText(tr('保存失败，请重试'));b.setDisabled(false)}
    }))
  }
  onClose(){this.contentEl.empty();this.draft.apiKey=''}
}
