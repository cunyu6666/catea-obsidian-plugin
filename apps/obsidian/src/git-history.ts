/**
 * [WHO]: Provides GitCommit, GitHistory, readGitHistory, readGitCommit
 * [FROM]: Depends on node:child_process
 * [TO]: Consumed by apps/obsidian/src/GitHistoryPanel.tsx
 * [HERE]: apps/obsidian/src/git-history.ts - bounded, shell-free local Git history and commit inspection scoped to the vault
 */
import { execFile } from 'node:child_process'

export interface GitCommit {
  hash: string
  parents: string[]
  branch: string
  message: string
  committerDate: string
  author: { name: string }
}
export interface GitHistory {
  branch: string
  entries: GitCommit[]
  hasMore: boolean
}

async function git(vault: string, args: string[], signal?: AbortSignal): Promise<string> {
  const environment = { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' }
  // An inherited Git override must not redirect reads to a different repository.
  for (const key of [
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_COMMON_DIR',
    'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_NAMESPACE',
  ])
    delete (environment as NodeJS.ProcessEnv)[key]
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['--no-pager', '--no-optional-locks', ...args],
      {
        cwd: vault,
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
        signal,
        env: environment,
      },
      (error, stdout, stderr) => {
        if (error) {
          if (signal?.aborted) {
            reject(new Error('cancelled'))
            return
          }
          reject(
            new Error(
              (error as NodeJS.ErrnoException).code === 'ENOENT'
                ? 'git-missing'
                : /not a git repository/i.test(stderr)
                  ? 'not-repository'
                  : 'git-failed',
            ),
          )
          return
        }
        resolve(stdout)
      },
    )
  })
}

export async function readGitHistory(
  vault: string,
  limit = 100,
  signal?: AbortSignal,
): Promise<GitHistory> {
  if ((await git(vault, ['rev-parse', '--is-inside-work-tree'], signal)).trim() !== 'true')
    throw new Error('not-repository')
  const count = Math.max(1, Math.min(1000, Math.floor(limit) || 100))
  // --all includes local refs only. The pathspec confines a nested vault to its own history.
  // NUL-delimited fixed fields tolerate tabs, commas and newlines in commit subjects.
  const output = await git(
    vault,
    [
      'log',
      '--all',
      '--source',
      '--date-order',
      `--max-count=${count + 1}`,
      '--format=%H%x00%P%x00%S%x00%s%x00%cI%x00%an%x00',
      '--',
      '.',
    ],
    signal,
  )
  let branch = 'HEAD'
  try {
    branch =
      (await git(vault, ['symbolic-ref', '--quiet', '--short', 'HEAD'], signal)).trim() || 'HEAD'
  } catch {
    if (signal?.aborted) throw new Error('cancelled')
  }
  const fields = output.split('\0'),
    entries: GitCommit[] = []
  for (let i = 0; i + 5 < fields.length; i += 6) {
    const hash = fields[i].trim()
    if (!/^[a-f0-9]{40,64}$/.test(hash)) continue
    entries.push({
      hash,
      parents: fields[i + 1].split(' ').filter(Boolean),
      branch: fields[i + 2].replace(/^refs\/(heads|remotes|tags)\//, '') || branch,
      message: fields[i + 3],
      committerDate: fields[i + 4],
      author: { name: fields[i + 5] },
    })
  }
  return { branch, entries: entries.slice(0, count), hasMore: entries.length > count }
}

export async function readGitCommit(
  vault: string,
  hash: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!/^[a-f0-9]{40,64}$/.test(hash)) throw new Error('git-failed')
  return git(
    vault,
    [
      'show',
      '--no-ext-diff',
      '--no-textconv',
      '--no-renames',
      '--format=fuller',
      '--stat',
      '--stat-width=80',
      hash,
      '--',
      '.',
    ],
    signal,
  )
}
