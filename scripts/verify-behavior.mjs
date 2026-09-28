// Runtime regression checks for the hand-written adapters. Hosts and network
// transports are injected; no live vault, credentials or model calls are used.
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {runInNewContext} from 'node:vm'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

async function load(entry,mocks={},globals={}) {
  const result=await build({entryPoints:[entry],bundle:true,platform:'node',format:'cjs',write:false,loader:{'.md':'text'},
    plugins:[{name:'test-host',setup(b){
      b.onResolve({filter:/.*/},args=>Object.hasOwn(mocks,args.path)?{path:args.path,namespace:'mock'}:undefined)
      b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js'}))
    }}]})
  const module={exports:{}}
  runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,require:createRequire(import.meta.url),
    URL,URLSearchParams,Headers,Response,Request,ReadableStream,TextDecoder,TextEncoder,AbortController,AbortSignal,DOMException,
    crypto,Buffer,console,process,setTimeout,clearTimeout,window:{setTimeout,clearTimeout},...globals},{filename:resolve(entry)})
  return module.exports
}
const model={id:'fixture',name:'Fixture',model:'fixture',apiKey:'test-key',baseUrl:'https://example.invalid/v1',protocol:'openai'}

test('Drafts stay with their session and failed sends restore only their own content',async()=>{
  const {SessionDraftStore}=await load('apps/obsidian/src/session-drafts.ts')
  const drafts=new SessionDraftStore()
  const attachment={id:'file-a',path:'a.png',size:10,mimeType:'image/png'}
  drafts.update('a',current=>({...current,text:'First',attachments:[attachment],quotes:[{id:'q',path:'note.md',text:'quoted'}]}))
  const sent=drafts.get('a');drafts.clear('a')
  drafts.update('b',current=>({...current,text:'Second'}))
  drafts.restore('a',sent)
  assert.equal(drafts.get('a').text,'First')
  assert.equal(drafts.get('a').attachments[0].id,'file-a')
  assert.equal(drafts.get('a').quotes[0].text,'quoted')
  assert.equal(drafts.get('b').text,'Second')
})

test('Model capabilities centralize known exceptions and explicit overrides',async()=>{
  const {modelCapabilities,unsupportedAttachment}=await load('packages/agent-core/src/model-capabilities.ts')
  const image={id:'image',path:'photo.png',mimeType:'image/png',size:10}
  const m2={...model,model:'MiniMax-M2.7'}
  assert.equal(modelCapabilities(m2).vision,false)
  assert.equal(unsupportedAttachment(m2,[image]).id,'image')
  assert.equal(unsupportedAttachment({...m2,capabilities:{vision:true}},[image]),undefined)
})

test('Provider rejects unsupported attachments before network and honors tool declarations',async()=>{
  let calls=0,body
  const {streamModel}=await load('packages/agent-core/src/providers.ts',{'./transport':'export const serviceFetch=globalThis.testFetch'},{testFetch:async(_url,options)=>{calls++;body=JSON.parse(options.body);return Response.json({choices:[{message:{content:'ok'}}]})}})
  const image={id:'image',path:'photo.png',mimeType:'image/png',size:10,dataUrl:'data:image/png;base64,YQ=='}
  const transcript=[{role:'user',content:'inspect',attachmentIds:['image']}]
  const signal=new AbortController().signal
  await assert.rejects(()=>streamModel({...model,model:'MiniMax-M2.7'},transcript,'',[],new Map([['image',image]]),()=>{},signal),/cannot read attachment/)
  assert.equal(calls,0)
  await streamModel({...model,capabilities:{tools:false,streaming:false}},[{role:'user',content:'hello'}],'system',[{name:'read',description:'read',parameters:{type:'object'}}],new Map(),()=>{},signal)
  assert.equal(body.stream,false)
  assert.equal(body.tools,undefined)
  assert.equal(body.stream_options,undefined)
})

