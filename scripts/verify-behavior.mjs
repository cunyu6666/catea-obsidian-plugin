// Runtime regression checks for the hand-written adapters. Hosts and network
// transports are injected; no live vault, credentials or model calls are used.
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {runInNewContext} from 'node:vm'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'

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
const stream=frames=>new Response(frames.map(frame=>`data: ${typeof frame==='string'?frame:JSON.stringify(frame)}\n\n`).join(''),{headers:{'content-type':'text/event-stream'}})
const parse=async(protocol,response)=>{
  const {streamModel}=await load('packages/agent-core/src/providers.ts',{'./transport':'export const serviceFetch=globalThis.testFetch'},{testFetch:async()=>response})
  const deltas=[]
  const reply=await streamModel({...model,protocol},[{role:'user',content:'Hello'}],'',[],new Map(),text=>deltas.push(text),new AbortController().signal)
  return {reply,deltas}
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
  const {reply}=await parse('anthropic',stream([
    {type:'message_start',message:{usage:{input_tokens:10,cache_read_input_tokens:2,output_tokens:0}}},
    {type:'content_block_start',index:0,content_block:{type:'thinking',thinking:'',signature:''}},
    {type:'content_block_delta',index:0,delta:{type:'thinking_delta',thinking:'reason'}},
    {type:'content_block_delta',index:0,delta:{type:'signature_delta',signature:'signed'}},
    {type:'content_block_start',index:1,content_block:{type:'tool_use',id:'call',name:'read',input:{path:'note.md'}}},
    {type:'message_delta',delta:{stop_reason:'tool_use'},usage:{output_tokens:5}},
  ]))
  assert.equal(reply.anthropicContent[0].thinking,'reason');assert.equal(reply.anthropicContent[0].signature,'signed')
  assert.equal(reply.calls[0].args.path,'note.md');assert.equal(reply.usage.inputTokens,12)
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
