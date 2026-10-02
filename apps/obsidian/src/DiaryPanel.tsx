/**
 * [WHO]: Provides DiaryPanel
 * [FROM]: Depends on react, ../../../packages/personas/src, ./diary, ./main, ../cat-welcome.png
 * [TO]: Consumed by apps/obsidian/src/main.tsx
 * [HERE]: apps/obsidian/src/DiaryPanel.tsx - companion diary cover, horizontally scrolling cards, archive, paper reader and local profile customization
 */
import { useEffect, useRef, useState } from 'react'
import { personas, persona } from '../../../packages/personas/src'
import type { DiaryEntry, DiaryState } from './diary'
import type Catea from './main'
import catWelcome from '../cat-welcome.png'

type View = 'home' | 'all' | 'profile'
export function DiaryPanel({ plugin }: { plugin: Catea }) {
  const [state, setState] = useState<DiaryState>()
  const [scope, setScope] = useState(plugin.agentSettings.personaId)
  const [view, setView] = useState<View>('home')
  const [entry, setEntry] = useState<DiaryEntry>()
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const alive = useRef(true)
  const t = plugin.t
  useEffect(() => {
    alive.current = true
    let revision = 0
    const load = () => {
      const current = ++revision
      void plugin.diary
        .snapshot()
        .then((value) => {
          if (alive.current && current === revision) setState(value)
        })
        .catch(() => {
          if (alive.current) setError(t('无法读取日记数据'))
        })
    }
    load()
    const unsubscribe = plugin.subscribe(load)
    return () => {
      alive.current = false
      unsubscribe()
    }
  }, [plugin, t])
  const profile = state?.profiles[scope]
  const author = profile?.name || persona(scope).name
  const picture = profile?.avatar || catWelcome
  const entries = (state?.entries || [])
    .filter((item) => item.personaId === scope)
    .sort((a, b) => b.date.localeCompare(a.date))
  const locale = plugin.agentSettings.language === 'en' ? 'en-US' : 'zh-CN'
  const date = (value: string, options?: Intl.DateTimeFormatOptions) =>
    new Date(`${value}T12:00:00`).toLocaleDateString(locale, options)
  const action = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch {
      if (alive.current) setError(t('日记操作失败，请稍后重试'))
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  const customize = () => {
    setName(author)
    setAvatar(profile?.avatar || '')
    setView('profile')
  }
  const readAvatar = (value?: File) => {
    if (!value) return
    if (
      value.size > 1024 * 1024 ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(value.type)
    ) {
      setError(t('请使用有效名称和小于 1 MB 的 PNG、JPEG 或 WebP 头像'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (alive.current && typeof reader.result === 'string') {
        setAvatar(reader.result)
        setError('')
      }
    }
    reader.onerror = () => {
      if (alive.current) setError(t('无法读取头像'))
    }
    reader.readAsDataURL(value)
  }
  return (
    <div className="catea-diary">
      {entry ? (
        <>
          <header className="catea-diary__bar">
            <button aria-label={t('返回')} onClick={() => setEntry(undefined)}>
              ←
            </button>
            <span>{entry.title}</span>
          </header>
          <article className="catea-diary__paper">
            <h1>{entry.title}</h1>
            <time dateTime={entry.date}>
              {date(entry.date, { year: 'numeric', month: 'long', day: 'numeric' })}
            </time>
            <div className="catea-diary__prose">
              {entry.body.split(/\n\s*\n/).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
            <footer>
              {entry.author} · {t('日记')}
            </footer>
          </article>
        </>
      ) : view === 'profile' ? (
        <>
          <header className="catea-diary__bar">
            <button aria-label={t('返回')} onClick={() => setView('home')}>
              ←
            </button>
            <span>{t('自定义')}</span>
          </header>
          <div className="catea-diary__custom">
            <img className="catea-diary__avatar" src={avatar || catWelcome} alt={author} />
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(event) => readAvatar(event.target.files?.[0])}
            />
            <button disabled={busy} onClick={() => file.current?.click()}>
              {t('更换头像')}
            </button>
            {avatar && (
              <button disabled={busy} onClick={() => setAvatar('')}>
                {t('恢复默认头像')}
              </button>
            )}
            <label className="catea-diary__field">
              <span>{t('名称')}</span>
              <input
                value={name}
                maxLength={60}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button
              className="mod-cta"
              disabled={busy || !name.trim()}
              onClick={() =>
                void action(async () => {
                  await plugin.diary.setProfile(scope, { name, avatar })
                  if (alive.current) setView('home')
                })
              }
            >
              {t('保存')}
            </button>
          </div>
        </>
      ) : (
        <>
          {view === 'home' ? (
            <section className="catea-diary__cover">
              <img className="catea-diary__cover-image" src={picture} alt="" />
              <button className="catea-diary__edit" onClick={customize} aria-label={t('自定义')}>
                ✎
              </button>
              <div className="catea-diary__identity">
                <h1>{author}</h1>
                <p>
                  {t('陪伴始于')} {state ? date(state.startedOn) : '…'}
                </p>
              </div>
            </section>
          ) : (
            <header className="catea-diary__bar">
              <button aria-label={t('返回')} onClick={() => setView('home')}>
                ←
              </button>
              <span>{t('所有日记')}</span>
            </header>
          )}
          <div className="catea-diary__scope">
            <label>
              {t('日记主人')}
              <select value={scope} onChange={(event) => setScope(event.target.value)}>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {state?.profiles[p.id]?.name || p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {entries.length ? (
            <div className={view === 'home' ? 'catea-diary__cards' : 'catea-diary__archive'}>
              {(view === 'home' ? entries.slice(0, 5) : entries).map((item) => (
                <button
                  className="catea-diary__card"
                  key={`${item.date}/${item.personaId}`}
                  onClick={() => setEntry(item)}
                >
                  <time className="catea-diary__calendar" dateTime={item.date}>
                    <span>{date(item.date, { weekday: 'short' })}</span>
                    <strong>{Number(item.date.slice(-2))}</strong>
                  </time>
                  <h2>{item.title}</h2>
                  <p>{item.body}</p>
                  <small>{date(item.date)}</small>
                </button>
              ))}
            </div>
          ) : (
            <p className="catea-diary__empty">
              {state ? t('聊过的一天，值得被记住。今天的故事将在明天写下。') : t('正在读取日记…')}
            </p>
          )}
          {view === 'home' && entries.length > 0 && (
            <button className="catea-diary__all" onClick={() => setView('all')}>
              {t('查看所有日记')} ›
            </button>
          )}
          <section className="catea-diary__settings">
            <label>
              <span>{t('每天自动写日记')}</span>
              <input
                type="checkbox"
                checked={state?.enabled ?? false}
                disabled={!state || busy}
                onChange={(event) =>
                  void action(() => plugin.diary.setEnabled(event.target.checked))
                }
              />
            </label>
            <p>
              {t(
                '在本地日期结束后，根据当天对话以 AI 的视角写下日记。未打开 Catea 的日期不补写，没有对话也会跳过。',
              )}
            </p>
            <p>
              {t(
                '使用当前默认聊天模型，会发送相关对话并消耗模型额度。名称与头像仅用于日记，不改变聊天 Persona。',
              )}
            </p>
            {state?.error && (
              <p role="status">
                {t(
                  state.error === 'model'
                    ? '请配置可用的聊天模型，日记会在模型可用后重试。'
                    : '日记生成暂未完成，将自动重试。',
                )}
              </p>
            )}
            <button
              disabled={busy || !state?.enabled}
              onClick={() => void action(() => plugin.diary.process(true))}
            >
              {busy ? t('正在检查…') : t('检查待写日记')}
            </button>
          </section>
        </>
      )}
      {error && (
        <p className="catea-diary__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
