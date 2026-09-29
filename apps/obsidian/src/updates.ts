/**
 * [WHO]: UpdatePreferences, UpdateChecker
 * [FROM]: obsidian
 * [TO]: apps/obsidian/src/main.tsx
 * [HERE]: apps/obsidian/src/updates.ts - cached stable-release checks, compatibility validation and per-version dismissal
 */
import { requestUrl, requireApiVersion } from 'obsidian'

interface Candidate {
  version: string
  minAppVersion: string
}
export interface UpdatePreferences {
  autoCheckUpdates?: boolean
  updateLastChecked?: number
  updateCandidate?: Candidate
  dismissedUpdateVersion?: string
}
const REPOSITORY = 'cunyu6666/catea-obsidian-plugin'
const DAY = 24 * 60 * 60 * 1000
function version(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) &&
    value.split('.').every((part) => Number.isSafeInteger(Number(part)))
  )
}
function newer(next: string, current: string) {
  const left = next.split('.').map(Number),
    right = current.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i]
  return false
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
async function json(url: string): Promise<unknown> {
  let timer: number | undefined
  try {
    const response = await Promise.race([
      requestUrl({ url, headers: { Accept: 'application/json' }, throw: false }),
      new Promise<never>((_resolve, reject) => {
        timer = window.setTimeout(() => reject(new Error('Update check timed out')), 12000)
      }),
    ])
    if (response.status !== 200 || response.text.length > 1_000_000)
      throw new Error('Release metadata unavailable')
    return JSON.parse(response.text) as unknown
  } finally {
    window.clearTimeout(timer)
  }
}

export class UpdateChecker {
  private pending?: Promise<'available' | 'current' | 'failed' | 'disabled'>
  private disposed = false
  private generation = 0
  constructor(
    private preferences: UpdatePreferences,
    private currentVersion: string,
    private pluginId: string,
    private save: () => Promise<void>,
    private change: () => void,
  ) {}

  get available(): string | undefined {
    const candidate = this.preferences.updateCandidate
    return candidate &&
      version(candidate.version) &&
      version(candidate.minAppVersion) &&
      version(this.currentVersion) &&
      newer(candidate.version, this.currentVersion) &&
      requireApiVersion(candidate.minAppVersion)
      ? candidate.version
      : undefined
  }
  get bannerVersion() {
    return this.preferences.autoCheckUpdates !== false &&
      this.available !== this.preferences.dismissedUpdateVersion
      ? this.available
      : undefined
  }
  async dismiss() {
    this.preferences.dismissedUpdateVersion = this.available
    this.change()
    await this.save()
  }
  async setEnabled(enabled: boolean) {
    this.preferences.autoCheckUpdates = enabled
    this.generation++
    this.change()
    await this.save()
    if (enabled) await this.check()
  }
  check(force = false): Promise<'available' | 'current' | 'failed' | 'disabled'> {
    if (this.disposed || (!force && this.preferences.autoCheckUpdates === false))
      return Promise.resolve('disabled')
    if (this.pending) return this.pending
    const elapsed = Date.now() - (this.preferences.updateLastChecked || 0)
    if (!force && elapsed >= 0 && elapsed < DAY)
      return Promise.resolve(this.available ? 'available' : 'current')
    this.pending = this.run(this.generation).finally(() => {
      this.pending = undefined
    })
    return this.pending
  }
  private async run(generation: number): Promise<'available' | 'current' | 'failed' | 'disabled'> {
    this.preferences.updateLastChecked = Date.now()
    let result: 'available' | 'current' | 'failed' = 'failed'
    try {
      const release = record(
        await json(`https://api.github.com/repos/${REPOSITORY}/releases/latest`),
      )
      const tag = release.tag_name
      if (release.draft !== false || release.prerelease !== false || !version(tag))
        throw new Error('Invalid stable release')
      let candidate: Candidate | undefined
      if (version(this.currentVersion) && newer(tag, this.currentVersion)) {
        const assets = Array.isArray(release.assets) ? release.assets.map(record) : []
        if (
          !['main.js', 'styles.css', 'manifest.json'].every((name) =>
            assets.some(
              (asset) =>
                asset.name === name &&
                asset.state === 'uploaded' &&
                typeof asset.size === 'number' &&
                asset.size > 0,
            ),
          )
        )
          throw new Error('Release assets incomplete')
        // Construct a trusted URL instead of following URLs in release metadata.
        const manifest = record(
          await json(`https://github.com/${REPOSITORY}/releases/download/${tag}/manifest.json`),
        )
        if (
          manifest.id !== this.pluginId ||
          manifest.version !== tag ||
          !version(manifest.minAppVersion)
        )
          throw new Error('Invalid release manifest')
        if (requireApiVersion(manifest.minAppVersion))
          candidate = { version: tag, minAppVersion: manifest.minAppVersion }
      }
      if (this.disposed || generation !== this.generation) return 'disabled'
      this.preferences.updateCandidate = candidate
      result = candidate ? 'available' : 'current'
    } catch {
      /* Automatic failures stay quiet and retain the last verified candidate. */
    }
    if (this.disposed || generation !== this.generation) return 'disabled'
    this.change()
    try {
      await this.save()
    } catch {
      return 'failed'
    }
    return result
  }
  dispose() {
    this.disposed = true
    this.generation++
  }
}
