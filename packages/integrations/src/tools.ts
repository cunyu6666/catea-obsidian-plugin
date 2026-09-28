/**
 * [WHO]: Provides Approve, VaultTools, fileTools
 * [FROM]: Depends on ../../agent-core/src/i18n, node:fs/promises, node:path, node:child_process, ./storage, ../../agent-core/src/providers
 * [TO]: Consumed by apps/obsidian/src/obsidian-tools.ts, packages/agent-core/src/index.ts,
 *   packages/integrations/src/index.ts
 * [HERE]: packages/integrations/src/tools.ts - filesystem tool surface (time/read/ls/find/grep/write/edit/bash); 1 MB text cap, 10000-file walk, 300-line read, 80 grep hits, 100 KB write, 60 s bash
 */
import {textValue} from '../../agent-core/src/i18n'
import {readFile,readdir,stat,mkdir,writeFile} from 'node:fs/promises'
import {dirname} from 'node:path'
import {spawn} from 'node:child_process'
import {within} from './storage'
import type {ToolDefinition} from '../../agent-core/src/providers'
export type Approve=(title:string,detail:string,signal:AbortSignal)=>Promise<boolean>
const string={type:'string'}
const tool=(name:string,description:string,properties:Record<string,unknown>,required:string[]=[]):ToolDefinition=>({name,description,parameters:{type:'object',properties,required,additionalProperties:false}})
export const fileTools=[
 tool('time','Get current system time; use for today, deadlines and time-sensitive questions.',{timeZone:string,locale:string}),
 tool('read','Read a UTF-8 vault file, with line offset and limit.',{path:string,offset:{type:'integer'},limit:{type:'integer'}},['path']),
 tool('ls','List a vault directory.',{path:string}),
 tool('find','Find vault files by path substring.',{query:string},['query']),
 tool('grep','Search literal text in vault text files.',{query:string},['query']),
 tool('write','Create or replace a vault text file after user approves the exact change.',{path:string,content:string},['path','content']),
 tool('edit','Replace one unique exact occurrence in a vault text file after user approval.',{path:string,oldText:string,newText:string},['path','oldText','newText']),
 tool('bash','Execute a shell command under the configured permission mode. This can access files beyond the vault; use file tools when possible.',{command:string},['command']),
 tool('AskUserQuestion','Ask the user a short clarification question.',{question:string},['question']),
]
const textExtensions=/\.(md|txt|json|ya?ml|csv|ts|js|css|html)$/i
export class VaultTools {
  constructor(private vault:string,private approve:Approve,private ask:(q:string,signal:AbortSignal)=>Promise<string>,private permissionMode:()=>'assist'|'full'=()=>'assist'){}
  private async text(path:string){const p=await within(this.vault,path);if((await stat(p)).size>1_000_000)throw new Error('文件超过 1 MB，请缩小范围');return readFile(p,'utf8')}
  private async files(){
    const result:string[]=[]
    const walk=async(path:string)=>{for(const entry of await readdir(await within(this.vault,path),{withFileTypes:true})){
      if(result.length>=10000)return
      if(entry.name.startsWith('.')||entry.name==='node_modules'||entry.isSymbolicLink())continue
      const rel=path?`${path}/${entry.name}`:entry.name
      if(entry.isDirectory())await walk(rel);else if(entry.isFile())result.push(rel)
    }}
    await walk('');return result
  }
  async run(name:string,a:Record<string,unknown>,signal:AbortSignal):Promise<string>{
    signal.throwIfAborted()
    const path=textValue(a.path||'')
    if(name==='time')return JSON.stringify({iso:new Date().toISOString(),epochMs:Date.now(),local:new Date().toLocaleString(textValue(a.locale||'zh-CN'),{timeZone:textValue(a.timeZone)||Intl.DateTimeFormat().resolvedOptions().timeZone,timeZoneName:'short'})})
    if(name==='AskUserQuestion')return this.ask(textValue(a.question||''),signal)
    if(name==='read'){
      if(!path||path.split(/[\\/]/).some(p=>p.startsWith('.')))throw new Error('隐藏目录请使用专门的 Skill 或记忆工具')
      const lines=(await this.text(path)).split('\n'),start=Math.max(0,Number(a.offset)||0),limit=Math.min(300,Math.max(1,Number(a.limit)||120))
      return JSON.stringify({path,lines:lines.slice(start,start+limit),nextOffset:start+limit<lines.length?start+limit:null}).slice(0,24000)
    }
    if(name==='ls'){
      if(path.split(/[\\/]/).some(p=>p.startsWith('.')))throw new Error('不列出隐藏目录')
      return JSON.stringify((await readdir(await within(this.vault,path),{withFileTypes:true})).filter(d=>!d.name.startsWith('.')).slice(0,200).map(d=>({name:d.name,directory:d.isDirectory()})))
    }
    if(name==='find')return JSON.stringify((await this.files()).filter(p=>p.toLowerCase().includes(textValue(a.query||'').toLowerCase())).slice(0,200))
    if(name==='grep'){
      const q=textValue(a.query||'');if(!q)throw new Error('搜索词不能为空');const hits:unknown[]=[]
      for(const file of await this.files()){
        signal.throwIfAborted();if(!textExtensions.test(file))continue
        const info=await stat(await within(this.vault,file));if(info.size>1_000_000)continue
        const lines=(await this.text(file)).split('\n')
        lines.forEach((line,i)=>{if(hits.length<80&&line.toLowerCase().includes(q.toLowerCase()))hits.push({path:file,line:i+1,text:line.slice(0,400)})})
        if(hits.length>=80)break
      }
      return JSON.stringify(hits)
    }
    if(name==='write'||name==='edit'){
      if(!path||path.split(/[\\/]/).some(p=>p.startsWith('.'))||/^raw(?:\/|$)/.test(path))throw new Error('不改写隐藏目录或 raw 原始素材')
      const target=await within(this.vault,path);let before:string|null=null
      try{before=await this.text(path)}catch(e:unknown){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
      let after=textValue(a.content??'')
      if(name==='edit'){
        const old=textValue(a.oldText||'');if(before===null||!old||before.split(old).length!==2)throw new Error('oldText 必须在文件中唯一匹配')
        after=before.replace(old,()=>textValue(a.newText??''))
      }
      if(after.length>100000)throw new Error('单次写入上限 100 KB')
      if(path==='wiki/log.md'&&before!==null&&!after.startsWith(before))throw new Error('wiki/log.md 只能追加')
      if(!await this.approve(`修改 ${path}`,JSON.stringify({path,before,after},null,2),signal))throw new Error('用户拒绝修改')
      signal.throwIfAborted();await within(this.vault,path)
      let current:string|null=null;try{current=await this.text(path)}catch(e:unknown){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
      if(current!==before)throw new Error('文件在确认期间发生变化，请重新读取')
      await mkdir(dirname(target),{recursive:true});await writeFile(target,after,'utf8');return `已写入 ${path}`
    }
    if(name==='bash'){
      const command=textValue(a.command||'');if(!command.trim())throw new Error('命令不能为空')
      // Only exact, non-composable directory inspection is automatically approved.
      // Execute these through absolute binaries without a shell (no PATH aliases).
      const readOnly=process.platform==='win32'?undefined:command.trim()==='pwd'?{file:'/bin/pwd',args:[]}:/^ls(?: -[alh]+)*$/.test(command.trim())?{file:'/bin/ls',args:command.trim().split(/ +/).slice(1)}:undefined
      if(this.permissionMode()!=='full'&&!readOnly&&!await this.approve('运行终端命令',`工作目录：${this.vault}\n该命令可访问知识库之外的文件。\n\n${command}`,signal))throw new Error('用户拒绝命令')
      signal.throwIfAborted()
      return new Promise((resolve,reject)=>{
        const child=readOnly&&process.platform!=='win32'?spawn(readOnly.file,readOnly.args,{cwd:this.vault,detached:true,stdio:['ignore','pipe','pipe']}):spawn(command,{cwd:this.vault,shell:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});let output=''
        const kill=()=>{try{if(process.platform!=='win32'&&child.pid)process.kill(-child.pid,'SIGKILL');else child.kill('SIGKILL')}catch{/* The process may already have exited. */}}
        const timer=window.setTimeout(kill,60000);const abort=()=>kill();signal.addEventListener('abort',abort,{once:true})
        const collect=(chunk:Buffer)=>{output=(output+chunk.toString()).slice(-24000)};child.stdout.on('data',collect);child.stderr.on('data',collect)
        const cleanup=()=>{window.clearTimeout(timer);signal.removeEventListener('abort',abort)}
        child.on('error',e=>{cleanup();reject(e)});child.on('close',code=>{cleanup();signal.aborted?reject(new Error('已停止')):resolve(JSON.stringify({code,output}))})
      })
    }
    throw new Error(`未知工具：${name}`)
  }
}
