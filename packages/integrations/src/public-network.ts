/**
 * [WHO]: Provides publicLookup, publicUrl
 * [FROM]: Depends on node:dns, node:net
 * [TO]: Consumed by packages/integrations/src/web.ts
 * [HERE]: packages/integrations/src/public-network.ts - public URL validation and connection-bound DNS policy for untrusted web requests
 */
import { lookup } from 'node:dns'
import { BlockList, isIP, type LookupFunction } from 'node:net'

const privateV4 = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  privateV4.addSubnet(address, prefix, 'ipv4')
const globalV6 = new BlockList()
globalV6.addSubnet('2000::', 3, 'ipv6')
const privateV6 = new BlockList()
for (const [address, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
] as const)
  privateV6.addSubnet(address, prefix, 'ipv6')

function publicAddress(address: string): boolean {
  const family = isIP(address)
  return family === 4
    ? !privateV4.check(address, 'ipv4')
    : family === 6 && globalV6.check(address, 'ipv6') && !privateV6.check(address, 'ipv6')
}
function privateNetwork() {
  return new Error('联网工具不读取本机或私有网络地址')
}
export function publicUrl(input: string): string {
  const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    throw new Error('仅支持不含凭据的公开 HTTP(S) 网页')
  const host = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.+$/, '')
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === 'local' ||
    host.endsWith('.local') ||
    (isIP(host) !== 0 && !publicAddress(host))
  )
    throw privateNetwork()
  if (isIP(host) === 0) url.hostname = host
  return url.toString()
}

// Node connects to these exact checked answers; no second DNS resolution or host fallback.
export const publicLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error, '', 0)
    if (!addresses.length || addresses.some(({ address }) => !publicAddress(address)))
      return callback(privateNetwork(), '', 0)
    const requested = options.family === 'IPv4' ? 4 : options.family === 'IPv6' ? 6 : options.family
    const selected = addresses.filter(({ family }) => !requested || requested === family)
    if (!selected.length) return callback(new Error('公开网页地址解析失败'), '', 0)
    if (options.all) callback(null, selected)
    else callback(null, selected[0].address, selected[0].family)
  })
}
