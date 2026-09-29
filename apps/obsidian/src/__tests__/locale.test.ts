import {contractTest} from '../../../../tests/dip-contract.ts'

contractTest('apps/obsidian/src/locale.ts')

import {test} from 'node:test'
import assert from 'node:assert/strict'
import {humanizeError,pendingReplyText} from '../locale.ts'

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

test('technical failures use actionable bilingual wording',()=>{
  assert.match(humanizeError('aborted','zh'),/继续刚才的任务/)
  assert.match(humanizeError('Request was aborted','en'),/interrupted/i)
  assert.match(humanizeError('上下文压缩失败：No complete earlier turn can be compacted','zh'),/没有可压缩/)
  assert.match(humanizeError('context_length_exceeded: Context window exceeded','en'),/context window/i)
  assert.match(humanizeError('EISDIR: illegal operation on a directory, read','zh'),/路径不是可读取的笔记/)
  assert.equal(humanizeError('文件超过 1 MB，请缩小范围','en'),'The file exceeds 1 MB. Narrow the read to the part you need.')
})
