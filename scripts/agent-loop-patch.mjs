import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { originalSource } from './upstream-source-adaptations.mjs'

const relativePath = 'packages/agent-core/upstream/loop/agent-loop.ts'
const manifestPath = 'packages/agent-core/LOCAL_PATCHES.json'

const changes = [
  {
    before: `\t// 无 mayPause policy 时使用并发批次执行（只读安全工具同批并发，有状态工具串行）
\tif (!toolPolicies?.some((policy) => policy.mayPause !== false)) {`,
    after: `\t// A host permission callback may pause any tool. Keep that path serial so
\t// later calls cannot run before the host resolves the pending approval.
\tif (!canUseTool && !toolPolicies?.some((policy) => policy.mayPause !== false)) {`,
  },
  {
    before: `\t\t\tif (use.approvalRequired) {
\t\t\t\tapprovalRequired = use.approvalRequired;
\t\t\t\tcontextMessages.push(...use.contextMessages);
\t\t\t\tbreak;
\t\t\t}
\t\t\tcontextMessages.push(...use.contextMessages);
\t\t\tresults.push(use.toolResult);
\t\t\tif (progressTracker) {`,
    after: `\t\t\tif (use.approvalRequired) {
\t\t\t\tapprovalRequired = use.approvalRequired;
\t\t\t\tcontextMessages.push(...use.contextMessages);
\t\t\t\tcontinue;
\t\t\t}
\t\t\tcontextMessages.push(...use.contextMessages);
\t\t\tresults.push(use.toolResult);
\t\t\t// Every call in this batch has already run. Record all results even if
\t\t\t// an earlier call detected a cycle; skip only future batches.
\t\t\tif (progressTracker && !livelock) {`,
  },
  {
    before: `\t\t\t\tif (livelock) break;
\t\t\t}
\t\t}

\t\tconsumed += batch.length;`,
    after: `\t\t\t}
\t\t}

\t\tconsumed += batch.length;`,
  },
]

function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

export function applyAgentLoopPatch(source) {
  let result = source
  for (const { before, after } of changes) {
    const first = result.indexOf(before)
    if (first < 0 || result.indexOf(before, first + 1) >= 0)
      throw new Error(
        'CatUI agent-loop patch no longer applies uniquely; review the upstream update',
      )
    result = result.slice(0, first) + after + result.slice(first + before.length)
  }
  return result
}

export function agentLoopPatchPlugin(root) {
  const path = resolve(root, relativePath)
  let applied = false
  return {
    name: 'catea-agent-loop-patch',
    setup(build) {
      build.onLoad({ filter: /agent-loop\.ts$/ }, async (args) => {
        if (args.path !== path) return
        const [source, manifest] = await Promise.all([
          readFile(path, 'utf8'),
          readFile(resolve(root, manifestPath), 'utf8'),
        ])
        const { files } = JSON.parse(manifest)
        const expected = files['loop/agent-loop.ts']
        const original = await originalSource(root, relativePath, source)
        if (!expected || sha256(original) !== expected.upstreamSha256)
          throw new Error('CatUI agent-loop source differs from the reviewed upstream snapshot')
        const contents = applyAgentLoopPatch(source)
        if (sha256(applyAgentLoopPatch(original)) !== expected.localSha256)
          throw new Error('CatUI agent-loop patch differs from its reviewed digest')
        applied = true
        return {
          contents,
          loader: 'ts',
          resolveDir: resolve(root, 'packages/agent-core/upstream/loop'),
        }
      })
      build.onEnd(() =>
        applied
          ? undefined
          : { errors: [{ text: 'Catea build did not load the reviewed CatUI agent-loop patch' }] },
      )
    },
  }
}
