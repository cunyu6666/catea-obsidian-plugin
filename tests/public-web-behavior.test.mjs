import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once, EventEmitter } from 'node:events'
import { publicUrl } from '../packages/integrations/src/public-network.ts'
import { loadSource } from './helpers/load-source.mjs'

test('public URLs reject local aliases, reserved IPs and credentials before a request', () => {
  for (const host of [
    'localhost',
    'LOCALHOST.',
    'localhost..',
    'app.localhost.',
    'app.local.',
    '127.0.0.1',
    '127.1',
    '0x7f000001',
    '2130706433',
    '10.1.2.3',
    '100.64.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '[::]',
    '[::1]',
    '[::ffff:127.0.0.1]',
    '[fc00::1]',
    '[fe80::1]',
    '[2001:db8::1]',
    '[2002:7f00:1::]',
  ])
    assert.throws(() => publicUrl(`http://${host}/`), /私有网络/, host)
  assert.throws(() => publicUrl('https://user:password@example.com/'), /凭据/)
  assert.equal(publicUrl('https://EXAMPLE.COM./page'), 'https://example.com/page')
  assert.equal(publicUrl('https://1.1.1.1/'), 'https://1.1.1.1/')
  assert.equal(publicUrl('https://[2606:4700:4700::1111]/'), 'https://[2606:4700:4700::1111]/')
})

async function dnsPolicy(resolve) {
  return loadSource(
    'packages/integrations/src/public-network.ts',
    {
      'node:dns': 'export const lookup=(...args)=>globalThis.resolveFixture(...args)',
    },
    { resolveFixture: resolve },
  )
}
function answer(policy, options = {}) {
  return new Promise((resolve, reject) =>
    policy.publicLookup('fixture.invalid', options, (error, address, family) =>
      error ? reject(error) : resolve({ address, family }),
    ),
  )
}

