import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {contractTest} from '../../../../tests/dip-contract.ts'
import {repairToolProtocol} from '../protocol-repair.ts'
import type {Session} from '../contracts.ts'

contractTest('packages/agent-core/src/protocol-repair.ts')

test('interrupted tool calls are repaired before a later user turn',()=>{
  const assistant={role:'assistant' as const,content:'Searching',calls:[{id:'call-1',name:'read',args:{path:'a.md'}}]}
  const later={role:'user' as const,content:'Are you still there?'}
  const session:Session={id:'s',title:'test',personaId:'aria',messages:[],updated:0,transcript:[assistant,later,{role:'tool',callId:'call-1',name:'read',content:'late'}],journal:[
    {id:'a',type:'message',timestamp:'',message:{role:'assistant',api:'catea',provider:'catea',model:'',timestamp:0,stopReason:'toolUse',content:[{type:'toolCall',id:'call-1',name:'read',arguments:{path:'a.md'}}]}},
    {id:'u',type:'message',timestamp:'',message:{role:'user',content:'Are you still there?',timestamp:0}},
  ]} as Session
  repairToolProtocol(session)
  assert.deepEqual(session.transcript.map(row=>row.role),['assistant','tool','user'])
  assert.equal(session.transcript[1].role==='tool'&&session.transcript[1].content,'late')
  assert.deepEqual(session.journal!.map(row=>row.type==='message'?row.message.role:''),['assistant','toolResult','user'])
  repairToolProtocol(session)
  assert.equal(session.transcript.length,3)
  assert.equal(session.journal!.length,3)
})
