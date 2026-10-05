import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contractTest } from '../../../../tests/dip-contract.ts'
import {
  callWeChatConnector,
  markdownToWechatHtml,
  type WeChatHttpCall,
} from '../wechat-connector.ts'

contractTest('packages/integrations/src/wechat-connector.ts')

test('wechat connector | converts bounded Markdown into Official Account HTML', () => {
  const html = markdownToWechatHtml('# Title\n\n- one\n- <two>\n\nBody & tail')
  assert.match(html, /<h1>Title<\/h1>/)
  assert.match(html, /<li>&lt;two&gt;<\/li>/)
  assert.match(html, /<p>Body &amp; tail<\/p>/)
})

test('wechat connector | pushes Markdown through PushPlus', async () => {
  const calls: { url: string; init: RequestInit }[] = []
  const http: WeChatHttpCall = async (url, init) => {
    calls.push({ url, init })
    return { code: 200, msg: 'ok', data: 'short-code' }
  }
  const output = await callWeChatConnector(
    'share',
    {
      title: 'Daily Note',
      content_markdown: '# hello',
      target: { topic: 'catea' },
    },
    { id: 'wechat', enabled: true, adapter: 'wechat_pushplus' },
    { PUSHPLUS_TOKEN: 'push-token' },
    http,
    new AbortController().signal,
  )
  assert.equal((output as { adapter: string }).adapter, 'wechat_pushplus')
  assert.equal(calls[0]?.url, 'https://www.pushplus.plus/send')
  const body = JSON.parse(String(calls[0]?.init.body))
  assert.equal(body.token, 'push-token')
  assert.equal(body.title, 'Daily Note')
  assert.equal(body.content, '# hello')
  assert.equal(body.template, 'markdown')
  assert.equal(body.channel, 'wechat')
  assert.equal(body.topic, 'catea')
})

test('wechat connector | creates an Official Account article draft', async () => {
  const calls: { url: string; init: RequestInit }[] = []
  const http: WeChatHttpCall = async (url, init) => {
    calls.push({ url, init })
    if (url.includes('/cgi-bin/token')) return { access_token: 'official-token' }
    return { media_id: 'draft-media-id' }
  }
  const output = await callWeChatConnector(
    'create',
    {
      title: 'Article',
      content_markdown: '# Heading\nBody',
      target: { author: 'Catea', digest: 'Short summary' },
    },
    { id: 'wechat', enabled: true, adapter: 'wechat_official_account_api' },
    {
      WECHAT_OFFICIAL_APP_ID: 'app-id',
      WECHAT_OFFICIAL_APP_SECRET: 'app-secret',
      WECHAT_OFFICIAL_THUMB_MEDIA_ID: 'thumb-media-id',
    },
    http,
    new AbortController().signal,
  )
  assert.equal((output as { mode: string }).mode, 'draft_create')
  assert.match(calls[0]?.url || '', /\/cgi-bin\/token/)
  assert.match(calls[1]?.url || '', /\/cgi-bin\/draft\/add/)
  const body = JSON.parse(String(calls[1]?.init.body))
  assert.equal(body.articles[0].title, 'Article')
  assert.equal(body.articles[0].author, 'Catea')
  assert.equal(body.articles[0].thumb_media_id, 'thumb-media-id')
  assert.match(body.articles[0].content, /<h1>Heading<\/h1>/)
})

test('wechat connector | reads an Official Account draft by media id', async () => {
  const calls: { url: string; init: RequestInit }[] = []
  const http: WeChatHttpCall = async (url, init) => {
    calls.push({ url, init })
    return { news_item: [{ title: 'Existing' }] }
  }
  const output = await callWeChatConnector(
    'read',
    { target: { media_id: 'draft-media-id' } },
    { id: 'wechat', enabled: true, adapter: 'wechat_official_account_api' },
    { WECHAT_OFFICIAL_ACCESS_TOKEN: 'official-token' },
    http,
    new AbortController().signal,
  )
  assert.equal((output as { adapter: string }).adapter, 'wechat_official_account_api')
  assert.match(calls[0]?.url || '', /\/cgi-bin\/draft\/get/)
  assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), { media_id: 'draft-media-id' })
})
