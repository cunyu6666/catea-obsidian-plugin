#!/usr/bin/env node
/**
 * [WHO]: Provides submitSmoke
 * [FROM]: Depends on ./server.ts
 * [TO]: Consumed by (entry)
 * [HERE]: packages/figmabeidge/src/smoke.ts - command-line smoke client that submits a minimal design IR action to a running bridge and prints the action status URL
 */
import { defaultPort } from './server.ts'

export async function submitSmoke(port = defaultPort): Promise<unknown> {
  const response = await fetch(`http://127.0.0.1:${port}/v1/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operation: 'create',
      document: {
        kind: 'figma_document',
        version: 1,
        nodes: [
          {
            type: 'frame',
            name: 'Catea Bridge Smoke',
            fill: '#FFFFFF',
            stroke: '#DADDE3',
            layout: { mode: 'vertical', gap: 12, padding: 24 },
            children: [
              { type: 'text', name: 'Title', text: 'Hello from Catea', style: 'heading' },
              {
                type: 'text',
                name: 'Body',
                text: 'This frame was queued from Obsidian-side bridge code and rendered by the Figma plugin.',
                style: 'body',
              },
            ],
          },
        ],
      },
    }),
  })
  return { status: response.status, ...(await response.json()) }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const portArg = process.argv.find((arg) => arg.startsWith('--port='))
  const port = portArg ? Number(portArg.slice('--port='.length)) : defaultPort
  console.log(JSON.stringify(await submitSmoke(port), null, 2))
}