test('connection DNS rejects mixed, mapped, private, empty and failed answers', async () => {
  for (const addresses of [
    [],
    [{ address: '127.0.0.1', family: 4 }],
    [
      { address: '1.1.1.1', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ],
    [
      { address: '1.1.1.1', family: 4 },
      { address: '::ffff:127.0.0.1', family: 6 },
    ],
  ]) {
    const policy = await dnsPolicy((_host, _options, cb) => cb(null, addresses))
    await assert.rejects(answer(policy), /私有网络/)
  }
  const failed = await dnsPolicy((_host, _options, cb) => cb(new Error('DNS unavailable')))
  await assert.rejects(answer(failed), /DNS unavailable/)
  const records = [
    { address: '1.1.1.1', family: 4 },
    { address: '2606:4700::1111', family: 6 },
  ]
  const policy = await dnsPolicy((_host, _options, cb) => cb(null, records))
  assert.equal((await answer(policy, { family: 6 })).address, records[1].address)
  assert.deepEqual((await answer(policy, { all: true })).address, records)
})

async function transport(request) {
  return loadSource(
    'packages/agent-core/src/transport.ts',
    {
      obsidian: 'export const requestUrl=()=>{throw new Error("Unexpected host fallback")}',
      'node:http': 'export const request=(...args)=>globalThis.requestFixture(...args)',
      'node:https': 'export const request=(...args)=>globalThis.requestFixture(...args)',
    },
    { requestFixture: request },
  )
}

test('public transport uses the checked DNS answer without re-resolving or pooling', async () => {
  let resolutions = 0
  const policy = await dnsPolicy((_host, _options, cb) =>
    cb(null, [{ address: ++resolutions === 1 ? '1.1.1.1' : '127.0.0.1', family: 4 }]),
  )
  const client = await transport((url, options, onResponse) => {
    assert.equal(url.hostname, 'fixture.invalid')
    assert.equal(options.agent, false)
    const request = new EventEmitter()
    request.setTimeout = () => request
    request.end = () =>
      options.lookup(url.hostname, {}, (error, address) => {
        assert.ifError(error)
        assert.equal(address, '1.1.1.1')
        const response = new EventEmitter()
        response.statusCode = 200
        response.headers = {}
        onResponse(response)
        response.emit('data', Buffer.from('Public page'))
        response.emit('end')
      })
    return request
  })
  const response = await client.serviceFetch(
    'https://fixture.invalid/',
    {},
    { lookup: policy.publicLookup, maxBytes: 1024 },
  )
  assert.equal(await response.text(), 'Public page')
  assert.equal(resolutions, 1)
})

test('public policy fails closed on certificate errors and redirects and bounds the response', async () => {
  for (const mode of ['certificate', 'redirect', 'oversize']) {
    const client = await transport((_url, _options, onResponse) => {
      const request = new EventEmitter()
      request.setTimeout = () => request
      request.end = () => {
        if (mode === 'certificate') {
          request.emit(
            'error',
            Object.assign(new Error('Certificate fixture'), { code: 'SELF_SIGNED_CERT_IN_CHAIN' }),
          )
          return
        }
        const response = new EventEmitter()
        response.statusCode = mode === 'redirect' ? 302 : 200
        response.headers = {}
        response.resume = () => response
        response.destroy = (error) => response.emit('error', error)
        onResponse(response)
        if (mode === 'oversize') response.emit('data', Buffer.alloc(1025))
      }
      return request
    })
    const request = client.serviceFetch('https://1.1.1.1/', {}, { lookup() {}, maxBytes: 1024 })
    if (mode === 'oversize') await assert.rejects((await request).text(), /大小限制/)
    else await assert.rejects(request, mode === 'redirect' ? /重定向/ : /Certificate fixture/)
  }
})

test('real Node transport blocks private DNS while trusted local endpoints still work', async () => {
  let hits = 0
  const server = createServer((_req, res) => {
    hits++
    res.end('Local model fixture')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const { serviceFetch } = await loadSource('packages/agent-core/src/transport.ts', {
      obsidian: 'export const requestUrl=()=>{throw new Error("Unexpected host fallback")}',
    })
    const policy = await dnsPolicy((_host, _options, cb) =>
      cb(null, [{ address: '127.0.0.1', family: 4 }]),
    )
    const port = server.address().port
    await assert.rejects(
      serviceFetch(
        `http://alias.invalid:${port}`,
        {},
        { lookup: policy.publicLookup, maxBytes: 1024 },
      ),
      /私有网络/,
    )
    assert.equal(hits, 0)
    const response = await serviceFetch(`http://127.0.0.1:${port}`)
    assert.equal(await response.text(), 'Local model fixture')
    assert.equal(hits, 1)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('web_fetch rejects localhost aliases before Jina or direct fallback', async () => {
  let calls = 0
  const web = await loadSource(
    'packages/integrations/src/web.ts',
    {
      '../../agent-core/src/transport':
        'export const serviceFetch=(...args)=>globalThis.webFixture(...args)',
    },
    {
      webFixture: () => {
        calls++
        throw new Error('Jina offline')
      },
    },
  )
  await assert.rejects(
    web.runWeb('web_fetch', { url: 'http://localhost./' }, new AbortController().signal),
    /私有网络/,
  )
  assert.equal(calls, 0)
  const policies = []
  const fallback = await loadSource(
    'packages/integrations/src/web.ts',
    {
      '../../agent-core/src/transport':
        'export const serviceFetch=(...args)=>globalThis.webFixture(...args)',
    },
    {
      webFixture: (url, _init, policy) => {
        policies.push(policy)
        if (url.startsWith('https://r.jina.ai/')) throw new Error('Jina offline')
        return new Response('Public fixture')
      },
    },
  )
  assert.match(
    await fallback.runWeb(
      'web_fetch',
      { url: 'https://example.com/' },
      new AbortController().signal,
    ),
    /Public fixture/,
  )
  assert.equal(policies.length, 2)
  assert.ok(policies.every((p) => typeof p.lookup === 'function' && p.maxBytes === 2 * 1024 * 1024))
})
