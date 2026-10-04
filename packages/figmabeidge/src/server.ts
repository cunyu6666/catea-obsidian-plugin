#!/usr/bin/env node
/**
 * [WHO]: Provides CateaFigmaBridgeServer, defaultPort
 * [FROM]: Depends on node:http, node:crypto
 * [TO]: Consumed by packages/figmabeidge/src/smoke.ts
 * [HERE]: packages/figmabeidge/src/server.ts - localhost-only HTTP bridge that accepts Catea design IR write jobs, queues them for a connected Figma plugin, receives plugin results, and exposes health/status endpoints
 */
import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

export const defaultPort = 38451

type BridgeRequest = IncomingMessage & {
  method?: string
  url?: string
}

type BridgeActionStatus = 'queued' | 'running' | 'done' | 'error'

interface BridgeAction {
  id: string
  status: BridgeActionStatus
  createdAt: number
  updatedAt: number
  operation: string
  document: Record<string, unknown>
  target?: Record<string, unknown>
  result?: unknown
  error?: string
}

const jsonHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Content-Type': 'application/json; charset=utf-8',
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, jsonHeaders)
  response.end(JSON.stringify(body, null, 2))
}

function body(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = ''
    request.on('data', (chunk) => {
      raw += String(chunk)
      if (raw.length > 1_000_000) {
        request.destroy(new Error('request body too large'))
        reject(new Error('request body too large'))
      }
    })
    request.on('end', () => {
      try {
        resolve(raw.trim() ? JSON.parse(raw) : {})
      } catch (error) {
        reject(error)
      }
    })
    request.on('error', reject)
  })
}

export class CateaFigmaBridgeServer {
  private actions = new Map<string, BridgeAction>()
  private lastPluginSeen = 0

  readonly server = createServer((request, response) => {
    void this.route(request, response).catch((error) => {
      send(response, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  })

  listen(port = defaultPort, host = '127.0.0.1') {
    this.server.listen(port, host)
  }

  private async route(request: BridgeRequest, response: ServerResponse) {
    const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`)
    if (request.method === 'OPTIONS') {
      response.writeHead(204, jsonHeaders)
      response.end()
      return
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      send(response, 200, {
        ok: true,
        pluginConnected: Date.now() - this.lastPluginSeen < 5000,
        queued: [...this.actions.values()].filter((action) => action.status === 'queued').length,
        running: [...this.actions.values()].filter((action) => action.status === 'running').length,
      })
      return
    }
    if (request.method === 'POST' && url.pathname === '/v1/actions') {
      const input = record(await body(request))
      const document = record(input.document)
      if (!Object.keys(document).length) {
        send(response, 400, { ok: false, error: 'document is required' })
        return
      }
      const action: BridgeAction = {
        id: randomUUID(),
        status: 'queued',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        operation: typeof input.operation === 'string' ? input.operation : 'create',
        document,
        target: record(input.target),
      }
      this.actions.set(action.id, action)
      send(response, 202, { ok: true, actionId: action.id, statusUrl: `/v1/actions/${action.id}` })
      return
    }
    if (request.method === 'GET' && url.pathname === '/v1/actions/next') {
      this.lastPluginSeen = Date.now()
      const action = [...this.actions.values()].find((item) => item.status === 'queued')
      if (!action) {
        response.writeHead(204, jsonHeaders)
        response.end()
        return
      }
      action.status = 'running'
      action.updatedAt = Date.now()
      send(response, 200, action)
      return
    }
    const resultMatch = url.pathname.match(/^\/v1\/actions\/([^/]+)\/result$/)
    if (request.method === 'POST' && resultMatch) {
      this.lastPluginSeen = Date.now()
      const action = this.actions.get(resultMatch[1])
      if (!action) {
        send(response, 404, { ok: false, error: 'action not found' })
        return
      }
      const input = record(await body(request))
      action.status = input.ok === false ? 'error' : 'done'
      action.result = input.result
      action.error = typeof input.error === 'string' ? input.error : undefined
      action.updatedAt = Date.now()
      send(response, 200, { ok: true, actionId: action.id, status: action.status })
      return
    }
    const statusMatch = url.pathname.match(/^\/v1\/actions\/([^/]+)$/)
    if (request.method === 'GET' && statusMatch) {
      const action = this.actions.get(statusMatch[1])
      if (!action) send(response, 404, { ok: false, error: 'action not found' })
      else send(response, 200, action)
      return
    }
    send(response, 404, { ok: false, error: 'not found' })
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const portArg = process.argv.find((arg) => arg.startsWith('--port='))
  const port = portArg ? Number(portArg.slice('--port='.length)) : defaultPort
  const bridge = new CateaFigmaBridgeServer()
  bridge.listen(port)
  console.log(`Catea Figma bridge listening on http://127.0.0.1:${port}`)
  console.log(
    `Load plugin manifest: ${new URL('../plugin/manifest.json', import.meta.url).pathname}`,
  )
}
