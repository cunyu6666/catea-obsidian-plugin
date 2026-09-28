import {contractTest} from '../../../../tests/dip-contract.ts'

contractTest('apps/obsidian/src/locale.ts')

import {test} from 'node:test'
import assert from 'node:assert/strict'
import {pendingReplyText} from '../locale.ts'

test('Waiting acknowledgements offer 50 paired translations and stay stable per message',()=>{
  const chinese=new Set<string>(),english=new Set<string>()
  for(let i=0;i<2000;i++){
    const id=`reply-${i}`,zh=pendingReplyText(id,'zh'),en=pendingReplyText(id,'en')
    chinese.add(zh);english.add(en)
    assert.equal(pendingReplyText(id),zh)
    assert.equal(pendingReplyText(id,'en'),en)
    assert.notEqual(zh,en)
    assert.match(zh,/[\u4e00-\u9fff]/)
    assert.doesNotMatch(en,/[\u4e00-\u9fff]/)
  }
  assert.equal(chinese.size,50)
  assert.equal(english.size,50)
})
