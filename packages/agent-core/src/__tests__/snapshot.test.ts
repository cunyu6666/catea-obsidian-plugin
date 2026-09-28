import {contractTest} from '../../../../tests/dip-contract.ts'
import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {mkdtemp,mkdir,readFile,rm,symlink,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {captureVaultSnapshot,previewVaultRestore,restoreVaultSnapshot} from '../snapshot.ts'

contractTest('packages/agent-core/src/snapshot.ts')

test('vault checkpoint previews changes and restores content with a recovery copy',async()=>{
  const vault=await mkdtemp(join(tmpdir(),'catea-snapshot-'))
  try{
    await mkdir(join(vault,'notes'))
    await writeFile(join(vault,'notes','a.md'),'before')
    await mkdir(join(vault,'.obsidian'))
    await writeFile(join(vault,'.obsidian','config'),'private')
    await mkdir(join(vault,'node_modules'))
    await writeFile(join(vault,'node_modules','package.js'),'dependency')
    await captureVaultSnapshot(vault,'session','message','.obsidian')
    await writeFile(join(vault,'notes','a.md'),'after')
    await writeFile(join(vault,'notes','b.md'),'new')
    const plan=await previewVaultRestore(vault,'session','message','.obsidian')
    assert.deepEqual(plan,{added:['notes/b.md'],changed:['notes/a.md'],removed:[]})
    const recovery=await restoreVaultSnapshot(vault,'session','message',plan,'.obsidian')
    assert.equal(await readFile(join(vault,'notes','a.md'),'utf8'),'before')
    await assert.rejects(readFile(join(vault,'notes','b.md')))
    assert.equal(await readFile(join(vault,'.obsidian','config'),'utf8'),'private')
    assert.equal(await readFile(join(vault,'node_modules','package.js'),'utf8'),'dependency')
    assert.deepEqual(await previewVaultRestore(vault,'recovery',recovery,'.obsidian'),{added:[],changed:['notes/a.md'],removed:['notes/b.md']})
  }finally{await rm(vault,{recursive:true,force:true})}
})

test('vault checkpoint refuses a symlink destination',async()=>{
  const vault=await mkdtemp(join(tmpdir(),'catea-snapshot-'))
  const outside=await mkdtemp(join(tmpdir(),'catea-outside-'))
  try{
    await mkdir(join(vault,'notes'))
    await writeFile(join(vault,'notes','a.md'),'before')
    await captureVaultSnapshot(vault,'session','message')
    await rm(join(vault,'notes'),{recursive:true})
    await symlink(outside,join(vault,'notes'))
    const plan=await previewVaultRestore(vault,'session','message')
    await assert.rejects(restoreVaultSnapshot(vault,'session','message',plan),/symlink/i)
  }finally{await rm(vault,{recursive:true,force:true});await rm(outside,{recursive:true,force:true})}
})
