/**
 * [WHO]: Provides captureVaultSnapshot, previewVaultRestore, restoreVaultSnapshot, VaultRestorePlan
 * [FROM]: Depends on node:crypto, node:fs, node:fs/promises, node:path
 * [TO]: Consumed by packages/agent-core/src/index.ts
 * [HERE]: packages/agent-core/src/snapshot.ts - file checkpoints for restoring the vault to a user-message boundary
 */
import {createHash,randomUUID} from 'node:crypto'
import {createReadStream,constants} from 'node:fs'
import {copyFile,lstat,mkdir,readdir,readFile,rename,rm,writeFile} from 'node:fs/promises'
import {dirname,join,resolve,sep} from 'node:path'

interface FileRecord {path:string;hash:string;size:number}
interface Manifest {files:FileRecord[]}
export interface VaultRestorePlan {added:string[];changed:string[];removed:string[]}
function exclusions(configDir?:string){return new Set(['.catea','.git',...(configDir?[configDir.replace(/\\/g,'/').replace(/\/$/,'')]:[])])}

function safeId(value:string){if(!/^[\w-]+$/.test(value))throw new Error('Invalid snapshot ID');return value}
function safeFile(root:string,path:string,configDir?:string){
  if(!path||path.split('/').some(part=>!part||part==='.'||part==='..'||part==='node_modules')||[...exclusions(configDir)].some(excluded=>path===excluded||path.startsWith(`${excluded}/`)))throw new Error('Invalid snapshot path')
  const target=resolve(root,path)
  if(!target.startsWith(resolve(root)+sep))throw new Error('Snapshot path escapes vault')
  return target
}
async function assertNoSymlink(root:string,path:string){
  let current=resolve(root)
  for(const part of path.split('/')){
    current=join(current,part)
    try{if((await lstat(current)).isSymbolicLink())throw new Error(`Refusing symlink in restore path: ${path}`)}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
  }
}
function snapshotPath(vault:string,sessionId:string,messageId:string){return join(vault,'.catea','snapshots',safeId(sessionId),safeId(messageId))}
async function hash(path:string){
  const digest=createHash('sha256')
  for await(const chunk of createReadStream(path))digest.update(chunk as Buffer)
  return digest.digest('hex')
}
async function files(vault:string,configDir?:string){
  const output:string[]=[]
  async function visit(folder:string,prefix=''){
    for(const entry of await readdir(folder,{withFileTypes:true})){
      if(entry.isDirectory()&&entry.name==='node_modules')continue
      const relative=prefix?`${prefix}/${entry.name}`:entry.name
      if([...exclusions(configDir)].some(excluded=>relative===excluded||relative.startsWith(`${excluded}/`)))continue
      if(entry.isDirectory())await visit(join(folder,entry.name),relative)
      else if(entry.isFile())output.push(relative)
    }
  }
  await visit(vault)
  return output.sort()
}
async function copy(source:string,target:string){
  await mkdir(dirname(target),{recursive:true})
  try{await copyFile(source,target,constants.COPYFILE_FICLONE)}
  catch(error){if(!['ENOTSUP','EOPNOTSUPP','EINVAL','ENOSYS'].includes((error as NodeJS.ErrnoException).code||''))throw error;await copyFile(source,target)}
}
async function apply(vault:string,base:string,plan:VaultRestorePlan,configDir?:string){
  for(const path of [...plan.added,...plan.changed,...plan.removed])await assertNoSymlink(vault,path)
  for(const path of plan.added)await rm(safeFile(vault,path,configDir))
  for(const path of [...plan.changed,...plan.removed])await copy(safeFile(base,path),safeFile(vault,path,configDir))
}
async function manifest(vault:string,sessionId:string,messageId:string,configDir?:string):Promise<Manifest>{
  const directory=snapshotPath(vault,sessionId,messageId)
  const data=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8')) as Manifest
  if(!Array.isArray(data.files)||data.files.some(file=>typeof file.path!=='string'||typeof file.hash!=='string'||!/^[a-f0-9]{64}$/i.test(file.hash)||typeof file.size!=='number'||file.size<0))throw new Error('Invalid vault snapshot')
  const seen=new Set<string>()
  for(const file of data.files){safeFile(vault,file.path,configDir);if(seen.has(file.path))throw new Error('Duplicate vault snapshot path');seen.add(file.path)}
  return data
}
export async function captureVaultSnapshot(vault:string,sessionId:string,messageId:string,configDir?:string){
  const destination=snapshotPath(vault,sessionId,messageId),temporary=`${destination}.${randomUUID()}.tmp`
  await mkdir(temporary,{recursive:true})
  try{
    const records:FileRecord[]=[]
    for(const path of await files(vault,configDir)){
      const source=safeFile(vault,path,configDir),target=join(temporary,'files',path)
      const stat=await lstat(source)
      if(!stat.isFile())continue
      await copy(source,target)
      records.push({path,hash:await hash(target),size:stat.size})
    }
    await writeFile(join(temporary,'manifest.json'),JSON.stringify({files:records}))
    await mkdir(dirname(destination),{recursive:true})
    await rename(temporary,destination)
    return records.length
  }catch(error){await rm(temporary,{recursive:true,force:true});throw error}
}
export async function previewVaultRestore(vault:string,sessionId:string,messageId:string,configDir?:string):Promise<VaultRestorePlan>{
  const saved=await manifest(vault,sessionId,messageId,configDir),before=new Map(saved.files.map(file=>[file.path,file]))
  const present=await files(vault,configDir),current=new Set(present)
  const added=present.filter(path=>!before.has(path))
  const removed=saved.files.filter(file=>!current.has(file.path)).map(file=>file.path)
  const changed:string[]=[]
  for(const path of present)if(before.has(path)&&await hash(safeFile(vault,path,configDir))!==before.get(path)!.hash)changed.push(path)
  return {added,changed,removed}
}
export async function restoreVaultSnapshot(vault:string,sessionId:string,messageId:string,expected:VaultRestorePlan,configDir?:string){
  const actual=await previewVaultRestore(vault,sessionId,messageId,configDir)
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('Vault changed after restore preview; review the changes again')
  const saved=await manifest(vault,sessionId,messageId,configDir)
  const base=join(snapshotPath(vault,sessionId,messageId),'files')
  for(const file of saved.files){const source=safeFile(base,file.path);await assertNoSymlink(base,file.path);if(await hash(source)!==file.hash)throw new Error(`Vault snapshot is corrupt: ${file.path}`)}
  for(const path of [...actual.added,...actual.changed,...actual.removed])await assertNoSymlink(vault,path)
  const recoveryId=randomUUID()
  await captureVaultSnapshot(vault,'recovery',recoveryId,configDir)
  try{await apply(vault,base,actual,configDir)}
  catch(error){
    try{
      const recoveryPlan=await previewVaultRestore(vault,'recovery',recoveryId,configDir)
      await apply(vault,join(snapshotPath(vault,'recovery',recoveryId),'files'),recoveryPlan,configDir)
    }catch(rollbackError){throw new Error(`Vault restore and automatic recovery failed; recovery snapshot: ${recoveryId}`,{cause:rollbackError})}
    throw new Error(`Vault restore failed; original files were recovered. Recovery snapshot: ${recoveryId}`,{cause:error})
  }
  return recoveryId
}