test('Permission policy makes assist, full and disabled decisions consistently',async()=>{
  const {PermissionPolicy,requirePermission}=await load('packages/agent-core/src/permission-policy.ts')
  const request={mode:'assist',capability:'vault',operation:'write'}
  assert.equal(PermissionPolicy.evaluate(request),'ask')
  assert.equal(PermissionPolicy.evaluate({...request,mode:'full'}),'allow')
  assert.equal(PermissionPolicy.evaluate({...request,operation:'read'}),'allow')
  assert.equal(PermissionPolicy.evaluate({...request,disabled:true}),'deny')
  let asked=0
  const approve=async()=>{asked++;return true}
  const signal=new AbortController().signal
  await requirePermission({...request,mode:'full'},approve,'write','detail',signal)
  assert.equal(asked,0)
  await requirePermission(request,approve,'write','detail',signal)
  assert.equal(asked,1)
  await assert.rejects(()=>requirePermission({...request,disabled:true},approve,'write','detail',signal),/disabled/)
})

test('Vault writes obey the shared permission policy without losing path checks',async()=>{
  const {VaultTools}=await load('packages/integrations/src/tools.ts')
  const root=await mkdtemp(join(tmpdir(),'catea-policy-'))
  try{
    let approvals=0
    const approve=async()=>{approvals++;return false}
    const signal=new AbortController().signal
    const assist=new VaultTools(root,approve,async()=>'',()=>'assist')
    await assert.rejects(()=>assist.run('write',{path:'note.md',content:'text'},signal),/Permission denied/)
    assert.equal(approvals,1)
    const full=new VaultTools(root,approve,async()=>'',()=>'full')
    await full.run('write',{path:'note.md',content:'text'},signal)
    assert.equal(await readFile(join(root,'note.md'),'utf8'),'text')
    assert.equal(approvals,1)
    await assert.rejects(()=>full.run('write',{path:'raw/source.md',content:'no'},signal),/raw/)
  }finally{await rm(root,{recursive:true,force:true})}
})

test('Tool presenters keep known labels and safely show unknown tools',async()=>{
  const {createToolPresenters}=await load('apps/obsidian/src/tool-presenters.ts')
  const registry=createToolPresenters()
  const translate=text=>`translated:${text}`
  assert.equal(registry.title({id:'a',name:'web_search',args:{}},translate),'translated:网络搜索')
  const unknown={id:'b',name:'custom_tool',args:{},result:'completed'}
  assert.equal(registry.title(unknown,translate),'custom_tool')
  assert.equal(registry.summary(unknown),'completed')
  assert.match(registry.details(unknown),/custom_tool/)
})

test('OpenRouter quick configuration selects Free or a model slug and uses the compatible endpoint',async()=>{
  const {createOpenRouterModel,isOpenRouterModel}=await load('packages/agent-core/src/byok.ts')
  const free=createOpenRouterModel('free-id',' test-key ','openrouter/free')
  assert.equal(free.model,'openrouter/free')
  assert.equal(free.baseUrl,'https://openrouter.ai/api/v1')
  assert.equal(free.apiKey,'test-key')
  assert.equal(isOpenRouterModel(free),true)
  const custom=createOpenRouterModel('custom-id','test-key','anthropic/claude-sonnet-4')
  assert.equal(custom.model,'anthropic/claude-sonnet-4')
  assert.throws(()=>createOpenRouterModel('bad','test-key','free'),/provider\/model/)
  let requested
  const {streamModel}=await load('packages/agent-core/src/providers.ts',{'./transport':'export const serviceFetch=globalThis.testFetch'},{testFetch:async(url,options)=>{requested={url,options};return Response.json({choices:[{message:{content:'ready'}}]})}})
  const reply=await streamModel(free,[{role:'user',content:'hello'}],'',[],new Map(),()=>{},new AbortController().signal)
  assert.equal(reply.text,'ready')
  assert.equal(requested.url,'https://openrouter.ai/api/v1/chat/completions')
  assert.equal(requested.options.headers.Authorization,'Bearer test-key')
  assert.equal(JSON.parse(requested.options.body).model,'openrouter/free')
})
const stream=frames=>new Response(frames.map(frame=>`data: ${typeof frame==='string'?frame:JSON.stringify(frame)}\n\n`).join(''),{headers:{'content-type':'text/event-stream'}})
const parse=async(protocol,response)=>{
  const {streamModel}=await load('packages/agent-core/src/providers.ts',{'./transport':'export const serviceFetch=globalThis.testFetch'},{testFetch:async()=>response})
  const deltas=[],reasoning=[]
  const reply=await streamModel({...model,protocol},[{role:'user',content:'Hello'}],'',[],new Map(),text=>deltas.push(text),new AbortController().signal,{onReasoning:text=>reasoning.push(text)})
  return {reply,deltas,reasoning}
}

