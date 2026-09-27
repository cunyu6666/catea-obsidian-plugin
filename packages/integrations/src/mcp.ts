/**
 * [WHO]: Provides McpConfig, McpPool
 * [FROM]: Depends on ../../agent-core/src/providers, @modelcontextprotocol/sdk/client/index.js,
 *   @modelcontextprotocol/sdk/client/stdio.js,
 *   @modelcontextprotocol/sdk/client/streamableHttp.js
 * [TO]: Consumed by packages/agent-core/src/index.ts, packages/integrations/src/index.ts
 * [HERE]: packages/integrations/src/mcp.ts - connects enabled stdio and HTTP MCP servers, paginates tool discovery and namespaces tool names to 64 chars; catalog cap 1000, call timeout 120 s, output 24000 chars
 */
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js'
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type {ToolDefinition} from '../../agent-core/src/providers'
export interface McpConfig {id:string;enabled:boolean;transport:'stdio'|'http';command?:string;args?:string[];url?:string;token?:string;env?:Record<string,string>}
export class McpPool {
  private clients=new Map<string,Client>()
  private calls=new Map<string,{client:Client;name:string}>()
  async connect(configs:McpConfig[],vault:string,signal:AbortSignal):Promise<ToolDefinition[]>{
    signal.throwIfAborted();await this.close();const definitions:ToolDefinition[]=[]
    const abort=()=>{void this.close()};signal.addEventListener("abort",abort,{once:true})
    try{
      for(const [index,c] of configs.filter(c=>c.enabled).entries()){
        signal.throwIfAborted();const client=new Client({name:'catea-paper',version:'0.3.0'},{capabilities:{}})
        const transport=c.transport==='stdio'
          ? new StdioClientTransport({command:c.command!,args:c.args||[],cwd:vault,env:c.env})
          : new StreamableHTTPClientTransport(new URL(c.url!),{requestInit:{headers:c.token?{Authorization:`Bearer ${c.token}`}:{}}})
        this.clients.set(c.id,client);await client.connect(transport)
        let cursor:string|undefined
        do{
          const page=await client.listTools(cursor?{cursor}:{})
          for(const [i,tool] of page.tools.entries()){
            const key=`mcp_${index}_${definitions.length}_${tool.name.replace(/[^a-zA-Z0-9_]/g,'_')}`.slice(0,64)
            this.calls.set(key,{client,name:tool.name});definitions.push({name:key,description:`[${c.id}] ${tool.description||tool.name}`,parameters:tool.inputSchema})
          }
          signal.throwIfAborted();if(definitions.length>1000)throw new Error("MCP 工具目录超过 1000 项");cursor=page.nextCursor
        }while(cursor)
      }
      return definitions
    }catch(e){await this.close();throw e}finally{signal.removeEventListener("abort",abort)}
  }
  async call(name:string,args:Record<string,unknown>,signal:AbortSignal){
    const entry=this.calls.get(name);if(!entry)throw new Error('MCP 工具不存在')
    const result=await entry.client.callTool({name:entry.name,arguments:args},undefined,{signal,timeout:120000});if(result.isError)throw new Error(JSON.stringify(result.content).slice(0,2000));return JSON.stringify(result).slice(0,24000)
  }
  async close(){await Promise.allSettled([...this.clients.values()].map(c=>c.close()));this.clients.clear();this.calls.clear()}
}
