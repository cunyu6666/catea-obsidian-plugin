/**
 * [WHO]: Provides CateaSettings
 * [FROM]: Depends on ../../../packages/agent-core/src/byok, ../../../packages/agent-core/src/types,
 *   ../../../packages/integrations/src/skills, ./main, obsidian
 * [TO]: Consumed by apps/obsidian/src/main.tsx
 * [HERE]: apps/obsidian/src/settings.ts - plugin settings tab for language, paper toggles, Agent toggles, BYOK models and MCP servers; ModelModal validates through normalizeModel
 */
import {App,PluginSettingTab,Setting,Notice,Modal} from 'obsidian'
import type Catea from './main'
import type {ModelConfig} from '../../../packages/agent-core/src/types'
import {defaultBaseUrl,normalizeModel,selectedModel} from '../../../packages/agent-core/src/byok'
import {listSkills} from '../../../packages/integrations/src/skills'
export class CateaSettings extends PluginSettingTab {
  constructor(app:App,private owner:Catea){super(app,owner)}
  display(){
    const p=this.owner,tr=p.t,c=p.agentSettings,el=this.containerEl;el.empty();new Setting(el).setName('Catea Paper').setHeading()
    new Setting(el).setName(tr('语言 / Language')).addDropdown(d=>d.addOption('zh',tr('简体中文')).addOption('en','English').setValue(c.language||'zh').onChange(async value=>{c.language=value as 'zh'|'en';await p.saveAgentSettings();p.refreshPaperLanguage();this.display()}))
    const shell=p as any
    for(const [key,name] of [['enabled',tr('启用纸张界面')],['toolbar',tr('格式工具栏')],['tablerIcons',tr('Tabler 图标')],['hideProperties',tr('隐藏正文属性')],['hideRibbon',tr('隐藏导航栏')],['hideStatus',tr('隐藏状态栏')]])new Setting(el).setName(tr(name)).addToggle(t=>t.setValue(shell.settings[key]).onChange(async v=>{shell.settings[key]=v;await p.saveData(shell.settings);shell.apply()}))
    new Setting(el).setName(tr('笔记缩略图')).setDesc(tr('文件树显示真实标题、正文和首张本地图片的缩略预览。')).addToggle(t=>t.setValue(c.noteThumbnails!==false).onChange(async value=>{c.noteThumbnails=value;await p.saveAgentSettings();p.refreshThumbnails()}))
    new Setting(el).setName('Agent').setHeading()
    new Setting(el).setName(tr('启用 Agent')).addToggle(t=>t.setValue(c.enabled).onChange(async v=>{c.enabled=v;if(!v)p.agent.stop();p.agent.memory.setEnabled(v&&c.memory);await p.saveAgentSettings()}))
    new Setting(el).setName(tr('网络搜索与网页读取')).setDesc(tr('复用 CatUI 联网工具：Exa / agent-reach（支持时）/ Jina / DuckDuckGo；无需模型 Key 之外的搜索 Key。搜索词和目标 URL 会发送到联网服务。')).addToggle(t=>t.setValue(c.web).onChange(async v=>{c.web=v;p.agent.stop();await p.saveAgentSettings()}))
    new Setting(el).setName(tr('长期记忆')).setDesc(tr('自动提取、召回和巩固；保存在当前知识库 .catea/memory。')).addToggle(t=>t.setValue(c.memory).onChange(async v=>{c.memory=v;if(!v)p.agent.stop();p.agent.memory.setEnabled(v&&c.enabled);await p.saveAgentSettings()}))
    new Setting(el).setName('Bash').setDesc(tr('默认开启，命令执行遵循下方权限模式。')).addToggle(t=>t.setValue(c.shell).onChange(async v=>{c.shell=v;p.agent.stop();await p.saveAgentSettings()}))
    new Setting(el).setName(tr('权限模式')).setDesc(tr('帮我批准：自动放行 pwd、ls 等简单目录查看，其余操作请求确认。完全访问：跳过 Bash、文件修改、MCP 和记忆更新的审批，命令可访问知识库之外。')).addDropdown(d=>d.addOption('assist',tr('帮我批准')).addOption('full',tr('完全访问')).setValue(c.permissionMode||'assist').onChange(async value=>{p.agent.stop();c.permissionMode=value==='full'?'full':'assist';await p.saveAgentSettings()}))
    new Setting(el).setName(tr('BYOK 模型')).setHeading()
    el.createEl('p',{text:tr('使用自己的 API Key，直接连接 OpenAI / Anthropic 兼容服务。仅显示你配置的模型。')})
    for(const model of c.models){
      new Setting(el).setName(model.name).setDesc(`${model.protocol==='openai'?tr('OpenAI 兼容'):tr('Anthropic 兼容')} · ${model.model} · ${model.baseUrl}${model.apiKey?'':tr(' · 请补充 API Key')}`)
        .addButton(b=>b.setButtonText(tr('编辑')).onClick(()=>new ModelModal(p,model,()=>this.display()).open()))
        .addButton(b=>b.setButtonText(tr('移除')).onClick(async()=>{
          const previous=c.models,previousId=c.modelId
          c.models=c.models.filter(m=>m.id!==model.id);c.modelId=selectedModel(c.models,c.modelId)?.id||''
          try{await p.saveAgentSettings();p.saveSecret(model.id,'');this.display()}
          catch{c.models=previous;c.modelId=previousId;new Notice(tr('模型移除失败，请重试'))}
        }))
    }
    new Setting(el).addButton(b=>b.setButtonText(tr('添加模型')).onClick(()=>new ModelModal(p,{id:crypto.randomUUID(),name:'',protocol:'openai',baseUrl:defaultBaseUrl('openai'),apiKey:'',model:''},()=>this.display()).open()))
    new Setting(el).setName('Skills').setHeading();new Setting(el).setName(tr('Obsidian 操作 · 内置')).setDesc(tr('随 Agent 启用：当前笔记、搜索、内部打开、阅读与编辑；写入和设置变更需确认。'));el.createEl('p',{text:tr('将 Skill 文件夹放到 .catea/skills/<名称>/SKILL.md，再启用。')})
    const skillBox=el.createDiv();void listSkills(p.vaultPath).then(skills=>{if(!skillBox.isConnected)return;for(const id of skills)new Setting(skillBox).setName(id).addToggle(t=>t.setValue(c.skills.includes(id)).onChange(async v=>{c.skills=v?[...new Set([...c.skills,id])]:c.skills.filter(s=>s!==id);await p.saveAgentSettings()}))}).catch(e=>new Notice(e.message))
    new Setting(el).setName('MCP').setHeading()
    for(const server of c.mcp){
      new Setting(el).setName(server.id).addToggle(t=>t.setValue(server.enabled).onChange(async v=>{server.enabled=v;await p.saveAgentSettings()}))
      new Setting(el).setName(tr('连接方式')).addDropdown(d=>d.addOption('http','HTTP').addOption('stdio',tr('本地 stdio')).setValue(server.transport).onChange(async v=>{server.transport=v as any;await p.saveAgentSettings();this.display()}))
      for(const [key,label] of (server.transport==='http'?[['url',tr('服务器地址')]]:[['command',tr('可执行程序')]]) as Array<['url'|'command',string]>)new Setting(el).setName(tr(label)).addText(t=>t.setValue(server[key]||'').onChange(async v=>{server[key]=v;await p.saveAgentSettings()}))
      if(server.transport==='stdio')new Setting(el).setName(tr('参数（JSON 数组）')).addTextArea(t=>t.setValue(JSON.stringify(server.args||[])).onChange(async v=>{try{const args=JSON.parse(v);if(!Array.isArray(args)||args.some(a=>typeof a!=='string'))return;server.args=args;await p.saveAgentSettings()}catch{}}))
      else new Setting(el).setName('Bearer Token').addText(t=>{t.inputEl.type='password';t.setValue(server.token||'').onChange(v=>{server.token=v;p.saveSecret(`mcp-${server.id}`,v)})})
      new Setting(el).addButton(b=>b.setButtonText(tr('移除 MCP')).onClick(async()=>{c.mcp=c.mcp.filter(s=>s!==server);await p.saveAgentSettings();this.display()}))
    }
    new Setting(el).addButton(b=>b.setButtonText(tr('添加 MCP')).onClick(async()=>{c.mcp.push({id:crypto.randomUUID(),enabled:false,transport:'http',url:''});await p.saveAgentSettings();this.display()}))
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
    new Setting(el).setName('API Key').setDesc(tr('优先保存到 Obsidian 安全存储；不可用时仅本次运行有效，不写入 .catea。')).addText(t=>{
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