test('OpenAI SSE joins tool fragments and reports usage',async()=>{
  const {reply,deltas}=await parse('openai',stream([
    {choices:[{delta:{content:'Hi',tool_calls:[{index:0,id:'call',function:{name:'read',arguments:'{"path":'}}]}}]},
    {choices:[{delta:{tool_calls:[{index:0,function:{arguments:'"note.md"}'}}]},finish_reason:'tool_calls'}]},
    {choices:[],usage:{prompt_tokens:20,completion_tokens:8}},'[DONE]',
  ]))
  assert.equal(deltas.join(''),'Hi');assert.equal(reply.calls[0].name,'read');assert.equal(reply.calls[0].args.path,'note.md')
  assert.equal(reply.usage.inputTokens,20);assert.equal(reply.usage.outputTokens,8)
})
test('Anthropic SSE retains signed blocks and complete initial tool input',async()=>{
  const {reply,reasoning}=await parse('anthropic',stream([
    {type:'message_start',message:{usage:{input_tokens:10,cache_read_input_tokens:2,output_tokens:0}}},
    {type:'content_block_start',index:0,content_block:{type:'thinking',thinking:'',signature:''}},
    {type:'content_block_delta',index:0,delta:{type:'thinking_delta',thinking:'reason'}},
    {type:'content_block_delta',index:0,delta:{type:'signature_delta',signature:'signed'}},
    {type:'content_block_start',index:1,content_block:{type:'tool_use',id:'call',name:'read',input:{path:'note.md'}}},
    {type:'message_delta',delta:{stop_reason:'tool_use'},usage:{output_tokens:5}},
  ]))
  assert.equal(reply.anthropicContent[0].thinking,'reason');assert.equal(reply.anthropicContent[0].signature,'signed')
  assert.equal(reasoning.join(''),'reason')
  assert.equal(reply.calls[0].args.path,'note.md');assert.equal(reply.usage.inputTokens,12)
})
test('OpenAI compatible reasoning streams separately from answer text',async()=>{
  const {reply,deltas,reasoning}=await parse('openai',stream([
    {choices:[{delta:{reasoning_content:'Checking the note.'}}]},
    {choices:[{delta:{content:'Here is the answer.'}}]},'[DONE]',
  ]))
  assert.equal(reasoning.join(''),'Checking the note.')
  assert.equal(deltas.join(''),'Here is the answer.')
  assert.equal(reply.text,'Here is the answer.')
})
test('Agent stream forwards provider reasoning before the answer',async()=>{
  const {providerStream}=await load('packages/agent-core/src/upstream-stream.ts',{'./providers':'export class ModelServiceError extends Error { status=0 }'})
  const client={async *stream(){
    yield {type:'reasoning',text:'Check the note.'}
    yield {type:'delta',text:'Done.'}
    yield {type:'done',reply:{text:'Done.',calls:[]}}
  }}
  const events=[]
  const modelInfo={id:model.model,api:'openai-completions',provider:'catea'}
  for await(const event of providerStream(model,()=>new Map(),client)(modelInfo,{messages:[],systemPrompt:'',tools:[]}))events.push(event)
  assert.equal(events.find(event=>event.type==='thinking_delta')?.delta,'Check the note.')
  assert.equal(events.find(event=>event.type==='text_delta')?.delta,'Done.')
  assert.equal(events.find(event=>event.type==='done')?.message.content.find(block=>block.type==='thinking')?.thinking,'Check the note.')
})
test('Malformed optional JSON fields cannot become executable tool arguments',async()=>{
  const {reply}=await parse('anthropic',Response.json({content:[null,{type:'tool_use',id:'x',name:'read',input:['bad']}],usage:null}))
  assert.equal(reply.calls.length,1);assert.equal(JSON.stringify(reply.calls[0].args),'{}')
  const {reply:openai}=await parse('openai',Response.json({choices:[{message:{content:{unexpected:true},tool_calls:{unexpected:true}}}]}))
  assert.equal(openai.text,'');assert.equal(openai.calls.length,0)
})
test('Provider errors never disclose response bodies',async()=>{
  await assert.rejects(()=>parse('openai',new Response('private note and secret key',{status:503})),error=>{
    assert.equal(error.message.includes('private note'),false);assert.equal(error.message.includes('secret key'),false);return true
  })
})
test('Buffered OpenAI and Anthropic responses preserve tool calls',async()=>{
  const {reply}=await parse('openai',Response.json({choices:[{finish_reason:'length',message:{content:'result',tool_calls:[{id:'c',function:{name:'read',arguments:'{"path":"a.md"}'}}]}}]}))
  assert.equal(reply.text,'result');assert.equal(reply.calls[0].args.path,'a.md');assert.equal(reply.stopReason,'length')
  const {reply:anthropic}=await parse('anthropic',Response.json({content:[{type:'text',text:'done'},{type:'tool_use',id:'b',name:'read',input:{path:'b.md'}}],usage:{input_tokens:3,output_tokens:4}}))
  assert.equal(anthropic.text,'done');assert.equal(anthropic.calls[0].args.path,'b.md')
})
test('Context history and notes remain usable across a saved handoff',async()=>{
  const {WorkingContext}=await load('packages/agent-core/src/context.ts',{'./providers':'export const streamModel=()=>{};export class ModelServiceError extends Error {}'})
  const transcript=[]
  for(let i=0;i<16;i++){transcript.push({role:'user',content:`Old request ${i} `+'a'.repeat(2000)});transcript.push({role:'assistant',content:'b'.repeat(2000)})}
  transcript.push({role:'user',content:'Continue the current task'})
  const session={id:'fixture-session',transcript,messages:[]}
  let saved=0;const context=new WorkingContext(session,4096,0,async()=>{saved++})
  const signal=new AbortController().signal
  await context.run('working_notes',{action:'write',name:'plan',content:'Keep the original constraints'},signal)
  assert.match(await context.run('working_notes',{action:'read',name:'plan'},signal),/original constraints/)
  const count=session.journal.length
  await context.run('new_context',{handoff:'Continue the current task; old requests are complete.'},signal)
  const prepared=await context.prepare(context.messages(),'system',[])
  assert.ok(saved>0);assert.ok(session.journal.length>=count)
  assert.ok(session.journal.some(entry=>entry.type==='compaction'))
  assert.ok(prepared.some(message=>String(message.content).includes('Continue the current task')))
  assert.match(await context.run('session_history',{action:'search',query:'Old request 0'},signal),/Old request 0/)
})
const hostMock=`
 export class PluginSettingTab {constructor(app,plugin){this.app=app;this.plugin=plugin;this.containerEl={empty(){},createDiv(){return {}}}}}
 export class Setting {constructor(){} setName(){return this} setDesc(){return this} setHeading(){return this}}
 export class Modal {} export class App {} export class Notice {}
`
async function settingsFixture(){
  const {CateaSettings}=await load('apps/obsidian/src/settings.ts',{'obsidian':hostMock,'../../../packages/integrations/src/skills':'export const listSkills=async()=>[]'})
  let saves=0,stops=0,refreshes=0
  const plugin={app:{},settings:{enabled:true},t:text=>text,vaultPath:'/unused',
    agentSettings:{language:'zh',enabled:true,web:true,memory:true,shell:true,models:[],skills:[],mcp:[],modelId:''},
    agent:{stop(){stops++},memory:{setEnabled(){}}},async saveAgentSettings(){saves++},refreshPaperLanguage(){},refreshThumbnails(){},async saveData(){},apply(){}}
  const tab=new CateaSettings(plugin.app,plugin)
  return {tab,plugin,stats:()=>({saves,stops,refreshes}),enableModern:()=>{tab.update=()=>{refreshes++}}}
}
function rows(tab){return tab.getSettingDefinitions().flatMap(group=>group.items)}
test('Settings definitions expose searchable names and persist toggles',async()=>{
  const {tab,plugin,stats}=await settingsFixture()
  const row=rows(tab).find(item=>item.name==='网络搜索与网页读取')
  assert.ok(row);let change
  row.render({addToggle(fn){fn({setValue(){return this},onChange(fn){change=fn;return this}});return this}})
  await change(false)
  assert.equal(plugin.agentSettings.web,false);assert.equal(stats().saves,1);assert.equal(stats().stops,1)
})
test('Settings offer a dedicated OpenRouter quick entry alongside advanced models',async()=>{
  const {tab}=await settingsFixture()
  const names=rows(tab).map(item=>item.name)
  assert.ok(names.includes('添加 OpenRouter'))
  assert.ok(names.includes('添加其他模型'))
})
test('Settings refresh uses the modern API when present and keeps a legacy fallback',async()=>{
  const fixture=await settingsFixture();fixture.enableModern()
  fixture.tab.refresh();assert.equal(fixture.stats().refreshes,1)
  delete fixture.tab.update
  let rendered=0;fixture.tab.renderLegacy=()=>{rendered++}
  fixture.tab.refresh();assert.equal(rendered,1)
})
test('Settings search metadata never contains API keys or MCP tokens',async()=>{
  const {tab,plugin}=await settingsFixture()
  plugin.agentSettings.models=[{...model,apiKey:'SECRET_MODEL_KEY'}]
  plugin.agentSettings.mcp=[{id:'server',transport:'http',enabled:true,url:'https://example.invalid',token:'SECRET_MCP_TOKEN'}]
  const metadata=JSON.stringify(tab.getSettingDefinitions())
  assert.equal(metadata.includes('SECRET_MODEL_KEY'),false);assert.equal(metadata.includes('SECRET_MCP_TOKEN'),false)
})

