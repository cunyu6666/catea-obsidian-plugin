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

// A minimal local-only environment: these read-only commands never touch the
// network, credentials or hooks. Copying an explicit allowlist instead of the
// full process environment keeps machine identity variables out of the child
// process, and structurally guarantees that an inherited Git override such as
// GIT_DIR cannot redirect reads to a different repository.
const GIT_ENV_ALLOWLIST = [
  'PATH',
  'HOME',
  'USERPROFILE',
  'XDG_CONFIG_HOME',
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'TMPDIR',
  'TEMP',
  'TMP',
  'LANG',
] as const
async function git(vault: string, args: string[], signal?: AbortSignal): Promise<string> {
  const environment: Record<string, string> = {
    GIT_TERMINAL_PROMPT: '0',
    LC_ALL: 'C',
  }
  for (const key of GIT_ENV_ALLOWLIST) {
    const value = process.env[key]
    if (typeof value === 'string') environment[key] = value
  }
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