test('Certificate fallback lazily loads the host transport without relaxing TLS',async()=>{
  let called=false
  const {serviceFetch}=await load('packages/agent-core/src/transport.ts',{
    'node:https':`export const request=()=>({on(name,fn){if(name==='error')Promise.resolve().then(()=>fn(Object.assign(new Error('chain'),{code:'SELF_SIGNED_CERT_IN_CHAIN'})));return this},setTimeout(){},write(){},end(){}})`,
    'electron':'export const net={fetch:globalThis.hostFetch}',
    '@electron/remote':'export const net=undefined',
    'obsidian':`export const requestUrl=()=>{throw new Error('Unexpected buffered fallback')}`,
  },{hostFetch:async(input,options)=>{called=true;assert.equal(options.redirect,'error');assert.equal(options.rejectUnauthorized,undefined);return new Response('host stream')}})
  const response=await serviceFetch('https://example.invalid',{method:'POST',body:'{}'})
  assert.equal(called,true);assert.equal(await response.text(),'host stream')
})
test('Plugin and bundled design-system styles avoid the reported CSS patterns',async()=>{
  const {readFile,readdir}=await import('node:fs/promises')
  const {default:postcss}=await import('postcss')
  const dir='packages/design-system/components/src'
  const files=['apps/obsidian/paper.css',...(await readdir(dir)).filter(name=>name.endsWith('.css')).map(name=>`${dir}/${name}`)]
  for(const file of files){
    const root=postcss.parse(await readFile(file,'utf8'))
    root.walkDecls(decl=>assert.equal(!!decl.important,false,`${file}: ${decl.prop}`))
    root.walkRules(rule=>assert.equal(rule.selector.includes(':has('),false,`${file}: ${rule.selector}`))
  }
})
